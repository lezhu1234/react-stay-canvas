import { useState } from "react"

import { ExampleDefinition } from "../examples/types"
import { useI18n } from "../i18n"

type Tab = "result" | "source" | "acceptance"

export function ExamplePage({
  definition,
  source,
}: {
  definition: ExampleDefinition
  source: string
}) {
  const [tab, setTab] = useState<Tab>("result")
  const [verified, setVerified] = useState<Set<number>>(() => new Set())
  const { localized, text } = useI18n()
  const Demo = definition.component
  const tabLabels: Record<Tab, string> = {
    result: text("Live result", "运行结果"),
    source: text("Source", "源码"),
    acceptance: text("Acceptance handbook", "验收手册"),
  }

  const toggleVerified = (index: number) => {
    setVerified((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <article className="example-page">
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
        {(["result", "source", "acceptance"] as Tab[]).map((item) => (
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

      <section aria-labelledby="acceptance-tab" className="tab-panel acceptance-panel" hidden={tab !== "acceptance"} id="acceptance-panel" role="tabpanel">
        <header className="acceptance-summary">
          <div>
            <p>{text("Manual acceptance", "手动验收")}</p>
            <h2>{localized(definition.title)}</h2>
          </div>
          <div aria-live="polite" className={verified.size === definition.checklist.length ? "acceptance-progress complete" : "acceptance-progress"}>
            <strong>{verified.size}/{definition.checklist.length}</strong>
            <span>{text("results verified", "项结果已确认")}</span>
          </div>
        </header>

        <div className="acceptance-grid">
          <section className="acceptance-section acceptance-actions">
            <h3>{text("Environment and prerequisites", "环境与前置条件")}</h3>
            <ul>
              <li>{text("Build with", "先执行")} <code>npm run build --prefix example</code>{text(", then run", "，再执行")} <code>npm run preview --prefix example</code>.</li>
              <li>{text("Use a desktop browser with pointer and keyboard input. Keep DevTools Console open.", "使用桌面浏览器，确保鼠标和键盘可用，并打开 DevTools Console。")}</li>
              <li>{text("Account: none. Test data: the built-in scene on this route.", "无需账号，直接使用当前页面自带的场景。")}</li>
            </ul>

            <h3>{text("Operator actions", "操作步骤")}</h3>
            <ol>
              {definition.instructions.map((instruction) => <li key={instruction.en}>{localized(instruction)}</li>)}
            </ol>
          </section>

          <section className="acceptance-section acceptance-results">
            <div className="acceptance-section-heading">
              <h3>{text("Expected results", "预期结果")}</h3>
              {verified.size > 0 && <button onClick={() => setVerified(new Set())}>{text("Clear checks", "清除勾选")}</button>}
            </div>
            <div className="acceptance-checks">
              {definition.checklist.map((item, index) => (
                <label className="acceptance-check" key={item.en}>
                  <input checked={verified.has(index)} onChange={() => toggleVerified(index)} type="checkbox" />
                  <span>{localized(item)}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="acceptance-section">
            <h3>{text("Failure criteria", "失败标准")}</h3>
            <ul>
              <li>{text("Any expected result cannot be reproduced after following the actions once.", "按顺序操作一遍后，有任何一项预期结果没有出现。")}</li>
              <li>{text("The Canvas leaves stale pixels, handles one input more than once, or enters an unexpected state.", "Canvas 出现残影、一次输入触发多次，或页面状态明显不对。")}</li>
              <li>{text("DevTools reports an uncaught exception or React error during the scenario.", "操作过程中，DevTools 出现未捕获异常或 React 错误。")}</li>
            </ul>
          </section>

          <section className="acceptance-section">
            <h3>{text("Required evidence", "需要保留的证据")}</h3>
            <ul>
              <li>{text("Capture the Live result after the final action. Capture transient logs or intermediate states before continuing.", "完成最后一步后截取“运行结果”；日志等会消失的状态要及时截图。")}</li>
              <li>{text("Record this route, browser version, timestamp, and the verified result count.", "记录当前路由、浏览器版本、时间戳和已确认结果数量。")}</li>
              <li>{text("For a failure, retain the Console output and the first action that diverged.", "如果失败，保留 Console 输出，并记录从哪一步开始不符合预期。")}</li>
            </ul>
          </section>

          <section className="acceptance-section acceptance-cleanup">
            <h3>{text("Cleanup", "清理")}</h3>
            <p>{text("Use Reset or reload this route before repeating the scenario. Stop the preview server after the full gallery pass.", "再次验收前，点击“重置”或刷新页面。全部示例完成后关闭预览服务。")}</p>
          </section>
        </div>
      </section>
    </article>
  )
}
