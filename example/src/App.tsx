import { ReactNode, useEffect, useState } from "react"

import { ErrorBoundary } from "./components/ErrorBoundary"
import { ExamplePage } from "./components/ExamplePage"
import { catalog, getExampleByPath } from "./examples/catalog"
import { type Locale, useI18n } from "./i18n"

const sourceModules = import.meta.glob([
  "./examples/simple/*.tsx",
  "./examples/integrated/**/*.{ts,tsx}",
], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>

function useHashPath() {
  const readPath = () => window.location.hash.slice(1) || "/"
  const [path, setPath] = useState(readPath)

  useEffect(() => {
    const onHashChange = () => setPath(readPath())
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  return path
}

function RouteLink({
  path,
  className,
  children,
}: {
  path: string
  className?: string
  children: ReactNode
}) {
  // A document navigation gives every handbook scenario a clean route state.
  const href = `${window.location.pathname}?example=${encodeURIComponent(path)}#${path}`
  return <a className={className} href={href}>{children}</a>
}

function ExampleGrid({
  title,
  examples,
  featured = false,
}: {
  title: string
  examples: typeof catalog
  featured?: boolean
}) {
  const { localized, text } = useI18n()
  return (
    <section className="catalog-section">
      <h2>{title}</h2>
      <div className={featured ? "catalog-grid catalog-grid-featured" : "catalog-grid"}>
        {examples.map((example) => (
          <RouteLink className="catalog-card" path={example.path} key={example.path}>
            <span className="catalog-card-index">{String(example.order).padStart(2, "0")}</span>
            <h3>{localized(example.title)}</h3>
            <p>{localized(example.summary)}</p>
            <span className="catalog-card-link">{text("Open example", "打开示例")}</span>
          </RouteLink>
        ))}
      </div>
    </section>
  )
}

function CatalogHome() {
  const { text } = useI18n()
  const simple = catalog.filter((example) => example.group === "Simple")
  const integrations = catalog.filter((example) => example.group === "Integrated")

  return (
    <div className="catalog-home">
      <section className="catalog-intro">
        <p className="eyebrow">{text("Executable reference", "可运行示例")}</p>
        <h1>{text("Learn one behavior. Regress the whole system.", "从基础绘制到完整流程，都有示例可以直接验证。")}</h1>
        <p>
          {text(
            "Fourteen isolated examples cover the public surface of react-stay-canvas, from individual shapes to complete editing workflows.",
            "14 个可独立运行的示例，覆盖 react-stay-canvas 从基础绘制到完整编辑流程的主要能力。",
          )}
        </p>
        <div className="catalog-metrics" aria-label={text("Example counts", "示例数量")}>
          <span><strong>{simple.length}</strong> {text("focused examples", "个基础示例")}</span>
          <span><strong>{integrations.length}</strong> {text("integration scenarios", "个集成场景")}</span>
        </div>
      </section>

      <ExampleGrid title={text("Focused examples", "基础示例")} examples={simple} />
      <ExampleGrid title={text("Integration scenarios", "集成场景")} examples={integrations} featured />
    </div>
  )
}

export default function App() {
  const { locale, localized, switchLocale, text } = useI18n()
  const path = useHashPath()
  const active = getExampleByPath(path)
  const shellClassName = active?.presentation === "immersive"
    || active?.presentation === "canvas-only"
    ? "app-shell example-active example-immersive"
    : active ? "app-shell example-active" : "app-shell"

  useEffect(() => {
    document.title = active ? `${localized(active.title)} | react-stay-canvas` : text("react-stay-canvas examples", "react-stay-canvas 示例")
  }, [active, localized, text])

  const localeButton = (target: Locale, label: string) => (
    <button
      aria-pressed={locale === target}
      className={locale === target ? "active" : ""}
      onClick={() => switchLocale(target)}
      type="button"
    >
      {label}
    </button>
  )

  return (
    <div className={shellClassName}>
      <header className="topbar">
        <RouteLink className="brand" path="/">
          <span className="brand-mark" aria-hidden="true" />
          <span>react-stay-canvas</span>
        </RouteLink>
        <nav aria-label={text("Project links", "项目链接")}>
          <div className="language-switcher" role="group" aria-label={text("Language", "语言")}>
            {localeButton("zh", "中文")}
            {localeButton("en", "EN")}
          </div>
          <a href="https://github.com/lezhu1234/react-stay-canvas">GitHub</a>
          <a href="https://www.npmjs.com/package/react-stay-canvas">npm</a>
        </nav>
      </header>

      <aside className="sidebar" aria-label={text("Examples", "示例")}>
        <RouteLink className={path === "/" ? "sidebar-home active" : "sidebar-home"} path="/">
          {text("Overview", "总览")}
        </RouteLink>
        {(["Simple", "Integrated"] as const).map((group) => (
          <div className="sidebar-group" key={group}>
            <h2>{group === "Simple" ? text("Focused", "基础") : text("Integrated", "集成")}</h2>
            {catalog
              .filter((example) => example.group === group)
              .map((example) => (
                <RouteLink
                  className={path === example.path ? "active" : ""}
                  key={example.path}
                  path={example.path}
                >
                  <span>{String(example.order).padStart(2, "0")}</span>
                  {localized(example.shortTitle)}
                </RouteLink>
              ))}
          </div>
        ))}
      </aside>

      <main className="content">
        {active ? (
          <ErrorBoundary key={active.path}>
            <ExamplePage
              definition={active}
              sources={active.sourcePaths.map((path) => ({
                path,
                source: sourceModules[path] ?? text("Source unavailable.", "源码暂不可用。"),
              }))}
            />
          </ErrorBoundary>
        ) : path === "/" ? (
          <CatalogHome />
        ) : (
          <section className="not-found">
            <p>{text("Example not found.", "未找到示例。")}</p>
            <a href="#/">{text("Return to overview", "返回总览")}</a>
          </section>
        )}
      </main>
    </div>
  )
}
