import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  errorMessage: string
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error: unknown): State {
    const msg = error instanceof Error ? error.message : String(error)
    return { hasError: true, errorMessage: msg }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#0d1117', color: '#e6edf3', padding: '24px', textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: 16 }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', fontSize: '1.25rem' }}>Something went wrong</h2>
          <p style={{ margin: '0 0 24px', color: '#8ea0b4', maxWidth: 360, fontSize: '0.9rem' }}>
            The editor ran into an unexpected error. Reloading usually fixes it.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              background: '#238636', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 24px', fontSize: '1rem',
              cursor: 'pointer', fontWeight: 600,
            }}
          >
            Reload App
          </button>
          {this.state.errorMessage && (
            <p style={{ marginTop: 16, color: '#6e7681', fontSize: '0.75rem', maxWidth: 360, wordBreak: 'break-word' }}>
              {this.state.errorMessage}
            </p>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
