import { ReactNode, useEffect, useState } from "react"

import { ErrorBoundary } from "./components/ErrorBoundary"
import { ExamplePage } from "./components/ExamplePage"
import { catalog, getExampleByPath } from "./examples/catalog"

const sourceModules = import.meta.glob("./examples/**/*.tsx", {
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
  // Stay currently owns a perpetual RAF loop. The query change forces a document
  // navigation, isolating examples and fully discarding the previous stage.
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
  return (
    <section className="catalog-section">
      <h2>{title}</h2>
      <div className={featured ? "catalog-grid catalog-grid-featured" : "catalog-grid"}>
        {examples.map((example) => (
          <RouteLink className="catalog-card" path={example.path} key={example.path}>
            <span className="catalog-card-index">{String(example.order).padStart(2, "0")}</span>
            <h3>{example.title}</h3>
            <p>{example.summary}</p>
            <span className="catalog-card-link">Open example</span>
          </RouteLink>
        ))}
      </div>
    </section>
  )
}

function CatalogHome() {
  const simple = catalog.filter((example) => example.group === "Simple")
  const integrations = catalog.filter((example) => example.group === "Integrated")

  return (
    <div className="catalog-home">
      <section className="catalog-intro">
        <p className="eyebrow">Executable reference</p>
        <h1>Learn one behavior. Regress the whole system.</h1>
        <p>
          Thirteen isolated examples cover the public surface of react-stay-canvas, from
          individual shapes to complete editing workflows.
        </p>
        <div className="catalog-metrics" aria-label="Example counts">
          <span><strong>10</strong> focused examples</span>
          <span><strong>3</strong> integration scenarios</span>
          <span><strong>56</strong> unit tests</span>
        </div>
      </section>

      <ExampleGrid title="Focused examples" examples={simple} />
      <ExampleGrid title="Integration scenarios" examples={integrations} featured />
    </div>
  )
}

export default function App() {
  const path = useHashPath()
  const active = getExampleByPath(path)

  useEffect(() => {
    document.title = active ? `${active.title} | react-stay-canvas` : "react-stay-canvas examples"
  }, [active])

  return (
    <div className="app-shell">
      <header className="topbar">
        <RouteLink className="brand" path="/">
          <span className="brand-mark" aria-hidden="true" />
          <span>react-stay-canvas</span>
        </RouteLink>
        <nav aria-label="Project links">
          <a href="https://github.com/lezhu1234/react-stay-canvas">GitHub</a>
          <a href="https://www.npmjs.com/package/react-stay-canvas">npm</a>
        </nav>
      </header>

      <aside className="sidebar" aria-label="Examples">
        <RouteLink className={path === "/" ? "sidebar-home active" : "sidebar-home"} path="/">
          Overview
        </RouteLink>
        {(["Simple", "Integrated"] as const).map((group) => (
          <div className="sidebar-group" key={group}>
            <h2>{group === "Simple" ? "Focused" : "Integrated"}</h2>
            {catalog
              .filter((example) => example.group === group)
              .map((example) => (
                <RouteLink
                  className={path === example.path ? "active" : ""}
                  key={example.path}
                  path={example.path}
                >
                  <span>{String(example.order).padStart(2, "0")}</span>
                  {example.shortTitle}
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
              source={sourceModules[active.sourcePath] ?? "Source unavailable."}
            />
          </ErrorBoundary>
        ) : path === "/" ? (
          <CatalogHome />
        ) : (
          <section className="not-found">
            <p>Example not found.</p>
            <a href="#/">Return to overview</a>
          </section>
        )}
      </main>
    </div>
  )
}
