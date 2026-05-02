import { useState } from 'react'
import { WRAP_COLOR_SWATCHES, WRAP_SWATCH_BY_ID } from '../../lib/wrapColorPalette'
import { useEditorStore } from '../../store/editorStore'
import type { ColorReference, PaintFinish } from '../../types/editor'
import { PaintTargetToolbar } from './PaintTargetToolbar'
import { WrapColorPicker } from './WrapColorPicker'

type CarLibraryPanelProps = {
  onClose?: () => void
}

export function CarLibraryPanel({ onClose }: CarLibraryPanelProps) {
  const [activeTab, setActiveTab] = useState<'paint' | 'gradient'>('paint')
  const finishOptions: PaintFinish[] = ['gloss', 'matte', 'chrome', 'satin']

  const mapSwatchFinishToPaintFinish = (value: string): PaintFinish => {
    if (value === 'chrome') return 'chrome'
    if (value === 'matte') return 'matte'
    if (value === 'satin') return 'satin'
    return 'gloss'
  }

  const paint = useEditorStore((state) => state.project.paint)
  const carGradient = useEditorStore((state) => state.project.carGradient)
  const selectedPaintTarget = useEditorStore((state) => state.selectedPaintTarget)
  const setPaint = useEditorStore((state) => state.setPaint)
  const setCarGradient = useEditorStore((state) => state.setCarGradient)

  const makePaintRefFromSwatchId = (swatchId: string): ColorReference | null => {
    const swatch = WRAP_SWATCH_BY_ID.get(swatchId)
    if (!swatch) {
      return null
    }
    return {
      swatchId: swatch.id,
      brand: swatch.brand,
      code: swatch.code,
      name: swatch.name,
      finish: swatch.finish,
    }
  }

  const setPaintFromSwatch = (swatchId: string) => {
    if (!selectedPaintTarget) {
      return
    }

    const swatch = WRAP_SWATCH_BY_ID.get(swatchId)
    if (!swatch) {
      return
    }

    setPaint({
      colorHex: swatch.colorHex,
      colorRef: makePaintRefFromSwatchId(swatchId),
      finish: mapSwatchFinishToPaintFinish(swatch.finish),
    })
  }

  return (
    <section className="panel car-library-panel">
      <div className="panel-header">
        <h2>Car Colors</h2>
      </div>

      <PaintTargetToolbar />

      <div className="car-panel-tabs" role="tablist" aria-label="Car panel tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'paint'}
          className={activeTab === 'paint' ? 'chip active' : 'chip'}
          onClick={() => setActiveTab('paint')}
        >
          Paint
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'gradient'}
          className={activeTab === 'gradient' ? 'chip active' : 'chip'}
          onClick={() => setActiveTab('gradient')}
        >
          Gradient
        </button>
      </div>

      {activeTab === 'paint' ? (
        <>
          <div className="field-group compact">
            <label>Finish</label>
            <div className="finish-preview-row" role="radiogroup" aria-label="Paint finish">
              {finishOptions.map((finish) => (
                <button
                  key={finish}
                  type="button"
                  role="radio"
                  aria-checked={paint.finish === finish}
                  className={paint.finish === finish ? 'finish-preview-button active' : 'finish-preview-button'}
                  disabled={!selectedPaintTarget}
                  onClick={() => setPaint({ finish })}
                  title={`Set finish: ${finish}`}
                >
                  <span className={`finish-preview-ball finish-${finish}`} aria-hidden="true" />
                  <span className="finish-preview-label">{finish}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="car-panel-colors-scroll">
            <div className="field-group compact wrap-palette-block">
              <label>Wrap Palette</label>

              <div className="swatch-grid car-swatch-grid" role="listbox" aria-label="Car paint swatches">
                {WRAP_COLOR_SWATCHES.map((swatch) => {
                  const active = paint.colorRef?.swatchId === swatch.id
                  return (
                    <button
                      key={swatch.id}
                      type="button"
                      className={active ? 'swatch-dot active' : 'swatch-dot'}
                      style={{ backgroundColor: swatch.colorHex }}
                      title={`${swatch.brand} ${swatch.code} - ${swatch.name}`}
                      aria-label={`${swatch.brand} ${swatch.code} ${swatch.name}`}
                      disabled={!selectedPaintTarget}
                      onClick={() => setPaintFromSwatch(swatch.id)}
                    />
                  )
                })}
              </div>

              <span className="hint wrap-color-meta">
                {paint.colorRef
                  ? `${paint.colorRef.brand} ${paint.colorRef.code} • ${paint.colorRef.name}`
                  : 'Pick a wrap swatch to set production paint reference.'}
              </span>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="field-group compact gradient-controls">
            <label className="tint-toggle-row">
              <span>Enable Gradient</span>
              <input
                type="checkbox"
                checked={carGradient.enabled}
                disabled={!selectedPaintTarget}
                onChange={(event) => setCarGradient({ enabled: event.target.checked })}
              />
            </label>

            <label>From Color</label>
            <WrapColorPicker
              value={carGradient.fromHex}
              disabled={!carGradient.enabled}
              onChange={(hex) => setCarGradient({ fromHex: hex })}
              label="Gradient from color"
            />

            <label>To Color</label>
            <WrapColorPicker
              value={carGradient.toHex}
              disabled={!carGradient.enabled}
              onChange={(hex) => setCarGradient({ toHex: hex })}
              label="Gradient to color"
            />

            <label>Direction</label>
            <select
              value={carGradient.axis}
              disabled={!carGradient.enabled || !selectedPaintTarget}
              onChange={(event) => setCarGradient({ axis: event.target.value as 'x' | 'y' | 'z' })}
            >
              <option value="x">Side to Side</option>
              <option value="y">Top to Bottom</option>
              <option value="z">Front to Back</option>
            </select>

            <label>Color Balance ({carGradient.balance.toFixed(0)}%)</label>
            <input
              type="range"
              min={-100}
              max={100}
              step={1}
              value={carGradient.balance}
              disabled={!carGradient.enabled || !selectedPaintTarget}
              onChange={(event) => setCarGradient({ balance: Number(event.target.value) })}
            />

            <button
              type="button"
              className="chip"
              onClick={() => setCarGradient({ enabled: false, fromHex: '#cc2a2a', toHex: '#6b0f0f', axis: 'y', balance: 0 })}
            >
              Reset Gradient
            </button>
          </div>
        </>
      )}

      <div className="panel-actions compact-actions">
        <button type="button" className="chip" onClick={onClose}>
          Hide
        </button>
      </div>
    </section>
  )
}
