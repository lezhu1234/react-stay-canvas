import { execSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, posix, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"))
const errors = []

function packedFiles() {
  const output = execSync("npm pack --dry-run --json --ignore-scripts", {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
  const result = JSON.parse(output)
  return new Set(result[0]?.files?.map(({ path }) => path) ?? [])
}

function markdownFiles(directory) {
  return readdirSync(resolve(repositoryRoot, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const path = posix.join(directory, entry.name)
      if (entry.isDirectory()) return markdownFiles(path)
      return entry.isFile() && entry.name.endsWith(".md") ? [path] : []
    })
    .sort()
}

function stripFencedCode(markdown) {
  return markdown.replace(/^\s*(```|~~~)[\s\S]*?^\s*\1\s*$/gm, "")
}

function localLinks(markdown) {
  const links = []
  const pattern = /!?\[[^\]]*\]\(([^)]+)\)/g
  let match

  while ((match = pattern.exec(stripFencedCode(markdown)))) {
    const raw = match[1].trim()
    const destination = raw.startsWith("<") && raw.endsWith(">")
      ? raw.slice(1, -1)
      : raw.split(/\s+["']/)[0]
    if (!destination || /^(?:[a-z]+:|\/\/|#)/i.test(destination)) continue
    links.push(decodeURIComponent(destination.split("#")[0]))
  }

  return links
}

function packedLinkTarget(source, destination, files) {
  const target = posix.normalize(posix.join(posix.dirname(source), destination))
  if (files.has(target)) return target
  const index = posix.join(target, "README.md")
  return files.has(index) ? index : target
}

function verifyRequiredFiles(files) {
  const required = [
    "LICENSE",
    "README.md",
    "package.json",
    packageJson.main,
    packageJson.module,
    packageJson.types,
    ...markdownFiles("docs/en"),
    ...markdownFiles("docs/zh"),
  ]

  required.forEach((path) => {
    if (!files.has(path)) errors.push(`Package is missing required file: ${path}`)
  })
}

function verifyPublishedLinks(files) {
  const markdownFiles = [...files]
    .filter((path) => path === "README.md" || /^docs\/(?:en|zh)\/.+\.md$/.test(path))
    .sort()

  markdownFiles.forEach((source) => {
    const markdown = readFileSync(resolve(repositoryRoot, source), "utf8")
    localLinks(markdown).forEach((destination) => {
      const target = packedLinkTarget(source, destination, files)
      if (!files.has(target)) {
        errors.push(`${source} links to file excluded from the package: ${destination}`)
      }
    })
  })
}

const files = packedFiles()
verifyRequiredFiles(files)
verifyPublishedLinks(files)

if (errors.length) {
  console.error("Package verification failed:\n")
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

console.log(`Package verification passed (${files.size} files).`)
