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
  sourcePath: "./SourceTest.tsx",
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
          <ExamplePage definition={definition} source={source} />
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
  })
})
