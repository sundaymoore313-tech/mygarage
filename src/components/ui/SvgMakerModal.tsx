import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { WrapColorPicker } from './WrapColorPicker'

// ─── Shape types ────────────────────────────────────────────────────────────

type SvgShapeKind = 'rect' | 'circle' | 'triangle' | 'text' | 'star' | 'arrow' | 'path'

type SvgShape = {
  id: string
  kind: SvgShapeKind
  name: string
  x: number
  y: number
  width: number
  height: number
  radius: number
  rotation: number
  fill: string
  stroke: string
  strokeWidth: number
  text: string
  fontSize: number
  fontFamily: string
  fontUrl: string
  fontWeight: 'normal' | 'bold'
  fontStyle: 'normal' | 'italic'
  textAlign: 'left' | 'center' | 'right'
  starPoints: number
  pathData: string
  visible: boolean
  locked: boolean
}

type SavePayload = {
  name: string
  imageUrl: string
  svgMarkup: string
}

type SvgMakerPageProps = {
  onClose: () => void
  onSave: (payload: SavePayload) => void
}

type FontManifestItem = {
  name: string
  family: string
  fileName: string
  url: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ARTBOARD_SIZE = 1024
const GRID_SNAP = 28
const ANGLE_SNAP = 15
const MIN_SIZE = 24
const HISTORY_LIMIT = 80

type ResizeHandle = 'se' | 'e' | 's' | 'radius' | 'text-size'

type DragState = {
  pointerId: number
  shapeId: string
  mode: 'move' | 'resize'
  handle?: ResizeHandle
  startX: number
  startY: number
  origin: SvgShape
}

type DrawState = {
  pointerId: number
  shapeId: string
  points: Array<{ x: number; y: number }>
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function clamp(value: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, value))
}

function snapTo(value: number, size: number) {
  return Math.round(value / size) * size
}

function parseNum(input: string | null | undefined, fallback = 0) {
  if (!input) return fallback
  const v = Number.parseFloat(input)
  return Number.isFinite(v) ? v : fallback
}

function parseRot(transform: string | null): number {
  if (!transform) return 0
  const m = /rotate\(([-\d.]+)/i.exec(transform)
  if (!m) return 0
  const v = Number.parseFloat(m[1])
  return Number.isFinite(v) ? v : 0
}

function buildStarPoints(cx: number, cy: number, outer: number, inner: number, n: number): string {
  const coords: string[] = []
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI / n) * i - Math.PI / 2
    const r = i % 2 === 0 ? outer : inner
    coords.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`)
  }
  return coords.join(' ')
}

function buildArrowPoints(w: number, h: number): string {
  const hw = w / 2
  const hh = h / 2
  const shaft = hh * 0.38
  const head = hw * 0.42
  return [
    `${-hw},${-shaft}`,
    `${hw - head},${-shaft}`,
    `${hw - head},${-hh}`,
    `${hw},0`,
    `${hw - head},${hh}`,
    `${hw - head},${shaft}`,
    `${-hw},${shaft}`,
  ].join(' ')
}

function normalizeShape(s: SvgShape): SvgShape {
  const n = { ...s }
  n.width = Math.max(MIN_SIZE, n.width)
  n.height = Math.max(MIN_SIZE, n.height)
  n.radius = Math.max(MIN_SIZE / 2, n.radius)
  n.fontSize = Math.max(8, n.fontSize)
  n.strokeWidth = Math.max(0, n.strokeWidth)
  n.starPoints = Math.max(3, Math.min(20, n.starPoints))
  n.x = clamp(n.x, MIN_SIZE / 2, ARTBOARD_SIZE - MIN_SIZE / 2)
  n.y = clamp(n.y, MIN_SIZE / 2, ARTBOARD_SIZE - MIN_SIZE / 2)
  return n
}

function defaultShape(kind: SvgShapeKind, nameHint?: string): SvgShape {
  return {
    id: createId(kind),
    kind,
    name: nameHint ?? kind.charAt(0).toUpperCase() + kind.slice(1),
    x: ARTBOARD_SIZE / 2,
    y: ARTBOARD_SIZE / 2,
    width: 280,
    height: 180,
    radius: 120,
    rotation: 0,
    fill: '#ffffff',
    stroke: kind === 'text' ? '#000000' : '#1a1a1a',
    strokeWidth: kind === 'text' ? 0 : 8,
    text: 'LOGO',
    fontSize: 130,
    fontFamily: 'sans-serif',
    fontUrl: '',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'center',
    starPoints: 5,
    pathData: '',
    visible: true,
    locked: false,
  }
}

// ─── SVG export ──────────────────────────────────────────────────────────────

function shapeToSvgString(s: SvgShape): string {
  if (!s.visible) return ''
  const t = `translate(${s.x} ${s.y}) rotate(${s.rotation})`
  const base = `fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"`

  if (s.kind === 'rect')
    return `<rect x="${-s.width / 2}" y="${-s.height / 2}" width="${s.width}" height="${s.height}" ${base} transform="${t}" />`

  if (s.kind === 'circle')
    return `<circle cx="${s.x}" cy="${s.y}" r="${s.radius}" ${base} />`

  if (s.kind === 'triangle') {
    const pts = `${-s.width / 2},${s.height / 2} 0,${-s.height / 2} ${s.width / 2},${s.height / 2}`
    return `<polygon points="${pts}" ${base} transform="${t}" />`
  }

  if (s.kind === 'star') {
    const outer = Math.min(s.width, s.height) / 2
    const pts = buildStarPoints(0, 0, outer, outer * 0.42, s.starPoints)
    return `<polygon points="${pts}" ${base} transform="${t}" />`
  }

  if (s.kind === 'arrow') {
    const pts = buildArrowPoints(s.width, s.height)
    return `<polygon points="${pts}" ${base} transform="${t}" />`
  }

  if (s.kind === 'path') {
    if (!s.pathData) return ''
    return `<path d="${s.pathData}" ${base} transform="${t}" fill-rule="evenodd" />`
  }

  // text
  const textAnchorMap = { left: 'start', center: 'middle', right: 'end' }
  const anchor = textAnchorMap[s.textAlign ?? 'center']
  const fontAttr = s.fontFamily && s.fontFamily !== 'sans-serif' ? ` font-family="${s.fontFamily}"` : ''
  const weightAttr = s.fontWeight === 'bold' ? ' font-weight="bold"' : ''
  const styleAttr = s.fontStyle === 'italic' ? ' font-style="italic"' : ''
  const lines = (s.text || '').split('\n')
  const lineH = s.fontSize * 1.25
  const totalH = (lines.length - 1) * lineH
  const baseY = s.y - totalH / 2
  if (lines.length === 1) {
    return `<text x="${s.x}" y="${s.y}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" font-size="${s.fontSize}"${fontAttr}${weightAttr}${styleAttr} text-anchor="${anchor}" dominant-baseline="middle" transform="rotate(${s.rotation} ${s.x} ${s.y})">${lines[0]}</text>`
  }
  const tspans = lines.map((l, i) => `<tspan x="${s.x}" dy="${i === 0 ? 0 : lineH}">${l}</tspan>`).join('')
  return `<text x="${s.x}" y="${baseY}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" font-size="${s.fontSize}"${fontAttr}${weightAttr}${styleAttr} text-anchor="${anchor}" dominant-baseline="middle" transform="rotate(${s.rotation} ${s.x} ${s.y})">${tspans}</text>`
}

// ─── SVG import ───────────────────────────────────────────────────────────────

function parseSvgImport(svgText: string): SvgShape[] {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const svg = doc.querySelector('svg')
  if (!svg) return []

  const vb = svg.getAttribute('viewBox')
  const [vbX, vbY, vbW, vbH] = vb
    ? vb.split(/[\s,]+/).map((p) => Number.parseFloat(p))
    : [0, 0, parseNum(svg.getAttribute('width'), ARTBOARD_SIZE), parseNum(svg.getAttribute('height'), ARTBOARD_SIZE)]

  const sx = vbW > 0 ? ARTBOARD_SIZE / vbW : 1
  const sy = vbH > 0 ? ARTBOARD_SIZE / vbH : 1
  const tx = (v: number) => (v - vbX) * sx
  const ty = (v: number) => (v - vbY) * sy
  const df = { fill: '#ffffff', stroke: '#1a1a1a', sw: 8 }
  const shapes: SvgShape[] = []

  svg.querySelectorAll('rect').forEach((n) => {
    const x = parseNum(n.getAttribute('x'))
    const y = parseNum(n.getAttribute('y'))
    const w = Math.max(MIN_SIZE, parseNum(n.getAttribute('width'), 140) * sx)
    const h = Math.max(MIN_SIZE, parseNum(n.getAttribute('height'), 90) * sy)
    shapes.push(normalizeShape({ ...defaultShape('rect'), id: createId('rect'), x: tx(x + parseNum(n.getAttribute('width')) / 2), y: ty(y + parseNum(n.getAttribute('height')) / 2), width: w, height: h, rotation: parseRot(n.getAttribute('transform')), fill: n.getAttribute('fill') || df.fill, stroke: n.getAttribute('stroke') || df.stroke, strokeWidth: parseNum(n.getAttribute('stroke-width'), df.sw) }))
  })

  svg.querySelectorAll('circle').forEach((n) => {
    const cx = parseNum(n.getAttribute('cx'))
    const cy = parseNum(n.getAttribute('cy'))
    const r = Math.max(MIN_SIZE / 2, parseNum(n.getAttribute('r'), 60) * ((sx + sy) / 2))
    shapes.push(normalizeShape({ ...defaultShape('circle'), id: createId('circle'), x: tx(cx), y: ty(cy), radius: r, fill: n.getAttribute('fill') || df.fill, stroke: n.getAttribute('stroke') || df.stroke, strokeWidth: parseNum(n.getAttribute('stroke-width'), df.sw) }))
  })

  svg.querySelectorAll('polygon').forEach((n) => {
    const raw = n.getAttribute('points') || ''
    const nums = raw.trim().split(/[\s,]+/).map((p) => Number.parseFloat(p)).filter((v) => Number.isFinite(v))
    if (nums.length < 6) return
    const xs: number[] = []; const ys: number[] = []
    for (let i = 0; i < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]) }
    shapes.push(normalizeShape({ ...defaultShape('triangle'), id: createId('triangle'), x: tx((Math.min(...xs) + Math.max(...xs)) / 2), y: ty((Math.min(...ys) + Math.max(...ys)) / 2), width: Math.max(MIN_SIZE, (Math.max(...xs) - Math.min(...xs)) * sx), height: Math.max(MIN_SIZE, (Math.max(...ys) - Math.min(...ys)) * sy), rotation: parseRot(n.getAttribute('transform')), fill: n.getAttribute('fill') || df.fill, stroke: n.getAttribute('stroke') || df.stroke, strokeWidth: parseNum(n.getAttribute('stroke-width'), df.sw) }))
  })

  svg.querySelectorAll('text').forEach((n) => {
    const x = parseNum(n.getAttribute('x'), vbW / 2)
    const y = parseNum(n.getAttribute('y'), vbH / 2)
    shapes.push(normalizeShape({ ...defaultShape('text'), id: createId('text'), x: tx(x), y: ty(y), rotation: parseRot(n.getAttribute('transform')), fill: n.getAttribute('fill') || df.fill, stroke: n.getAttribute('stroke') || '#000000', strokeWidth: parseNum(n.getAttribute('stroke-width'), 0), text: (n.textContent || 'LOGO').trim() || 'LOGO', fontSize: Math.max(8, parseNum(n.getAttribute('font-size'), 130) * sy), fontFamily: n.getAttribute('font-family') || 'sans-serif' }))
  })

  return shapes
}

// ─── Selection handles ────────────────────────────────────────────────────────

function SelectionHandles({
  shape,
  onStartResize,
}: {
  shape: SvgShape
  onStartResize: (e: React.PointerEvent, id: string, h: ResizeHandle) => void
}) {
  if (shape.kind === 'circle') {
    return (
      <>
        <circle cx={shape.x} cy={shape.y} r={shape.radius + 8} fill="none" stroke="#fff" strokeDasharray="8 6" strokeWidth={2} pointerEvents="none" />
        <circle cx={shape.x + shape.radius + 14} cy={shape.y} r={10} className="svg-maker-handle" onPointerDown={(e) => { e.stopPropagation(); onStartResize(e, shape.id, 'radius') }} />
      </>
    )
  }
  if (shape.kind === 'text') {
    const hw = Math.max(shape.fontSize * (shape.text.length || 1) * 0.55, 60)
    const hh = shape.fontSize * 0.7
    return (
      <g transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}>
        <rect x={-hw} y={-hh} width={hw * 2} height={hh * 2} fill="none" stroke="#fff" strokeDasharray="8 6" strokeWidth={2} pointerEvents="none" />
        <circle cx={0} cy={hh + 16} r={10} className="svg-maker-handle" style={{ cursor: 'ns-resize' }} onPointerDown={(e) => { e.stopPropagation(); onStartResize(e, shape.id, 'text-size') }} />
      </g>
    )
  }
  const hw = shape.width / 2 + 8
  const hh = shape.height / 2 + 8
  return (
    <>
      <rect x={-hw} y={-hh} width={shape.width + 16} height={shape.height + 16} fill="none" stroke="#fff" strokeDasharray="8 6" strokeWidth={2} pointerEvents="none" />
      <circle cx={hw + 2} cy={hh + 2} r={10} className="svg-maker-handle" style={{ cursor: 'nwse-resize' }} onPointerDown={(e) => { e.stopPropagation(); onStartResize(e, shape.id, 'se') }} />
      <circle cx={hw + 2} cy={0} r={8} className="svg-maker-handle" style={{ cursor: 'ew-resize' }} onPointerDown={(e) => { e.stopPropagation(); onStartResize(e, shape.id, 'e') }} />
      <circle cx={0} cy={hh + 2} r={8} className="svg-maker-handle" style={{ cursor: 'ns-resize' }} onPointerDown={(e) => { e.stopPropagation(); onStartResize(e, shape.id, 's') }} />
    </>
  )
}

// ─── Individual shape element ─────────────────────────────────────────────────

function ShapeEl({
  shape, active, onSelect, onStartMove, onStartResize, onInlineEdit,
}: {
  shape: SvgShape
  active: boolean
  onSelect: () => void
  onStartMove: (e: React.PointerEvent, id: string) => void
  onStartResize: (e: React.PointerEvent, id: string, h: ResizeHandle) => void
  onInlineEdit?: (id: string) => void
}) {
  if (!shape.visible) return null
  const locked = shape.locked
  const down = (e: React.PointerEvent) => {
    e.stopPropagation()
    onSelect()
    if (!locked) onStartMove(e, shape.id)
  }
  const fill = shape.fill; const stroke = shape.stroke; const sw = shape.strokeWidth

  if (shape.kind === 'circle') {
    return (
      <g key={shape.id}>
        <circle cx={shape.x} cy={shape.y} r={shape.radius} fill={fill} stroke={stroke} strokeWidth={sw} onPointerDown={down} style={{ cursor: 'pointer' }} />
        {active && !locked && <SelectionHandles shape={shape} onStartResize={onStartResize} />}
      </g>
    )
  }

  if (shape.kind === 'text') {
    const anchor = { left: 'start' as const, center: 'middle' as const, right: 'end' as const }[shape.textAlign ?? 'center']
    const fontStyle: React.CSSProperties = {
      ...(shape.fontFamily && shape.fontFamily !== 'sans-serif' ? { fontFamily: shape.fontFamily } : {}),
      fontWeight: shape.fontWeight ?? 'normal',
      fontStyle: shape.fontStyle ?? 'normal',
      cursor: 'pointer',
    }
    const lines = (shape.text || '').split('\n')
    const lineH = shape.fontSize * 1.25
    const totalH = (lines.length - 1) * lineH
    return (
      <g key={shape.id}>
        {lines.length === 1 ? (
          <text x={shape.x} y={shape.y} fill={fill} stroke={stroke} strokeWidth={sw} fontSize={shape.fontSize}
            textAnchor={anchor} dominantBaseline="middle"
            transform={`rotate(${shape.rotation} ${shape.x} ${shape.y})`}
            onPointerDown={down}
            onDoubleClick={(e) => { e.stopPropagation(); if (!locked) onInlineEdit?.(shape.id) }}
            style={fontStyle}>
            {shape.text}
          </text>
        ) : (
          <text x={shape.x} y={shape.y - totalH / 2} fill={fill} stroke={stroke} strokeWidth={sw} fontSize={shape.fontSize}
            textAnchor={anchor} dominantBaseline="middle"
            transform={`rotate(${shape.rotation} ${shape.x} ${shape.y})`}
            onPointerDown={down}
            onDoubleClick={(e) => { e.stopPropagation(); if (!locked) onInlineEdit?.(shape.id) }}
            style={fontStyle}>
            {lines.map((l, i) => <tspan key={i} x={shape.x} dy={i === 0 ? 0 : lineH}>{l}</tspan>)}
          </text>
        )}
        {active && !locked && <SelectionHandles shape={shape} onStartResize={onStartResize} />}
      </g>
    )
  }

  if (shape.kind === 'star') {
    const outer = Math.min(shape.width, shape.height) / 2
    const pts = buildStarPoints(0, 0, outer, outer * 0.42, shape.starPoints)
    return (
      <g key={shape.id} transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}>
        <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} onPointerDown={down} style={{ cursor: 'pointer' }} />
        {active && !locked && <SelectionHandles shape={shape} onStartResize={onStartResize} />}
      </g>
    )
  }

  if (shape.kind === 'arrow') {
    const pts = buildArrowPoints(shape.width, shape.height)
    return (
      <g key={shape.id} transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}>
        <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} onPointerDown={down} style={{ cursor: 'pointer' }} />
        {active && !locked && <SelectionHandles shape={shape} onStartResize={onStartResize} />}
      </g>
    )
  }

  if (shape.kind === 'triangle') {
    const pts = `${-shape.width / 2},${shape.height / 2} 0,${-shape.height / 2} ${shape.width / 2},${shape.height / 2}`
    return (
      <g key={shape.id} transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}>
        <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} onPointerDown={down} style={{ cursor: 'pointer' }} />
        {active && !locked && <SelectionHandles shape={shape} onStartResize={onStartResize} />}
      </g>
    )
  }

  if (shape.kind === 'path') {
    if (!shape.pathData) return null
    return (
      <g key={shape.id} transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}>
        <path d={shape.pathData} fill={fill} stroke={stroke} strokeWidth={sw} onPointerDown={down} style={{ cursor: 'pointer' }} />
        {active && !locked && <SelectionHandles shape={shape} onStartResize={onStartResize} />}
      </g>
    )
  }

  // rect
  return (
    <g key={shape.id} transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}>
      <rect x={-shape.width / 2} y={-shape.height / 2} width={shape.width} height={shape.height} fill={fill} stroke={stroke} strokeWidth={sw} onPointerDown={down} style={{ cursor: 'pointer' }} />
      {active && !locked && <SelectionHandles shape={shape} onStartResize={onStartResize} />}
    </g>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

// ─── Layer row (SVG Maker) ───────────────────────────────────────────────────

type SvgLayerRowProps = {
  shape: SvgShape
  selected: boolean
  dragOver: boolean
  onSelect: () => void
  onToggleVisible: () => void
  onToggleLocked: () => void
  onDelete: () => void
  onRename: (name: string) => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  onDragEnd: () => void
}

function SvgLayerRow({
  shape, selected, dragOver,
  onSelect, onToggleVisible, onToggleLocked, onDelete, onRename,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: SvgLayerRowProps) {
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState(shape.name)
  const inputRef = useRef<HTMLInputElement>(null)

  function startRename(e: React.MouseEvent) {
    e.stopPropagation()
    setRenameVal(shape.name)
    setRenaming(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commit() {
    if (renameVal.trim()) onRename(renameVal.trim())
    setRenaming(false)
  }

  const swatchColor = shape.kind === 'path' ? shape.stroke : shape.fill

  return (
    <div
      className={['svg-layer-row', selected && 'selected', dragOver && 'drag-over', !shape.visible && 'hidden', shape.locked && 'locked'].filter(Boolean).join(' ')}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onSelect}
    >
      <span className="svg-layer-drag-handle" title="Drag to reorder">⠿</span>
      <span className="svg-layer-swatch" style={{ background: swatchColor }} />
      <div className="svg-layer-info">
        {renaming ? (
          <input
            ref={inputRef}
            className="svg-layer-rename-input"
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setRenaming(false) }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="svg-layer-name" onDoubleClick={startRename} title="Double-click to rename">
            {shape.name}
          </span>
        )}
        <span className="svg-layer-kind">
          {shape.kind}{shape.kind === 'text' ? ` "${shape.text.slice(0, 10)}"` : ''}
        </span>
      </div>
      <button type="button" className="svg-layer-icon-btn" title={shape.visible ? 'Hide' : 'Show'}
        onClick={(e) => { e.stopPropagation(); onToggleVisible() }}>
        {shape.visible ? '👁' : '🚫'}
      </button>
      <button type="button" className="svg-layer-icon-btn" title={shape.locked ? 'Unlock' : 'Lock'}
        onClick={(e) => { e.stopPropagation(); onToggleLocked() }}>
        {shape.locked ? '🔒' : '🔓'}
      </button>
      <button type="button" className="svg-layer-icon-btn danger" title="Delete"
        onClick={(e) => { e.stopPropagation(); onDelete() }}>
        ✕
      </button>
    </div>
  )
}

// ─── Modal ───────────────────────────────────────────────────────────────────

export function SvgMakerPage({ onClose, onSave }: SvgMakerPageProps) {
  const [name, setName] = useState('My Logo')
  const [shapes, setShapes] = useState<SvgShape[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [snapRotation, setSnapRotation] = useState(true)
  const [importError, setImportError] = useState<string | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [drawState, setDrawState] = useState<DrawState | null>(null)
  const [penMode, setPenMode] = useState(false)
  const [fonts, setFonts] = useState<FontManifestItem[]>([])
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [layerDragFrom, setLayerDragFrom] = useState<number | null>(null)
  const [layerDragOver, setLayerDragOver] = useState<number | null>(null)

  // Force re-render for undo button enabled state
  const [, forceUpdate] = useState(0)

  const historyPast = useRef<SvgShape[][]>([])
  const historyFuture = useRef<SvgShape[][]>([])
  const svgRef = useRef<SVGSVGElement | null>(null)
  const artboardWrapRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const selected = useMemo(() => shapes.find((s) => s.id === selectedId) ?? null, [shapes, selectedId])

  // Load fonts
  useEffect(() => {
    fetch('/fonts/manifest.json', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setFonts(Array.isArray(j.items) ? j.items : []))
      .catch(() => {})
  }, [])

  // Load @font-face when text shape with custom font is selected
  useEffect(() => {
    if (!selected || selected.kind !== 'text' || !selected.fontUrl) return
    const styleId = `svgmaker-ff-${selected.fontUrl.replace(/\W/g, '')}`
    if (document.getElementById(styleId)) return
    const el = document.createElement('style')
    el.id = styleId
    el.textContent = `@font-face { font-family: "${selected.fontFamily}"; src: url("${selected.fontUrl}"); }`
    document.head.appendChild(el)
  }, [selected])

  // ── History ──────────────────────────────────────────────────────────────

  function pushHistory(current: SvgShape[]) {
    historyPast.current = [...historyPast.current.slice(-HISTORY_LIMIT), [...current]]
    historyFuture.current = []
    forceUpdate((n) => n + 1)
  }

  function doUndo() {
    if (!historyPast.current.length) return
    historyFuture.current = [...historyFuture.current, [...shapes]]
    const prev = historyPast.current.pop()!
    setShapes(prev)
    forceUpdate((n) => n + 1)
  }

  function doRedo() {
    if (!historyFuture.current.length) return
    historyPast.current = [...historyPast.current, [...shapes]]
    const next = historyFuture.current.pop()!
    setShapes(next)
    forceUpdate((n) => n + 1)
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && !e.shiftKey && e.key === 'z') { e.preventDefault(); doUndo(); return }
      if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); doRedo(); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        if ((e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'SELECT') {
          e.preventDefault(); removeSelected()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── Shape mutations ───────────────────────────────────────────────────────

  function addShape(kind: SvgShapeKind) {
    pushHistory(shapes)
    const s = normalizeShape(defaultShape(kind))
    setShapes((prev) => [...prev, s])
    setSelectedId(s.id)
  }

  function toggleVisible(id: string) {
    setShapes((prev) => prev.map((s) => s.id === id ? { ...s, visible: !s.visible } : s))
  }
  function toggleLocked(id: string) {
    setShapes((prev) => prev.map((s) => s.id === id ? { ...s, locked: !s.locked } : s))
  }
  function renameShape(id: string, newName: string) {
    setShapes((prev) => prev.map((s) => s.id === id ? { ...s, name: newName } : s))
  }
  function deleteShape(id: string) {
    pushHistory(shapes)
    setShapes((prev) => prev.filter((s) => s.id !== id))
    if (selectedId === id) setSelectedId(null)
  }
  function duplicateShape(id: string) {
    const src = shapes.find((s) => s.id === id)
    if (!src) return
    pushHistory(shapes)
    const dup: SvgShape = { ...src, id: createId(src.kind), x: src.x + 20, y: src.y + 20, name: src.name + ' copy' }
    setShapes((prev) => [...prev, dup])
    setSelectedId(dup.id)
  }

  function updateSelected(patch: Partial<SvgShape>, opts?: { snapPos?: boolean; snapAng?: boolean }) {
    if (!selected) return
    setShapes((prev) => prev.map((s) => {
      if (s.id !== selected.id) return s
      const m = { ...s, ...patch }
      if (opts?.snapPos && snapToGrid) { m.x = snapTo(m.x, GRID_SNAP); m.y = snapTo(m.y, GRID_SNAP) }
      if (opts?.snapAng && snapRotation) { m.rotation = snapTo(m.rotation, ANGLE_SNAP) }
      return normalizeShape(m)
    }))
  }

  function removeSelected() {
    if (!selected) return
    pushHistory(shapes)
    setShapes((prev) => prev.filter((s) => s.id !== selected.id))
    setSelectedId(null)
  }

  function moveSelected(delta: -1 | 1) {
    if (!selected) return
    pushHistory(shapes)
    setShapes((prev) => {
      const idx = prev.findIndex((s) => s.id === selected.id)
      if (idx < 0) return prev
      const ni = idx + delta
      if (ni < 0 || ni >= prev.length) return prev
      const copy = [...prev]
      const [item] = copy.splice(idx, 1)
      copy.splice(ni, 0, item)
      return copy
    })
  }

  function duplicateSelected() {
    if (!selected) return
    pushHistory(shapes)
    const copy = normalizeShape({ ...selected, id: createId(selected.kind), x: selected.x + 48, y: selected.y + 48 })
    setShapes((prev) => [...prev, copy])
    setSelectedId(copy.id)
  }

  function mirrorSelected() {
    if (!selected) return
    pushHistory(shapes)
    updateSelected({ x: ARTBOARD_SIZE - selected.x, rotation: -selected.rotation }, { snapPos: true, snapAng: true })
  }

  function rotateSelected(step: number) {
    if (!selected) return
    updateSelected({ rotation: selected.rotation + step }, { snapAng: true })
  }

  // ── Align ─────────────────────────────────────────────────────────────────

  function alignSelected(action: 'centerH' | 'centerV' | 'left' | 'right' | 'top' | 'bottom') {
    if (!selected) return
    pushHistory(shapes)
    const hw = selected.kind === 'circle' ? selected.radius : selected.width / 2
    const hh = selected.kind === 'circle' ? selected.radius : selected.height / 2
    const patch: Partial<SvgShape> = {}
    if (action === 'centerH') patch.x = ARTBOARD_SIZE / 2
    else if (action === 'centerV') patch.y = ARTBOARD_SIZE / 2
    else if (action === 'left') patch.x = hw
    else if (action === 'right') patch.x = ARTBOARD_SIZE - hw
    else if (action === 'top') patch.y = hh
    else if (action === 'bottom') patch.y = ARTBOARD_SIZE - hh
    updateSelected(patch)
  }

  // ── Pointer helpers ───────────────────────────────────────────────────────

  function getSvgPoint(e: React.PointerEvent): { x: number; y: number } | null {
    const el = svgRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return null
    return { x: ((e.clientX - r.left) / r.width) * ARTBOARD_SIZE, y: ((e.clientY - r.top) / r.height) * ARTBOARD_SIZE }
  }

  function startMove(e: React.PointerEvent, shapeId: string) {
    if (penMode) return
    const pt = getSvgPoint(e); if (!pt) return
    const shape = shapes.find((s) => s.id === shapeId); if (!shape) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pushHistory(shapes)
    setDragState({ pointerId: e.pointerId, shapeId, mode: 'move', startX: pt.x, startY: pt.y, origin: shape })
  }

  function startResize(e: React.PointerEvent, shapeId: string, handle: ResizeHandle) {
    if (penMode) return
    const pt = getSvgPoint(e); if (!pt) return
    const shape = shapes.find((s) => s.id === shapeId); if (!shape) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pushHistory(shapes)
    setDragState({ pointerId: e.pointerId, shapeId, mode: 'resize', handle, startX: pt.x, startY: pt.y, origin: shape })
  }

  function handlePointerMove(e: React.PointerEvent) {
    const pt = getSvgPoint(e); if (!pt) return

    if (drawState && drawState.pointerId === e.pointerId) {
      const pts = [...drawState.points, pt]
      setDrawState({ ...drawState, points: pts })
      const d = ptsToPath(pts)
      setShapes((prev) => prev.map((s) => s.id === drawState.shapeId ? normalizeShape({ ...s, pathData: d }) : s))
      return
    }

    if (!dragState || dragState.pointerId !== e.pointerId) return
    const dx = pt.x - dragState.startX
    const dy = pt.y - dragState.startY
    setShapes((prev) => prev.map((s) => {
      if (s.id !== dragState.shapeId) return s
      const base = dragState.origin
      const next = { ...base }
      if (dragState.mode === 'move') {
        next.x = base.x + dx; next.y = base.y + dy
        if (snapToGrid) { next.x = snapTo(next.x, GRID_SNAP); next.y = snapTo(next.y, GRID_SNAP) }
        return normalizeShape(next)
      }
      const h = dragState.handle
      if (base.kind === 'circle' && h === 'radius') next.radius = base.radius + dx
      else if (base.kind === 'text' && h === 'text-size') next.fontSize = base.fontSize + dy
      else {
        if (h === 'se' || h === 'e') next.width = base.width + dx * 2
        if (h === 'se' || h === 's') next.height = base.height + dy * 2
      }
      return normalizeShape(next)
    }))
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (drawState && drawState.pointerId === e.pointerId) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      setDrawState(null); return
    }
    if (!dragState || dragState.pointerId !== e.pointerId) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDragState(null)
  }

  // ── Pen tool ──────────────────────────────────────────────────────────────

  function ptsToPath(pts: Array<{ x: number; y: number }>): string {
    if (pts.length < 2) return ''
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x - ARTBOARD_SIZE / 2},${p.y - ARTBOARD_SIZE / 2}`).join(' ')
  }

  const handleArtboardDown = useCallback((e: React.PointerEvent) => {
    if (!penMode) { setSelectedId(null); return }
    if (e.button !== 0) return
    const pt = getSvgPoint(e); if (!pt) return
    pushHistory(shapes)
    const s = normalizeShape({ ...defaultShape('path'), pathData: '' })
    setShapes((prev) => [...prev, s])
    setSelectedId(s.id)
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrawState({ pointerId: e.pointerId, shapeId: s.id, points: [pt] })
  }, [penMode, shapes])

  // ── SVG import ────────────────────────────────────────────────────────────

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    try {
      const text = await file.text()
      const parsed = parseSvgImport(text)
      if (!parsed.length) {
        setImportError('No supported shapes found (rect/circle/polygon/text).')
      } else {
        pushHistory(shapes)
        setImportError(null)
        setShapes((prev) => [...prev, ...parsed])
        setSelectedId(parsed[parsed.length - 1]?.id ?? null)
        if (!name.trim()) setName(file.name.replace(/\.svg$/i, ''))
      }
    } catch { setImportError('Could not parse SVG file.') }
    finally { e.target.value = '' }
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  function handleSave() {
    if (!shapes.length) return
    const body = shapes.map(shapeToSvgString).filter(Boolean).join('')
    const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ARTBOARD_SIZE} ${ARTBOARD_SIZE}">${body}</svg>`
    const imageUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`
    onSave({ name: name.trim() || 'Custom Logo', imageUrl, svgMarkup })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="svg-maker-page">
      <header className="svg-maker-header">
          <div>
            <strong>SVG Maker</strong>
            <p>Ctrl+Z / Ctrl+Y · Delete key removes selected</p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button type="button" className="svg-maker-btn" onClick={doUndo} title="Undo" disabled={!historyPast.current.length} style={{ padding: '4px 10px' }}>↩ Undo</button>
            <button type="button" className="svg-maker-btn" onClick={doRedo} title="Redo" disabled={!historyFuture.current.length} style={{ padding: '4px 10px' }}>↪ Redo</button>
            <button type="button" className="svg-maker-close" onClick={onClose}><X size={16} /></button>
          </div>
        </header>

        <div className="svg-maker-main">
          {/* Left panel */}
          <aside className="svg-maker-tools">
            <label className="svg-maker-label">Preset Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="svg-maker-input" />

            <label className="svg-maker-label">Add Shape</label>
            <div className="svg-maker-btn-grid">
              <button type="button" onClick={() => addShape('rect')}>Rect</button>
              <button type="button" onClick={() => addShape('circle')}>Circle</button>
              <button type="button" onClick={() => addShape('triangle')}>Triangle</button>
              <button type="button" onClick={() => addShape('text')}>Text</button>
              <button type="button" onClick={() => addShape('star')}>Star</button>
              <button type="button" onClick={() => addShape('arrow')}>Arrow</button>
            </div>

            <div className="svg-maker-toggle-row">
              <label>
                <input type="checkbox" checked={penMode} onChange={(e) => { setPenMode(e.target.checked); if (e.target.checked) setSelectedId(null) }} />
                Pen / Freehand
              </label>
            </div>

            <button type="button" className="svg-maker-btn" onClick={() => fileInputRef.current?.click()}>Import SVG</button>
            <input ref={fileInputRef} type="file" accept=".svg,image/svg+xml" onChange={handleImportFile} style={{ display: 'none' }} />
            {importError && <p className="svg-maker-error">{importError}</p>}

            <div className="svg-maker-toggle-row">
              <label><input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} /> Snap Grid</label>
              <label><input type="checkbox" checked={snapRotation} onChange={(e) => setSnapRotation(e.target.checked)} /> Snap Angle</label>
            </div>

            <label className="svg-maker-label">Order / Edit</label>
            <div className="svg-maker-btn-grid two">
              <button type="button" onClick={() => moveSelected(-1)} disabled={!selected}>Back</button>
              <button type="button" onClick={() => moveSelected(1)} disabled={!selected}>Front</button>
              <button type="button" className="danger" onClick={removeSelected} disabled={!selected}>Delete</button>
            </div>
            <div className="svg-maker-btn-grid">
              <button type="button" onClick={duplicateSelected} disabled={!selected}>Duplicate</button>
              <button type="button" onClick={mirrorSelected} disabled={!selected}>Mirror X</button>
            </div>
            <div className="svg-maker-btn-grid">
              <button type="button" onClick={() => rotateSelected(-ANGLE_SNAP)} disabled={!selected}>-15°</button>
              <button type="button" onClick={() => rotateSelected(ANGLE_SNAP)} disabled={!selected}>+15°</button>
            </div>

            <label className="svg-maker-label">Align</label>
            <div className="svg-maker-btn-grid">
              <button type="button" onClick={() => alignSelected('centerH')} disabled={!selected} title="Center H">⟵·⟶</button>
              <button type="button" onClick={() => alignSelected('centerV')} disabled={!selected} title="Center V">↑·↓</button>
              <button type="button" onClick={() => alignSelected('left')} disabled={!selected} title="Left edge">⇤L</button>
              <button type="button" onClick={() => alignSelected('right')} disabled={!selected} title="Right edge">R⇥</button>
              <button type="button" onClick={() => alignSelected('top')} disabled={!selected} title="Top edge">⇡T</button>
              <button type="button" onClick={() => alignSelected('bottom')} disabled={!selected} title="Bottom edge">B⇣</button>
            </div>

            <div className="svg-layer-header">
              <span className="svg-layer-title">Layers ({shapes.length})</span>
              <div className="svg-layer-actions">
                <button
                  type="button"
                  className="svg-layer-action-btn"
                  disabled={!selectedId}
                  onClick={() => selectedId && duplicateShape(selectedId)}
                  title="Duplicate"
                >
                  ⧉ Dupe
                </button>
                <button
                  type="button"
                  className="svg-layer-action-btn danger"
                  disabled={!selectedId}
                  onClick={() => selectedId && deleteShape(selectedId)}
                  title="Delete"
                >
                  ✕ Del
                </button>
              </div>
            </div>
            <div className="svg-layer-list">
              {shapes.length === 0 && <p className="svg-maker-error" style={{ margin: 0, padding: '8px' }}>No shapes yet</p>}
              {[...shapes].reverse().map((s, ri) => {
                const realIdx = shapes.length - 1 - ri
                return (
                  <SvgLayerRow
                    key={s.id}
                    shape={s}
                    selected={s.id === selectedId}
                    dragOver={layerDragOver === realIdx}
                    onSelect={() => setSelectedId(s.id)}
                    onToggleVisible={() => toggleVisible(s.id)}
                    onToggleLocked={() => toggleLocked(s.id)}
                    onDelete={() => deleteShape(s.id)}
                    onRename={(newName) => renameShape(s.id, newName)}
                    onDragStart={() => setLayerDragFrom(realIdx)}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setLayerDragOver(realIdx)
                    }}
                    onDrop={() => {
                      if (layerDragFrom !== null && layerDragFrom !== realIdx) {
                        pushHistory(shapes)
                        const next = [...shapes]
                        const [moved] = next.splice(layerDragFrom, 1)
                        next.splice(realIdx, 0, moved)
                        setShapes(next)
                      }
                      setLayerDragFrom(null)
                      setLayerDragOver(null)
                    }}
                    onDragEnd={() => {
                      setLayerDragFrom(null)
                      setLayerDragOver(null)
                    }}
                  />
                )
              })}
            </div>
          </aside>

          {/* Artboard */}
          <div className="svg-maker-artboard-wrap" ref={artboardWrapRef} style={{ position: 'relative' }}>
            <div className="svg-maker-grid-bg" />
            <svg
              ref={svgRef}
              className="svg-maker-artboard"
              viewBox={`0 0 ${ARTBOARD_SIZE} ${ARTBOARD_SIZE}`}
              style={{ cursor: penMode ? 'crosshair' : 'default' }}
              onPointerDown={handleArtboardDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              {shapes.map((s) => (
                <ShapeEl
                  key={s.id}
                  shape={s}
                  active={s.id === selectedId}
                  onSelect={() => setSelectedId(s.id)}
                  onStartMove={startMove}
                  onStartResize={startResize}
                  onInlineEdit={(id) => {
                    setSelectedId(id)
                    setEditingTextId(id)
                  }}
                />
              ))}
            </svg>
            {/* Inline text editor overlay */}
            {editingTextId && (() => {
              const s = shapes.find((sh) => sh.id === editingTextId)
              if (!s || s.kind !== 'text') return null
              const svgEl = svgRef.current
              const wrapEl = artboardWrapRef.current
              if (!svgEl || !wrapEl) return null
              const svgRect = svgEl.getBoundingClientRect()
              const wrapRect = wrapEl.getBoundingClientRect()
              const scale = svgRect.width / ARTBOARD_SIZE
              const cx = (s.x * scale) + (svgRect.left - wrapRect.left)
              const cy = (s.y * scale) + (svgRect.top - wrapRect.top)
              const fs = Math.max(12, s.fontSize * scale)
              const w = Math.max(120, s.fontSize * (s.text.length + 2) * 0.62 * scale)
              const fontFamily = s.fontFamily && s.fontFamily !== 'sans-serif' ? s.fontFamily : 'sans-serif'
              return (
                <textarea
                  className="svg-maker-inline-edit"
                  autoFocus
                  value={s.text}
                  rows={Math.max(1, s.text.split('\n').length)}
                  onChange={(e) => updateSelected({ text: e.target.value })}
                  onBlur={() => setEditingTextId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditingTextId(null)
                    // allow Enter for newlines; Shift+Enter could close
                    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) { e.stopPropagation() }
                  }}
                  style={{
                    left: cx,
                    top: cy,
                    width: w,
                    fontSize: fs,
                    fontFamily,
                    fontWeight: s.fontWeight ?? 'normal',
                    fontStyle: s.fontStyle ?? 'normal',
                    textAlign: s.textAlign ?? 'center',
                    color: s.fill,
                    transform: `translate(-50%, -50%) rotate(${s.rotation}deg)`,
                  }}
                />
              )
            })()}
          </div>

          {/* Right: properties */}
          <aside className="svg-maker-props">
            <label className="svg-maker-label">Selected</label>
            <input className="svg-maker-input" value={selected ? selected.kind : 'None'} disabled />

            <div className="svg-maker-prop-row">
              <label>X</label>
              <input type="number" className="svg-maker-input" value={selected?.x ?? 0} disabled={!selected} onChange={(e) => updateSelected({ x: +e.target.value })} />
            </div>
            <div className="svg-maker-prop-row">
              <label>Y</label>
              <input type="number" className="svg-maker-input" value={selected?.y ?? 0} disabled={!selected} onChange={(e) => updateSelected({ y: +e.target.value })} />
            </div>
            <div className="svg-maker-prop-row">
              <label>Rotate</label>
              <input type="number" className="svg-maker-input" value={selected?.rotation ?? 0} disabled={!selected} onChange={(e) => updateSelected({ rotation: +e.target.value }, { snapAng: true })} />
            </div>
            <div className="svg-maker-prop-row">
              <label>W</label>
              <input type="number" className="svg-maker-input" value={selected?.width ?? 0} disabled={!selected || selected.kind === 'circle'} onChange={(e) => updateSelected({ width: +e.target.value })} />
            </div>
            <div className="svg-maker-prop-row">
              <label>H</label>
              <input type="number" className="svg-maker-input" value={selected?.height ?? 0} disabled={!selected || selected.kind === 'circle'} onChange={(e) => updateSelected({ height: +e.target.value })} />
            </div>
            <div className="svg-maker-prop-row">
              <label>Radius</label>
              <input type="number" className="svg-maker-input" value={selected?.radius ?? 0} disabled={!selected || selected.kind !== 'circle'} onChange={(e) => updateSelected({ radius: +e.target.value })} />
            </div>

            {selected?.kind === 'star' && (
              <div className="svg-maker-prop-row">
                <label>Points</label>
                <input type="number" className="svg-maker-input" min={3} max={20} value={selected.starPoints} onChange={(e) => updateSelected({ starPoints: +e.target.value })} />
              </div>
            )}

            {selected?.kind === 'text' && (
              <>
                <label className="svg-maker-label">Text</label>
                <textarea
                  className="svg-maker-input svg-maker-text-area"
                  value={selected.text}
                  rows={Math.max(2, selected.text.split('\n').length + 1)}
                  onChange={(e) => updateSelected({ text: e.target.value })}
                  placeholder="Type here…"
                />
                <div className="svg-maker-prop-row">
                  <label>Size</label>
                  <input type="number" className="svg-maker-input" value={selected.fontSize} onChange={(e) => updateSelected({ fontSize: +e.target.value })} />
                </div>
                <label className="svg-maker-label">Style</label>
                <div className="svg-maker-text-style-row">
                  <button
                    type="button"
                    className={`svg-maker-style-btn${selected.fontWeight === 'bold' ? ' active' : ''}`}
                    onClick={() => updateSelected({ fontWeight: selected.fontWeight === 'bold' ? 'normal' : 'bold' })}
                    title="Bold"
                  ><strong>B</strong></button>
                  <button
                    type="button"
                    className={`svg-maker-style-btn${selected.fontStyle === 'italic' ? ' active' : ''}`}
                    onClick={() => updateSelected({ fontStyle: selected.fontStyle === 'italic' ? 'normal' : 'italic' })}
                    title="Italic"
                  ><em>I</em></button>
                  <button
                    type="button"
                    className={`svg-maker-style-btn${(selected.textAlign ?? 'center') === 'left' ? ' active' : ''}`}
                    onClick={() => updateSelected({ textAlign: 'left' })}
                    title="Align left"
                  >≡</button>
                  <button
                    type="button"
                    className={`svg-maker-style-btn${(selected.textAlign ?? 'center') === 'center' ? ' active' : ''}`}
                    onClick={() => updateSelected({ textAlign: 'center' })}
                    title="Align center"
                  >≡</button>
                  <button
                    type="button"
                    className={`svg-maker-style-btn${(selected.textAlign ?? 'center') === 'right' ? ' active' : ''}`}
                    onClick={() => updateSelected({ textAlign: 'right' })}
                    title="Align right"
                  >≡</button>
                </div>
                <p className="svg-maker-hint">Double-click text on canvas to edit inline. Enter = new line.</p>
                <label className="svg-maker-label">Font</label>
                <select className="svg-maker-input" value={selected.fontUrl || ''} onChange={(e) => {
                  const item = fonts.find((f) => f.url === e.target.value)
                  if (item) updateSelected({ fontFamily: item.family, fontUrl: item.url })
                  else updateSelected({ fontFamily: 'sans-serif', fontUrl: '' })
                }}>
                  <option value="">Default (sans-serif)</option>
                  {fonts.map((f) => <option key={f.url} value={f.url}>{f.name}</option>)}
                </select>
              </>
            )}

            <div className="svg-maker-prop-row">
              <label>Fill</label>
              <WrapColorPicker
                value={selected?.fill ?? '#ffffff'}
                disabled={!selected}
                onChange={(hex) => updateSelected({ fill: hex })}
                label="Fill color"
              />
            </div>
            <div className="svg-maker-prop-row">
              <label>Stroke</label>
              <WrapColorPicker
                value={selected?.stroke ?? '#1a1a1a'}
                disabled={!selected}
                onChange={(hex) => updateSelected({ stroke: hex })}
                label="Stroke color"
              />
            </div>
            <div className="svg-maker-prop-row">
              <label>Stroke W</label>
              <input type="number" className="svg-maker-input" value={selected?.strokeWidth ?? 0} disabled={!selected} onChange={(e) => updateSelected({ strokeWidth: +e.target.value })} />
            </div>
          </aside>
        </div>

        <footer className="svg-maker-footer">
          <button type="button" className="svg-maker-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="svg-maker-btn primary" onClick={handleSave} disabled={!shapes.length}>Save Preset + Add Decal</button>
        </footer>
    </div>
  )
}
