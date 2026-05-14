import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Layers, Type, Palette } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { cleanFontDisplayName } from '../../lib/fontNames'
import type { PaintTargetId } from '../../lib/paintTargets'
import { WRAP_COLOR_SWATCHES } from '../../lib/wrapColorPalette'

type TabId = 'car' | 'text' | 'elements' | 'stripes' | 'split' | 'tint' | 'layers'

interface MobileEditorLayoutProps {
  editorCanvas: React.ReactNode
  isGuest: boolean
  onGuestSignIn: () => void
  simplified?: boolean
  /** When true: render only the controls strip (no canvas, no tab bar) for embedding in the desktop dock */
  embedded?: boolean
  /** When embedded, which tab to show. Defaults to 'layers'. */
  embeddedTab?: TabId
}

// ── Static data ─────────────────────────────────────────────────
const CAR_COLORS = WRAP_COLOR_SWATCHES.map((swatch) => ({
  id: swatch.id,
  name: swatch.name,
  hex: swatch.colorHex,
  brand: swatch.brand,
  code: swatch.code,
  finish: swatch.finish,
}))

type PaintTargetOption = {
  id: PaintTargetId
  label: string
  icon: ReactNode
}

type FinishOption = {
  id: 'gloss' | 'matte' | 'chrome' | 'satin'
  label: string
  icon: ReactNode
}

function getFinishPreviewStyle(finish: FinishOption['id']) {
  switch (finish) {
    case 'matte':
      return {
        background: '#8e949c',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
      }
    case 'chrome':
      return {
        background: 'linear-gradient(135deg, #f8fbff 0%, #b9c0c8 28%, #ffffff 46%, #8f98a3 66%, #f0f4f8 100%)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.28)',
      }
    case 'satin':
      return {
        background: 'linear-gradient(135deg, #c7cbd1 0%, #7e8691 50%, #d9dde2 100%)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)',
      }
    case 'gloss':
    default:
      return {
        background: 'radial-gradient(circle at 30% 28%, rgba(255,255,255,0.98) 0 12%, rgba(255,255,255,0.35) 13%, rgba(255,255,255,0) 28%), linear-gradient(135deg, #40444d 0%, #0f1115 100%)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.22)',
      }
  }
}

function mapWrapFinishToPaintFinish(finish: 'gloss' | 'matte' | 'satin' | 'metallic' | 'chrome'): 'gloss' | 'matte' | 'satin' | 'chrome' {
  if (finish === 'chrome') return 'chrome'
  if (finish === 'matte') return 'matte'
  if (finish === 'satin') return 'satin'
  return 'gloss'
}

const PAINT_TARGETS: PaintTargetOption[] = [
  {
    id: 'fullCar',
    label: 'Full car',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 15h14l-1.1-4.2A2.4 2.4 0 0 0 15.6 9H8.4a2.4 2.4 0 0 0-2.3 1.8L5 15Z" />
        <path d="M7.2 9.1 8.7 6.7h6.6l1.5 2.4" opacity="0.85" />
        <circle cx="8.1" cy="15.6" r="1.3" />
        <circle cx="15.9" cy="15.6" r="1.3" />
      </svg>
    ),
  },
  {
    id: 'hood',
    label: 'Hood',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4.5 15h15L18 9.2A2.5 2.5 0 0 0 15.6 7H8.4a2.5 2.5 0 0 0-2.4 2.2L4.5 15Z" />
        <path d="M12 7v8" opacity="0.6" />
        <path d="M7 9h5" />
      </svg>
    ),
  },
  {
    id: 'trunk',
    label: 'Trunk',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4.5 15h15l-1.2-4.8A2.4 2.4 0 0 0 15.9 8H8.1a2.4 2.4 0 0 0-2.4 2.2L4.5 15Z" />
        <path d="M12 7v8" opacity="0.6" />
        <path d="M12 9h5" />
      </svg>
    ),
  },
  {
    id: 'rims',
    label: 'Rims',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="2.2" />
        <path d="M12 5v4" />
        <path d="M12 15v4" />
        <path d="M5 12h4" />
        <path d="M15 12h4" />
      </svg>
    ),
  },
]

const FINISHES: FinishOption[] = [
  {
    id: 'gloss',
    label: 'gloss',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="7.5" />
        <path d="M8.8 9.1c.7-1 1.8-1.6 3.2-1.6" opacity="0.6" />
        <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" opacity="0.35" />
      </svg>
    ),
  },
  {
    id: 'matte',
    label: 'matte',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="7.5" />
        <path d="M7.8 12h8.4" opacity="0.5" />
      </svg>
    ),
  },
  {
    id: 'chrome',
    label: 'chrome',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="7.5" />
        <path d="M9 7.6a6 6 0 0 1 5.8 0" opacity="0.8" />
        <path d="M8.8 16.2a6 6 0 0 0 6.4 0" opacity="0.55" />
        <path d="M9.1 9.2h5.8" opacity="0.45" />
      </svg>
    ),
  },
  {
    id: 'satin',
    label: 'satin',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="7.5" />
        <path d="M7.8 15.8 16.2 7.4" opacity="0.7" />
        <path d="M8 10.8h8" opacity="0.35" />
      </svg>
    ),
  },
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

const POSITION_NUDGE_STEP = 0.04

// ── Types ───────────────────────────────────────────────────────
type FontItem = { label: string; family: string; url?: string }
type DecalItem = { name: string; url: string; fileName: string }

// ── Component ──────────────────────────────────────────────────
type LayerScaleMode = 'uniform' | 'horl' | 'vert' | 'rotate'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function hexToHsl(hex: string) {
  const normalized = hex.replace('#', '').trim()
  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized

  const intValue = Number.parseInt(expanded, 16)
  if (!Number.isFinite(intValue)) return { h: 0, s: 0, l: 50 }

  const red = ((intValue >> 16) & 255) / 255
  const green = ((intValue >> 8) & 255) / 255
  const blue = (intValue & 255) / 255

  const maxChannel = Math.max(red, green, blue)
  const minChannel = Math.min(red, green, blue)
  const lightness = (maxChannel + minChannel) / 2

  if (maxChannel === minChannel) {
    return { h: 0, s: 0, l: Math.round(lightness * 100) }
  }

  const delta = maxChannel - minChannel
  const saturation = lightness > 0.5
    ? delta / (2 - maxChannel - minChannel)
    : delta / (maxChannel + minChannel)

  let hue: number
  switch (maxChannel) {
    case red:
      hue = (green - blue) / delta + (green < blue ? 6 : 0)
      break
    case green:
      hue = (blue - red) / delta + 2
      break
    default:
      hue = (red - green) / delta + 4
      break
  }

  return {
    h: Math.round(hue * 60) % 360,
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  }
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const h = ((hue % 360) + 360) % 360
  const s = clamp(saturation, 0, 100) / 100
  const l = clamp(lightness, 0, 100) / 100

  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const secondary = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
  const match = l - chroma / 2

  let red = 0
  let green = 0
  let blue = 0

  if (h < 60) {
    red = chroma; green = secondary
  } else if (h < 120) {
    red = secondary; green = chroma
  } else if (h < 180) {
    green = chroma; blue = secondary
  } else if (h < 240) {
    green = secondary; blue = chroma
  } else if (h < 300) {
    red = secondary; blue = chroma
  } else {
    red = chroma; blue = secondary
  }

  const toHex = (channel: number) => Math.round((channel + match) * 255).toString(16).padStart(2, '0')
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`
}

export function MobileEditorLayout({ editorCanvas, isGuest, onGuestSignIn, embedded, embeddedTab }: MobileEditorLayoutProps) {
  const [_internalTab, setActiveTab] = useState<TabId | null>(null)
  // Embedded mode: derive active tab synchronously from prop (no effect delay = no flicker)
  const activeTab: TabId | null = embedded ? (embeddedTab ?? null) : _internalTab
  const [layerScaleMode, setLayerScaleMode] = useState<LayerScaleMode>('uniform')
  const [textDetailsTab, setTextDetailsTab] = useState<'text' | 'transform'>('text')

  // Car paint
  const setPaint               = useEditorStore(s => s.setPaint)
  const setSelectedPaintTarget = useEditorStore(s => s.setSelectedPaintTarget)
  const selectedPaintTarget    = useEditorStore(s => s.selectedPaintTarget)
  const paintColorHex          = useEditorStore(s => s.project.paint.colorHex)
  const currentFinish          = useEditorStore(s => s.project.paint.finish)
  const [paintMode, setPaintMode] = useState<'paint' | 'gradient'>('paint')
  const paintHsl = hexToHsl(paintColorHex)

  // Gradient
  const carGradient    = useEditorStore(s => s.project.carGradient)
  const setCarGradient = useEditorStore(s => s.setCarGradient)

  // Text
  const addTextLayer = useEditorStore(s => s.addTextLayer)
  const setTool      = useEditorStore(s => s.setTool)
  const [fonts, setFonts] = useState<FontItem[]>(FONT_PRESETS)
  const [selectedFont, setSelectedFont] = useState<string>('Impact')
  const [editingTextContent, setEditingTextContent] = useState<string>('')
  const textImportInputRef = useRef<HTMLInputElement>(null)

  // Elements / decals
  const addDecalLayer = useEditorStore(s => s.addDecalLayer)
  const customDecals = useEditorStore(s => s.project.customDecals)
  const [decals, setDecals] = useState<DecalItem[]>([])
  const [decalsLoading, setDecalsLoading] = useState(false)
  const elementsImportInputRef = useRef<HTMLInputElement>(null)

  // Gradient color slot
  const [gradColorSlot, setGradColorSlot] = useState<1 | 2>(1)
  const visibleWrapColors = CAR_COLORS

  // Stripes
  const carStripe    = useEditorStore(s => s.project.carStripe)
  const setCarStripe = useEditorStore(s => s.setCarStripe)
  const addStripeLayer = useEditorStore(s => s.addStripeLayer)
  const addStripeLayerPreset = useEditorStore(s => s.addStripeLayerPreset)
  const [stripeSlider, setStripeSlider] = useState<'width' | 'gap' | 'angle' | 'offset' | 'soft'>('width')

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
  const reorderLayer         = useEditorStore(s => s.reorderLayer)
  const updateLayer          = useEditorStore(s => s.updateLayer)
  const updateLayerTransient = useEditorStore(s => s.updateLayerTransient)

  // Selected layer (derived)
  const selectedLayer = layers.find(l => l.id === selectedLayerId) ?? null
  const textLayer = selectedLayer?.type === 'text' ? selectedLayer as any : null

  const moveLayerByDisplayOffset = (layerId: string, offset: -1 | 1) => {
    const displayLayers = [...layers].reverse()
    const displayIndex = displayLayers.findIndex((layer) => layer.id === layerId)
    if (displayIndex < 0) return
    const nextDisplayIndex = displayIndex + offset
    if (nextDisplayIndex < 0 || nextDisplayIndex >= displayLayers.length) return
    const fromArrIndex = layers.length - 1 - displayIndex
    const toArrIndex = layers.length - 1 - nextDisplayIndex
    reorderLayer(fromArrIndex, toArrIndex)
  }

  // Sync editing text content when selected text layer changes
  useEffect(() => {
    if (activeTab === 'text' && textLayer) {
      setEditingTextContent(textLayer.text || '')
    }
  }, [activeTab, textLayer])

  // Commit text to undo history when leaving the text tab
  useEffect(() => {
    if (activeTab === 'text') return
    if (textLayer) {
      updateLayer(textLayer.id, { text: editingTextContent } as any)
    }
  }, [activeTab, editingTextContent, textLayer, updateLayer])

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

  const handleDecalsRowWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollWidth > el.clientWidth) {
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      if (delta !== 0) {
        el.scrollLeft += delta
        e.preventDefault()
      }
    }
  }

  const handleElementsImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isGuest) {
      onGuestSignIn()
      if (elementsImportInputRef.current) elementsImportInputRef.current.value = ''
      return
    }

    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      addDecalLayer(dataUrl)
      setTool('decal')
    }
    reader.readAsDataURL(file)

    if (elementsImportInputRef.current) elementsImportInputRef.current.value = ''
  }

  const handleTextFontImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isGuest) {
      onGuestSignIn()
      if (textImportInputRef.current) textImportInputRef.current.value = ''
      return
    }

    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      const baseFamily = file.name.replace(/\.[^/.]+$/, '')
      const importedFamily = `${baseFamily} (imported)`
      const label = cleanFontDisplayName(baseFamily)

      let style = document.getElementById('mgfonts') as HTMLStyleElement | null
      if (!style) {
        style = document.createElement('style')
        style.id = 'mgfonts'
        document.head.appendChild(style)
      }
      style.textContent = `${style.textContent ?? ''}\n@font-face{font-family:"${importedFamily}";src:url("${dataUrl}");font-display:swap;}`

      setFonts((prev) => {
        const deduped = prev.filter((font) => font.family !== importedFamily)
        return [{ label, family: importedFamily, url: dataUrl }, ...deduped]
      })
      setSelectedFont(importedFamily)
    }
    reader.readAsDataURL(file)

    if (textImportInputRef.current) textImportInputRef.current.value = ''
  }

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: 'car',      label: 'Wrap Color',      icon: <Palette size={22} /> },
    { id: 'text',     label: 'Text',     icon: <Type size={22} /> },
    { id: 'elements', label: 'Elements', icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
        <rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/>
        <rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>
      </svg>
    )},
    { id: 'stripes',  label: 'Stripes',  icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        <rect x="4" y="3" width="4" height="18" rx="1.4" />
        <rect x="10" y="3" width="4" height="18" rx="1.4" />
        <rect x="16" y="3" width="4" height="18" rx="1.4" opacity="0.45" />
      </svg>
    )},
    { id: 'split',    label: 'Split',    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3.5" y="4" width="17" height="16" rx="2.6" />
        <path d="M12 4v16" />
        <path d="M6.5 8.5h5.5" opacity="0.8" />
        <path d="M12 15.5h5.5" opacity="0.8" />
      </svg>
    )},
    { id: 'tint',     label: 'Tint',     icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 17 5 8c.3-1.4 1.4-2 3-2h8c1.6 0 2.7.6 3 2l2 9c.3 1.2-.5 2-1.9 2H4.9C3.5 19 2.7 18.2 3 17Z" />
        <path d="M3.7 14h16.6" opacity="0.9" />
        <path d="M12 6v8" opacity="0.45" />
        <rect x="4" y="14" width="16" height="5" rx="1.6" fill="currentColor" opacity="0.22" stroke="none" />
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
              >
                <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3, lineHeight: 1.05 }}>
                  {t.icon}
                  <span>{t.label}</span>
                </span>
              </button>
            ))}
            <span className="mobile-chips-sep" />
            {FINISHES.map(f => (
              <button key={f.id} type="button"
                className={`mobile-chip${currentFinish === f.id ? ' active' : ''}`}
                onClick={() => setPaint({ finish: f.id })}
              >
                <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3, lineHeight: 1.05 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '999px',
                      ...getFinishPreviewStyle(f.id),
                    }}
                  />
                  <span>{f.label}</span>
                </span>
              </button>
            ))}
          </div>

          {paintMode === 'paint' ? (
            <div className="mobile-swatches-row">
              {visibleWrapColors.map(c => (
                <button key={c.id} type="button" className="mobile-color-swatch"
                  style={{ backgroundColor: c.hex }}
                  onClick={() => setPaint({
                    colorHex: c.hex,
                    finish: mapWrapFinishToPaintFinish(c.finish),
                    colorRef: {
                      swatchId: c.id,
                      brand: c.brand,
                      code: c.code,
                      name: c.name,
                      finish: c.finish,
                    },
                  })}
                  aria-label={`${c.brand} ${c.code} ${c.name}`}
                  title={`${c.brand} ${c.code} - ${c.name}`}
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
                {visibleWrapColors.map(c => (
                  <button key={c.id} type="button" className="mobile-color-swatch"
                    style={{ backgroundColor: c.hex }}
                    onClick={() => {
                      if (gradColorSlot === 1) setCarGradient({ enabled: true, fromHex: c.hex })
                      else setCarGradient({ enabled: true, toHex: c.hex })
                    }}
                    aria-label={`${c.brand} ${c.code} ${c.name}`}
                    title={`${c.brand} ${c.code} - ${c.name}`}
                  />
                ))}
              </div>
            </>
          )}

          {paintMode === 'paint' && (
            <div className="mobile-transform-slider-row mobile-transform-slider-row--saturation">
              <span className="mobile-slider-label">Saturation</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={paintHsl.s}
                onChange={(e) => {
                  const nextSaturation = Number(e.target.value)
                  const nextColor = hslToHex(paintHsl.h, nextSaturation, paintHsl.l)
                  setPaint({ colorHex: nextColor })
                }}
                className="mobile-slider mobile-slider--transform mobile-slider--saturation"
                style={{
                  background: `linear-gradient(to right, hsl(${paintHsl.h}, 0%, ${paintHsl.l}%), hsl(${paintHsl.h}, 100%, ${paintHsl.l}%))`,
                }}
              />
              <span className="mobile-slider-val">{paintHsl.s}%</span>
            </div>
          )}
        </div>
      )

      // ── TEXT ─────────────────────────────────────────────────
      case 'text': {
        const textLayer = selectedLayer?.type === 'text' ? selectedLayer as { id: string; type: 'text'; text: string; fontFamily: string; fontUrl: string | null; colorHex: string; finish: 'gloss' | 'matte' | 'chrome' | 'satin'; mirrorX: boolean; mirrorToOtherSide: boolean; mirrorColorHex: string | null; mirrorMirrorX: boolean; transform: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } } } : null
        const textHsl = textLayer ? hexToHsl(textLayer.colorHex) : null
        return (
        <div className="mobile-car-controls">
          {/* Font chips */}
          <div className="mobile-chips-row mobile-fonts-row">
            <span className="mobile-strip-label" style={{ flexShrink: 0 }}>Font</span>
            <button
              type="button"
              className="mobile-chip"
              onClick={() => {
                if (isGuest) {
                  onGuestSignIn()
                  return
                }
                textImportInputRef.current?.click()
              }}
            >
              Import Font
            </button>
            <input
              ref={textImportInputRef}
              type="file"
              accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
              onChange={handleTextFontImport}
              style={{ display: 'none' }}
            />
            <div className="mobile-fonts-scroll">
              {fonts.map(f => (
                <button key={f.family} type="button"
                  className={`mobile-font-chip${selectedFont === f.family ? ' active' : ''}`}
                  style={{ fontFamily: f.family }}
                  onClick={() => setSelectedFont(f.family)}
                >{f.label}</button>
              ))}
            </div>
          </div>
          {/* Add text + color row */}
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
            {visibleWrapColors.map(c => (
              <button key={c.id} type="button" className="mobile-color-swatch"
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
                aria-label={`${c.brand} ${c.code} ${c.name}`}
                title={`${c.brand} ${c.code} - ${c.name}`}
              />
            ))}
          </div>
          {/* Text input + transform controls — shown when a text layer is selected */}
          {textLayer && (
            <>
              <div className="mobile-chips-row" style={{ paddingTop: 6 }}>
                <span className="mobile-strip-label">Finish</span>
                {FINISHES.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`mobile-chip${textLayer.finish === f.id ? ' active' : ''}`}
                    onClick={() => updateLayer(textLayer.id, { finish: f.id } as Parameters<typeof updateLayer>[1])}
                  >
                    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3, lineHeight: 1.05 }}>
                      <span
                        aria-hidden
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: '999px',
                          ...getFinishPreviewStyle(f.id),
                        }}
                      />
                      <span>{f.label}</span>
                    </span>
                  </button>
                ))}
                <span className="mobile-chips-sep" />
                <button
                  type="button"
                  className={`mobile-chip mobile-inline-mirror-chip${textLayer.mirrorToOtherSide ? ' active' : ''}`}
                  onClick={() => updateLayer(textLayer.id, { mirrorToOtherSide: !textLayer.mirrorToOtherSide } as Parameters<typeof updateLayer>[1])}
                  aria-label={textLayer.mirrorToOtherSide ? 'Mirrored to both sides' : 'Mirror to other side'}
                  title="Mirror to other side of car"
                >
                  ⟷ Mirror
                </button>
                {textLayer.mirrorToOtherSide && (
                  <button
                    type="button"
                    className={`mobile-chip mobile-inline-mirror-chip${textLayer.mirrorX ? ' active' : ''}`}
                    onClick={() => updateLayer(textLayer.id, { mirrorX: !textLayer.mirrorX } as Parameters<typeof updateLayer>[1])}
                    aria-label={textLayer.mirrorX ? 'Horizontally mirrored' : 'Mirror horizontally'}
                    title="Flip the mirrored copy"
                  >
                    ↔ Flip
                  </button>
                )}
                <button
                  type="button"
                  className={`mobile-chip${textDetailsTab === 'transform' ? ' active' : ''}`}
                  onClick={() => setTextDetailsTab((v) => (v === 'transform' ? 'text' : 'transform'))}
                  title="Transform controls"
                >
                  Transform
                </button>
                <span className="mobile-chips-sep" />
                <input
                  type="text"
                  value={editingTextContent}
                  onChange={e => {
                    const nextText = e.target.value
                    setEditingTextContent(nextText)
                    updateLayerTransient(textLayer.id, { text: nextText } as any)
                  }}
                  onBlur={() => updateLayer(textLayer.id, { text: editingTextContent } as any)}
                  placeholder="Change text..."
                  className="mobile-layer-text-input"
                  style={{ fontFamily: textLayer.fontFamily || 'Arial', width: 260, minWidth: 260, flex: '0 0 260px' }}
                />
                {textLayer.mirrorToOtherSide && (
                  <>
                    <span className="mobile-chips-sep" />
                    <span className="mobile-strip-label" style={{ fontSize: '0.72rem' }}>Mirror</span>
                    <button
                      type="button"
                      className={`mobile-chip${textLayer.mirrorMirrorX ? ' active' : ''}`}
                      onClick={() => updateLayer(textLayer.id, { mirrorMirrorX: !textLayer.mirrorMirrorX } as Parameters<typeof updateLayer>[1])}
                      title="Flip the mirrored copy"
                      style={{ minWidth: 38, fontSize: '0.75rem' }}
                    >Flip</button>
                    <button
                      type="button"
                      className={`mobile-chip${!textLayer.mirrorColorHex ? ' active' : ''}`}
                      style={{ fontSize: '0.75rem', minWidth: 44 }}
                      onClick={() => updateLayer(textLayer.id, { mirrorColorHex: null } as Parameters<typeof updateLayer>[1])}
                      title="Same color as main side"
                    >Same</button>
                    <div className="mobile-mirror-colors-scroll">
                      {visibleWrapColors.map(c => (
                        <button key={c.id} type="button" className="mobile-color-swatch"
                          style={{ backgroundColor: c.hex, width: 28, height: 28, minWidth: 28, flex: '0 0 28px',
                            boxShadow: textLayer.mirrorColorHex === c.hex ? `0 0 0 2px #fff` : undefined }}
                          onClick={() => updateLayer(textLayer.id, { mirrorColorHex: c.hex } as Parameters<typeof updateLayer>[1])}
                          aria-label={`Mirror: ${c.brand} ${c.code}`}
                          title={`${c.brand} ${c.code}`}
                        />
                      ))}
                    </div>
                  </>
                )}
                {textDetailsTab === 'transform' && (
                  <>
                    <span className="mobile-chips-sep" />
                    {(['uniform', 'horl', 'vert', 'rotate'] as LayerScaleMode[]).map(m => (
                      <button key={m} type="button"
                        className={`mobile-chip${layerScaleMode === m ? ' active' : ''}`}
                        onClick={() => setLayerScaleMode(m)}
                      >
                        {m === 'uniform' ? 'Scale' : m === 'horl' ? 'Wide' : m === 'vert' ? 'Tall' : 'Rotate'}
                      </button>
                    ))}
                    {layerScaleMode === 'uniform' && (
                      <>
                        <input
                          type="range"
                          min={0.1}
                          max={4}
                          step={0.05}
                          value={textLayer.transform.scale.x}
                          onChange={e => { const v = Number(e.target.value); updateLayerTransient(textLayer.id, { transform: { ...textLayer.transform, scale: { x: v, y: v, z: 1 } } } as any) }}
                          onPointerUp={e => { const v = Number((e.target as HTMLInputElement).value); updateLayer(textLayer.id, { transform: { ...textLayer.transform, scale: { x: v, y: v, z: 1 } } } as any) }}
                          className="mobile-slider mobile-slider--transform"
                          style={{ width: 140 }}
                        />
                        <span className="mobile-slider-val">{textLayer.transform.scale.x.toFixed(2)}x</span>
                      </>
                    )}
                    <span className="mobile-chips-sep" />
                    <button
                      type="button"
                      className="mobile-chip mobile-chip--nudge"
                      onClick={() => updateLayer(textLayer.id, {
                        transform: {
                          position: {
                            ...textLayer.transform.position,
                            y: textLayer.transform.position.y + POSITION_NUDGE_STEP,
                          },
                        },
                      } as Parameters<typeof updateLayer>[1])}
                      title="Nudge up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="mobile-chip mobile-chip--nudge"
                      onClick={() => updateLayer(textLayer.id, {
                        transform: {
                          position: {
                            ...textLayer.transform.position,
                            z: textLayer.transform.position.z - POSITION_NUDGE_STEP,
                          },
                        },
                      } as Parameters<typeof updateLayer>[1])}
                      title="Nudge left"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="mobile-chip mobile-chip--nudge"
                      onClick={() => updateLayer(textLayer.id, {
                        transform: {
                          position: {
                            ...textLayer.transform.position,
                            z: textLayer.transform.position.z + POSITION_NUDGE_STEP,
                          },
                        },
                      } as Parameters<typeof updateLayer>[1])}
                      title="Nudge right"
                    >
                      →
                    </button>
                    <button
                      type="button"
                      className="mobile-chip mobile-chip--nudge"
                      onClick={() => updateLayer(textLayer.id, {
                        transform: {
                          position: {
                            ...textLayer.transform.position,
                            y: textLayer.transform.position.y - POSITION_NUDGE_STEP,
                          },
                        },
                      } as Parameters<typeof updateLayer>[1])}
                      title="Nudge down"
                    >
                      ↓
                    </button>
                  </>
                )}
              </div>
              {textDetailsTab === 'text' && textHsl && (
                <div className="mobile-transform-slider-row mobile-transform-slider-row--saturation">
                  <span className="mobile-slider-label">Saturation</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={textHsl.s}
                    onChange={(e) => {
                      const nextSaturation = Number(e.target.value)
                      const nextHex = hslToHex(textHsl.h, nextSaturation, textHsl.l)
                      updateLayer(textLayer.id, { colorHex: nextHex } as Parameters<typeof updateLayer>[1])
                    }}
                    className="mobile-slider mobile-slider--transform mobile-slider--saturation"
                    style={{
                      background: `linear-gradient(to right, hsl(${textHsl.h}, 0%, ${textHsl.l}%), hsl(${textHsl.h}, 100%, ${textHsl.l}%))`,
                    }}
                  />
                  <span className="mobile-slider-val">{textHsl.s}%</span>
                </div>
              )}

              {textDetailsTab === 'transform' && (
                <>
                  <div className="mobile-transform-slider-row">
                    {layerScaleMode === 'horl' && (
                      <>
                        <span className="mobile-slider-label">Wide</span>
                        <input type="range" min={0.1} max={4} step={0.05}
                          value={textLayer.transform.scale.x}
                          onChange={e => { const v = Number(e.target.value); updateLayerTransient(textLayer.id, { transform: { scale: { x: v } } } as any) }}
                          onPointerUp={e => { const v = Number((e.target as HTMLInputElement).value); updateLayer(textLayer.id, { transform: { scale: { x: v } } } as any) }}
                          className="mobile-slider mobile-slider--transform"
                        />
                        <span className="mobile-slider-val">{textLayer.transform.scale.x.toFixed(2)}×</span>
                      </>
                    )}
                    {layerScaleMode === 'vert' && (
                      <>
                        <span className="mobile-slider-label">Tall</span>
                        <input type="range" min={0.1} max={4} step={0.05}
                          value={textLayer.transform.scale.y}
                          onChange={e => { const v = Number(e.target.value); updateLayerTransient(textLayer.id, { transform: { scale: { y: v } } } as any) }}
                          onPointerUp={e => { const v = Number((e.target as HTMLInputElement).value); updateLayer(textLayer.id, { transform: { scale: { y: v } } } as any) }}
                          className="mobile-slider mobile-slider--transform"
                        />
                        <span className="mobile-slider-val">{textLayer.transform.scale.y.toFixed(2)}×</span>
                      </>
                    )}
                    {layerScaleMode === 'rotate' && (
                      <>
                        <span className="mobile-slider-label">Rotate</span>
                        <input type="range" min={-3.14} max={3.14} step={0.02}
                          value={textLayer.transform.rotation?.z ?? 0}
                          onChange={e => { const v = Number(e.target.value); updateLayerTransient(textLayer.id, { transform: { rotation: { ...textLayer.transform.rotation, z: v } } } as any) }}
                          onPointerUp={e => { const v = Number((e.target as HTMLInputElement).value); updateLayer(textLayer.id, { transform: { rotation: { ...textLayer.transform.rotation, z: v } } } as any) }}
                          className="mobile-slider mobile-slider--transform"
                        />
                        <span className="mobile-slider-val">{Math.round(((textLayer.transform.rotation?.z ?? 0) * 180) / Math.PI)}°</span>
                      </>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
        )
      }

      // ── ELEMENTS ─────────────────────────────────────────────
      case 'elements': {
        const decalLayer = selectedLayer?.type === 'decal' ? selectedLayer as { id: string; type: 'decal'; colorHex: string; finish: 'gloss' | 'matte' | 'chrome' | 'satin'; mirrorX: boolean; mirrorToOtherSide: boolean; mirrorColorHex: string | null; mirrorMirrorX: boolean; transform: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } } } : null
        return (
        <div className="mobile-car-controls">
          <div className="mobile-chips-row">
            <span className="mobile-strip-label">Decals</span>
            <button
              type="button"
              className="mobile-chip"
              onClick={() => {
                if (isGuest) {
                  onGuestSignIn()
                  return
                }
                elementsImportInputRef.current?.click()
              }}
            >
              Import
            </button>
            <input
              ref={elementsImportInputRef}
              type="file"
              accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"
              onChange={handleElementsImport}
              style={{ display: 'none' }}
            />
          </div>
          {decalLayer && (
            <div className="mobile-chips-row" style={{ paddingTop: 6 }}>
              <span className="mobile-strip-label">Finish</span>
              {FINISHES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`mobile-chip${decalLayer.finish === f.id ? ' active' : ''}`}
                  onClick={() => updateLayer(decalLayer.id, { finish: f.id } as Parameters<typeof updateLayer>[1])}
                >
                  {f.label}
                </button>
              ))}
              <span className="mobile-chips-sep" />
              <button
                type="button"
                className={`mobile-chip mobile-inline-mirror-chip${decalLayer.mirrorToOtherSide ? ' active' : ''}`}
                onClick={() => updateLayer(decalLayer.id, { mirrorToOtherSide: !decalLayer.mirrorToOtherSide } as Parameters<typeof updateLayer>[1])}
                aria-label={decalLayer.mirrorToOtherSide ? 'Mirrored to both sides' : 'Mirror to other side'}
                title="Mirror to other side of car"
              >
                ⟷ Mirror
              </button>
              {decalLayer.mirrorToOtherSide && (
                <button
                  type="button"
                  className={`mobile-chip mobile-inline-mirror-chip${decalLayer.mirrorX ? ' active' : ''}`}
                  onClick={() => updateLayer(decalLayer.id, { mirrorX: !decalLayer.mirrorX } as Parameters<typeof updateLayer>[1])}
                  aria-label={decalLayer.mirrorX ? 'Horizontally mirrored' : 'Mirror horizontally'}
                  title="Flip the mirrored copy"
                >
                  ↔ Flip
                </button>
              )}
            </div>
          )}
          {/* Color swatches for selected decal */}
          {decalLayer && (
            <>
            <div className="mobile-swatches-row mobile-swatches-row--mirror" style={{ paddingTop: 4 }}>
              <span className="mobile-strip-label">Color</span>
              {visibleWrapColors.map(c => (
                <button key={c.id} type="button" className="mobile-color-swatch"
                  style={{ backgroundColor: c.hex, width: 34, height: 34, minWidth: 34,
                    boxShadow: decalLayer.colorHex === c.hex ? `0 0 0 2px #fff` : undefined }}
                  onClick={() => updateLayer(decalLayer.id, { colorHex: c.hex } as Parameters<typeof updateLayer>[1])}
                  aria-label={`${c.brand} ${c.code} ${c.name}`}
                  title={`${c.brand} ${c.code} - ${c.name}`}
                />
              ))}
              {decalLayer.mirrorToOtherSide && (
                <>
                  <span className="mobile-chips-sep" />
                  <span className="mobile-strip-label" style={{ fontSize: '0.72rem' }}>Mirror</span>
                  <button
                    type="button"
                    className={`mobile-chip${decalLayer.mirrorMirrorX ? ' active' : ''}`}
                    onClick={() => updateLayer(decalLayer.id, { mirrorMirrorX: !decalLayer.mirrorMirrorX } as Parameters<typeof updateLayer>[1])}
                    title="Flip the mirrored copy"
                    style={{ minWidth: 38, fontSize: '0.75rem' }}
                  >Flip</button>
                  <button
                    type="button"
                    className={`mobile-chip${!decalLayer.mirrorColorHex ? ' active' : ''}`}
                    style={{ fontSize: '0.75rem', minWidth: 44 }}
                    onClick={() => updateLayer(decalLayer.id, { mirrorColorHex: null } as Parameters<typeof updateLayer>[1])}
                    title="Same color as main side"
                  >Same</button>
                  <div className="mobile-mirror-colors-scroll">
                    {visibleWrapColors.map(c => (
                      <button key={`mirror-${c.id}`} type="button" className="mobile-color-swatch"
                        style={{ backgroundColor: c.hex, width: 28, height: 28, minWidth: 28, flex: '0 0 28px',
                          boxShadow: decalLayer.mirrorColorHex === c.hex ? `0 0 0 2px #fff` : undefined }}
                        onClick={() => updateLayer(decalLayer.id, { mirrorColorHex: c.hex } as Parameters<typeof updateLayer>[1])}
                        aria-label={`Mirror: ${c.brand} ${c.code}`}
                        title={`${c.brand} ${c.code}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
            </>
          )}
          {/* Scale / Rotate mode tabs + slider for selected decal */}
          {decalLayer && (
            <>
              <div className="mobile-chips-row" style={{ paddingTop: 6 }}>
                <span className="mobile-strip-label">Transform</span>
                {(['uniform', 'horl', 'vert', 'rotate'] as LayerScaleMode[]).map(m => (
                  <button key={m} type="button"
                    className={`mobile-chip${layerScaleMode === m ? ' active' : ''}`}
                    onClick={() => setLayerScaleMode(m)}
                  >
                    {m === 'uniform' ? 'Scale' : m === 'horl' ? 'Wide' : m === 'vert' ? 'Tall' : 'Rotate'}
                  </button>
                ))}
                <span className="mobile-chips-sep" />
                <button
                  type="button"
                  className="mobile-chip mobile-chip--nudge"
                  onClick={() => updateLayer(decalLayer.id, {
                    transform: {
                      position: {
                        ...decalLayer.transform.position,
                        y: decalLayer.transform.position.y + POSITION_NUDGE_STEP,
                      },
                    },
                  } as Parameters<typeof updateLayer>[1])}
                  title="Nudge up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="mobile-chip mobile-chip--nudge"
                  onClick={() => updateLayer(decalLayer.id, {
                    transform: {
                      position: {
                        ...decalLayer.transform.position,
                        z: decalLayer.transform.position.z - POSITION_NUDGE_STEP,
                      },
                    },
                  } as Parameters<typeof updateLayer>[1])}
                  title="Nudge left"
                >
                  ←
                </button>
                <button
                  type="button"
                  className="mobile-chip mobile-chip--nudge"
                  onClick={() => updateLayer(decalLayer.id, {
                    transform: {
                      position: {
                        ...decalLayer.transform.position,
                        z: decalLayer.transform.position.z + POSITION_NUDGE_STEP,
                      },
                    },
                  } as Parameters<typeof updateLayer>[1])}
                  title="Nudge right"
                >
                  →
                </button>
                <button
                  type="button"
                  className="mobile-chip mobile-chip--nudge"
                  onClick={() => updateLayer(decalLayer.id, {
                    transform: {
                      position: {
                        ...decalLayer.transform.position,
                        y: decalLayer.transform.position.y - POSITION_NUDGE_STEP,
                      },
                    },
                  } as Parameters<typeof updateLayer>[1])}
                  title="Nudge down"
                >
                  ↓
                </button>
              </div>
              <div className="mobile-transform-slider-row">
                {layerScaleMode === 'uniform' && (
                  <>
                    <span className="mobile-slider-label">Scale</span>
                    <input type="range" min={0.1} max={4} step={0.05}
                      value={decalLayer.transform.scale.x}
                      onChange={e => { const v = Number(e.target.value); updateLayerTransient(decalLayer.id, { transform: { ...decalLayer.transform, scale: { x: v, y: v, z: 1 } } } as any) }}
                      onPointerUp={e => { const v = Number((e.target as HTMLInputElement).value); updateLayer(decalLayer.id, { transform: { ...decalLayer.transform, scale: { x: v, y: v, z: 1 } } } as any) }}
                      className="mobile-slider mobile-slider--transform"
                    />
                    <span className="mobile-slider-val">{decalLayer.transform.scale.x.toFixed(2)}×</span>
                  </>
                )}
                {layerScaleMode === 'horl' && (
                  <>
                    <span className="mobile-slider-label">Wide</span>
                    <input type="range" min={0.1} max={4} step={0.05}
                      value={decalLayer.transform.scale.x}
                      onChange={e => { const v = Number(e.target.value); updateLayerTransient(decalLayer.id, { transform: { scale: { x: v } } } as any) }}
                      onPointerUp={e => { const v = Number((e.target as HTMLInputElement).value); updateLayer(decalLayer.id, { transform: { scale: { x: v } } } as any) }}
                      className="mobile-slider mobile-slider--transform"
                    />
                    <span className="mobile-slider-val">{decalLayer.transform.scale.x.toFixed(2)}×</span>
                  </>
                )}
                {layerScaleMode === 'vert' && (
                  <>
                    <span className="mobile-slider-label">Tall</span>
                    <input type="range" min={0.1} max={4} step={0.05}
                      value={decalLayer.transform.scale.y}
                      onChange={e => { const v = Number(e.target.value); updateLayerTransient(decalLayer.id, { transform: { scale: { y: v } } } as any) }}
                      onPointerUp={e => { const v = Number((e.target as HTMLInputElement).value); updateLayer(decalLayer.id, { transform: { scale: { y: v } } } as any) }}
                      className="mobile-slider mobile-slider--transform"
                    />
                    <span className="mobile-slider-val">{decalLayer.transform.scale.y.toFixed(2)}×</span>
                  </>
                )}
                {layerScaleMode === 'rotate' && (
                  <>
                    <span className="mobile-slider-label">Rotate</span>
                    <input type="range" min={-3.14} max={3.14} step={0.02}
                      value={decalLayer.transform.rotation?.z ?? 0}
                      onChange={e => { const v = Number(e.target.value); updateLayerTransient(decalLayer.id, { transform: { rotation: { ...decalLayer.transform.rotation, z: v } } } as any) }}
                      onPointerUp={e => { const v = Number((e.target as HTMLInputElement).value); updateLayer(decalLayer.id, { transform: { rotation: { ...decalLayer.transform.rotation, z: v } } } as any) }}
                      className="mobile-slider mobile-slider--transform"
                    />
                    <span className="mobile-slider-val">{Math.round(((decalLayer.transform.rotation?.z ?? 0) * 180) / Math.PI)}°</span>
                  </>
                )}
              </div>
            </>
          )}
          <div
            className="mobile-decals-row"
            onWheelCapture={handleDecalsRowWheel}
            onWheel={handleDecalsRowWheel}
          >
            {decalsLoading && <span className="mobile-strip-label">Loading…</span>}
            {!decalsLoading && decals.length === 0 && customDecals.length === 0 && <span className="mobile-strip-label">No decals yet</span>}
            {customDecals.map(d => (
              <button key={`created-${d.id}`} type="button" className="mobile-decal-thumb"
                onClick={() => { addDecalLayer(d.imageUrl); setTool('decal') }}
                title={`${d.name} (Created)`}
              >
                <img src={d.imageUrl} alt={d.name} loading="lazy" />
              </button>
            ))}
            {decals.map(d => (
              <button key={`library-${d.fileName}`} type="button" className="mobile-decal-thumb"
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
          {(() => {
            const stripeLayers = layers.filter((layer): layer is Extract<typeof layer, { type: 'stripe' }> => layer.type === 'stripe')
            const selectedStripeLayer = selectedLayer?.type === 'stripe' ? selectedLayer : null
            const activeStripeLayer = selectedStripeLayer ?? (stripeLayers.length > 0 ? stripeLayers[stripeLayers.length - 1] : null)
            const stripeColorHex = activeStripeLayer?.colorHex ?? carStripe.colorHex
            const stripeFinish = activeStripeLayer?.finish ?? carStripe.finish
            const stripeWidth = activeStripeLayer?.stripeWidth ?? carStripe.width
            const stripeGap = activeStripeLayer?.stripeGap ?? carStripe.gap
            const stripeOffset = activeStripeLayer?.stripeOffsetX ?? carStripe.offsetX
            const stripeAngle = activeStripeLayer?.transform.rotation.z ?? carStripe.angle
            const stripeSoftEdge = activeStripeLayer?.softEdge ?? carStripe.softEdge
            const stripeEnabled = activeStripeLayer ? activeStripeLayer.visible : carStripe.enabled
            const stripeHsl = hexToHsl(stripeColorHex)

            const applyStripePatch = (patch: {
              colorHex?: string
              finish?: 'gloss' | 'matte' | 'chrome' | 'satin'
              width?: number
              gap?: number
              offsetX?: number
              softEdge?: number
              angle?: number
              enabled?: boolean
            }) => {
              const carStripePatch = {
                ...(patch.colorHex !== undefined ? { colorHex: patch.colorHex } : {}),
                ...(patch.finish !== undefined ? { finish: patch.finish } : {}),
                ...(patch.width !== undefined ? { width: patch.width } : {}),
                ...(patch.gap !== undefined ? { gap: patch.gap } : {}),
                ...(patch.offsetX !== undefined ? { offsetX: patch.offsetX } : {}),
                ...(patch.softEdge !== undefined ? { softEdge: patch.softEdge } : {}),
                ...(patch.angle !== undefined ? { angle: patch.angle } : {}),
                ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
              }

              if (!activeStripeLayer) {
                setCarStripe(carStripePatch)
                return
              }

              const layerPatch = {
                ...(patch.colorHex !== undefined ? { colorHex: patch.colorHex } : {}),
                ...(patch.finish !== undefined ? { finish: patch.finish } : {}),
                ...(patch.width !== undefined ? { stripeWidth: patch.width } : {}),
                ...(patch.gap !== undefined ? { stripeGap: patch.gap } : {}),
                ...(patch.offsetX !== undefined ? { stripeOffsetX: patch.offsetX } : {}),
                ...(patch.softEdge !== undefined ? { softEdge: patch.softEdge } : {}),
                ...(patch.enabled !== undefined ? { visible: patch.enabled } : {}),
                ...(patch.angle !== undefined ? { transform: { rotation: { z: patch.angle } } } : {}),
              }

              updateLayer(activeStripeLayer.id, layerPatch as Parameters<typeof updateLayer>[1])
            }

            const applyStripePreset = (preset: typeof STRIPE_PRESETS[number]['config']) => {
              if (activeStripeLayer) {
                applyStripePatch({
                  colorHex: preset.colorHex,
                  finish: preset.finish,
                  width: preset.width,
                  gap: preset.gap,
                  offsetX: preset.offsetX,
                  softEdge: preset.softEdge,
                  angle: preset.angle,
                  enabled: true,
                })
                return
              }

              addStripeLayerPreset([
                {
                  colorHex: preset.colorHex,
                  finish: preset.finish,
                  stripeWidth: preset.width,
                  stripeGap: preset.gap,
                  stripeOffsetX: preset.offsetX,
                  softEdge: preset.softEdge,
                  visible: true,
                  transform: {
                    rotation: { z: preset.angle },
                  },
                } as any,
              ])
            }

            return (
              <>
          <div className="mobile-chips-row">
            <button
              type="button"
              className="mobile-add-btn"
              onClick={() => {
                if (isGuest) { onGuestSignIn(); return }
                addStripeLayer()
              }}
            >+ Add Stripe</button>
            <span className="mobile-chips-sep" />
            {stripeLayers.slice().reverse().map((layer) => (
              <button
                key={layer.id}
                type="button"
                className={`mobile-layer-chip${activeStripeLayer?.id === layer.id ? ' active' : ''}`}
                onClick={() => setSelectedLayer(layer.id)}
                title={layer.name}
              >
                {layer.name}
              </button>
            ))}
          </div>
          {/* Preset chips */}
          <div className="mobile-chips-row">
            {/* ON/OFF toggle */}
            <button type="button"
              className={`mobile-chip${stripeEnabled ? ' active' : ''}`}
              style={{ minWidth: 56, fontWeight: 700 }}
              onClick={() => applyStripePatch({ enabled: !stripeEnabled })}
            >{stripeEnabled ? 'ON' : 'OFF'}</button>
            <span className="mobile-chips-sep" />
            <span className="mobile-strip-label">Style</span>
            {STRIPE_PRESETS.map(p => (
              <button key={p.id} type="button"
                className={`mobile-preset-chip${stripeEnabled && stripeWidth === p.config.width && stripeAngle === p.config.angle ? ' active' : ''}`}
                onClick={() => applyStripePreset(p.config)}
              >
                <span className="mobile-preset-preview" style={{ background: p.preview }} />
                {p.label}
              </button>
            ))}
            <span className="mobile-chips-sep" />
            {FINISHES.map(f => (
              <button key={f.id} type="button"
                className={`mobile-chip${stripeFinish === f.id ? ' active' : ''}`}
                onClick={() => applyStripePatch({ finish: f.id, enabled: true })}
              >
                <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3, lineHeight: 1.05 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '999px',
                      ...getFinishPreviewStyle(f.id),
                    }}
                  />
                  <span>{f.label}</span>
                </span>
              </button>
            ))}
          </div>
          {/* Slider row */}
          <div className="mobile-swatches-row" style={{ gap: 8 }}>
            {/* Slider selector */}
            {(['width', 'gap', 'angle', 'offset', 'soft'] as const).map(s => (
              <button key={s} type="button"
                className={`mobile-chip${stripeSlider === s ? ' active' : ''}`}
                onClick={() => setStripeSlider(s)}
              >{s.charAt(0).toUpperCase() + s.slice(1)}</button>
            ))}
            <span className="mobile-chips-sep" />
            {stripeSlider === 'width' && (
              <input type="range" min={0.0001} max={0.5} step={0.0001}
                value={stripeWidth ?? 0.14}
                onChange={e => applyStripePatch({ width: Number(e.target.value) })}
                className="mobile-slider"
              />
            )}
            {stripeSlider === 'gap' && (
              <input type="range" min={0} max={0.9} step={0.01}
                value={stripeGap ?? 0}
                onChange={e => applyStripePatch({ gap: Number(e.target.value) })}
                className="mobile-slider"
              />
            )}
            {stripeSlider === 'angle' && (
              <input type="range" min={-1} max={1} step={0.01}
                value={stripeAngle ?? 0}
                onChange={e => applyStripePatch({ angle: Number(e.target.value) })}
                className="mobile-slider"
              />
            )}
            {stripeSlider === 'offset' && (
              <input type="range" min={-1} max={1} step={0.01}
                value={stripeOffset ?? 0}
                onChange={e => applyStripePatch({ offsetX: Number(e.target.value) })}
                className="mobile-slider"
              />
            )}
            {stripeSlider === 'soft' && (
              <input type="range" min={0} max={0.2} step={0.005}
                value={stripeSoftEdge ?? 0.02}
                onChange={e => applyStripePatch({ softEdge: Number(e.target.value) })}
                className="mobile-slider"
              />
            )}
            <span className="mobile-chips-sep" />
            {/* Stripe color swatches */}
            {visibleWrapColors.map(c => (
              <button key={c.id} type="button" className="mobile-color-swatch"
                style={{ backgroundColor: c.hex, width: 32, height: 32, minWidth: 32 }}
                onClick={() => applyStripePatch({ colorHex: c.hex })}
                aria-label={`${c.brand} ${c.code} ${c.name}`}
                title={`${c.brand} ${c.code} - ${c.name}`}
              />
            ))}
          </div>
          <div className="mobile-transform-slider-row mobile-transform-slider-row--saturation">
            <span className="mobile-slider-label">Saturation</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={stripeHsl.s}
              onChange={(e) => {
                const nextSaturation = Number(e.target.value)
                const nextHex = hslToHex(stripeHsl.h, nextSaturation, stripeHsl.l)
                applyStripePatch({ colorHex: nextHex, enabled: true })
              }}
              className="mobile-slider mobile-slider--transform mobile-slider--saturation"
              style={{
                background: `linear-gradient(to right, hsl(${stripeHsl.h}, 0%, ${stripeHsl.l}%), hsl(${stripeHsl.h}, 100%, ${stripeHsl.l}%))`,
              }}
            />
            <span className="mobile-slider-val">{stripeHsl.s}%</span>
          </div>
              </>
            )
          })()}
        </div>
      )

      // ── SPLIT ────────────────────────────────────────────────
      case 'split': return (
        <div className="mobile-car-controls">
          {(() => {
            const activeSplitHex = splitSide === 'A' ? carSplit.sideAHex : carSplit.sideBHex
            const splitHsl = hexToHsl(activeSplitHex)
            return (
              <>
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
            <span className="mobile-chips-sep" />
            {FINISHES.map(f => (
              <button key={f.id} type="button"
                className={`mobile-chip${carSplit.finish === f.id ? ' active' : ''}`}
                onClick={() => setCarSplit({ finish: f.id, enabled: true })}
              >{f.label}</button>
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
            {visibleWrapColors.map(c => (
              <button key={c.id} type="button" className="mobile-color-swatch"
                style={{ backgroundColor: c.hex, width: 32, height: 32, minWidth: 32 }}
                onClick={() => setCarSplit(splitSide === 'A' ? { sideAHex: c.hex } : { sideBHex: c.hex })}
                aria-label={`${c.brand} ${c.code} ${c.name}`}
                title={`${c.brand} ${c.code} - ${c.name}`}
              />
            ))}
          </div>
          <div className="mobile-transform-slider-row mobile-transform-slider-row--saturation">
            <span className="mobile-slider-label">Saturation</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={splitHsl.s}
              onChange={(e) => {
                const nextSaturation = Number(e.target.value)
                const nextHex = hslToHex(splitHsl.h, nextSaturation, splitHsl.l)
                setCarSplit(splitSide === 'A' ? { sideAHex: nextHex, enabled: true } : { sideBHex: nextHex, enabled: true })
              }}
              className="mobile-slider mobile-slider--transform mobile-slider--saturation"
              style={{
                background: `linear-gradient(to right, hsl(${splitHsl.h}, 0%, ${splitHsl.l}%), hsl(${splitHsl.h}, 100%, ${splitHsl.l}%))`,
              }}
            />
            <span className="mobile-slider-val">{splitHsl.s}%</span>
          </div>
              </>
            )
          })()}
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
            {visibleWrapColors.map(c => (
              <button key={c.id} type="button" className="mobile-color-swatch"
                style={{
                  backgroundColor: c.hex,
                  width: 38,
                  height: 38,
                  minWidth: 38,
                  boxShadow: windowTint.colorHex?.toLowerCase() === c.hex.toLowerCase() ? '0 0 0 2px #fff' : undefined,
                }}
                onClick={() => setWindowTint({ enabled: true, colorHex: c.hex })}
                aria-label={`${c.brand} ${c.code} ${c.name}`}
                title={`${c.brand} ${c.code} - ${c.name}`}
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
            {[...layers].reverse().map((layer, displayIndex, displayList) => (
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
                {(layer.type === 'text' || layer.type === 'decal') && (
                  <div className="mobile-layer-mirror-controls">
                    <button
                      type="button"
                      className={`mobile-layer-mirror${layer.mirrorToOtherSide ? ' active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        updateLayer(layer.id, { mirrorToOtherSide: !layer.mirrorToOtherSide })
                      }}
                      aria-label={layer.mirrorToOtherSide ? 'Mirrored to both sides' : 'Mirror to other side'}
                      title="Mirror to other side of car"
                    >
                      ⟷
                    </button>
                    <button
                      type="button"
                      className={`mobile-layer-mirror${layer.mirrorX ? ' active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        updateLayer(layer.id, { mirrorX: !layer.mirrorX })
                      }}
                      aria-label={layer.mirrorX ? 'Horizontally mirrored' : 'Mirror horizontally'}
                      title="Mirror horizontally"
                    >
                      ↔
                    </button>
                  </div>
                )}
                <div className="mobile-layer-order-controls">
                  <button
                    type="button"
                    className="mobile-layer-move"
                    disabled={displayIndex === 0}
                    onClick={(e) => {
                      e.stopPropagation()
                      moveLayerByDisplayOffset(layer.id, -1)
                    }}
                    aria-label="Move layer left"
                    title="Move left"
                  >
                    {'<'}
                  </button>
                  <button
                    type="button"
                    className="mobile-layer-move"
                    disabled={displayIndex === displayList.length - 1}
                    onClick={(e) => {
                      e.stopPropagation()
                      moveLayerByDisplayOffset(layer.id, 1)
                    }}
                    aria-label="Move layer right"
                    title="Move right"
                  >
                    {'>'}
                  </button>
                </div>
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

  // Embedded mode — just the controls strip, no canvas or tab bar
  if (embedded) {
    return (
      <div className="mobile-controls-strip mobile-controls-strip--embedded">
        {renderStrip()}
      </div>
    )
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
