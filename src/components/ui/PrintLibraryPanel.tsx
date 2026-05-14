import { useEffect, useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { PaintFinish, PrintConfig } from '../../types/editor'
import { PAINT_TARGETS } from '../../lib/paintTargets'
import { WrapColorPicker } from './WrapColorPicker'

type PrintManifestItem = {
  name: string
  fileName: string
  url: string
}

type PrintManifest = {
  generatedAt: string
  items: PrintManifestItem[]
}

const MANIFEST_URL = '/prints/manifest.json'

const DEFAULT_PRINT_CONFIG: Omit<PrintConfig, 'imageUrl'> = {
  tileScale: 4,
  opacity: 1,
  finish: 'gloss',
  tintHex: '#ffffff',
}

const FINISH_OPTIONS: PaintFinish[] = ['gloss', 'matte', 'satin', 'chrome']
const PRINT_TARGET_ID = 'fullCar' as const

type PrintLibraryPanelProps = {
  onClose?: () => void
  isGuest?: boolean
  onGuestSignIn?: () => void
}

export function PrintLibraryPanel({ onClose, isGuest = false, onGuestSignIn }: PrintLibraryPanelProps) {
  void onClose
  const targetPrints = useEditorStore((state) => state.targetPrints)
  const setTargetPrint = useEditorStore((state) => state.setTargetPrint)
  const clearTargetPrint = useEditorStore((state) => state.clearTargetPrint)

  const [items, setItems] = useState<PrintManifestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [guestPrompt, setGuestPrompt] = useState<string | null>(null)
  const [disabledPrintCache, setDisabledPrintCache] = useState<PrintConfig | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const guestPromptTimerRef = useRef<number | null>(null)

  const handlePrintGridWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    // Convert wheel scrolling into horizontal movement for the print strip.
    // Do this whenever the strip can overflow so parent vertical scroll does not steal the gesture.
    if (el.scrollWidth > el.clientWidth) {
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      if (delta !== 0) {
        el.scrollLeft += delta
        e.preventDefault()
      }
    }
  }

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

  // Active print for the currently selected target
  const activePrint: PrintConfig | null = targetPrints[PRINT_TARGET_ID] ?? null

  useEffect(() => {
    let mounted = true

    async function loadManifest() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(MANIFEST_URL, { cache: 'no-store' })
        if (!response.ok) throw new Error('Manifest not found')
        const json = (await response.json()) as PrintManifest
        if (!mounted) return
        setItems(Array.isArray(json.items) ? json.items : [])
      } catch {
        if (mounted) {
          setItems([])
          setError('No print manifest found yet.')
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadManifest()
    return () => { mounted = false }
  }, [])

  const applyPrint = (imageUrl: string) => {
    const existing = targetPrints[PRINT_TARGET_ID]
    setTargetPrint(PRINT_TARGET_ID, {
      imageUrl,
      tileScale: existing?.tileScale ?? DEFAULT_PRINT_CONFIG.tileScale,
      opacity: existing?.opacity ?? DEFAULT_PRINT_CONFIG.opacity,
      finish: existing?.finish ?? DEFAULT_PRINT_CONFIG.finish,
      tintHex: existing?.tintHex ?? DEFAULT_PRINT_CONFIG.tintHex,
    })
  }

  const updateActivePrint = (patch: Partial<Omit<PrintConfig, 'imageUrl'>>) => {
    if (!activePrint) return
    setTargetPrint(PRINT_TARGET_ID, { ...activePrint, ...patch })
  }

  const togglePrintEnabled = () => {
    if (activePrint) {
      setDisabledPrintCache(activePrint)
      clearTargetPrint(PRINT_TARGET_ID)
      return
    }
    if (disabledPrintCache) {
      setTargetPrint(PRINT_TARGET_ID, disabledPrintCache)
    }
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isGuest) {
      showGuestPrompt('Print Import')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      applyPrint(dataUrl)
    }
    reader.readAsDataURL(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  useEffect(() => {
    return () => {
      if (guestPromptTimerRef.current !== null) {
        window.clearTimeout(guestPromptTimerRef.current)
      }
    }
  }, [])

  return (
    <section className="panel print-library-panel">
      <div className="panel-header">
        <h2>Prints</h2>
        <button
          type="button"
          className="import-btn import-btn--labeled"
          onClick={() => {
            if (isGuest) {
              showGuestPrompt('Print Import')
              return
            }
            fileInputRef.current?.click()
          }}
          title={isGuest ? 'Sign in to import print images' : 'Import a custom print/pattern image'}
          aria-label="Import print image"
        >
          <Upload size={16} />
          <span>Import</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
          onChange={handleImport}
          style={{ display: 'none' }}
        />
      </div>

      <div className="print-toggle-row">
        <span className="print-toggle-label">Print</span>
        <button
          type="button"
          className={activePrint ? 'print-toggle-btn active' : 'print-toggle-btn'}
          onClick={togglePrintEnabled}
          disabled={!activePrint && !disabledPrintCache}
          title={activePrint ? 'Turn print off' : 'Turn print on'}
        >
          {activePrint ? 'On' : 'Off'}
        </button>
      </div>

      {isGuest && guestPrompt && (
        <div className="top-guest-prompt" role="status" aria-live="polite">
          <span>{guestPrompt}</span>
          <button type="button" className="top-guest-prompt-link" onClick={onGuestSignIn}>
            Sign In
          </button>
        </div>
      )}

      {/* Active print summary */}
      {activePrint && (
        <div className="print-active-bar">
          <div className="print-active-preview">
            <img
              src={activePrint.imageUrl}
              alt="Active print"
              style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }}
            />
            <span className="print-active-label">
              {PAINT_TARGETS.find((t) => t.id === PRINT_TARGET_ID)?.label ?? PRINT_TARGET_ID} — Print active
            </span>
          </div>
          <button
            type="button"
            className="print-remove-btn"
            title="Remove print from this target"
            onClick={() => {
              setDisabledPrintCache(null)
              clearTargetPrint(PRINT_TARGET_ID)
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Controls for active print */}
      {activePrint && (
        <div className="print-controls">
          <div className="field-group compact">
            <label>Tile Scale</label>
            <div className="slider-row">
              <input
                type="range"
                min={0.5}
                max={20}
                step={0.5}
                value={activePrint.tileScale}
                onChange={(e) => updateActivePrint({ tileScale: parseFloat(e.target.value) })}
              />
              <span className="slider-value">{activePrint.tileScale.toFixed(1)}×</span>
            </div>
          </div>

          <div className="field-group compact">
            <label>Opacity</label>
            <div className="slider-row">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={activePrint.opacity}
                onChange={(e) => updateActivePrint({ opacity: parseFloat(e.target.value) })}
              />
              <span className="slider-value">{Math.round(activePrint.opacity * 100)}%</span>
            </div>
          </div>

          <div className="field-group compact">
            <label>Tint</label>
            <div className="color-input-row">
              <WrapColorPicker
                value={activePrint.tintHex}
                onChange={(hex) => updateActivePrint({ tintHex: hex })}
                label="Print tint color"
              />
              <span className="color-hex-label">{activePrint.tintHex.toUpperCase()}</span>
            </div>
          </div>

          <div className="field-group compact">
            <label>Finish</label>
            <div className="finish-preview-row" role="radiogroup" aria-label="Print finish">
              {FINISH_OPTIONS.map((finish) => (
                <button
                  key={finish}
                  type="button"
                  role="radio"
                  aria-checked={activePrint.finish === finish}
                  className={activePrint.finish === finish ? 'finish-preview-button active' : 'finish-preview-button'}
                  onClick={() => updateActivePrint({ finish })}
                >
                  {finish.charAt(0).toUpperCase() + finish.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Print grid */}
      <div className="print-grid-header">
        <span>Click a print to apply to: Full Car</span>
        <button
          type="button"
          className="import-btn import-btn--labeled print-import-inline-btn"
          onClick={() => {
            if (isGuest) {
              showGuestPrompt('Print Import')
              return
            }
            fileInputRef.current?.click()
          }}
          title={isGuest ? 'Sign in to import print images' : 'Import a custom print image'}
          aria-label="Import print image"
        >
          <Upload size={14} />
          <span>Import Print</span>
        </button>
      </div>

      {loading ? <p className="hint">Loading prints...</p> : null}
      {!loading && error ? <p className="hint">{error}</p> : null}
      {!loading && items.length === 0 && !error ? (
        <p className="hint">
          Drop pattern images (PNG, JPG, WEBP) into{' '}
          <code>public/prints/</code> and restart the dev server — or import one with
          the upload button above.
        </p>
      ) : null}

      <div
        className="decal-grid print-grid"
        role="list"
        aria-label="Print patterns"
        onWheelCapture={handlePrintGridWheel}
        onWheel={handlePrintGridWheel}
      >
        {items.map((item) => (
          <button
            key={item.fileName}
            type="button"
            className={
              'decal-card print-card' +
              (activePrint?.imageUrl === item.url ? ' print-card--active' : '')
            }
            title={`Apply "${item.name}" to Full Car`}
            onClick={() => applyPrint(item.url)}
          >
            <img src={item.url} alt={item.name} loading="lazy" />
            <span>{item.name}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
