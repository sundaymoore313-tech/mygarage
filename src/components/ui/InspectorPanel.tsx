import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { WRAP_COLOR_SWATCHES, WRAP_SWATCH_BY_ID } from '../../lib/wrapColorPalette'
import { PAINT_TARGETS } from '../../lib/paintTargets'
import { cleanFontDisplayName } from '../../lib/fontNames'
import { clampNumber, clampOpacity, clampRotation, clampSoftEdge, clampStripeOffset, clampStripeWidth, clampTransformComponent, validateColorHex } from '../../lib/validation'
import { useEditorStore } from '../../store/editorStore'
import type { BlendMode, ColorReference, DecalLayer, Layer, PaintFinish, SplitLayer, StripeLayer, TextLayer } from '../../types/editor'
import { WrapColorPicker } from './WrapColorPicker'

type FontOption = { label: string; family: string; url: string | null }

const FONT_PRESETS: FontOption[] = [
  { label: 'Arial', family: 'Arial', url: null },
  { label: 'Verdana', family: 'Verdana', url: null },
  { label: 'Trebuchet', family: 'Trebuchet MS', url: null },
  { label: 'Tahoma', family: 'Tahoma', url: null },
  { label: 'Georgia', family: 'Georgia', url: null },
  { label: 'Times', family: 'Times New Roman', url: null },
  { label: 'Courier', family: 'Courier New', url: null },
  { label: 'Impact', family: 'Impact', url: null },
]

function useFontList(): FontOption[] {
  const [manifestFonts, setManifestFonts] = useState<FontOption[]>([])
  useEffect(() => {
    fetch('/fonts/manifest.json', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        const items = Array.isArray(json.items) ? json.items : []
        setManifestFonts(items.map((item: { name: string; family: string; url: string; fileName?: string }) => ({
          label: cleanFontDisplayName(item.name || item.fileName || item.family),
          family: item.family,
          url: item.url,
        })))
      })
      .catch(() => {})
  }, [])
  return [...manifestFonts, ...FONT_PRESETS]
}

export function InspectorPanel() {
  const [nudgeStep, setNudgeStep] = useState(0.01)
  const [swatchPopoverOpen, setSwatchPopoverOpen] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ bottom: 0, left: 0 })
  const popoverRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLButtonElement>(null)
  const panelScrollRef = useRef<HTMLElement>(null)
  const [mirrorPopoverOpen, setMirrorPopoverOpen] = useState(false)
  const [mirrorPopoverPos, setMirrorPopoverPos] = useState({ bottom: 0, left: 0 })
  const mirrorPopoverRef = useRef<HTMLDivElement>(null)
  const mirrorBubbleRef = useRef<HTMLButtonElement>(null)
  const layers = useEditorStore((state) => state.project.layers)
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const updateLayerTransient = useEditorStore((state) => state.updateLayerTransient)
  const fontList = useFontList()
  const activeCarTool = useEditorStore((state) => state.activeCarTool)
  const setActiveCarTool = useEditorStore((state) => state.setActiveCarTool)
  const carSplit = useEditorStore((state) => state.project.carSplit)
  const carStripe = useEditorStore((state) => state.project.carStripe)
  const setCarSplit = useEditorStore((state) => state.setCarSplit)
  const setCarStripe = useEditorStore((state) => state.setCarStripe)
  const selectedPaintTarget = useEditorStore((state) => state.selectedPaintTarget)
  const targetPrints = useEditorStore((state) => state.targetPrints)
  const setTargetPrint = useEditorStore((state) => state.setTargetPrint)
  const clearTargetPrint = useEditorStore((state) => state.clearTargetPrint)

  const selected = (layers.find((layer) => layer.id === selectedLayerId && layer.type !== 'group') ?? null) as DecalLayer | TextLayer | StripeLayer | SplitLayer | null
  const activePrint = selectedPaintTarget ? (targetPrints[selectedPaintTarget] ?? null) : null
  const activePrintTargetLabel = selectedPaintTarget
    ? (PAINT_TARGETS.find((target) => target.id === selectedPaintTarget)?.label ?? selectedPaintTarget)
    : null
  const uniformScale = selected?.transform.scale.x ?? 1.0
  const offsetSnapAmount = 0.5
  const finishOptions: PaintFinish[] = ['gloss', 'matte', 'chrome', 'satin']

  const makeColorRefFromSwatchId = (swatchId: string): ColorReference | null => {
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

  const nudgeSelected = (axis: 'x' | 'y' | 'z', delta: number) => {
    if (!selected) {
      return
    }

    updateLayer(selected.id, {
      transform: {
        ...selected.transform,
        position: {
          ...selected.transform.position,
          [axis]: clampTransformComponent(selected.transform.position[axis] + delta),
        },
      },
    })
  }

  const rotateSelected = (delta: number) => {
    if (!selected) {
      return
    }

    updateLayer(selected.id, {
      transform: {
        ...selected.transform,
        rotation: {
          ...selected.transform.rotation,
          z: clampRotation(selected.transform.rotation.z + delta),
        },
      },
    })
  }

  const setSelectedMirror = (mirrorX: boolean) => {
    if (!selected) {
      return
    }

    updateLayer(selected.id, { mirrorX })
  }

  const setSelectedSideMirror = (mirrorToOtherSide: boolean) => {
    if (!selected) {
      return
    }

    updateLayer(selected.id, { mirrorToOtherSide })
  }

  const setSelectedColor = (colorHex: string, commit = false) => {
    if (!selected) {
      return
    }
    const safeHex = validateColorHex(colorHex, selected.colorHex)
    // Live drag uses transient (no history entry); releasing commits to history
    if (commit) {
      updateLayer(selected.id, { colorHex: safeHex, colorRef: null })
    } else {
      updateLayerTransient(selected.id, { colorHex: safeHex, colorRef: null })
    }
  }

  const setSelectedSwatch = (swatchId: string) => {
    if (!selected) {
      return
    }

    if (swatchId === '') {
      updateLayer(selected.id, { colorRef: null })
      return
    }

    const swatch = WRAP_SWATCH_BY_ID.get(swatchId)
    if (!swatch) {
      return
    }

    const mappedFinish: PaintFinish =
      swatch.finish === 'chrome'
        ? 'chrome'
        : swatch.finish === 'matte'
          ? 'matte'
          : swatch.finish === 'satin'
            ? 'satin'
            : 'gloss'

    updateLayer(selected.id, {
      colorHex: swatch.colorHex,
      colorRef: makeColorRefFromSwatchId(swatchId),
      finish: mappedFinish,
    })
  }

  const setSelectedFinish = (finish: PaintFinish) => {
    if (!selected) {
      return
    }

    updateLayer(selected.id, { finish })
  }

  // Close popover when clicking outside
  useEffect(() => {
    if (!swatchPopoverOpen) return
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        bubbleRef.current && !bubbleRef.current.contains(e.target as Node)
      ) {
        setSwatchPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [swatchPopoverOpen])

    // Close mirror popover when clicking outside
    useEffect(() => {
      if (!mirrorPopoverOpen) return
      const handler = (e: MouseEvent) => {
        if (
          mirrorPopoverRef.current && !mirrorPopoverRef.current.contains(e.target as Node) &&
          mirrorBubbleRef.current && !mirrorBubbleRef.current.contains(e.target as Node)
        ) {
          setMirrorPopoverOpen(false)
        }
      }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }, [mirrorPopoverOpen])

    // Allow mouse wheel to scroll the horizontal inspector toolbar lane.
    useEffect(() => {
      const panel = panelScrollRef.current
      if (!panel) {
        return
      }

      const onWheel = (event: WheelEvent) => {
        if (!event.deltaY) {
          return
        }
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
          return
        }
        panel.scrollLeft += event.deltaY
        event.preventDefault()
      }

      panel.addEventListener('wheel', onWheel, { passive: false })
      return () => panel.removeEventListener('wheel', onWheel)
    }, [])

  const openPopover = () => {
    if (bubbleRef.current) {
      const rect = bubbleRef.current.getBoundingClientRect()
      setPopoverPos({
        bottom: window.innerHeight - rect.top + 8,
        left: rect.left + rect.width / 2,
      })
    }
    setSwatchPopoverOpen((v) => !v)
  }

  return (
    <section ref={panelScrollRef} className="panel inspector-panel">
      {selected ? (
        <>
          {/* Layer preview thumbnail (decal / text only) */}
          {selected.type === 'decal' || selected.type === 'text' ? (
            <div className="field-group compact-field layer-preview-field">
              {selected.type === 'decal' && selected.imageUrl ? (
                <img
                  src={selected.imageUrl}
                  alt={selected.name}
                  className="layer-preview-img"
                  style={{ filter: selected.colorHex !== '#ffffff' ? `drop-shadow(0 0 0 ${selected.colorHex})` : undefined }}
                />
              ) : selected.type === 'text' ? (
                <span
                  className="layer-preview-text"
                  style={{
                    fontFamily: `"${selected.fontFamily}", sans-serif`,
                    color: selected.colorHex,
                  }}
                >
                  {selected.text || 'Text'}
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Font picker — text only */}
          {selected.type === 'text' ? (
            <div className="field-group compact-field shellless-field">
              <label>Font</label>
              <select
                value={selected.fontFamily}
                onChange={(event) => {
                  const picked = fontList.find((f) => f.family === event.target.value)
                  if (picked) updateLayer(selected.id, { fontFamily: picked.family, fontUrl: picked.url })
                }}
                className="inspector-select"
              >
                {fontList.map((f) => (
                  <option key={f.family} value={f.family}>{f.label}</option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Text input — text only */}
          {selected.type === 'text' ? (
            <div className="field-group compact-field text-field shellless-field">
              <label>Text</label>
              <input
                type="text"
                value={selected.text}
                onChange={(event) =>
                  updateLayer(selected.id, { text: event.target.value })
                }
              />
            </div>
          ) : null}

          {/* Color — all layer types */}
          <div className="field-group compact-field shellless-field color-field">
            <div className="color-bubble-wrap" title="Layer Color">
              <button
                ref={bubbleRef}
                type="button"
                className="color-bubble-btn"
                style={{ backgroundColor: selected.colorHex }}
                aria-label="Open color palette"
                onClick={openPopover}
              />
            </div>

            {swatchPopoverOpen && createPortal(
              <div
                className="swatch-popover"
                ref={popoverRef}
                style={{
                  position: 'fixed',
                  bottom: popoverPos.bottom,
                  left: popoverPos.left,
                  transform: 'translateX(-50%)',
                }}
              >
                <div className="swatch-popover-header">
                  <span>Color Palette</span>
                  <button
                    type="button"
                    className="swatch-popover-close"
                    onClick={() => setSwatchPopoverOpen(false)}
                    aria-label="Close palette"
                  >✕</button>
                </div>

                <div className="swatch-popover-grid" role="listbox" aria-label="Wrap color swatches">
                  {WRAP_COLOR_SWATCHES.map((swatch) => {
                    const active = selected.colorRef?.swatchId === swatch.id
                    return (
                      <button
                        key={swatch.id}
                        type="button"
                        className={active ? 'swatch-dot active' : 'swatch-dot'}
                        style={{ backgroundColor: swatch.colorHex }}
                        title={`${swatch.brand} ${swatch.code} - ${swatch.name} (${swatch.finish})`}
                        aria-label={`${swatch.brand} ${swatch.code} ${swatch.name}`}
                        onClick={() => { setSelectedSwatch(swatch.id); setSwatchPopoverOpen(false) }}
                      />
                    )
                  })}
                </div>

                <div className="swatch-popover-custom">
                  <label>Custom</label>
                  <input
                    type="color"
                    value={selected.colorHex}
                    onInput={(e) => setSelectedColor((e.target as HTMLInputElement).value, false)}
                    onChange={(e) => setSelectedColor((e.target as HTMLInputElement).value, true)}
                    aria-label="Custom color"
                  />
                </div>

                <span className="swatch-popover-meta">
                  {selected.colorRef
                    ? `${selected.colorRef.brand} ${selected.colorRef.code} • ${selected.colorRef.name}`
                    : 'Custom color'}
                </span>
              </div>,
              document.body
            )}
          </div>

          {/* Finish — all layer types */}
          <div className="field-group compact-field">
            <label>Finish</label>
            <div className="inline-actions">
              {finishOptions.map((finish) => (
                <button
                  key={finish}
                  type="button"
                  className={selected.finish === finish ? 'chip active' : 'chip'}
                  onClick={() => setSelectedFinish(finish)}
                >
                  {finish}
                </button>
              ))}
            </div>
          </div>

          {/* Opacity — all layer types */}
          <div className="field-group compact-field shellless-field">
            <label>Opacity</label>
            <div className="opacity-row">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={selected.transform.opacity}
                onChange={(event) =>
                  updateLayerTransient(selected.id, {
                    transform: { ...selected.transform, opacity: clampOpacity(event.target.value) },
                  })
                }
                onMouseUp={(event) =>
                  updateLayer(selected.id, {
                    transform: { ...selected.transform, opacity: clampOpacity((event.target as HTMLInputElement).value) },
                  })
                }
              />
              <span className="hint">{Math.round(selected.transform.opacity * 100)}%</span>
            </div>
          </div>

          {/* Blend mode — decal only */}
          {selected.type === 'decal' ? (
            <div className="field-group compact-field shellless-field">
              <label>Blend</label>
              <div className="inline-actions">
                {(['normal', 'multiply', 'additive'] as BlendMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={((selected as DecalLayer).blendMode ?? 'normal') === mode ? 'chip active' : 'chip'}
                    onClick={() => updateLayer(selected.id, { blendMode: mode })}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* ── Stripe-specific controls ── */}
          {selected.type === 'stripe' ? (
            <>
              <div className="field-group compact-field shellless-field">
                <label>Width</label>
                <div className="opacity-row">
                  <input type="range" min="0.0001" max="1.5" step="0.0001"
                    value={(selected as StripeLayer).stripeWidth}
                    onChange={(e) => updateLayerTransient(selected.id, { stripeWidth: clampStripeWidth(e.target.value) } as Partial<Layer>)}
                    onMouseUp={(e) => updateLayer(selected.id, { stripeWidth: clampStripeWidth((e.target as HTMLInputElement).value) } as Partial<Layer>)}
                  />
                  <span className="hint">{(selected as StripeLayer).stripeWidth.toFixed(2)}m</span>
                </div>
              </div>

              <div className="field-group compact-field shellless-field">
                <label>Offset</label>
                <div className="opacity-row">
                  <input type="range" min="-1.8" max="1.8" step="0.01"
                    value={(selected as StripeLayer).stripeOffsetX}
                    onChange={(e) => updateLayerTransient(selected.id, { stripeOffsetX: clampStripeOffset(e.target.value) } as Partial<Layer>)}
                    onMouseUp={(e) => updateLayer(selected.id, { stripeOffsetX: clampStripeOffset((e.target as HTMLInputElement).value) } as Partial<Layer>)}
                  />
                  <span className="hint">{(selected as StripeLayer).stripeOffsetX >= 0 ? '+' : ''}{(selected as StripeLayer).stripeOffsetX.toFixed(2)}</span>
                </div>
              </div>

              <div className="field-group compact-field">
                <label>Nudge</label>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="chip"
                    onClick={() => updateLayer(selected.id, { stripeOffsetX: clampStripeOffset((selected as StripeLayer).stripeOffsetX - 0.02) } as Partial<Layer>)}
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => updateLayer(selected.id, { stripeOffsetX: clampStripeOffset((selected as StripeLayer).stripeOffsetX + 0.02) } as Partial<Layer>)}
                  >
                    Right
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => updateLayer(selected.id, { stripeOffsetX: 0 } as Partial<Layer>)}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => updateLayer(selected.id, {
                      transform: {
                        ...selected.transform,
                        rotation: {
                          ...selected.transform.rotation,
                          z: clampRotation(selected.transform.rotation.z - 0.04),
                        },
                      },
                    })}
                  >
                    ↺
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => updateLayer(selected.id, {
                      transform: {
                        ...selected.transform,
                        rotation: {
                          ...selected.transform.rotation,
                          z: clampRotation(selected.transform.rotation.z + 0.04),
                        },
                      },
                    })}
                  >
                    ↻
                  </button>
                </div>
              </div>

              <div className="field-group compact-field">
                <label>Position</label>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="chip"
                    onClick={() => updateLayer(selected.id, { stripeOffsetX: -offsetSnapAmount } as Partial<Layer>)}
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => updateLayer(selected.id, { stripeOffsetX: 0 } as Partial<Layer>)}
                  >
                    Center
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => updateLayer(selected.id, { stripeOffsetX: offsetSnapAmount } as Partial<Layer>)}
                  >
                    Right
                  </button>
                </div>
              </div>

              <div className="field-group compact-field shellless-field">
                <label>Gap</label>
                <div className="opacity-row">
                  <input type="range" min="0" max="0.9" step="0.01"
                    value={(selected as StripeLayer).stripeGap ?? 0}
                    onChange={(e) => updateLayerTransient(selected.id, { stripeGap: clampNumber(e.target.value, { min: 0, max: 0.9 }) } as Partial<Layer>)}
                    onMouseUp={(e) => updateLayer(selected.id, { stripeGap: clampNumber((e.target as HTMLInputElement).value, { min: 0, max: 0.9 }) } as Partial<Layer>)}
                  />
                  <span className="hint">{((selected as StripeLayer).stripeGap ?? 0).toFixed(2)}</span>
                </div>
              </div>

              <div className="field-group compact-field shellless-field">
                <label>Soft Edge</label>
                <div className="opacity-row">
                  <input type="range" min="0" max="0.12" step="0.005"
                    value={(selected as StripeLayer).softEdge}
                    onChange={(e) => updateLayerTransient(selected.id, { softEdge: clampSoftEdge(e.target.value) } as Partial<Layer>)}
                    onMouseUp={(e) => updateLayer(selected.id, { softEdge: clampSoftEdge((e.target as HTMLInputElement).value) } as Partial<Layer>)}
                  />
                  <span className="hint">{(selected as StripeLayer).softEdge.toFixed(3)}</span>
                </div>
              </div>

              <div className="field-group compact-field icon-actions-field shellless-field">
                <label>Rotate</label>
                <div className="rotate-slider-wrap">
                  <input
                    type="range"
                    min="-6.28"
                    max="6.28"
                    step="0.01"
                    value={selected.transform.rotation.z}
                    onChange={(event) => {
                      const nextZ = clampRotation(event.target.value)
                      updateLayerTransient(selected.id, {
                        transform: {
                          ...selected.transform,
                          rotation: { ...selected.transform.rotation, z: nextZ },
                        },
                      })
                    }}
                    onMouseUp={(event) => {
                      const nextZ = clampRotation((event.target as HTMLInputElement).value)
                      updateLayer(selected.id, {
                        transform: {
                          ...selected.transform,
                          rotation: { ...selected.transform.rotation, z: nextZ },
                        },
                      })
                    }}
                  />
                  <div className="rotate-overlay-actions" aria-hidden="false">
                    <div className="rotate-overlay-top">
                      <button
                        type="button"
                        className="chip icon-chip"
                        onClick={() => rotateSelected(Math.PI / 2)}
                        title="Rotate 90 degrees"
                        aria-label="Rotate 90 degrees"
                      >
                        <span>90°</span>
                      </button>
                    </div>
                    <div className="rotate-overlay-row">
                      <button type="button" className="chip icon-chip" onClick={() => rotateSelected(-0.08)} title="Rotate Left" aria-label="Rotate Left">
                        <span className="action-icon" aria-hidden="true">↺</span>
                        <span>Left</span>
                      </button>
                      <button type="button" className="chip icon-chip" onClick={() => rotateSelected(0.08)} title="Rotate Right" aria-label="Rotate Right">
                        <span className="action-icon" aria-hidden="true">↻</span>
                        <span>Right</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="field-group compact-field">
                <label>Mirror</label>
                <div className="inline-actions">
                  <button
                    type="button"
                    className={selected.mirrorX ? 'chip active' : 'chip'}
                    onClick={() => updateLayer(selected.id, { mirrorX: true })}
                  >On</button>
                  <button
                    type="button"
                    className={!selected.mirrorX ? 'chip active' : 'chip'}
                    onClick={() => updateLayer(selected.id, { mirrorX: false })}
                  >Off</button>
                </div>
              </div>
            </>
          ) : null}

          {selected.type === 'split' ? (
            <>
              <div className="field-group compact-field shellless-field">
                <label>Side 1</label>
                <WrapColorPicker
                  value={selected.colorHex}
                  onChange={(hex) => updateLayer(selected.id, { colorHex: hex, colorRef: null })}
                  label="Side 1 color"
                />
              </div>

              <div className="field-group compact-field shellless-field">
                <label>Side 2</label>
                <WrapColorPicker
                  value={selected.sideBColorHex}
                  onChange={(hex) => updateLayer(selected.id, { sideBColorHex: hex } as Partial<Layer>)}
                  label="Side 2 color"
                />
              </div>

              <div className="field-group compact-field shellless-field">
                <label>Split Offset</label>
                <div className="opacity-row">
                  <input
                    type="range"
                    min="-1.8"
                    max="1.8"
                    step="0.01"
                    value={selected.splitOffsetX}
                    onChange={(e) => updateLayerTransient(selected.id, { splitOffsetX: clampStripeOffset(e.target.value) } as Partial<Layer>)}
                    onMouseUp={(e) => updateLayer(selected.id, { splitOffsetX: clampStripeOffset((e.target as HTMLInputElement).value) } as Partial<Layer>)}
                  />
                  <span className="hint">{selected.splitOffsetX >= 0 ? '+' : ''}{selected.splitOffsetX.toFixed(2)}</span>
                </div>
              </div>

              <div className="field-group compact-field">
                <label>Nudge</label>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="chip"
                    onClick={() => updateLayer(selected.id, { splitOffsetX: clampStripeOffset(selected.splitOffsetX - 0.02) } as Partial<Layer>)}
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => updateLayer(selected.id, { splitOffsetX: clampStripeOffset(selected.splitOffsetX + 0.02) } as Partial<Layer>)}
                  >
                    Right
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => updateLayer(selected.id, { splitOffsetX: 0 } as Partial<Layer>)}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => updateLayer(selected.id, {
                      transform: {
                        ...selected.transform,
                        rotation: {
                          ...selected.transform.rotation,
                          z: clampRotation(selected.transform.rotation.z - 0.04),
                        },
                      },
                    })}
                  >
                    ↺
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => updateLayer(selected.id, {
                      transform: {
                        ...selected.transform,
                        rotation: {
                          ...selected.transform.rotation,
                          z: clampRotation(selected.transform.rotation.z + 0.04),
                        },
                      },
                    })}
                  >
                    ↻
                  </button>
                </div>
              </div>

              <div className="field-group compact-field">
                <label>Position</label>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="chip"
                    onClick={() => updateLayer(selected.id, { splitOffsetX: -offsetSnapAmount } as Partial<Layer>)}
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => updateLayer(selected.id, { splitOffsetX: 0 } as Partial<Layer>)}
                  >
                    Center
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => updateLayer(selected.id, { splitOffsetX: offsetSnapAmount } as Partial<Layer>)}
                  >
                    Right
                  </button>
                </div>
              </div>

              <div className="field-group compact-field shellless-field">
                <label>Blend Edge</label>
                <div className="opacity-row">
                  <input
                    type="range"
                    min="0"
                    max="0.2"
                    step="0.005"
                    value={selected.softEdge}
                    onChange={(e) => updateLayerTransient(selected.id, { softEdge: clampNumber(e.target.value, { min: 0, max: 0.2 }) } as Partial<Layer>)}
                    onMouseUp={(e) => updateLayer(selected.id, { softEdge: clampNumber((e.target as HTMLInputElement).value, { min: 0, max: 0.2 }) } as Partial<Layer>)}
                  />
                  <span className="hint">{selected.softEdge.toFixed(3)}</span>
                </div>
              </div>

              <div className="field-group compact-field icon-actions-field shellless-field">
                <label>Rotate</label>
                <div className="rotate-slider-wrap">
                  <input
                    type="range"
                    min="-6.28"
                    max="6.28"
                    step="0.01"
                    value={selected.transform.rotation.z}
                    onChange={(event) => {
                      const nextZ = clampRotation(event.target.value)
                      updateLayerTransient(selected.id, {
                        transform: {
                          ...selected.transform,
                          rotation: { ...selected.transform.rotation, z: nextZ },
                        },
                      })
                    }}
                    onMouseUp={(event) => {
                      const nextZ = clampRotation((event.target as HTMLInputElement).value)
                      updateLayer(selected.id, {
                        transform: {
                          ...selected.transform,
                          rotation: { ...selected.transform.rotation, z: nextZ },
                        },
                      })
                    }}
                  />
                  <div className="rotate-overlay-actions" aria-hidden="false">
                    <div className="rotate-overlay-top">
                      <button
                        type="button"
                        className="chip icon-chip"
                        onClick={() => rotateSelected(Math.PI / 2)}
                        title="Rotate 90 degrees"
                        aria-label="Rotate 90 degrees"
                      >
                        <span>90°</span>
                      </button>
                    </div>
                    <div className="rotate-overlay-row">
                      <button type="button" className="chip icon-chip" onClick={() => rotateSelected(-0.08)} title="Rotate Left" aria-label="Rotate Left">
                        <span className="action-icon" aria-hidden="true">↺</span>
                        <span>Left</span>
                      </button>
                      <button type="button" className="chip icon-chip" onClick={() => rotateSelected(0.08)} title="Rotate Right" aria-label="Rotate Right">
                        <span className="action-icon" aria-hidden="true">↻</span>
                        <span>Right</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {/* ── Decal / text positional controls ── */}
          {selected.type === 'decal' || selected.type === 'text' ? (
            <>
              <div className="field-group compact-field scale-stack-field">
                <div className="scale-row">
                  <label>Uniform</label>
                  <input
                    type="range"
                    min="0.1"
                    max="10.0"
                    step="0.01"
                    value={uniformScale}
                    onChange={(event) => {
                      const nextScale = clampNumber(event.target.value, { min: 0.1, max: 10 })
                      updateLayer(selected.id, {
                        transform: {
                          ...selected.transform,
                          scale: { x: nextScale, y: nextScale, z: nextScale },
                        },
                      })
                    }}
                  />
                </div>

                <div className="scale-row">
                  <label>Horizontal</label>
                  <input
                    type="range"
                    min="0.05"
                    max="10.0"
                    step="0.01"
                    value={selected.transform.scale.x}
                    onChange={(event) => {
                      const nextScale = clampNumber(event.target.value, { min: 0.05, max: 10 })
                      updateLayer(selected.id, {
                        transform: {
                          ...selected.transform,
                          scale: { ...selected.transform.scale, x: nextScale },
                        },
                      })
                    }}
                  />
                </div>

                <div className="scale-row">
                  <label>Vertical</label>
                  <input
                    type="range"
                    min="0.05"
                    max="5.0"
                    step="0.01"
                    value={selected.transform.scale.y}
                    onChange={(event) => {
                      const nextScale = clampNumber(event.target.value, { min: 0.05, max: 5 })
                      updateLayer(selected.id, {
                        transform: {
                          ...selected.transform,
                          scale: { ...selected.transform.scale, y: nextScale },
                        },
                      })
                    }}
                  />
                </div>
              </div>

              <div className="field-group compact-field">
                <label>Nudge</label>
                <div className="inline-actions">
                  <button type="button" className="chip" onClick={() => nudgeSelected('y', -nudgeStep)}>Y-</button>
                  <button type="button" className="chip" onClick={() => nudgeSelected('y', nudgeStep)}>Y+</button>
                  <button type="button" className="chip" onClick={() => nudgeSelected('z', -nudgeStep)}>Z-</button>
                  <button type="button" className="chip" onClick={() => nudgeSelected('z', nudgeStep)}>Z+</button>
                </div>
                <input
                  type="range"
                  min="0.005"
                  max="0.15"
                  step="0.005"
                  value={nudgeStep}
                  onChange={(event) => setNudgeStep(clampNumber(event.target.value, { min: 0.005, max: 0.15 }))}
                  aria-label="Nudge speed"
                />
                <span className="hint">Speed {nudgeStep.toFixed(3)}</span>
              </div>

              <div className="field-group compact-field icon-actions-field shellless-field">
                <label>Rotate</label>
                <div className="rotate-slider-wrap">
                  <input
                    type="range"
                    min="-6.28"
                    max="6.28"
                    step="0.01"
                    value={selected.transform.rotation.z}
                    onChange={(event) => {
                      const nextZ = clampRotation(event.target.value)
                      updateLayer(selected.id, {
                        transform: {
                          ...selected.transform,
                          rotation: { ...selected.transform.rotation, z: nextZ },
                        },
                      })
                    }}
                  />
                  <div className="rotate-overlay-actions" aria-hidden="false">
                    <div className="rotate-overlay-top">
                      <button
                        type="button"
                        className="chip icon-chip"
                        onClick={() => rotateSelected(Math.PI / 2)}
                        title="Rotate 90 degrees"
                        aria-label="Rotate 90 degrees"
                      >
                        <span>90°</span>
                      </button>
                    </div>
                    <div className="rotate-overlay-row">
                      <button type="button" className="chip icon-chip" onClick={() => rotateSelected(-0.08)} title="Rotate Left" aria-label="Rotate Left">
                        <span className="action-icon" aria-hidden="true">↺</span>
                        <span>Left</span>
                      </button>
                      <button type="button" className="chip icon-chip" onClick={() => rotateSelected(0.08)} title="Rotate Right" aria-label="Rotate Right">
                        <span className="action-icon" aria-hidden="true">↻</span>
                        <span>Right</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {selected.type === 'text' ? (
                <>
                  <div className="field-group compact-field text-shape-card">
                    <div className="text-shape-section">
                      <label>Size</label>
                      <div className="inline-actions text-size-row">
                        {([['XS', 0.18], ['S', 0.28], ['M', 0.45], ['L', 0.7], ['XL', 1.1]] as [string, number][]).map(([label, s]) => (
                          <button
                            key={label}
                            type="button"
                            className={Math.abs(selected.transform.scale.x - s) < 0.06 ? 'chip active' : 'chip'}
                            onClick={() => {
                              updateLayer(selected.id, { transform: { ...selected.transform, scale: { x: s, y: s, z: s } } })
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="text-shape-section">
                      <label>Curve</label>
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.05"
                        value={selected.textCurve ?? 0}
                        onChange={(event) =>
                          updateLayer(selected.id, { textCurve: clampNumber(event.target.value, { min: -1, max: 1 }) })
                        }
                      />
                    </div>

                    <div className="inline-actions curve-presets-row text-curve-presets-card-row">
                      {([['Flat', 0], ['Soft', 0.4], ['Arc', 0.72], ['Full', 1.0]] as [string, number][]).map(([label, v]) => (
                        <button
                          key={label}
                          type="button"
                          className={Math.abs((selected.textCurve ?? 0) - v) < 0.08 ? 'chip active' : 'chip'}
                          onClick={() => updateLayer(selected.id, { textCurve: v })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}

              <div className="field-group compact-field icon-actions-field shellless-field flip-field">
                <label>Flip</label>
                <div className="inline-actions icon-actions">
                  <button
                    type="button"
                    className={selected.mirrorX ? 'chip icon-chip icon-only active' : 'chip icon-chip icon-only'}
                    onClick={() => setSelectedMirror(true)}
                    title="Flip Left"
                    aria-label="Flip Left"
                  >
                    <span className="action-icon" aria-hidden="true">⇤</span>
                  </button>
                  <button
                    type="button"
                    className={!selected.mirrorX ? 'chip icon-chip icon-only active' : 'chip icon-chip icon-only'}
                    onClick={() => setSelectedMirror(false)}
                    title="Flip Right"
                    aria-label="Flip Right"
                  >
                    <span className="action-icon" aria-hidden="true">⇥</span>
                  </button>
                </div>
              </div>

              <div className="field-group compact-field icon-actions-field shellless-field">
                <label>Mirror Side</label>
                <div className="inline-actions icon-actions">
                  <button
                    type="button"
                    className={selected.mirrorToOtherSide ? 'chip icon-chip active' : 'chip icon-chip'}
                    onClick={() => setSelectedSideMirror(true)}
                    title="Project on both sides"
                    aria-label="Project on both sides"
                  >
                    <span>On</span>
                  </button>
                  <button
                    type="button"
                    className={!selected.mirrorToOtherSide ? 'chip icon-chip active' : 'chip icon-chip'}
                    onClick={() => setSelectedSideMirror(false)}
                    title="Project only on this side"
                    aria-label="Project only on this side"
                  >
                    <span>Off</span>
                  </button>
                </div>
              </div>

              {selected.mirrorToOtherSide && selected.type === 'text' ? (
                <div className="field-group compact-field icon-actions-field shellless-field">
                  <label>Mirror Text</label>
                  <div className="inline-actions icon-actions">
                    <button
                      type="button"
                      className={(selected.mirroredTextReadable ?? true) ? 'chip icon-chip active' : 'chip icon-chip'}
                      onClick={() => updateLayer(selected.id, { mirroredTextReadable: true })}
                      title="Keep mirrored text readable"
                      aria-label="Keep mirrored text readable"
                    >
                      <span>Flip</span>
                    </button>
                    <button
                      type="button"
                      className={!(selected.mirroredTextReadable ?? true) ? 'chip icon-chip active' : 'chip icon-chip'}
                      onClick={() => updateLayer(selected.id, { mirroredTextReadable: false })}
                      title="Match front-side flip"
                      aria-label="Match front-side flip"
                    >
                      <span>Match</span>
                    </button>
                  </div>
                </div>
              ) : null}

              {selected.mirrorToOtherSide ? (
                <div className="field-group compact-field shellless-field color-field mirror-color-field">
                  <label>{selected.type === 'text' ? 'Mirror Text Color' : 'Mirror Decal Color'}</label>
                  <div className="color-bubble-wrap" title="Mirror Side Color">
                    <button
                      ref={mirrorBubbleRef}
                      type="button"
                      className="color-bubble-btn"
                      style={{ backgroundColor: selected.mirrorColorHex ?? selected.colorHex }}
                      aria-label="Open mirror color palette"
                      onClick={() => {
                        const rect = mirrorBubbleRef.current?.getBoundingClientRect()
                        if (rect) {
                          setMirrorPopoverPos({
                            bottom: window.innerHeight - rect.top + 6,
                            left: rect.left + rect.width / 2,
                          })
                        }
                        setMirrorPopoverOpen((v) => !v)
                      }}
                    />
                  </div>

                  {mirrorPopoverOpen && createPortal(
                    <div
                      className="swatch-popover"
                      ref={mirrorPopoverRef}
                      style={{
                        position: 'fixed',
                        bottom: mirrorPopoverPos.bottom,
                        left: mirrorPopoverPos.left,
                        transform: 'translateX(-50%)',
                      }}
                    >
                      <div className="swatch-popover-header">
                        <span>{selected.type === 'text' ? 'Mirror Text Color' : 'Mirror Color'}</span>
                        <button
                          type="button"
                          className="swatch-popover-close"
                          onClick={() => setMirrorPopoverOpen(false)}
                          aria-label="Close palette"
                        >✕</button>
                      </div>

                      <div className="swatch-popover-grid" role="listbox" aria-label="Mirror color swatches">
                        {WRAP_COLOR_SWATCHES.map((swatch) => (
                          <button
                            key={swatch.id}
                            type="button"
                            className={(selected.mirrorColorHex === swatch.colorHex) ? 'swatch-dot active' : 'swatch-dot'}
                            style={{ backgroundColor: swatch.colorHex }}
                            title={`${swatch.brand} ${swatch.code} - ${swatch.name} (${swatch.finish})`}
                            aria-label={`${swatch.brand} ${swatch.code} ${swatch.name}`}
                            onClick={() => {
                              updateLayer(selected.id, { mirrorColorHex: swatch.colorHex })
                              setMirrorPopoverOpen(false)
                            }}
                          />
                        ))}
                      </div>

                      <div className="swatch-popover-custom">
                        <label>Custom</label>
                        <input
                          type="color"
                          value={selected.mirrorColorHex ?? selected.colorHex}
                          onChange={(e) => updateLayer(selected.id, { mirrorColorHex: validateColorHex(e.target.value, selected.colorHex) })}
                          aria-label="Custom mirror color"
                        />
                      </div>

                      <button
                        type="button"
                        className="chip"
                        onClick={() => {
                          updateLayer(selected.id, { mirrorColorHex: null })
                          setMirrorPopoverOpen(false)
                        }}
                      >
                        Match Original
                      </button>

                      <span className="swatch-popover-meta">
                        {selected.mirrorColorHex ? 'Custom color' : 'Matches original'}
                      </span>
                    </div>,
                    document.body
                  )}
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : activePrint && selectedPaintTarget ? (
        <>
          <div className="field-group compact-field shellless-field">
            <label style={{ fontSize: '0.72rem', color: '#8aa0b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Print Layer</label>
            <span className="hint" style={{ marginLeft: 'auto' }}>{activePrintTargetLabel}</span>
          </div>

          <div className="field-group compact-field shellless-field">
            <label>Tile Scale</label>
            <div className="opacity-row">
              <input
                type="range"
                min={0.5}
                max={20}
                step={0.5}
                value={activePrint.tileScale}
                onChange={(e) => {
                  setTargetPrint(selectedPaintTarget, {
                    ...activePrint,
                    tileScale: clampNumber(e.target.value, { min: 0.5, max: 20 }),
                  })
                }}
              />
              <span className="hint">{activePrint.tileScale.toFixed(1)}x</span>
            </div>
          </div>

          <div className="field-group compact-field shellless-field">
            <label>Opacity</label>
            <div className="opacity-row">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={activePrint.opacity}
                onChange={(e) => {
                  setTargetPrint(selectedPaintTarget, {
                    ...activePrint,
                    opacity: clampOpacity(e.target.value),
                  })
                }}
              />
              <span className="hint">{Math.round(activePrint.opacity * 100)}%</span>
            </div>
          </div>

          <div className="field-group compact-field shellless-field">
            <label>Tint</label>
            <WrapColorPicker
              value={activePrint.tintHex}
              onChange={(hex) => {
                setTargetPrint(selectedPaintTarget, {
                  ...activePrint,
                  tintHex: hex,
                })
              }}
              label="Print tint color"
            />
          </div>

          <div className="field-group compact-field">
            <button
              type="button"
              className="chip"
              style={{ color: '#f87171' }}
              onClick={() => clearTargetPrint(selectedPaintTarget)}
            >
              Remove Print
            </button>
          </div>
        </>
      ) : activeCarTool === 'stripes' && carStripe.enabled ? (
        <>
          <div className="field-group compact-field shellless-field">
            <label style={{ fontSize: '0.72rem', color: '#8aa0b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Racing Stripes</label>
          </div>

          <div className="field-group compact-field shellless-field">
            <label>Color</label>
            <WrapColorPicker
              value={carStripe.colorHex}
              onChange={(hex) => setCarStripe({ colorHex: hex })}
              label="Stripe color"
            />
          </div>

          <div className="field-group compact-field shellless-field">
            <label>Finish</label>
            <select
              value={carStripe.finish}
              onChange={(e) => setCarStripe({ finish: e.target.value as 'gloss' | 'matte' | 'chrome' | 'satin' })}
              aria-label="Stripe finish"
            >
              <option value="gloss">Gloss</option>
              <option value="matte">Matte</option>
              <option value="chrome">Chrome</option>
              <option value="satin">Satin</option>
            </select>
          </div>

          <div className="field-group compact-field shellless-field">
            <label>Width</label>
            <div className="opacity-row">
              <input type="range" min={0.04} max={0.5} step={0.01}
                value={carStripe.width}
                onChange={(e) => setCarStripe({ width: clampNumber(e.target.value, { min: 0.04, max: 0.5 }) })}
              />
              <span className="hint">{carStripe.width.toFixed(2)}</span>
            </div>
          </div>

          <div className="field-group compact-field shellless-field">
            <label>Gap</label>
            <div className="opacity-row">
              <input type="range" min={0} max={0.9} step={0.01}
                value={carStripe.gap}
                onChange={(e) => setCarStripe({ gap: clampNumber(e.target.value, { min: 0, max: 0.9 }) })}
              />
              <span className="hint">{carStripe.gap.toFixed(2)}</span>
            </div>
          </div>

          <div className="field-group compact-field shellless-field">
            <label>Offset</label>
            <div className="opacity-row">
              <input type="range" min={-2} max={2} step={0.01}
                value={carStripe.offsetX}
                onChange={(e) => setCarStripe({ offsetX: clampNumber(e.target.value, { min: -2, max: 2 }) })}
              />
              <span className="hint">{carStripe.offsetX >= 0 ? '+' : ''}{carStripe.offsetX.toFixed(2)}</span>
            </div>
          </div>

          <div className="field-group compact-field">
            <label>Nudge</label>
            <div className="inline-actions">
              <button type="button" className="chip" onClick={() => setCarStripe({ offsetX: clampNumber(carStripe.offsetX - 0.02, { min: -2, max: 2 }) })}>Left</button>
              <button type="button" className="chip" onClick={() => setCarStripe({ offsetX: clampNumber(carStripe.offsetX + 0.02, { min: -2, max: 2 }) })}>Right</button>
              <button type="button" className="chip" onClick={() => setCarStripe({ offsetX: 0 })}>Reset</button>
              <button type="button" className="chip" onClick={() => setCarStripe({ angle: clampNumber(carStripe.angle - 0.04, { min: -3.1416, max: 3.1416 }) })}>↺</button>
              <button type="button" className="chip" onClick={() => setCarStripe({ angle: clampNumber(carStripe.angle + 0.04, { min: -3.1416, max: 3.1416 }) })}>↻</button>
            </div>
          </div>

          <div className="field-group compact-field">
            <label>Position</label>
            <div className="inline-actions">
              <button type="button" className="chip" onClick={() => setCarStripe({ offsetX: -offsetSnapAmount })}>Left</button>
              <button type="button" className="chip" onClick={() => setCarStripe({ offsetX: 0 })}>Center</button>
              <button type="button" className="chip" onClick={() => setCarStripe({ offsetX: offsetSnapAmount })}>Right</button>
            </div>
          </div>

          <div className="field-group compact-field shellless-field">
            <label>Blend</label>
            <div className="opacity-row">
              <input type="range" min={0} max={0.15} step={0.005}
                value={carStripe.softEdge}
                onChange={(e) => setCarStripe({ softEdge: clampNumber(e.target.value, { min: 0, max: 0.15 }) })}
              />
              <span className="hint">{carStripe.softEdge.toFixed(3)}</span>
            </div>
          </div>

          <div className="field-group compact-field shellless-field">
            <label>Angle</label>
            <div className="opacity-row">
              <input type="range" min={-3.1416} max={3.1416} step={0.01}
                value={carStripe.angle}
                onChange={(e) => setCarStripe({ angle: clampNumber(e.target.value, { min: -3.1416, max: 3.1416 }) })}
              />
              <span className="hint">{Math.round((carStripe.angle * 180) / Math.PI)}°</span>
            </div>
          </div>

          <div className="field-group compact-field">
            <button
              type="button"
              className="chip"
              style={{ color: '#f87171' }}
              onClick={() => setCarStripe({ enabled: false, colorHex: '#f5f5f5', finish: 'gloss', width: 0.14, gap: 0, offsetX: 0, softEdge: 0.02, angle: 0 })}
            >
              Remove Stripes
            </button>
          </div>
        </>
      ) : activeCarTool === 'split' ? (
        <>
          <div className="field-group compact-field shellless-field">
            <label style={{ fontSize: '0.72rem', color: '#8aa0b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Split Paint</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', marginLeft: 'auto' }}>
              <input
                type="checkbox"
                checked={carSplit.enabled}
                onChange={(e) => setCarSplit({ enabled: e.target.checked })}
                aria-label="Enable split paint"
              />
              <span style={{ fontSize: '0.72rem', color: '#8aa0b8' }}>On</span>
            </label>
          </div>

          <div className="field-group compact-field shellless-field">
            <label>Side A</label>
            <WrapColorPicker
              value={carSplit.sideAHex}
              onChange={(hex) => setCarSplit({ sideAHex: hex })}
              label="Side A color"
            />
          </div>

          <div className="field-group compact-field shellless-field">
            <label>Side B</label>
            <WrapColorPicker
              value={carSplit.sideBHex}
              onChange={(hex) => setCarSplit({ sideBHex: hex })}
              label="Side B color"
            />
          </div>

          <div className="field-group compact-field shellless-field">
            <label>Finish</label>
            <select
              value={carSplit.finish}
              onChange={(e) => setCarSplit({ finish: e.target.value as 'gloss' | 'matte' | 'chrome' | 'satin' })}
              aria-label="Split finish"
            >
              <option value="gloss">Gloss</option>
              <option value="matte">Matte</option>
              <option value="chrome">Chrome</option>
              <option value="satin">Satin</option>
            </select>
          </div>

          <div className="field-group compact-field shellless-field">
            <label>Offset</label>
            <div className="opacity-row">
              <input type="range" min={-2} max={2} step={0.01}
                value={carSplit.offsetX}
                onChange={(e) => setCarSplit({ offsetX: clampNumber(e.target.value, { min: -2, max: 2 }) })}
              />
              <span className="hint">{carSplit.offsetX >= 0 ? '+' : ''}{carSplit.offsetX.toFixed(2)}</span>
            </div>
          </div>

          <div className="field-group compact-field">
            <label>Nudge</label>
            <div className="inline-actions">
              <button type="button" className="chip" onClick={() => setCarSplit({ offsetX: clampNumber(carSplit.offsetX - 0.02, { min: -2, max: 2 }) })}>Left</button>
              <button type="button" className="chip" onClick={() => setCarSplit({ offsetX: clampNumber(carSplit.offsetX + 0.02, { min: -2, max: 2 }) })}>Right</button>
              <button type="button" className="chip" onClick={() => setCarSplit({ offsetX: 0 })}>Reset</button>
              <button type="button" className="chip" onClick={() => setCarSplit({ angle: clampNumber(carSplit.angle - 0.04, { min: -3.1416, max: 3.1416 }) })}>↺</button>
              <button type="button" className="chip" onClick={() => setCarSplit({ angle: clampNumber(carSplit.angle + 0.04, { min: -3.1416, max: 3.1416 }) })}>↻</button>
            </div>
          </div>

          <div className="field-group compact-field">
            <label>Position</label>
            <div className="inline-actions">
              <button type="button" className="chip" onClick={() => setCarSplit({ offsetX: -offsetSnapAmount })}>Left</button>
              <button type="button" className="chip" onClick={() => setCarSplit({ offsetX: 0 })}>Center</button>
              <button type="button" className="chip" onClick={() => setCarSplit({ offsetX: offsetSnapAmount })}>Right</button>
            </div>
          </div>

          <div className="field-group compact-field shellless-field">
            <label>Blend</label>
            <div className="opacity-row">
              <input type="range" min={0} max={0.2} step={0.005}
                value={carSplit.softEdge}
                onChange={(e) => setCarSplit({ softEdge: clampNumber(e.target.value, { min: 0, max: 0.2 }) })}
              />
              <span className="hint">{carSplit.softEdge.toFixed(3)}</span>
            </div>
          </div>

          <div className="field-group compact-field shellless-field">
            <label>Angle</label>
            <div className="opacity-row">
              <input type="range" min={-3.1416} max={3.1416} step={0.01}
                value={carSplit.angle}
                onChange={(e) => setCarSplit({ angle: clampNumber(e.target.value, { min: -3.1416, max: 3.1416 }) })}
              />
              <span className="hint">{Math.round((carSplit.angle * 180) / Math.PI)}°</span>
            </div>
          </div>

          <div className="field-group compact-field">
            <button
              type="button"
              className="chip"
              style={{ color: '#f87171' }}
              onClick={() => { setCarSplit({ enabled: false, sideAHex: '#000000', sideBHex: '#ffffff', finish: 'gloss', offsetX: 0, softEdge: 0.02, angle: 0 }); setActiveCarTool(null) }}
            >
              Remove Split
            </button>
          </div>
        </>
      ) : (
        <p className="hint">Select a layer to edit its details.</p>
      )}
    </section>
  )
}
