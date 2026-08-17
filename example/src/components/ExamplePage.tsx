import { useState } from "react"

import { ExampleDefinition } from "../examples/types"

type Tab = "result" | "source" | "acceptance"

const tabLabels: Record<Tab, string> = {
  result: "Live result",
  source: "Source",
  acceptance: "Acceptance handbook",
}

export function ExamplePage({
  definition,
  source,
}: {
  definition: ExampleDefinition
  source: string
}) {
  const [tab, setTab] = useState<Tab>("result")
  const [verified, setVerified] = useState<Set<number>>(() => new Set())
  const Demo = definition.component

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
          <p className="example-kind">{definition.group} example</p>
          <h1>{definition.title}</h1>
          <p>{definition.summary}</p>
        </div>
        <div className="feature-list" aria-label="Covered features">
          {definition.features.map((feature) => <span key={feature}>{feature}</span>)}
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Example views">
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
          <p>This is the exact component rendered by the live result.</p>
          <button onClick={() => navigator.clipboard?.writeText(source)}>Copy source</button>
        </div>
        <pre><code>{source}</code></pre>
      </section>

      <section aria-labelledby="acceptance-tab" className="tab-panel acceptance-panel" hidden={tab !== "acceptance"} id="acceptance-panel" role="tabpanel">
        <header className="acceptance-summary">
          <div>
            <p>Manual acceptance</p>
            <h2>{definition.title}</h2>
          </div>
          <div aria-live="polite" className={verified.size === definition.checklist.length ? "acceptance-progress complete" : "acceptance-progress"}>
            <strong>{verified.size}/{definition.checklist.length}</strong>
            <span>results verified</span>
          </div>
        </header>

        <div className="acceptance-grid">
          <section className="acceptance-section acceptance-actions">
            <h3>Environment and prerequisites</h3>
            <ul>
              <li>Build with <code>npm run build --prefix example</code>, then run <code>npm run preview --prefix example</code>.</li>
              <li>Use a desktop browser with pointer and keyboard input. Keep DevTools Console open.</li>
              <li>Account: none. Test data: the built-in scene on this route.</li>
            </ul>

            <h3>Operator actions</h3>
            <ol>
              {definition.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
            </ol>
          </section>

          <section className="acceptance-section acceptance-results">
            <div className="acceptance-section-heading">
              <h3>Expected results</h3>
              {verified.size > 0 && <button onClick={() => setVerified(new Set())}>Clear checks</button>}
            </div>
            <div className="acceptance-checks">
              {definition.checklist.map((item, index) => (
                <label className="acceptance-check" key={item}>
                  <input checked={verified.has(index)} onChange={() => toggleVerified(index)} type="checkbox" />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="acceptance-section">
            <h3>Failure criteria</h3>
            <ul>
              <li>Any expected result cannot be reproduced after following the actions once.</li>
              <li>The Canvas leaves stale pixels, handles one input more than once, or enters an unexpected state.</li>
              <li>DevTools reports an uncaught exception or React error during the scenario.</li>
            </ul>
          </section>

          <section className="acceptance-section">
            <h3>Required evidence</h3>
            <ul>
              <li>Capture the Live result after the final action. Capture transient logs or intermediate states before continuing.</li>
              <li>Record this route, browser version, timestamp, and the verified result count.</li>
              <li>For a failure, retain the Console output and the first action that diverged.</li>
            </ul>
          </section>

          <section className="acceptance-section acceptance-cleanup">
            <h3>Cleanup</h3>
            <p>Use Reset or reload this route before repeating the scenario. Stop the preview server after the full gallery pass.</p>
          </section>
        </div>
      </section>
    </article>
  )
}
