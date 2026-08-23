import { useState } from "react"

import { ExampleDefinition } from "../examples/types"
import { useI18n } from "../i18n"

type Tab = "result" | "source"

export function ExamplePage({
  definition,
  source,
}: {
  definition: ExampleDefinition
  source: string
}) {
  const [tab, setTab] = useState<Tab>("result")
  const { localized, text } = useI18n()
  const Demo = definition.component
  const tabLabels: Record<Tab, string> = {
    result: text("Result", "效果"),
    source: text("Source", "源码"),
  }

  return (
    <article className={definition.presentation === "workspace" ? "example-page workspace-page" : "example-page"}>
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

      <section aria-labelledby="source-tab" className="tab-panel source-panel" hidden={tab !== "source"} id="source-panel" role="tabpanel">
        <div className="source-heading">
          <p>{text("This is the exact component rendered by the live result.", "这里展示运行结果所使用的完整组件源码。")}</p>
          <button onClick={() => navigator.clipboard?.writeText(source)}>{text("Copy source", "复制源码")}</button>
        </div>
        <pre><code>{source}</code></pre>
      </section>
    </article>
  )
}
