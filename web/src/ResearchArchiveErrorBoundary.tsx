import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { failed: boolean }

export class ResearchArchiveErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Research archive render failed', error, info)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <section className="panel notice" role="alert">
      <h2>Archiwum nie może wyświetlić jednego z lokalnych wpisów</h2>
      <p>Reszta aplikacji nadal działa. Odśwież stronę; niepełne wpisy są pomijane bez wyłączania całego ekranu.</p>
    </section>
  }
}
