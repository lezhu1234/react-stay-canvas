// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ExamplePage } from "../example/src/components/ExamplePage"
import { type ExampleDefinition } from "../example/src/examples/types"
import { I18nProvider } from "../example/src/i18n"

const source = [
  "import { StayCanvas } from \"react-stay-canvas\"",
  "",
  "export function Demo() {",
  "  return <StayCanvas width={320} height={180} />",
  "}",
].join("\n")

const definition: ExampleDefinition = {
  path: "/simple/source-test",
  sourcePaths: ["./SourceTest.tsx"],
  group: "Simple",
  order: 1,
  title: { en: "Source test", zh: "源码测试" },
  shortTitle: { en: "Source", zh: "源码" },
  summary: { en: "A source rendering test.", zh: "源码渲染测试。" },
  features: ["source"],
  component: () => <div />,
}

let root: Root | undefined

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  window.localStorage.clear()
})

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.innerHTML = ""
  vi.restoreAllMocks()
})

describe("Example source code", () => {
  it("renders TSX tokens with one visible line number per source line", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <I18nProvider>
          <ExamplePage definition={definition} sources={[{ path: definition.sourcePaths[0], source }]} />
        </I18nProvider>,
      )
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>("#source-tab")?.click()
      await import("../example/src/components/SourceCode")
    })

    const code = container.querySelector("pre.source-code")
    const lines = code?.querySelectorAll(".source-code-line")
    expect(code?.getAttribute("aria-label")).toBe("TypeScript source code")
    expect(lines).toHaveLength(source.split("\n").length)
    expect(lines?.[0].querySelector(".source-line-number")?.textContent).toBe("1")
    expect(lines?.[4].querySelector(".source-line-number")?.textContent).toBe("5")
    expect(code?.querySelector(".token.keyword")?.textContent).toBe("import")
    expect(code?.querySelector(".token.tag")).not.toBeNull()
    expect(lines?.[3].querySelector(".source-line-content")?.textContent).toContain("StayCanvas")
    expect(container.querySelector(".source-files")).toBeNull()
  })

  it("switches and copies complete source files without losing highlighting or line numbers", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const clipboard = { writeText: vi.fn() }
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard })
    const modelSource = "export type Node = { id: string }"

    act(() => {
      root?.render(
        <I18nProvider>
          <ExamplePage
            definition={{ ...definition, sourcePaths: ["./DiagramExample.tsx", "./diagram/model.ts"] }}
            sources={[
              { path: "./DiagramExample.tsx", source },
              { path: "./diagram/model.ts", source: modelSource },
            ]}
          />
        </I18nProvider>,
      )
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>("#source-tab")?.click()
      await import("../example/src/components/SourceCode")
    })

    const fileButtons = container.querySelectorAll<HTMLButtonElement>(".source-files button")
    expect([...fileButtons].map(({ textContent }) => textContent)).toEqual(["DiagramExample.tsx", "model.ts"])
    expect(fileButtons[0].getAttribute("aria-pressed")).toBe("true")

    await act(async () => fileButtons[1].click())
    const code = container.querySelector("pre.source-code")
    expect(code?.getAttribute("aria-label")).toBe("TypeScript source code: model.ts")
    expect(code?.querySelectorAll(".source-code-line")).toHaveLength(1)
    expect(code?.querySelector(".source-line-number")?.textContent).toBe("1")
    expect(code?.textContent).toContain("Node")

    await act(async () => container.querySelector<HTMLButtonElement>(".source-heading button")?.click())
    expect(clipboard.writeText).toHaveBeenCalledWith(modelSource)
  })
})
