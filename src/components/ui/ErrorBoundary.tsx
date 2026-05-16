import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useEditorStore } from '../../store/editorStore'
import { readSession, saveDraftProject, writeSession } from '../../lib/sessionPersistence'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  errorMessage: string
  incidentCode: string
}

function hashString(input: string): string {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36).toUpperCase().slice(0, 6).padStart(6, '0')
}

function buildBoundaryIncidentCode(reason: string): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(2, 12)
  const digest = hashString(`${reason}:${Date.now()}`)
  return `MG-EB-${stamp}-${digest}`
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, errorMessage: '', incidentCode: '' }
  }

  static getDerivedStateFromError(error: unknown): State {
    const msg = error instanceof Error ? error.message : String(error)
    return { hasError: true, errorMessage: msg, incidentCode: buildBoundaryIncidentCode(msg) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack)
    try {
      sessionStorage.setItem('mygarage-last-incident', JSON.stringify({
        code: this.state.incidentCode,
        reason: this.state.errorMessage,
        kind: 'crash',
        source: 'error-boundary',
        at: Date.now(),
      }))
    } catch {
      // Ignore storage failures.
    }
  }

  handleReload = () => {
    window.location.reload()
  }

  handleSaveAndReload = () => {
    try {
      const liveState = useEditorStore.getState()
      const session = readSession()
      const draftId = session?.projectId ?? liveState.project.meta.id
      if (draftId) {
        saveDraftProject(
          draftId,
          liveState.project,
          liveState.selectedCar ?? undefined,
          liveState.targetPaints,
          liveState.targetPrints,
        )
        writeSession({
          projectId: draftId,
          screen: 'editor',
          lastSaveMs: Date.now(),
          lastAutoSaveMs: Date.now(),
        })
      }
    } catch (err) {
      console.error('[ErrorBoundary] Failed to save crash draft:', err)
    }

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
          <button
            onClick={this.handleSaveAndReload}
            style={{
              marginTop: 10,
              background: '#1f6feb', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 24px', fontSize: '0.95rem',
              cursor: 'pointer', fontWeight: 600,
            }}
          >
            Save Draft And Reload
          </button>
          {this.state.incidentCode && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: '#facc15', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                {this.state.incidentCode}
              </span>
              <button
                type="button"
                onClick={() => {
                  const payload = `${this.state.incidentCode} | ${this.state.errorMessage}`
                  if (navigator.clipboard?.writeText) {
                    void navigator.clipboard.writeText(payload)
                  }
                }}
                style={{
                  background: '#374151',
                  color: '#fff',
                  border: '1px solid #4b5563',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
              >
                Copy Error Code
              </button>
            </div>
          )}
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
