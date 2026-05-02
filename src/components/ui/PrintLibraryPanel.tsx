import { useEffect, useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { PaintFinish, PaintTargetId, PrintConfig } from '../../types/editor'
import { PAINT_TARGETS } from '../../lib/paintTargets'
import { PaintTargetToolbar } from './PaintTargetToolbar'
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

type PrintLibraryPanelProps = {
  onClose?: () => void
}

export function PrintLibraryPanel({ onClose }: PrintLibraryPanelProps) {
  void onClose
  const selectedPaintTarget = useEditorStore((state) => state.selectedPaintTarget)
  const targetPrints = useEditorStore((state) => state.targetPrints)
  const setTargetPrint = useEditorStore((state) => state.setTargetPrint)
  const clearTargetPrint = useEditorStore((state) => state.clearTargetPrint)

  const [items, setItems] = useState<PrintManifestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Active print for the currently selected target
  const activePrint: PrintConfig | null =
    selectedPaintTarget ? (targetPrints[selectedPaintTarget] ?? null) : null

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
    if (!selectedPaintTarget) return
    const existing = targetPrints[selectedPaintTarget]
    setTargetPrint(selectedPaintTarget, {
      imageUrl,
      tileScale: existing?.tileScale ?? DEFAULT_PRINT_CONFIG.tileScale,
      opacity: existing?.opacity ?? DEFAULT_PRINT_CONFIG.opacity,
      finish: existing?.finish ?? DEFAULT_PRINT_CONFIG.finish,
      tintHex: existing?.tintHex ?? DEFAULT_PRINT_CONFIG.tintHex,
    })
  }

  const updateActivePrint = (patch: Partial<Omit<PrintConfig, 'imageUrl'>>) => {
    if (!selectedPaintTarget || !activePrint) return
    setTargetPrint(selectedPaintTarget, { ...activePrint, ...patch })
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      if (selectedPaintTarget) {
        applyPrint(dataUrl)
      }
    }
    reader.readAsDataURL(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <section className="panel print-library-panel">
      <div className="panel-header">
        <h2>Prints</h2>
        <button
          type="button"
          className="import-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Import a custom print/pattern image"
          aria-label="Import print image"
        >
          <Upload size={18} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
          onChange={handleImport}
          style={{ display: 'none' }}
        />
      </div>

      <PaintTargetToolbar />

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
              {PAINT_TARGETS.find((t) => t.id === selectedPaintTarget)?.label ?? selectedPaintTarget} — Print active
            </span>
          </div>
          <button
            type="button"
            className="print-remove-btn"
            title="Remove print from this target"
            onClick={() => { if (selectedPaintTarget) clearTargetPrint(selectedPaintTarget) }}
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
        <span>
          {selectedPaintTarget
            ? `Click a print to apply to: ${PAINT_TARGETS.find((t) => t.id === selectedPaintTarget)?.label ?? selectedPaintTarget}`
            : 'Select a paint target above, then choose a print'}
        </span>
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

      <div className="decal-grid print-grid" role="list" aria-label="Print patterns">
        {items.map((item) => (
          <button
            key={item.fileName}
            type="button"
            className={
              'decal-card print-card' +
              (activePrint?.imageUrl === item.url ? ' print-card--active' : '') +
              (!selectedPaintTarget ? ' print-card--disabled' : '')
            }
            disabled={!selectedPaintTarget}
            title={selectedPaintTarget ? `Apply "${item.name}" to ${PAINT_TARGETS.find((t) => t.id === selectedPaintTarget)?.label}` : 'Select a paint target first'}
            onClick={() => applyPrint(item.url)}
          >
            <img src={item.url} alt={item.name} loading="lazy" />
            <span>{item.name}</span>
          </button>
        ))}
      </div>

      {/* Per-target print summary */}
      {Object.entries(targetPrints).some(([, v]) => v != null) && (
        <div className="print-targets-summary">
          <div className="print-targets-summary-title">Active Prints</div>
          {(Object.entries(targetPrints) as [PaintTargetId, PrintConfig | null | undefined][])
            .filter(([, cfg]) => cfg != null)
            .map(([targetId, cfg]) => cfg && (
              <div key={targetId} className="print-target-row">
                <img
                  src={cfg.imageUrl}
                  alt="print"
                  style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 3 }}
                />
                <span>{PAINT_TARGETS.find((t) => t.id === targetId)?.label ?? targetId}</span>
                <button
                  type="button"
                  className="print-remove-btn"
                  title={`Remove print from ${targetId}`}
                  onClick={() => clearTargetPrint(targetId)}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
        </div>
      )}
    </section>
  )
}
