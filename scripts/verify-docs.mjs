import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, extname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const ts = require("typescript")
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const docsRoot = join(repositoryRoot, "docs")
const errors = []

function markdownFiles(root) {
  const files = []

  function visit(directory) {
    readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((entry) => {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) visit(path)
        else if (entry.isFile() && extname(entry.name) === ".md") files.push(path)
      })
  }

  visit(root)
  return files
}

function repositoryPath(path) {
  return relative(repositoryRoot, path).split(sep).join("/")
}

function stripFencedCode(markdown) {
  return markdown.replace(/^\s*(```|~~~)[\s\S]*?^\s*\1\s*$/gm, "")
}

function headings(markdown) {
  return stripFencedCode(markdown)
    .split("\n")
    .flatMap((line) => {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
      return match ? [{ level: match[1].length, text: match[2] }] : []
    })
}

function headingProfile(markdown) {
  const profile = Array(6).fill(0)
  headings(markdown).forEach(({ level }) => profile[level - 1]++)
  return profile
}

function slug(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

function anchors(markdown) {
  const counts = new Map()
  const result = new Set()

  headings(markdown).forEach(({ text }) => {
    const base = slug(text)
    const count = counts.get(base) ?? 0
    counts.set(base, count + 1)
    result.add(count === 0 ? base : `${base}-${count}`)
  })

  return result
}

function localLinks(markdown) {
  const withoutCode = stripFencedCode(markdown)
  const links = []
  const pattern = /!?\[[^\]]*\]\(([^)]+)\)/g
  let match

  while ((match = pattern.exec(withoutCode))) {
    const raw = match[1].trim()
    const destination = raw.startsWith("<") && raw.endsWith(">")
      ? raw.slice(1, -1)
      : raw.split(/\s+["']/)[0]

    if (!destination || /^(?:[a-z]+:|\/\/)/i.test(destination)) continue
    links.push(destination)
  }

  return links
}

function checkLanguageParity() {
  const zhRoot = join(docsRoot, "zh")
  const enRoot = join(docsRoot, "en")
  const zhFiles = markdownFiles(zhRoot).map((path) => relative(zhRoot, path)).sort()
  const enFiles = markdownFiles(enRoot).map((path) => relative(enRoot, path)).sort()

  const zhOnly = zhFiles.filter((path) => !enFiles.includes(path))
  const enOnly = enFiles.filter((path) => !zhFiles.includes(path))
  if (zhOnly.length) errors.push(`Chinese-only documentation pages: ${zhOnly.join(", ")}`)
  if (enOnly.length) errors.push(`English-only documentation pages: ${enOnly.join(", ")}`)

  zhFiles.filter((path) => enFiles.includes(path)).forEach((path) => {
    const zh = readFileSync(join(zhRoot, path), "utf8")
    const en = readFileSync(join(enRoot, path), "utf8")
    const zhProfile = headingProfile(zh)
    const enProfile = headingProfile(en)
    if (zhProfile.join(",") !== enProfile.join(",")) {
      errors.push(
        `Heading-level counts differ for ${path}: zh=${zhProfile.join("/")} en=${enProfile.join("/")}`
      )
    }

    const zhFences = (zh.match(/^\s*(```|~~~)/gm) ?? []).length
    const enFences = (en.match(/^\s*(```|~~~)/gm) ?? []).length
    if (zhFences !== enFences) {
      errors.push(`Code-fence counts differ for ${path}: zh=${zhFences} en=${enFences}`)
    }
  })
}

function resolveLink(sourceFile, destination) {
  const hashIndex = destination.indexOf("#")
  const pathPart = hashIndex === -1 ? destination : destination.slice(0, hashIndex)
  const anchor = hashIndex === -1 ? "" : decodeURIComponent(destination.slice(hashIndex + 1))
  const target = pathPart ? resolve(dirname(sourceFile), decodeURIComponent(pathPart)) : sourceFile
  return { target, anchor }
}

function checkLinks() {
  const files = [join(repositoryRoot, "README.md"), ...markdownFiles(docsRoot)]

  files.forEach((sourceFile) => {
    const markdown = readFileSync(sourceFile, "utf8")
    localLinks(markdown).forEach((destination) => {
      const { target, anchor } = resolveLink(sourceFile, destination)
      if (!existsSync(target)) {
        errors.push(`${repositoryPath(sourceFile)} links to missing ${destination}`)
        return
      }

      if (statSync(target).isDirectory() || !anchor || extname(target) !== ".md") return
      const targetAnchors = anchors(readFileSync(target, "utf8"))
      if (!targetAnchors.has(anchor)) {
        errors.push(`${repositoryPath(sourceFile)} links to missing anchor ${destination}`)
      }
    })
  })
}

function checkLegacyEntryPoints() {
  const legacyPaths = [join(docsRoot, "README.zh.md"), join(docsRoot, "README.en.md")]
  legacyPaths.forEach((path) => {
    if (!existsSync(path)) errors.push(`${repositoryPath(path)} compatibility entry point is missing`)
  })
}

function declaredMembers(sourcePath, declarationNames) {
  const sourceText = readFileSync(sourcePath, "utf8")
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const members = []

  sourceFile.forEachChild((node) => {
    if (!node.name || !declarationNames.includes(node.name.text)) return

    const declarationMembers = ts.isInterfaceDeclaration(node)
      ? node.members
      : ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)
        ? node.type.members
        : []

    declarationMembers.forEach((member) => {
      if (member.name && ts.isIdentifier(member.name)) members.push(member.name.text)
    })
  })

  return members
}

function checkApiReference() {
  const references = [
    {
      source: join(repositoryRoot, "src/types/tools.ts"),
      declarations: ["BasicTools", "AnimatedTools", "InstantTools", "DrawReturn"],
      pages: ["zh/api/stay-tools.md", "en/api/stay-tools.md"],
    },
    {
      source: join(repositoryRoot, "src/types/component.ts"),
      declarations: ["StayCanvasProps", "StayCanvasRefType"],
      pages: ["zh/api/stay-canvas.md", "en/api/stay-canvas.md"],
    },
    {
      source: join(repositoryRoot, "src/types/events.ts"),
      declarations: [
        "ActionEvent",
        "ActionCallbackProps",
        "ListenerProps",
        "StayEventRequiredProps",
        "StayEventChooseProps",
      ],
      pages: ["zh/api/events-and-listeners.md", "en/api/events-and-listeners.md"],
    },
    {
      source: join(repositoryRoot, "src/types/manualActions.ts"),
      declarations: ["ManualActionEvent"],
      pages: ["zh/api/events-and-listeners.md", "en/api/events-and-listeners.md"],
    },
    {
      source: join(repositoryRoot, "src/types/children.ts"),
      declarations: ["AppendChildProps", "CreateChildProps"],
      pages: ["zh/api/children-and-shapes.md", "en/api/children-and-shapes.md"],
    },
    {
      source: join(repositoryRoot, "src/types/children.ts"),
      declarations: [
        "getContainPointChildrenProps",
        "CaptureSceneProps",
        "SceneChildFragment",
        "SceneFragment",
        "RegionToTargetCanvasProps",
      ],
      pages: ["zh/api/stay-tools.md", "en/api/stay-tools.md"],
    },
    {
      source: join(repositoryRoot, "src/types/shapes.ts"),
      declarations: [
        "ShapeProps",
        "ShapeDrawProps",
        "CanvasStrokeProps",
        "CanvasFillProps",
        "CanvasGlobalProps",
        "TextAttr",
        "Font",
      ],
      pages: ["zh/api/children-and-shapes.md", "en/api/children-and-shapes.md"],
    },
    {
      source: join(repositoryRoot, "src/types/animation.ts"),
      declarations: ["StayShapeTransitionConfig"],
      pages: ["zh/api/children-and-shapes.md", "en/api/children-and-shapes.md"],
    },
    {
      source: join(repositoryRoot, "src/types/animation.ts"),
      declarations: ["ProgressProps"],
      pages: ["zh/api/stay-tools.md", "en/api/stay-tools.md"],
    },
    {
      source: join(repositoryRoot, "src/shapes/rectangle.ts"),
      declarations: ["RectangleAttr"],
      pages: ["zh/api/children-and-shapes.md", "en/api/children-and-shapes.md"],
    },
    {
      source: join(repositoryRoot, "src/shapes/circle.ts"),
      declarations: ["CircleAttr"],
      pages: ["zh/api/children-and-shapes.md", "en/api/children-and-shapes.md"],
    },
    {
      source: join(repositoryRoot, "src/shapes/line.ts"),
      declarations: ["LineProps"],
      pages: ["zh/api/children-and-shapes.md", "en/api/children-and-shapes.md"],
    },
    {
      source: join(repositoryRoot, "src/shapes/image.ts"),
      declarations: ["ImageProps"],
      pages: ["zh/api/children-and-shapes.md", "en/api/children-and-shapes.md"],
    },
    {
      source: join(repositoryRoot, "src/shapes/point.ts"),
      declarations: ["PointProps"],
      pages: ["zh/api/children-and-shapes.md", "en/api/children-and-shapes.md"],
    },
    {
      source: join(repositoryRoot, "src/shapes/path.ts"),
      declarations: ["PathAttr"],
      pages: ["zh/api/children-and-shapes.md", "en/api/children-and-shapes.md"],
    },
    {
      source: join(repositoryRoot, "src/shapes/polygon.ts"),
      declarations: ["PolygonAttr"],
      pages: ["zh/api/children-and-shapes.md", "en/api/children-and-shapes.md"],
    },
  ]

  references.forEach(({ source, declarations, pages }) => {
    const members = declaredMembers(source, declarations)
    pages.forEach((page) => {
      const pagePath = join(docsRoot, page)
      const markdown = readFileSync(pagePath, "utf8")
      members.forEach((member) => {
        const identifier = new RegExp(`\\b${member.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`)
        if (!identifier.test(markdown)) {
          errors.push(`${repositoryPath(pagePath)} does not mention public member ${member}`)
        }
      })
    })
  })
}

checkLanguageParity()
checkLinks()
checkLegacyEntryPoints()
checkApiReference()

if (errors.length) {
  console.error("Documentation verification failed:\n")
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

console.log("Documentation verification passed.")
