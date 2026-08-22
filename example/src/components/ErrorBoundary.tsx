import { Component, ErrorInfo, ReactNode } from "react"
import { useI18n } from "../i18n"

class ExampleErrorBoundary extends Component<
  { children: ReactNode; labels: { eyebrow: string; heading: string; reload: string } },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Example crashed", error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <section className="error-boundary" role="alert">
          <p className="eyebrow">{this.props.labels.eyebrow}</p>
          <h1>{this.props.labels.heading}</h1>
          <pre>{this.state.error.message}</pre>
          <button onClick={() => window.location.reload()}>{this.props.labels.reload}</button>
        </section>
      )
    }
    return this.props.children
  }
}

export function ErrorBoundary({ children }: { children: ReactNode }) {
  const { text } = useI18n()
  return (
    <ExampleErrorBoundary labels={{
      eyebrow: text("Runtime failure", "运行出错"),
      heading: text("This example stopped unexpectedly.", "这个示例没有正常运行。"),
      reload: text("Reload example", "重新加载示例"),
    }}>
      {children}
    </ExampleErrorBoundary>
  )
}
