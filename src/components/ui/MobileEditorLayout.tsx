import { useEffect, useState } from 'react'
import { Layers, Type, Car } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { cleanFontDisplayName } from '../../lib/fontNames'
import type { PaintTargetId } from '../../lib/paintTargets'

type TabId = 'car' | 'text' | 'elements' | 'stripes' | 'split' | 'tint' | 'layers'

interface MobileEditorLayoutProps {
  editorCanvas: React.ReactNode
  isGuest: boolean
  onGuestSignIn: () => void
  simplified?: boolean
}

// ── Static data ─────────────────────────────────────────────────
const CAR_COLORS = [
  { name: 'Red',      hex: '#CC1010' },
  { name: 'Blue',     hex: '#1050CC' },
  { name: 'Green',    hex: '#10A030' },
  { name: 'Yellow',   hex: '#D4B800' },
  { name: 'Black',    hex: '#111111' },
  { name: 'White',    hex: '#F5F5F5' },
  { name: 'Silver',   hex: '#A0A8B0' },
  { name: 'Orange',   hex: '#E05010' },
  { name: 'Purple',   hex: '#6020A0' },
  { name: 'Pink',     hex: '#D02080' },
  { name: 'Navy',     hex: '#101870' },
  { name: 'Burgundy', hex: '#5C1010' },
  { name: 'Gold',     hex: '#C8980A' },
  { name: 'Teal',     hex: '#0A7878' },
]

const PAINT_TARGETS: Array<{ id: PaintTargetId; label: string }> = [
  { id: 'fullCar', label: 'Full car' },
  { id: 'hood',    label: 'Hood' },
  { id: 'trunk',   label: 'trunk' },
  { id: 'rims',    label: 'rims' },
]

const FINISHES = [
  { id: 'gloss'  as const, label: 'gloss'  },
  { id: 'matte'  as const, label: 'matte'  },
  { id: 'chrome' as const, label: 'chrome' },
  { id: 'satin'  as const, label: 'satin'  },
]

const FONT_PRESETS = [
  { label: 'Arial',     family: 'Arial' },
  { label: 'Verdana',   family: 'Verdana' },
  { label: 'Trebuchet', family: 'Trebuchet MS' },
  { label: 'Impact',    family: 'Impact' },
  { label: 'Georgia',   family: 'Georgia' },
  { label: 'Tahoma',    family: 'Tahoma' },
  { label: 'Times',     family: 'Times New Roman' },
  { label: 'Courier',   family: 'Courier New' },
]

const STRIPE_PRESETS = [
  { id: 'single', label: 'Single',  preview: 'linear-gradient(to right,#444 0%,#444 43%,#eee 43%,#eee 57%,#444 57%)',   config: { colorHex: '#f5f5f5', finish: 'gloss' as const, width: 0.14, gap: 0, offsetX: 0, softEdge: 0.02, angle: 0 } },
  { id: 'wide',   label: 'Wide',    preview: 'linear-gradient(to right,#444 0%,#444 30%,#eee 30%,#eee 70%,#444 70%)',   config: { colorHex: '#f5f5f5', finish: 'gloss' as const, width: 0.26, gap: 0, offsetX: 0, softEdge: 0.02, angle: 0 } },
  { id: 'double', label: 'Double',  preview: 'linear-gradient(to right,#444 0%,#444 17%,#eee 17%,#eee 30%,#444 30%,#444 70%,#eee 70%,#eee 83%,#444 83%)', config: { colorHex: '#f5f5f5', finish: 'gloss' as const, width: 0.09, gap: 0.28, offsetX: 0, softEdge: 0.02, angle: 0 } },
  { id: 'angled', label: 'Angled',  preview: 'linear-gradient(80deg,#444 0%,#444 43%,#eee 43%,#eee 57%,#444 57%)',      config: { colorHex: '#f5f5f5', finish: 'gloss' as const, width: 0.14, gap: 0, offsetX: 0, softEdge: 0.02, angle: 0.22 } },
]

const SPLIT_PRESETS = [
  { id: 'center',      label: 'Center',      preview: 'linear-gradient(to right,#111 50%,#eee 50%)',                      config: { sideAHex: '#000', sideBHex: '#fff', finish: 'gloss' as const, offsetX: 0,    softEdge: 0.02, angle: 0 } },
  { id: 'soft',        label: 'Soft',        preview: 'linear-gradient(to right,#111 30%,#666 50%,#eee 70%)',              config: { sideAHex: '#000', sideBHex: '#fff', finish: 'gloss' as const, offsetX: 0,    softEdge: 0.09, angle: 0 } },
  { id: 'angled',      label: 'Angled',      preview: 'linear-gradient(125deg,#111 48%,#eee 52%)',                         config: { sideAHex: '#000', sideBHex: '#fff', finish: 'gloss' as const, offsetX: 0,    softEdge: 0.02, angle: 0.45 } },
  { id: 'sharpAngle',  label: 'Sharp',       preview: 'linear-gradient(110deg,#111 48%,#eee 52%)',                         config: { sideAHex: '#000', sideBHex: '#fff', finish: 'gloss' as const, offsetX: 0,    softEdge: 0.02, angle: 0.75 } },
  { id: 'leftHeavy',   label: 'Left',        preview: 'linear-gradient(to right,#111 68%,#eee 68%)',                       config: { sideAHex: '#000', sideBHex: '#fff', finish: 'gloss' as const, offsetX: -0.5, softEdge: 0.02, angle: 0 } },
  { id: 'rightHeavy',  label: 'Right',       preview: 'linear-gradient(to right,#111 32%,#eee 32%)',                       config: { sideAHex: '#000', sideBHex: '#fff', finish: 'gloss' as const, offsetX: 0.5,  softEdge: 0.02, angle: 0 } },
]

const TINT_OPACITIES = [
  { label: '15%', amount: 15 },
  { label: '35%', amount: 35 },
  { label: '50%', amount: 50 },
  { label: '70%', amount: 70 },
  { label: '90%', amount: 90 },
]

const TINT_COLORS = ['#101820', '#1a1000', '#001810', '#100010', '#181818']

// ── Types ───────────────────────────────────────────────────────
type FontItem = { label: string; family: string; url?: string }
type DecalItem = { name: string; url: string; fileName: string }

// ── Component ──────────────────────────────────────────────────
export function MobileEditorLayout({ editorCanvas, isGuest, onGuestSignIn }: MobileEditorLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabId | null>(null)

  // Car paint
  const setPaint               = useEditorStore(s => s.setPaint)
  const setSelectedPaintTarget = useEditorStore(s => s.setSelectedPaintTarget)
  const selectedPaintTarget    = useEditorStore(s => s.selectedPaintTarget)
  const currentFinish          = useEditorStore(s => s.project.paint.finish)
  const [paintMode, setPaintMode] = useState<'paint' | 'gradient'>('paint')

  // Gradient
  const carGradient    = useEditorStore(s => s.project.carGradient)
  const setCarGradient = useEditorStore(s => s.setCarGradient)

  // Text
  const addTextLayer = useEditorStore(s => s.addTextLayer)
  const setTool      = useEditorStore(s => s.setTool)
  const [fonts, setFonts] = useState<FontItem[]>(FONT_PRESETS)
  const [selectedFont, setSelectedFont] = useState<string>('Impact')

  // Elements / decals
  const addDecalLayer = useEditorStore(s => s.addDecalLayer)
  const [decals, setDecals] = useState<DecalItem[]>([])
  const [decalsLoading, setDecalsLoading] = useState(false)

  // Gradient color slot
  const [gradColorSlot, setGradColorSlot] = useState<1 | 2>(1)

  // Stripes
  const carStripe    = useEditorStore(s => s.project.carStripe)
  const setCarStripe = useEditorStore(s => s.setCarStripe)
  const [stripeSlider, setStripeSlider] = useState<'width' | 'angle' | 'offset'>('width')

  // Split
  const carSplit    = useEditorStore(s => s.project.carSplit)
  const setCarSplit = useEditorStore(s => s.setCarSplit)
  const [splitSlider, setSplitSlider] = useState<'angle' | 'offset' | 'soft'>('angle')
  const [splitSide, setSplitSide] = useState<'A' | 'B'>('A')

  // Tint
  const windowTint    = useEditorStore(s => s.project.windowTint)
  const setWindowTint = useEditorStore(s => s.setWindowTint)

  // Layers
  const layers               = useEditorStore(s => s.project.layers)
  const selectedLayerId      = useEditorStore(s => s.selectedLayerId)
  const setSelectedLayer     = useEditorStore(s => s.setSelectedLayer)
  const removeLayer          = useEditorStore(s => s.removeLayer)
  const updateLayer          = useEditorStore(s => s.updateLayer)
  const updateLayerTransient = useEditorStore(s => s.updateLayerTransient)

  // Selected layer (derived)
  const selectedLayer = layers.find(l => l.id === selectedLayerId) ?? null

  // Load fonts
  useEffect(() => {
    fetch('/fonts/manifest.json', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: { items?: Array<{ name: string; family: string; url: string }> } | null) => {
        if (!json?.items) return
        const css = json.items.map((i: { family: string; url: string }) =>
          `@font-face{font-family:"${i.family}";src:url("${i.url}");font-display:swap;}`
        ).join('\n')
        let style = document.getElementById('mgfonts') as HTMLStyleElement | null
        if (!style) { style = document.createElement('style'); style.id = 'mgfonts'; document.head.appendChild(style) }
        style.textContent = css
        setFonts([
          ...json.items.map((i: { name: string; family: string; url: string }) => ({ label: cleanFontDisplayName(i.name || i.family), family: i.family, url: i.url })),
          ...FONT_PRESETS,
        ])
      })
      .catch(() => {})
  }, [])

  // Load decals when tab opens
  useEffect(() => {
    if (activeTab !== 'elements' || decals.length > 0) return
    setDecalsLoading(true)
    fetch('/decals/manifest.json', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: { items?: DecalItem[] } | null) => {
        setDecals(json?.items ?? [])
        setDecalsLoading(false)
      })
      .catch(() => setDecalsLoading(false))
  }, [activeTab, decals.length])

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: 'car',      label: 'Car',      icon: <Car size={22} /> },
    { id: 'text',     label: 'Text',     icon: <Type size={22} /> },
    { id: 'elements', label: 'Elements', icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
        <rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/>
        <rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>
      </svg>
    )},
    { id: 'stripes',  label: 'Stripes',  icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
        <rect x="2" y="3" width="3" height="18" rx="1"/><rect x="7" y="3" width="2" height="18" rx="1"/>
        <rect x="11" y="3" width="4" height="18" rx="1"/>
      </svg>
    )},
    { id: 'split',    label: 'Split',    icon: <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>S</span> },
    { id: 'tint',     label: 'Tint',     icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        <path d="M3 17 L5 8 Q5.5 6 8 6 L16 6 Q18.5 6 19 8 L21 17 Q21.5 18.5 20 19 L4 19 Q2.5 18.5 3 17 Z"/>
        <line x1="3" y1="14" x2="21" y2="14"/><line x1="12" y1="6" x2="12" y2="14"/>
      </svg>
    )},
    { id: 'layers',   label: 'Layers',   icon: <Layers size={22} /> },
  ]

  // ── Controls strip contents per tab ────────────────────────
  const renderStrip = () => {
    switch (activeTab) {

      // ── CAR ──────────────────────────────────────────────────
      case 'car': return (
        <div className="mobile-car-controls">
          <div className="mobile-chips-row">
            <button type="button" className={`mobile-chip${paintMode === 'paint' ? ' active' : ''}`} onClick={() => setPaintMode('paint')}>Paint</button>
            <button type="button" className={`mobile-chip${paintMode === 'gradient' ? ' active' : ''}`} onClick={() => setPaintMode('gradient')}>Gradient</button>
            {paintMode === 'gradient' && (
              <button
                type="button"
                className={`mobile-chip${carGradient.enabled ? ' active' : ''}`}
                onClick={() => setCarGradient({ enabled: !carGradient.enabled })}
              >
                {carGradient.enabled ? 'On' : 'Off'}
              </button>
            )}
            <span className="mobile-chips-sep" />
            {PAINT_TARGETS.map(t => (
              <button key={t.id} type="button"
                className={`mobile-chip${selectedPaintTarget === t.id ? ' active' : ''}`}
                onClick={() => setSelectedPaintTarget(selectedPaintTarget === t.id ? null : t.id)}
              >{t.label}</button>
            ))}
            <span className="mobile-chips-sep" />
            {FINISHES.map(f => (
              <button key={f.id} type="button"
                className={`mobile-chip${currentFinish === f.id ? ' active' : ''}`}
                onClick={() => setPaint({ finish: f.id })}
              >{f.label}</button>
            ))}
          </div>

          {paintMode === 'paint' ? (
            <div className="mobile-swatches-row">
              {CAR_COLORS.map(c => (
                <button key={c.name} type="button" className="mobile-color-swatch"
                  style={{ backgroundColor: c.hex }}
                  onClick={() => setPaint({ colorHex: c.hex })}
                  aria-label={c.name} title={c.name}
                />
              ))}
            </div>
          ) : (
            <>
              {/* Gradient controls row: axis + balance */}
              <div className="mobile-chips-row" style={{ paddingTop: 6 }}>
                {([
                  { axis: 'x' as const, label: 'Horiz' },
                  { axis: 'y' as const, label: 'Vert' },
                  { axis: 'z' as const, label: 'Front/Back' },
                ]).map(({ axis, label }) => (
                  <button key={axis} type="button"
                    className={`mobile-chip${carGradient.axis === axis ? ' active' : ''}`}
                    onClick={() => setCarGradient({ enabled: true, axis })}
                  >{label}</button>
                ))}
                <span className="mobile-chips-sep" />
                <span className="mobile-grad-label">Balance</span>
                <input type="range" min={-95} max={95} step={1} value={carGradient.balance ?? 0}
                  onChange={e => setCarGradient({ enabled: true, balance: Number(e.target.value) })}
                  className="mobile-slider" style={{ width: 90 }}
                />
              </div>
              {/* Locked slot swatches followed by the palette */}
              <div className="mobile-swatches-row mobile-swatches-row--locked">
                <button
                  type="button"
                  className={`mobile-color-swatch mobile-color-swatch--locked${gradColorSlot === 1 ? ' active' : ''}`}
                  style={{ backgroundColor: carGradient.fromHex }}
                  onClick={() => setGradColorSlot(1)}
                  aria-label="Gradient color 1"
                  title="Gradient color 1"
                >
                  <span className="mobile-color-swatch-number">1</span>
                </button>
                <button
                  type="button"
                  className={`mobile-color-swatch mobile-color-swatch--locked mobile-color-swatch--locked-second${gradColorSlot === 2 ? ' active' : ''}`}
                  style={{ backgroundColor: carGradient.toHex }}
                  onClick={() => setGradColorSlot(2)}
                  aria-label="Gradient color 2"
                  title="Gradient color 2"
                >
                  <span className="mobile-color-swatch-number">2</span>
                </button>
                <span className="mobile-chips-sep mobile-chips-sep--swatches" />
                {CAR_COLORS.map(c => (
                  <button key={c.name} type="button" className="mobile-color-swatch"
                    style={{ backgroundColor: c.hex }}
                    onClick={() => {
                      if (gradColorSlot === 1) setCarGradient({ enabled: true, fromHex: c.hex })
                      else setCarGradient({ enabled: true, toHex: c.hex })
                    }}
                    aria-label={c.name} title={c.name}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )

      // ── TEXT ─────────────────────────────────────────────────
      case 'text': {
        const textLayer = selectedLayer?.type === 'text' ? selectedLayer as { id: string; type: 'text'; text: string; fontFamily: string; fontUrl: string | null; colorHex: string; transform: { position: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } } } : null
        return (
        <div className="mobile-car-controls">
          <div className="mobile-chips-row">
            <span className="mobile-strip-label">Font</span>
            {fonts.map(f => (
              <button key={f.family} type="button"
                className={`mobile-font-chip${selectedFont === f.family ? ' active' : ''}`}
                style={{ fontFamily: f.family }}
                onClick={() => setSelectedFont(f.family)}
              >{f.label}</button>
            ))}
          </div>
          <div className="mobile-swatches-row">
            <button type="button" className="mobile-add-btn"
              onClick={async () => {
                if (isGuest) { onGuestSignIn(); return }
                if ('fonts' in document) {
                  try { await document.fonts.load(`700 48px "${selectedFont}"`) } catch { /* ignore */ }
                }
                addTextLayer({ fontFamily: selectedFont })
                setTool('text')
              }}
            >+ Add Text</button>
            <span className="mobile-chips-sep" />
            {/* Color swatches — apply to selected text layer if one is selected */}
            {CAR_COLORS.map(c => (
              <button key={c.hex} type="button" className="mobile-color-swatch"
                style={{ backgroundColor: c.hex, boxShadow: textLayer?.colorHex === c.hex ? `0 0 0 2px #fff` : undefined }}
                onClick={() => {
                  if (isGuest) { onGuestSignIn(); return }
                  if (textLayer) {
                    updateLayer(textLayer.id, { colorHex: c.hex } as Parameters<typeof updateLayer>[1])
                  } else {
                    addTextLayer({ fontFamily: selectedFont })
                    setTool('text')
                  }
                }}
                aria-label={c.name}
              />
            ))}
          </div>
          {/* Scale slider for selected text layer */}
          {textLayer && (
            <div className="mobile-chips-row" style={{ paddingTop: 4, paddingBottom: 6 }}>
              <span className="mobile-strip-label">Scale</span>
              <input type="range" min={0.1} max={4} step={0.05}
                value={textLayer.transform.scale.x}
                onChange={e => {
                  const v = Number(e.target.value)
                  updateLayerTransient(textLayer.id, { transform: { ...textLayer.transform, scale: { x: v, y: v, z: 1 } } } as Parameters<typeof updateLayerTransient>[1])
                }}
                onPointerUp={e => {
                  const v = Number((e.target as HTMLInputElement).value)
                  updateLayer(textLayer.id, { transform: { ...textLayer.transform, scale: { x: v, y: v, z: 1 } } } as Parameters<typeof updateLayer>[1])
                }}
                className="mobile-slider" style={{ flex: 1, maxWidth: 160 }}
              />
              <span className="mobile-grad-label">{textLayer.transform.scale.x.toFixed(2)}×</span>
            </div>
          )}
          {textLayer && (
            <div className="mobile-chips-row" style={{ paddingTop: 2, paddingBottom: 8, gap: 10 }}>
              <span className="mobile-strip-label">Horz</span>
              <input type="range" min={0.1} max={4} step={0.05}
                value={textLayer.transform.scale.x}
                onChange={e => {
                  const v = Number(e.target.value)
                  updateLayerTransient(textLayer.id, { transform: { scale: { x: v } } } as Parameters<typeof updateLayerTransient>[1])
                }}
                onPointerUp={e => {
                  const v = Number((e.target as HTMLInputElement).value)
                  updateLayer(textLayer.id, { transform: { scale: { x: v } } } as Parameters<typeof updateLayer>[1])
                }}
                className="mobile-slider mobile-slider--wide"
              />
              <span className="mobile-strip-label">Vert</span>
              <input type="range" min={0.1} max={4} step={0.05}
                value={textLayer.transform.scale.y}
                onChange={e => {
                  const v = Number(e.target.value)
                  updateLayerTransient(textLayer.id, { transform: { scale: { y: v } } } as Parameters<typeof updateLayerTransient>[1])
                }}
                onPointerUp={e => {
                  const v = Number((e.target as HTMLInputElement).value)
                  updateLayer(textLayer.id, { transform: { scale: { y: v } } } as Parameters<typeof updateLayer>[1])
                }}
                className="mobile-slider mobile-slider--wide"
              />
            </div>
          )}
        </div>
        )
      }

      // ── ELEMENTS ─────────────────────────────────────────────
      case 'elements': {
        const decalLayer = selectedLayer?.type === 'decal' ? selectedLayer as { id: string; type: 'decal'; colorHex: string; transform: { position: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } } } : null
        return (
        <div className="mobile-car-controls">
          <div className="mobile-chips-row">
            <span className="mobile-strip-label">Decals</span>
            {isGuest && (
              <button type="button" className="mobile-chip" onClick={onGuestSignIn}>Sign in to import</button>
            )}
          </div>
          {/* Color + scale row for selected decal */}
          {decalLayer && (
            <div className="mobile-swatches-row" style={{ paddingTop: 4 }}>
              <span className="mobile-strip-label">Color</span>
              {CAR_COLORS.map(c => (
                <button key={c.hex} type="button" className="mobile-color-swatch"
                  style={{ backgroundColor: c.hex, width: 34, height: 34, minWidth: 34,
                    boxShadow: decalLayer.colorHex === c.hex ? `0 0 0 2px #fff` : undefined }}
                  onClick={() => updateLayer(decalLayer.id, { colorHex: c.hex } as Parameters<typeof updateLayer>[1])}
                  aria-label={c.name}
                />
              ))}
            </div>
          )}
          {decalLayer && (
            <div className="mobile-chips-row" style={{ paddingTop: 4, paddingBottom: 4 }}>
              <span className="mobile-strip-label">Scale</span>
              <input type="range" min={0.1} max={4} step={0.05}
                value={decalLayer.transform.scale.x}
                onChange={e => {
                  const v = Number(e.target.value)
                  updateLayerTransient(decalLayer.id, { transform: { ...decalLayer.transform, scale: { x: v, y: v, z: 1 } } } as Parameters<typeof updateLayerTransient>[1])
                }}
                onPointerUp={e => {
                  const v = Number((e.target as HTMLInputElement).value)
                  updateLayer(decalLayer.id, { transform: { ...decalLayer.transform, scale: { x: v, y: v, z: 1 } } } as Parameters<typeof updateLayer>[1])
                }}
                className="mobile-slider" style={{ flex: 1, maxWidth: 160 }}
              />
              <span className="mobile-grad-label">{decalLayer.transform.scale.x.toFixed(2)}×</span>
            </div>
          )}
          {decalLayer && (
            <div className="mobile-chips-row" style={{ paddingTop: 2, paddingBottom: 8, gap: 10 }}>
              <span className="mobile-strip-label">Horz</span>
              <input type="range" min={0.1} max={4} step={0.05}
                value={decalLayer.transform.scale.x}
                onChange={e => {
                  const v = Number(e.target.value)
                  updateLayerTransient(decalLayer.id, { transform: { scale: { x: v } } } as Parameters<typeof updateLayerTransient>[1])
                }}
                onPointerUp={e => {
                  const v = Number((e.target as HTMLInputElement).value)
                  updateLayer(decalLayer.id, { transform: { scale: { x: v } } } as Parameters<typeof updateLayer>[1])
                }}
                className="mobile-slider mobile-slider--wide"
              />
              <span className="mobile-strip-label">Vert</span>
              <input type="range" min={0.1} max={4} step={0.05}
                value={decalLayer.transform.scale.y}
                onChange={e => {
                  const v = Number(e.target.value)
                  updateLayerTransient(decalLayer.id, { transform: { scale: { y: v } } } as Parameters<typeof updateLayerTransient>[1])
                }}
                onPointerUp={e => {
                  const v = Number((e.target as HTMLInputElement).value)
                  updateLayer(decalLayer.id, { transform: { scale: { y: v } } } as Parameters<typeof updateLayer>[1])
                }}
                className="mobile-slider mobile-slider--wide"
              />
            </div>
          )}
          <div className="mobile-decals-row">
            {decalsLoading && <span className="mobile-strip-label">Loading…</span>}
            {!decalsLoading && decals.length === 0 && <span className="mobile-strip-label">No decals yet</span>}
            {decals.map(d => (
              <button key={d.fileName} type="button" className="mobile-decal-thumb"
                onClick={() => { addDecalLayer(d.url); setTool('decal') }}
                title={d.name}
              >
                <img src={d.url} alt={d.name} loading="lazy" />
              </button>
            ))}
          </div>
        </div>
        )
      }

      // ── STRIPES ──────────────────────────────────────────────
      case 'stripes': return (
        <div className="mobile-car-controls">
          {/* Preset chips */}
          <div className="mobile-chips-row">
            {/* ON/OFF toggle */}
            <button type="button"
              className={`mobile-chip${carStripe.enabled ? ' active' : ''}`}
              style={{ minWidth: 56, fontWeight: 700 }}
              onClick={() => setCarStripe({ enabled: !carStripe.enabled })}
            >{carStripe.enabled ? 'ON' : 'OFF'}</button>
            <span className="mobile-chips-sep" />
            <span className="mobile-strip-label">Style</span>
            {STRIPE_PRESETS.map(p => (
              <button key={p.id} type="button"
                className={`mobile-preset-chip${carStripe.enabled && carStripe.width === p.config.width && carStripe.angle === p.config.angle ? ' active' : ''}`}
                onClick={() => setCarStripe({ ...p.config, enabled: true })}
              >
                <span className="mobile-preset-preview" style={{ background: p.preview }} />
                {p.label}
              </button>
            ))}
          </div>
          {/* Slider row */}
          <div className="mobile-swatches-row" style={{ gap: 8 }}>
            {/* Slider selector */}
            {(['width', 'angle', 'offset'] as const).map(s => (
              <button key={s} type="button"
                className={`mobile-chip${stripeSlider === s ? ' active' : ''}`}
                onClick={() => setStripeSlider(s)}
              >{s.charAt(0).toUpperCase() + s.slice(1)}</button>
            ))}
            <span className="mobile-chips-sep" />
            {stripeSlider === 'width' && (
              <input type="range" min={0.03} max={0.5} step={0.01}
                value={carStripe.width ?? 0.14}
                onChange={e => setCarStripe({ width: Number(e.target.value) })}
                className="mobile-slider"
              />
            )}
            {stripeSlider === 'angle' && (
              <input type="range" min={-1} max={1} step={0.01}
                value={carStripe.angle ?? 0}
                onChange={e => setCarStripe({ angle: Number(e.target.value) })}
                className="mobile-slider"
              />
            )}
            {stripeSlider === 'offset' && (
              <input type="range" min={-1} max={1} step={0.01}
                value={carStripe.offsetX ?? 0}
                onChange={e => setCarStripe({ offsetX: Number(e.target.value) })}
                className="mobile-slider"
              />
            )}
            <span className="mobile-chips-sep" />
            {/* Stripe color swatches */}
            {CAR_COLORS.slice(0, 8).map(c => (
              <button key={c.hex} type="button" className="mobile-color-swatch"
                style={{ backgroundColor: c.hex, width: 32, height: 32, minWidth: 32 }}
                onClick={() => setCarStripe({ colorHex: c.hex })}
                aria-label={c.name}
              />
            ))}
          </div>
        </div>
      )

      // ── SPLIT ────────────────────────────────────────────────
      case 'split': return (
        <div className="mobile-car-controls">
          {/* Preset chips */}
          <div className="mobile-chips-row">
            {/* ON/OFF toggle */}
            <button type="button"
              className={`mobile-chip${carSplit.enabled ? ' active' : ''}`}
              style={{ minWidth: 56, fontWeight: 700 }}
              onClick={() => setCarSplit({ enabled: !carSplit.enabled })}
            >{carSplit.enabled ? 'ON' : 'OFF'}</button>
            <span className="mobile-chips-sep" />
            <span className="mobile-strip-label">Style</span>
            {SPLIT_PRESETS.map(p => (
              <button key={p.id} type="button"
                className={`mobile-preset-chip${carSplit.enabled && Math.abs((carSplit.angle ?? 0) - p.config.angle) < 0.01 && Math.abs((carSplit.offsetX ?? 0) - p.config.offsetX) < 0.01 ? ' active' : ''}`}
                onClick={() => setCarSplit({ ...p.config, enabled: true })}
              >
                <span className="mobile-preset-preview" style={{ background: p.preview }} />
                {p.label}
              </button>
            ))}
          </div>
          {/* Controls row */}
          <div className="mobile-swatches-row" style={{ gap: 8 }}>
            {/* Side selector */}
            <button type="button" className={`mobile-chip${splitSide === 'A' ? ' active' : ''}`} onClick={() => setSplitSide('A')}>
              Side A <span className="mobile-chip-dot" style={{ backgroundColor: carSplit.sideAHex }} />
            </button>
            <button type="button" className={`mobile-chip${splitSide === 'B' ? ' active' : ''}`} onClick={() => setSplitSide('B')}>
              Side B <span className="mobile-chip-dot" style={{ backgroundColor: carSplit.sideBHex }} />
            </button>
            <span className="mobile-chips-sep" />
            {/* Slider selector */}
            {(['angle', 'offset', 'soft'] as const).map(s => (
              <button key={s} type="button"
                className={`mobile-chip${splitSlider === s ? ' active' : ''}`}
                onClick={() => setSplitSlider(s)}
              >{s.charAt(0).toUpperCase() + s.slice(1)}</button>
            ))}
            <span className="mobile-chips-sep" />
            {splitSlider === 'angle' && (
              <input type="range" min={-1} max={1} step={0.01}
                value={carSplit.angle ?? 0}
                onChange={e => setCarSplit({ angle: Number(e.target.value) })}
                className="mobile-slider"
              />
            )}
            {splitSlider === 'offset' && (
              <input type="range" min={-1} max={1} step={0.01}
                value={carSplit.offsetX ?? 0}
                onChange={e => setCarSplit({ offsetX: Number(e.target.value) })}
                className="mobile-slider"
              />
            )}
            {splitSlider === 'soft' && (
              <input type="range" min={0} max={0.2} step={0.005}
                value={carSplit.softEdge ?? 0.02}
                onChange={e => setCarSplit({ softEdge: Number(e.target.value) })}
                className="mobile-slider"
              />
            )}
            <span className="mobile-chips-sep" />
            {/* Color swatches for active side */}
            {CAR_COLORS.slice(0, 8).map(c => (
              <button key={c.hex} type="button" className="mobile-color-swatch"
                style={{ backgroundColor: c.hex, width: 32, height: 32, minWidth: 32 }}
                onClick={() => setCarSplit(splitSide === 'A' ? { sideAHex: c.hex } : { sideBHex: c.hex })}
                aria-label={c.name}
              />
            ))}
          </div>
        </div>
      )

      // ── TINT ─────────────────────────────────────────────────
      case 'tint': return (
        <div className="mobile-car-controls">
          <div className="mobile-chips-row">
            {/* Toggle */}
            <button type="button"
              className={`mobile-chip${windowTint.enabled ? ' active' : ''}`}
              onClick={() => setWindowTint({ enabled: !windowTint.enabled })}
            >{windowTint.enabled ? 'Tint ON' : 'Tint OFF'}</button>
            <span className="mobile-chips-sep" />
            {/* Quick opacity presets */}
            {TINT_OPACITIES.map(t => (
              <button key={t.amount} type="button"
                className={`mobile-chip${windowTint.amount === t.amount ? ' active' : ''}`}
                onClick={() => setWindowTint({ enabled: true, amount: t.amount })}
              >{t.label}</button>
            ))}
          </div>
          <div className="mobile-swatches-row" style={{ gap: 10 }}>
            <span className="mobile-strip-label">Shade</span>
            <input type="range" min={1} max={98} step={1}
              value={windowTint.amount}
              onChange={e => setWindowTint({ enabled: true, amount: Number(e.target.value) })}
              className="mobile-slider"
            />
            <span className="mobile-chips-sep" />
            {TINT_COLORS.map(c => (
              <button key={c} type="button" className="mobile-color-swatch"
                style={{ backgroundColor: c, width: 38, height: 38, minWidth: 38 }}
                onClick={() => setWindowTint({ colorHex: c })}
                aria-label={c}
              />
            ))}
          </div>
        </div>
      )

      // ── LAYERS ───────────────────────────────────────────────
      case 'layers': return (
        <div className="mobile-car-controls">
          <div className="mobile-chips-row">
            <span className="mobile-strip-label">Layers</span>
            {layers.length === 0 && <span className="mobile-strip-label" style={{ opacity: 0.5 }}>No layers yet</span>}
          </div>
          <div className="mobile-layers-row">
            {[...layers].reverse().map(layer => (
              <div key={layer.id} className={`mobile-layer-chip${selectedLayerId === layer.id ? ' active' : ''}`}
                onClick={() => setSelectedLayer(layer.id)}
              >
                <span className="mobile-layer-icon">
                  {layer.type === 'text' ? 'T' : layer.type === 'decal' ? '◆' : layer.type === 'stripe' ? '║' : '◈'}
                </span>
                <span className="mobile-layer-name">
                  {layer.type === 'text' ? (layer as { text?: string }).text?.slice(0, 10) || 'Text'
                    : layer.type === 'decal' ? 'Decal'
                    : layer.type}
                </span>
                <button type="button" className="mobile-layer-del"
                  onClick={e => { e.stopPropagation(); removeLayer(layer.id) }}
                  aria-label="Remove layer"
                >✕</button>
              </div>
            ))}
          </div>
        </div>
      )

      default: return null
    }
  }

  return (
    <div className="mobile-editor-layout">
      <div className="mobile-viewport-container">{editorCanvas}</div>

      {activeTab && (
        <div className="mobile-controls-strip">
          {renderStrip()}
        </div>
      )}

      <div className="mobile-tab-bar">
        {tabs.map(tab => (
          <button key={tab.id} type="button"
            className={`mobile-tab-button${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(prev => prev === tab.id ? null : tab.id)}
            aria-label={tab.label} title={tab.label}
          >
            {tab.icon}
            <span className="mobile-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
