import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { CustomDecalPreset } from '../../types/editor'

type ContextMenu = {
  preset: CustomDecalPreset
  x: number
  y: number
}

function downloadSvg(preset: CustomDecalPreset) {
  const blob = new Blob([preset.svgMarkup], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${preset.name.replace(/\s+/g, '-').toLowerCase()}.svg`
  a.click()
  URL.revokeObjectURL(url)
}

type DecalManifestItem = {
  name: string
  fileName: string
  url: string
}

type DecalManifest = {
  generatedAt: string
  items: DecalManifestItem[]
}

const MANIFEST_URL = '/decals/manifest.json'

type DecalLibraryPanelProps = {
  onDecalPicked?: () => void
  isGuest?: boolean
  onGuestSignIn?: () => void
}

export function DecalLibraryPanel({ onDecalPicked, isGuest = false, onGuestSignIn }: DecalLibraryPanelProps) {
  const addDecalLayer = useEditorStore((state) => state.addDecalLayer)
  const renameCustomDecalPreset = useEditorStore((state) => state.renameCustomDecalPreset)
  const deleteCustomDecalPreset = useEditorStore((state) => state.deleteCustomDecalPreset)
  const customDecals = useEditorStore((state) => state.project.customDecals)
  const setTool = useEditorStore((state) => state.setTool)

  const [items, setItems] = useState<DecalManifestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'library' | 'created'>('library')
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [guestPrompt, setGuestPrompt] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const guestPromptTimerRef = useRef<number | null>(null)

  const showGuestPrompt = (feature: string) => {
    setGuestPrompt(`Create an account to use ${feature}.`)
    if (guestPromptTimerRef.current !== null) {
      window.clearTimeout(guestPromptTimerRef.current)
    }
    guestPromptTimerRef.current = window.setTimeout(() => {
      setGuestPrompt(null)
      guestPromptTimerRef.current = null
    }, 2800)
  }

  const handleImportDecal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isGuest) {
      showGuestPrompt('Decal Import')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      addDecalLayer(dataUrl)
      setTool('decal')
      onDecalPicked?.()
    }
    reader.readAsDataURL(file)

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  useEffect(() => {
    let mounted = true

    async function loadManifest() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(MANIFEST_URL, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error('Manifest not found')
        }

        const json = (await response.json()) as DecalManifest
        if (!mounted) {
          return
        }

        setItems(Array.isArray(json.items) ? json.items : [])
      } catch {
        if (mounted) {
          setItems([])
          setError('No decal manifest found yet.')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadManifest()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    return () => {
      if (guestPromptTimerRef.current !== null) {
        window.clearTimeout(guestPromptTimerRef.current)
      }
    }
  }, [])

  return (
    <section className="panel decal-library-panel">
      <div className="panel-header">
        <h2>Elements</h2>
        {activeTab === 'library' && (
          <button
            type="button"
            className="import-btn"
            onClick={() => {
              if (isGuest) {
                showGuestPrompt('Decal Import')
                return
              }
              fileInputRef.current?.click()
            }}
            title={isGuest ? 'Sign in to import decals' : 'Import a custom decal (SVG, PNG, JPG, WEBP)'}
            aria-label="Import decal"
          >
            <Upload size={18} />
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"
          onChange={handleImportDecal}
          style={{ display: 'none' }}
        />
      </div>

      {isGuest && guestPrompt && (
        <div className="top-guest-prompt" role="status" aria-live="polite">
          <span>{guestPrompt}</span>
          <button type="button" className="top-guest-prompt-link" onClick={onGuestSignIn}>
            Sign In
          </button>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="elements-tabs">
        <button
          type="button"
          className={activeTab === 'library' ? 'elements-tab active' : 'elements-tab'}
          onClick={() => setActiveTab('library')}
        >
          Library
        </button>
        <button
          type="button"
          className={activeTab === 'created' ? 'elements-tab active' : 'elements-tab'}
          onClick={() => setActiveTab('created')}
        >
          Created Decals
          {customDecals.length > 0 && (
            <span className="elements-tab-badge">{customDecals.length}</span>
          )}
        </button>
      </div>

      {/* Library tab */}
      {activeTab === 'library' && (
        <>
          {loading ? <p className="hint">Loading decals...</p> : null}
          {!loading && error ? <p className="hint">{error}</p> : null}
          {!loading && items.length === 0 ? (
            <p className="hint">Drop .svg/.png/.webp/.jpg files into public/decals, then restart dev server.</p>
          ) : null}

          <div className="decal-grid" role="list" aria-label="Decal images">
            {items.map((item) => (
              <button
                key={item.fileName}
                type="button"
                className="decal-card"
                onClick={() => {
                  addDecalLayer(item.url)
                  setTool('decal')
                  onDecalPicked?.()
                }}
              >
                <img src={item.url} alt={item.name} loading="lazy" />
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Created Decals tab */}
      {activeTab === 'created' && (
        <>
          {customDecals.length === 0 ? (
            <p className="hint">No created decals yet. Use the Create a Logo button in the toolbar to create one.</p>
          ) : null}

          <div className="decal-grid" role="list" aria-label="Created decals">
            {customDecals.map((item) => (
              <div key={item.id} className="decal-card-wrap" style={{ position: 'relative' }}>
                {renamingId === item.id ? (
                  <form
                    className="decal-card-rename"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (renameValue.trim()) renameCustomDecalPreset(item.id, renameValue.trim())
                      setRenamingId(null)
                    }}
                  >
                    <input
                      className="decal-rename-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      autoFocus
                      onBlur={() => setRenamingId(null)}
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    className="decal-card"
                    onClick={() => {
                      addDecalLayer(item.imageUrl)
                      setTool('decal')
                      onDecalPicked?.()
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setContextMenu({ preset: item, x: e.clientX, y: e.clientY })
                    }}
                  >
                    <img src={item.imageUrl} alt={item.name} loading="lazy" />
                    <span>{item.name}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {contextMenu && (
        <>
          <div
            className="decal-ctx-backdrop"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="decal-ctx-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              onClick={() => {
                addDecalLayer(contextMenu.preset.imageUrl)
                setTool('decal')
                onDecalPicked?.()
                setContextMenu(null)
              }}
            >
              Add to Car
            </button>
            <button
              type="button"
              onClick={() => {
                setRenamingId(contextMenu.preset.id)
                setRenameValue(contextMenu.preset.name)
                setContextMenu(null)
              }}
            >
              Rename
            </button>
            {contextMenu.preset.svgMarkup ? (
              <button
                type="button"
                onClick={() => {
                  downloadSvg(contextMenu.preset)
                  setContextMenu(null)
                }}
              >
                Download SVG
              </button>
            ) : null}
            <button
              type="button"
              className="danger"
              onClick={() => {
                deleteCustomDecalPreset(contextMenu.preset.id)
                setContextMenu(null)
              }}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </section>
  )
}
