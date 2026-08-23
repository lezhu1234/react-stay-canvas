import { lazy, Suspense, useState } from "react"

import { ExampleDefinition } from "../examples/types"
import { useI18n } from "../i18n"

const SourceCode = lazy(() => import("./SourceCode"))

type Tab = "result" | "source"

export interface ExampleSourceFile {
  path: string
  source: string
}

const sourceFileName = (path: string) => {
  const segments = path.split("/")
  return segments[segments.length - 1] || path
}

export function ExamplePage({
  definition,
  sources,
}: {
  definition: ExampleDefinition
  sources: readonly ExampleSourceFile[]
}) {
  const [tab, setTab] = useState<Tab>("result")
  const [activeSourcePath, setActiveSourcePath] = useState(sources[0]?.path)
  const { localized, text } = useI18n()
  const Demo = definition.component
  const activeSource = sources.find(({ path }) => path === activeSourcePath) ?? sources[0]
  const tabLabels: Record<Tab, string> = {
    result: text("Result", "效果"),
    source: text("Source", "源码"),
  }
  const sourceLabel = activeSource && sources.length > 1
    ? text(`TypeScript source code: ${sourceFileName(activeSource.path)}`, `TypeScript 源码：${sourceFileName(activeSource.path)}`)
    : text("TypeScript source code", "TypeScript 源码")

  return (
    <article className="example-page workspace-page">
      <header className="example-header">
        <div>
          <p className="example-kind">{definition.group === "Simple" ? text("Simple example", "简单示例") : text("Integrated example", "集成示例")}</p>
          <h1>{localized(definition.title)}</h1>
          <p>{localized(definition.summary)}</p>
        </div>
        <div className="feature-list" aria-label={text("Covered features", "涉及能力")}>
          {definition.features.map((feature) => <span key={feature}>{feature}</span>)}
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label={text("Example views", "示例视图")}>
        {(["result", "source"] as Tab[]).map((item) => (
          <button
            aria-controls={`${item}-panel`}
            aria-selected={tab === item}
            className={tab === item ? "active" : ""}
            id={`${item}-tab`}
            key={item}
            onClick={() => setTab(item)}
            role="tab"
          >
            {tabLabels[item]}
          </button>
        ))}
      </div>

      <section aria-labelledby="result-tab" className="tab-panel live-panel" hidden={tab !== "result"} id="result-panel" role="tabpanel">
        <Demo />
      </section>

      <section
        aria-labelledby="source-tab"
        className={`tab-panel source-panel${sources.length > 1 ? " source-panel-multiple" : ""}`}
        hidden={tab !== "source"}
        id="source-panel"
        role="tabpanel"
      >
        <div className="source-heading">
          <p>{sources.length > 1
            ? text("These are all source files used by the live result.", "这里展示运行结果使用的全部源码文件。")
            : text("This is the exact component rendered by the live result.", "这里展示运行结果所使用的完整组件源码。")}</p>
          <button disabled={!activeSource} onClick={() => activeSource && navigator.clipboard?.writeText(activeSource.source)}>{text("Copy source", "复制源码")}</button>
        </div>
        {sources.length > 1 && (
          <nav aria-label={text("Source files", "源码文件")} className="source-files">
            {sources.map(({ path }) => (
              <button
                aria-pressed={path === activeSource?.path}
                className={path === activeSource?.path ? "active" : ""}
                key={path}
                onClick={() => setActiveSourcePath(path)}
                type="button"
              >
                {sourceFileName(path)}
              </button>
            ))}
          </nav>
        )}
        {tab === "source" && activeSource && (
          <Suspense fallback={<pre aria-label={sourceLabel} className="source-code source-code-loading"><code>{activeSource.source}</code></pre>}>
            <SourceCode key={activeSource.path} label={sourceLabel} source={activeSource.source} />
          </Suspense>
        )}
      </section>
    </article>
  )
}
