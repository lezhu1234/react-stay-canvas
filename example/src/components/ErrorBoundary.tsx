import { Component, ErrorInfo, ReactNode } from "react"

export class ErrorBoundary extends Component<
  { children: ReactNode },
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
          <p className="eyebrow">Runtime failure</p>
          <h1>This example stopped unexpectedly.</h1>
          <pre>{this.state.error.message}</pre>
          <button onClick={() => window.location.reload()}>Reload example</button>
        </section>
      )
    }
    return this.props.children
  }
}
