import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { } from 'lucide-react'
import paper from 'paper'
import ClipperLibPkg from 'clipper-lib'
import * as opentype from 'opentype.js'
import { PaperOffset } from 'paperjs-offset'
import { WrapColorPicker } from './WrapColorPicker'
import { cleanFontDisplayName } from '../../lib/fontNames'

// ─── Shape types ─────────────────────────────────────────────────────────────

type SvgShapeKind =
  | 'rect' | 'roundedrect' | 'circle' | 'ellipse'
  | 'triangle' | 'diamond' | 'polygon' | 'star'
  | 'cross' | 'chevron' | 'heart' | 'ring'
  | 'arrow' | 'line' | 'path' | 'text' | 'image'

type Gradient = {
  type: 'linear' | 'radial'
  angle?: number
  stops: Array<{ color: string; position: number }>
}

type SvgShape = {
  id: string
  kind: SvgShapeKind
  name: string
  x: number
  y: number
  width: number
  height: number
  radius: number
  cornerRadius: number
  rotation: number
  opacity: number
  fill: string
  stroke: string
  strokeWidth: number
  strokeDasharray: string
  strokeDashoffset: number
  text: string
  fontSize: number
  fontFamily: string
  fontUrl: string
  fontWeight: 'normal' | 'bold'
  fontStyle: 'normal' | 'italic'
  textAlign: 'left' | 'center' | 'right'
  textCurve: number
  imageHref: string
  starPoints: number
  innerRatio: number
  pathData: string
  hiddenContours: number[]
  strokeLinejoin: 'round' | 'miter'
  isOffsetLayer: boolean
  offsetSourceId: string | null
  offsetDistance: number
  offsetSourceSignature: string | null
  attachedGroupId: string | null
  combineGroupId: string | null
  groupId: string | null
  fillGradient: Gradient | null
  strokeGradient: Gradient | null
  visible: boolean
  locked: boolean
}

type SavePayload = { name: string; imageUrl: string; svgMarkup: string }
type SvgMakerPageProps = {
  onClose: () => void
  onSave: (p: SavePayload) => void
  saveRef?: React.MutableRefObject<(() => void) | null>
  undoRef?: React.MutableRefObject<(() => void) | null>
  redoRef?: React.MutableRefObject<(() => void) | null>
  exportRef?: React.MutableRefObject<(() => void) | null>
}

type PrintExportSettings = {
  colorSpace: 'RGB' | 'CMYK'
  dpi: 72 | 150 | 300 | 600
  includeBleed: boolean
  bleedSize: number
  format: 'SVG' | 'PDF' | 'PNG'
  quality: 'standard' | 'high' | 'maximum'
}
type FontManifestItem = { name: string; family: string; fileName: string; url: string }

// ─── Constants ───────────────────────────────────────────────────────────────

const AB = 1024
const GRID_SNAP = 28
const ANGLE_SNAP = 15
const MIN_SIZE = 24
const HISTORY_LIMIT = 80
const BK = 0.5523
const CAR_SCALE_LENGTH_CM = 450
const CAR_SCALE_HEIGHT_CM = 180
const SELECTION_LINE_COLOR = '#8a939b'
const TEXT_OFFSET_STABLE_FILL = '#5a5e64'
const OFFSET_DISTANCE_MIN = -100
const OFFSET_DISTANCE_MAX = 100
// Slider uses a normalized position -100..100; actual distance is derived non-linearly
// so small moves near zero give fine control and large moves push to ±1.0 in (100 px)
const OFFSET_SLIDER_CURVE = 1.8  // exponent; >1 = more precision near zero
const OFFSET_DISTANCE_INPUT_STEP = 0.01  // inches step for the number input
const DEFAULT_OFFSET_FONT_FAMILY = 'MyGarage AVENGEANCE MIGHTIEST AVENGER'
const DEFAULT_OFFSET_FONT_URL = '/fonts/AVENGEANCE%20MIGHTIEST%20AVENGER.otf'

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'radius'

type DragState = {
  pointerId: number
  shapeId: string
  mode: 'move' | 'resize'
  handle?: ResizeHandle
  startX: number
  startY: number
  origins: Record<string, SvgShape>
}

type DrawState = {
  pointerId: number
  shapeId: string
  points: { x: number; y: number }[]
}

type PathAnchorDragState = {
  pointerId: number
  shapeId: string
  pointIndex: number
  handle?: 'in' | 'out'
}

type MarqueeState = {
  pointerId: number
  startX: number
  startY: number
  currentX: number
  currentY: number
  additive: boolean
  baseSelection: string[]
}

type PathAnchorPoint = {
  index: number
  x: number
  y: number
  inX: number
  inY: number
  outX: number
  outY: number
  hasIn: boolean
  hasOut: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createId(p: string) {
  return `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }
function selectionRect(startX: number, startY: number, endX: number, endY: number) {
  const x = Math.min(startX, endX)
  const y = Math.min(startY, endY)
  const width = Math.abs(endX - startX)
  const height = Math.abs(endY - startY)
  return { x, y, width, height }
}
function shapeSelectionBounds(shape: SvgShape) {
  const halfW = shape.kind === 'circle' || shape.kind === 'ring' ? shape.radius : shape.width / 2
  const halfH = shape.kind === 'circle' || shape.kind === 'ring' ? shape.radius : shape.height / 2
  return {
    x: shape.x - halfW,
    y: shape.y - halfH,
    width: halfW * 2,
    height: halfH * 2,
  }
}
function rectsOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
}
function normalizeOffsetDistance(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(clamp(value, OFFSET_DISTANCE_MIN, OFFSET_DISTANCE_MAX) * 100) / 100
}
// Map slider position (-100..100) → actual canvas-px distance, non-linearly
function sliderPosToDistance(pos: number): number {
  const t = clamp(pos, -100, 100) / 100 // -1..1
  const sign = t < 0 ? -1 : 1
  return sign * Math.pow(Math.abs(t), OFFSET_SLIDER_CURVE) * 100
}
// Map canvas-px distance → slider position (-100..100)
function distanceToSliderPos(dist: number): number {
  const t = clamp(dist, OFFSET_DISTANCE_MIN, OFFSET_DISTANCE_MAX) / 100 // -1..1
  const sign = t < 0 ? -1 : 1
  return sign * Math.pow(Math.abs(t), 1 / OFFSET_SLIDER_CURVE) * 100
}
function snapTo(v: number, sz: number) { return Math.round(v / sz) * sz }
function curvedTextPathData(width: number, curve: number) {
  const safeWidth = Math.max(40, width)
  const amt = clamp(curve, -100, 100)
  const bend = (Math.abs(amt) / 100) * Math.max(24, safeWidth * 0.5)
  const qy = amt >= 0 ? -bend : bend
  return `M ${-safeWidth / 2} 0 Q 0 ${qy} ${safeWidth / 2} 0`
}
function textCurveStartOffset(align: 'left' | 'center' | 'right') {
  if (align === 'left') return '0%'
  if (align === 'right') return '100%'
  return '50%'
}

let _textMeasureCanvas: HTMLCanvasElement | null = null
function getTextMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null
  if (!_textMeasureCanvas) {
    _textMeasureCanvas = document.createElement('canvas')
    _textMeasureCanvas.width = 16
    _textMeasureCanvas.height = 16
  }
  return _textMeasureCanvas.getContext('2d')
}

function getTextIntrinsicHalfSize(shape: SvgShape): { hw: number; hh: number } {
  const lines = (shape.text || '').split('\n')
  const lh = shape.fontSize * 1.25
  const ctx = getTextMeasureContext()
  if (ctx) {
    const family = shape.fontFamily || DEFAULT_OFFSET_FONT_FAMILY
    const weight = shape.fontWeight === 'bold' ? '700' : '400'
    const style = shape.fontStyle === 'italic' ? 'italic' : 'normal'
    ctx.font = `${style} ${weight} ${shape.fontSize}px "${family}", sans-serif`

    let maxWidth = 0
    let maxAscent = shape.fontSize * 0.8
    let maxDescent = shape.fontSize * 0.25
    for (const line of lines.length ? lines : ['']) {
      const metrics = ctx.measureText(line || ' ')
      maxWidth = Math.max(maxWidth, metrics.width || 0)
      maxAscent = Math.max(
        maxAscent,
        metrics.actualBoundingBoxAscent || metrics.fontBoundingBoxAscent || shape.fontSize * 0.8,
      )
      maxDescent = Math.max(
        maxDescent,
        metrics.actualBoundingBoxDescent || metrics.fontBoundingBoxDescent || shape.fontSize * 0.25,
      )
    }
    const textBlockHeight = maxAscent + maxDescent + Math.max(0, lines.length - 1) * lh
    const hw = Math.max(maxWidth * 0.58, 36)
    const hh = Math.max(textBlockHeight * 0.58, 28)
    return { hw, hh }
  }

  const maxChars = Math.max(1, ...lines.map(line => line.length))
  const hw = Math.max(shape.fontSize * maxChars * 0.55, 60)
  const totalH = (Math.max(1, lines.length) - 1) * lh
  const hh = Math.max(shape.fontSize * 0.7, totalH / 2 + shape.fontSize * 0.7)
  return { hw, hh }
}
function getTextScale(shape: SvgShape): { sx: number; sy: number; hw: number; hh: number } {
  const { hw, hh } = getTextIntrinsicHalfSize(shape)
  const sx = Math.max(0.08, shape.width / Math.max(1, hw * 2))
  const sy = Math.max(0.08, shape.height / Math.max(1, hh * 2))
  return { sx, sy, hw, hh }
}

function fitTextShapeToIntrinsic(shape: SvgShape, scale = 1.14): SvgShape {
  const { hw, hh } = getTextIntrinsicHalfSize(shape)
  return {
    ...shape,
    width: Math.max(MIN_SIZE, hw * 2 * scale),
    height: Math.max(MIN_SIZE, hh * 2 * scale),
  }
}

function pn(s: string | null | undefined, fb = 0) {
  const v = parseFloat(s ?? '')
  return isFinite(v) ? v : fb
}
// Prefer bundled clipper-lib so offset works without CDN/network.
function getClipperLib(): any {
  const globalClipper = (window as any).ClipperLib
  return globalClipper ?? ClipperLibPkg
}
function resolveAbsoluteUrl(url: string): string {
  try {
    return new URL(url, window.location.href).href
  } catch {
    return url
  }
}
function safeFileStem(value: string, fallback = 'custom-logo') {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || fallback
}
function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
function fontMimeFromUrl(url: string): string {
  const clean = url.split('?')[0].split('#')[0].toLowerCase()
  if (clean.endsWith('.woff2')) return 'font/woff2'
  if (clean.endsWith('.woff')) return 'font/woff'
  if (clean.endsWith('.otf')) return 'font/otf'
  if (clean.endsWith('.ttf')) return 'font/ttf'
  return 'application/octet-stream'
}
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk)
    binary += String.fromCharCode(...slice)
  }
  return btoa(binary)
}
async function fontUrlToDataUri(fontUrl: string): Promise<string | null> {
  try {
    const abs = resolveAbsoluteUrl(fontUrl)
    const res = await fetch(abs)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const mime = fontMimeFromUrl(abs)
    return `data:${mime};base64,${arrayBufferToBase64(buf)}`
  } catch {
    return null
  }
}
function ensureFontFaceInjected(fontFamily: string, fontUrl: string) {
  if (!fontFamily || !fontUrl || typeof document === 'undefined') return
  const absUrl = resolveAbsoluteUrl(fontUrl)
  const styleId = `svgmaker-ff-${`${fontFamily}|${absUrl}`.replace(/\W/g, '')}`
  if (document.getElementById(styleId)) return
  const el = document.createElement('style')
  el.id = styleId
  el.textContent = `@font-face { font-family: "${fontFamily}"; src: url("${absUrl}"); font-display: block; }`
  document.head.appendChild(el)
}
function prot(t: string | null): number {
  const m = /rotate\(([-\d.]+)/i.exec(t ?? '')
  const v = parseFloat(m?.[1] ?? '')
  return isFinite(v) ? v : 0
}

// ─── Geometry builders ────────────────────────────────────────────────────────

function polyPts(r: number, n: number): string {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i / n) - Math.PI / 2
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`
  }).join(' ')
}

function starPts(outer: number, inner: number, n: number): string {
  return Array.from({ length: n * 2 }, (_, i) => {
    const a = (Math.PI / n) * i - Math.PI / 2
    const r = i % 2 === 0 ? outer : inner
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`
  }).join(' ')
}

function arrowPts(w: number, h: number): string {
  const hw = w / 2, hh = h / 2, sh = hh * 0.38, hd = hw * 0.42
  return `${-hw},${-sh} ${hw - hd},${-sh} ${hw - hd},${-hh} ${hw},0 ${hw - hd},${hh} ${hw - hd},${sh} ${-hw},${sh}`
}

function chevronPts(w: number, h: number): string {
  const hw = w / 2, hh = h / 2, n = hw * 0.35
  return `${-hw},${-hh} ${hw - n},${-hh} ${hw},0 ${hw - n},${hh} ${-hw},${hh} ${-hw + n},0`
}

function crossPts(w: number, h: number, t = 0.33): string {
  const hw = w / 2, hh = h / 2, tx = hw * t, ty = hh * t
  return `${-tx},${-hh} ${tx},${-hh} ${tx},${-ty} ${hw},${-ty} ${hw},${ty} ${tx},${ty} ${tx},${hh} ${-tx},${hh} ${-tx},${ty} ${-hw},${ty} ${-hw},${-ty} ${-tx},${-ty}`
}

function diamondPts(w: number, h: number): string {
  return `0,${-h / 2} ${w / 2},0 0,${h / 2} ${-w / 2},0`
}

function heartPath(w: number, h: number): string {
  const sx = w / 100, sy = h / 115
  const s = (x: number, y: number) => `${(x * sx).toFixed(1)},${(y * sy).toFixed(1)}`
  return `M${s(0, -35)}C${s(0, -62)} ${s(-52, -67)} ${s(-50, -25)}C${s(-50, 15)} ${s(0, 57)} ${s(0, 60)}C${s(0, 57)} ${s(50, 15)} ${s(50, -25)}C${s(52, -67)} ${s(0, -62)} ${s(0, -35)}Z`
}

function ringPath(r: number, ir: number): string {
  const ri = r * clamp(ir, 0.2, 0.9)
  return `M${r},0A${r},${r} 0 1 0 ${-r},0A${r},${r} 0 1 0 ${r},0Z M${ri},0A${ri},${ri} 0 1 1 ${-ri},0A${ri},${ri} 0 1 1 ${ri},0Z`
}

function rrPath(w: number, h: number, cr: number): string {
  const hw = w / 2, hh = h / 2, r = Math.min(cr, hw, hh)
  return `M${-hw + r},${-hh}H${hw - r}Q${hw},${-hh} ${hw},${-hh + r}V${hh - r}Q${hw},${hh} ${hw - r},${hh}H${-hw + r}Q${-hw},${hh} ${-hw},${hh - r}V${-hh + r}Q${-hw},${-hh} ${-hw + r},${-hh}Z`
}

function circBez(r: number): string {
  const k = r * BK
  return `M${r},0C${r},${k} ${k},${r} 0,${r}C${-k},${r} ${-r},${k} ${-r},0C${-r},${-k} ${-k},${-r} 0,${-r}C${k},${-r} ${r},${-k} ${r},0Z`
}

function ellBez(rx: number, ry: number): string {
  const kx = rx * BK, ky = ry * BK
  return `M${rx},0C${rx},${ky} ${kx},${ry} 0,${ry}C${-kx},${ry} ${-rx},${ky} ${-rx},0C${-rx},${-ky} ${-kx},${-ry} 0,${-ry}C${kx},${-ry} ${rx},${-ky} ${rx},0Z`
}

function ptsToPath(pts: string): string {
  const c = pts.trim().split(/\s+/)
  if (!c.length) return ''
  return `M${c[0]} ${c.slice(1).map(p => `L${p}`).join(' ')}Z`
}

function splitPathSubpaths(pathData: string): string[] {
  const src = (pathData || '').trim()
  if (!src) return []
  const chunks = src.match(/[Mm][^Mm]*/g)
  if (!chunks || !chunks.length) return [src]
  return chunks.map(s => s.trim()).filter(Boolean)
}

function visiblePathData(pathData: string, hiddenContours: number[]): string {
  const chunks = splitPathSubpaths(pathData)
  if (!chunks.length) return ''
  if (!hiddenContours.length) return chunks.join(' ')
  const hidden = new Set(hiddenContours)
  const kept = chunks.filter((_, i) => !hidden.has(i))
  return (kept.length ? kept : [chunks[0]]).join(' ')
}

function offsetSourceSignature(shape: SvgShape): string {
  return JSON.stringify([
    shape.kind,
    shape.width,
    shape.height,
    shape.radius,
    shape.cornerRadius,
    shape.starPoints,
    shape.innerRatio,
    shape.strokeWidth,
    shape.text,
    shape.fontSize,
    shape.fontFamily,
    shape.fontWeight,
    shape.fontStyle,
    shape.textAlign,
    visiblePathData(shape.pathData, shape.hiddenContours),
  ])
}

function shapeToLocalPath(s: SvgShape): string {
  switch (s.kind) {
    case 'rect': { const hw = s.width / 2, hh = s.height / 2; return `M${-hw},${-hh}H${hw}V${hh}H${-hw}Z` }
    case 'roundedrect': return rrPath(s.width, s.height, s.cornerRadius)
    case 'circle': return circBez(s.radius)
    case 'ellipse': return ellBez(s.width / 2, s.height / 2)
    case 'triangle': return `M0,${-s.height / 2}L${s.width / 2},${s.height / 2}L${-s.width / 2},${s.height / 2}Z`
    case 'diamond': return ptsToPath(diamondPts(s.width, s.height))
    case 'polygon': return ptsToPath(polyPts(Math.min(s.width, s.height) / 2, s.starPoints))
    case 'star': { const o = Math.min(s.width, s.height) / 2; return ptsToPath(starPts(o, o * s.innerRatio, s.starPoints)) }
    case 'cross': return ptsToPath(crossPts(s.width, s.height))
    case 'chevron': return ptsToPath(chevronPts(s.width, s.height))
    case 'heart': return heartPath(s.width, s.height)
    case 'ring': return ringPath(s.radius, s.innerRatio)
    case 'arrow': return ptsToPath(arrowPts(s.width, s.height))
    case 'line': return `M${-s.width / 2},0L${s.width / 2},0`
    case 'path': return visiblePathData(s.pathData, s.hiddenContours)
    default: return ''
  }
}

function transformPathData(d: string, dx: number, dy: number, deg: number): string {
  if (!d) return ''
  const rad = deg * Math.PI / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const tp = (x: number, y: number) => `${(x * cos - y * sin + dx).toFixed(2)},${(y * cos + x * sin + dy).toFixed(2)}`
  const out: string[] = []
  let curX = 0
  let curY = 0
  const re = /([MLCSQTZAHVmlcsqtahvz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g
  let cmd = 'M'
  let nums: number[] = []
  const flush = () => {
    const C = cmd.toUpperCase()
    if (C === 'Z') { out.push('Z'); nums = []; return }
    if (C === 'M') {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const x = nums[i], y = nums[i + 1]
        out.push(`${i === 0 ? 'M' : 'L'}${tp(x, y)}`)
        curX = x; curY = y
      }
    }
    else if (C === 'L') {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const x = nums[i], y = nums[i + 1]
        out.push(`L${tp(x, y)}`)
        curX = x; curY = y
      }
    }
    else if (C === 'H') {
      for (let i = 0; i < nums.length; i++) {
        const x = nums[i]
        out.push(`L${tp(x, curY)}`)
        curX = x
      }
    }
    else if (C === 'V') {
      for (let i = 0; i < nums.length; i++) {
        const y = nums[i]
        out.push(`L${tp(curX, y)}`)
        curY = y
      }
    }
    else if (C === 'C') {
      for (let i = 0; i + 5 < nums.length; i += 6) {
        out.push(`C${tp(nums[i], nums[i + 1])} ${tp(nums[i + 2], nums[i + 3])} ${tp(nums[i + 4], nums[i + 5])}`)
        curX = nums[i + 4]; curY = nums[i + 5]
      }
    }
    else if (C === 'Q') {
      for (let i = 0; i + 3 < nums.length; i += 4) {
        out.push(`Q${tp(nums[i], nums[i + 1])} ${tp(nums[i + 2], nums[i + 3])}`)
        curX = nums[i + 2]; curY = nums[i + 3]
      }
    }
    else if (C === 'A') {
      for (let i = 0; i + 6 < nums.length; i += 7) {
        out.push(`A${nums[i]},${nums[i + 1]} ${nums[i + 2]} ${nums[i + 3]},${nums[i + 4]} ${tp(nums[i + 5], nums[i + 6])}`)
        curX = nums[i + 5]; curY = nums[i + 6]
      }
    }
    nums = []
  }
  let tok: RegExpExecArray | null
  while ((tok = re.exec(d)) !== null) {
    if (tok[1]) { flush(); cmd = tok[1] } else if (tok[2]) nums.push(parseFloat(tok[2]))
  }
  flush()
  return out.join(' ')
}

function scaleLocalPathData(pathData: string, sx: number, sy: number): string {
  const d = (pathData || '').trim()
  if (!d) return d
  try {
    const scope = getPaperScope()
    const shape = new scope.CompoundPath({ pathData: d, insert: false })
    shape.scale(sx, sy, new scope.Point(0, 0))
    const out = shape.exportSVG({ asString: true }) as string
    shape.remove()
    const m = out.match(/\sd=\"([^\"]+)\"/)
    return m?.[1] ?? d
  } catch {
    return d
  }
}

function pathAnchorPoints(shape: SvgShape): PathAnchorPoint[] {
  if (shape.kind !== 'path' || !shape.pathData.trim()) return []
  try {
    const scope = getPaperScope()
    const cp = new scope.CompoundPath({ pathData: shape.pathData, insert: false })
    const rad = shape.rotation * Math.PI / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const toWorld = (p: paper.Point) => ({
      x: shape.x + (p.x * cos - p.y * sin),
      y: shape.y + (p.y * cos + p.x * sin),
    })
    const anchors: PathAnchorPoint[] = []
    let idx = 0
    const pushSeg = (seg: paper.Segment) => {
      const w = toWorld(seg.point)
      const inLocal = seg.point.add(seg.handleIn)
      const outLocal = seg.point.add(seg.handleOut)
      const inWorld = toWorld(inLocal)
      const outWorld = toWorld(outLocal)
      anchors.push({
        index: idx,
        x: w.x,
        y: w.y,
        inX: inWorld.x,
        inY: inWorld.y,
        outX: outWorld.x,
        outY: outWorld.y,
        hasIn: seg.handleIn.length > 0.01,
        hasOut: seg.handleOut.length > 0.01,
      })
      idx += 1
    }
    if (cp.children.length) {
      for (const child of cp.children as paper.Path[]) {
        for (const seg of child.segments) pushSeg(seg)
      }
    } else {
      for (const seg of (cp as unknown as paper.Path).segments) pushSeg(seg)
    }
    cp.remove()
    return anchors
  } catch {
    return []
  }
}

function normalizeEditedPathShape(shape: SvgShape, editedLocalPath: string): SvgShape {
  const worldPath = transformPathData(editedLocalPath, shape.x, shape.y, shape.rotation)
  const bbox = pathWorldBbox(worldPath)
  if (!bbox) return normalizeShape({ ...shape, pathData: editedLocalPath })
  const cx = bbox.x + bbox.width / 2
  const cy = bbox.y + bbox.height / 2
  const centeredPath = transformPathData(worldPath, -cx, -cy, 0)
  return normalizeShape({
    ...shape,
    pathData: centeredPath,
    x: cx,
    y: cy,
    width: Math.max(MIN_SIZE, bbox.width),
    height: Math.max(MIN_SIZE, bbox.height),
    rotation: 0,
  })
}

function movePathAnchor(shape: SvgShape, pointIndex: number, worldX: number, worldY: number): SvgShape {
  if (shape.kind !== 'path' || !shape.pathData.trim()) return shape
  try {
    const scope = getPaperScope()
    const cp = new scope.CompoundPath({ pathData: shape.pathData, insert: false })
    const rad = shape.rotation * Math.PI / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const dx = worldX - shape.x
    const dy = worldY - shape.y
    const localX = dx * cos + dy * sin
    const localY = -dx * sin + dy * cos

    let idx = 0
    let changed = false
    const trySet = (seg: paper.Segment) => {
      if (idx === pointIndex) {
        seg.point.x = localX
        seg.point.y = localY
        changed = true
      }
      idx += 1
    }
    if (cp.children.length) {
      for (const child of cp.children as paper.Path[]) {
        for (const seg of child.segments) trySet(seg)
      }
    } else {
      for (const seg of (cp as unknown as paper.Path).segments) trySet(seg)
    }
    if (!changed) {
      cp.remove()
      return shape
    }

    const out = cp.exportSVG({ asString: true }) as string
    cp.remove()
    const m = out.match(/\sd=\"([^\"]+)\"/)
    const nextLocalPath = m?.[1] ?? shape.pathData
    return normalizeEditedPathShape(shape, nextLocalPath)
  } catch {
    return shape
  }
}

function movePathHandle(shape: SvgShape, pointIndex: number, handle: 'in' | 'out', worldX: number, worldY: number): SvgShape {
  if (shape.kind !== 'path' || !shape.pathData.trim()) return shape
  try {
    const scope = getPaperScope()
    const cp = new scope.CompoundPath({ pathData: shape.pathData, insert: false })
    const rad = shape.rotation * Math.PI / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const dx = worldX - shape.x
    const dy = worldY - shape.y
    const localX = dx * cos + dy * sin
    const localY = -dx * sin + dy * cos

    let idx = 0
    let changed = false
    const trySet = (seg: paper.Segment) => {
      if (idx === pointIndex) {
        const hx = localX - seg.point.x
        const hy = localY - seg.point.y
        if (handle === 'in') {
          seg.handleIn = new scope.Point(hx, hy)
        } else {
          seg.handleOut = new scope.Point(hx, hy)
        }
        changed = true
      }
      idx += 1
    }
    if (cp.children.length) {
      for (const child of cp.children as paper.Path[]) {
        for (const seg of child.segments) trySet(seg)
      }
    } else {
      for (const seg of (cp as unknown as paper.Path).segments) trySet(seg)
    }
    if (!changed) {
      cp.remove()
      return shape
    }
    const out = cp.exportSVG({ asString: true }) as string
    cp.remove()
    const m = out.match(/\sd=\"([^\"]+)\"/)
    return normalizeEditedPathShape(shape, m?.[1] ?? shape.pathData)
  } catch {
    return shape
  }
}

function insertPathAnchor(shape: SvgShape, worldX: number, worldY: number): SvgShape {
  if (shape.kind !== 'path' || !shape.pathData.trim()) return shape
  try {
    const scope = getPaperScope()
    const cp = new scope.CompoundPath({ pathData: shape.pathData, insert: false })
    const rad = shape.rotation * Math.PI / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const dx = worldX - shape.x
    const dy = worldY - shape.y
    const local = new scope.Point(dx * cos + dy * sin, -dx * sin + dy * cos)

    let bestPath: paper.Path | null = null
    let bestLoc: paper.CurveLocation | null = null
    let bestDist = Infinity
    const allPaths = cp.children.length ? (cp.children as paper.Path[]) : [cp as unknown as paper.Path]
    for (const p of allPaths) {
      if (!p.segments.length) continue
      const loc = p.getNearestLocation(local)
      if (!loc) continue
      const dist = loc.point.getDistance(local)
      if (dist < bestDist) {
        bestDist = dist
        bestLoc = loc
        bestPath = p
      }
    }
    if (!bestPath || !bestLoc) {
      cp.remove()
      return shape
    }

    bestPath.insert(bestLoc.index + 1, new scope.Segment(bestLoc.point))
    const out = cp.exportSVG({ asString: true }) as string
    cp.remove()
    const m = out.match(/\sd=\"([^\"]+)\"/)
    return normalizeEditedPathShape(shape, m?.[1] ?? shape.pathData)
  } catch {
    return shape
  }
}

function removePathAnchor(shape: SvgShape, pointIndex: number): SvgShape {
  if (shape.kind !== 'path' || !shape.pathData.trim()) return shape
  try {
    const scope = getPaperScope()
    const cp = new scope.CompoundPath({ pathData: shape.pathData, insert: false })
    let idx = 0
    let removed = false
    const tryRemove = (p: paper.Path, seg: paper.Segment) => {
      if (removed) { idx += 1; return }
      if (idx === pointIndex) {
        const minSegs = p.closed ? 3 : 2
        if (p.segments.length > minSegs) {
          seg.remove()
          removed = true
        }
      }
      idx += 1
    }
    if (cp.children.length) {
      for (const p of cp.children as paper.Path[]) {
        for (const seg of [...p.segments]) tryRemove(p, seg)
      }
    } else {
      const p = cp as unknown as paper.Path
      for (const seg of [...p.segments]) tryRemove(p, seg)
    }
    if (!removed) {
      cp.remove()
      return shape
    }
    const out = cp.exportSVG({ asString: true }) as string
    cp.remove()
    const m = out.match(/\sd=\"([^\"]+)\"/)
    return normalizeEditedPathShape(shape, m?.[1] ?? shape.pathData)
  } catch {
    return shape
  }
}

type SliceBooleanResult = {
  baseMinus: string
  overlap: string
  cutterMinus: string
}

// ─── Contour Modal ────────────────────────────────────────────────────────────

type ContourModalProps = {
  shape: SvgShape
  onClose: () => void
  onApply: (hiddenContours: number[]) => void
}

function ContourModal({ shape, onClose, onApply }: ContourModalProps) {
  const subpaths = useMemo(() => splitPathSubpaths(shape.pathData), [shape.pathData])
  const [hidden, setHidden] = useState<Set<number>>(new Set(shape.hiddenContours))
  const [hovered, setHovered] = useState<number | null>(null)

  // Compute viewBox from full path bounding box so canvas fits the shape
  const viewBox = useMemo(() => {
    if (typeof document === 'undefined') return '0 0 400 300'
    const svgNS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(svgNS, 'svg')
    svg.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none'
    document.body.appendChild(svg)
    try {
      const p = document.createElementNS(svgNS, 'path')
      p.setAttribute('d', shape.pathData)
      svg.appendChild(p)
      const bb = p.getBBox()
      const pad = Math.max(bb.width, bb.height) * 0.06
      return `${bb.x - pad} ${bb.y - pad} ${bb.width + pad * 2} ${bb.height + pad * 2}`
    } catch {
      return '0 0 400 300'
    } finally {
      document.body.removeChild(svg)
    }
  }, [shape.pathData])

  function toggle(idx: number) {
    if (idx === 0) return // outer silhouette always visible
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function hideAll() {
    setHidden(new Set(subpaths.slice(1).map((_, i) => i + 1)))
  }

  const FILL_ACTIVE = '#1abc7b'
  const FILL_HIDDEN = '#2a3040'
  const STROKE_HOVER = '#22d3ee'

  return createPortal(
    <div className="contour-modal-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="contour-modal">
        <div className="contour-modal-header">
          <span className="contour-modal-title">Contour</span>
          <button type="button" className="contour-modal-close" onClick={onClose}>✕</button>
        </div>
        <p className="contour-modal-hint">Click any outlined portion below to toggle it on or off.</p>

        <div className="contour-modal-body">
          {/* Main canvas */}
          <div className="contour-modal-canvas-wrap">
            <svg
              viewBox={viewBox}
              className="contour-modal-svg"
              xmlns="http://www.w3.org/2000/svg"
            >
              {subpaths.map((d, idx) => {
                const isHidden = hidden.has(idx)
                const isHovered = hovered === idx
                const isOuter = idx === 0
                return (
                  <path
                    key={idx}
                    d={d}
                    fill={isHidden ? FILL_HIDDEN : FILL_ACTIVE}
                    stroke={isHovered && !isOuter ? STROKE_HOVER : 'rgba(0,0,0,0.25)'}
                    strokeWidth={isHovered && !isOuter ? 3 : 1}
                    style={{ cursor: isOuter ? 'default' : 'pointer', transition: 'fill 0.15s, stroke 0.15s' }}
                    onClick={() => toggle(idx)}
                    onMouseEnter={() => !isOuter && setHovered(idx)}
                    onMouseLeave={() => setHovered(null)}
                  />
                )
              })}
            </svg>
          </div>

          {/* Sidebar thumbnails */}
          {subpaths.length > 1 && (
            <div className="contour-modal-sidebar">
              {subpaths.slice(1).map((d, i) => {
                const idx = i + 1
                const isHidden = hidden.has(idx)
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`contour-thumb${isHidden ? '' : ' active'}`}
                    onClick={() => toggle(idx)}
                    title={isHidden ? 'Click to show' : 'Click to hide'}
                  >
                    <svg viewBox={viewBox} className="contour-thumb-svg" xmlns="http://www.w3.org/2000/svg">
                      {/* outer in dark so thumb shows just this sub-path */}
                      <path d={subpaths[0]} fill="#1a2030" />
                      <path d={d} fill={isHidden ? '#2a3040' : FILL_ACTIVE} stroke="#22d3ee" strokeWidth={2} />
                    </svg>
                    <span>{isHidden ? 'Off' : 'On'}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="contour-modal-footer">
          <button type="button" className="contour-footer-btn" onClick={hideAll} disabled={subpaths.length <= 1}>
            Hide All Contours
          </button>
          <button type="button" className="contour-footer-btn primary" onClick={() => onApply(Array.from(hidden).sort((a, b) => a - b))}>
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function slicePathData(basePath: string, cutterPath: string): SliceBooleanResult | null {
  const a = basePath.trim()
  const b = cutterPath.trim()
  if (!a || !b) return null
  try {
    const scope = getPaperScope()

    const makeShape = (d: string) => new scope.CompoundPath({ pathData: d, insert: false })
    const toPathData = (item: paper.Item | null): string => {
      if (!item) return ''
      if (item instanceof scope.Path || item instanceof scope.CompoundPath) {
        return item.pathData?.trim() ?? ''
      }
      return ''
    }

    const base = makeShape(a)
    const cutter = makeShape(b)

    const baseMinus = base.subtract(cutter, { insert: false })
    const overlap = base.intersect(cutter, { insert: false })
    const cutterMinus = cutter.subtract(base, { insert: false })

    return {
      baseMinus: toPathData(baseMinus),
      overlap: toPathData(overlap),
      cutterMinus: toPathData(cutterMinus),
    }
  } catch {
    return null
  }
}

function paperBooleanPathData(basePath: string, cutterPath: string, op: 'unite' | 'subtract' | 'intersect' | 'exclude'): string {
  const a = basePath.trim()
  const b = cutterPath.trim()
  if (!a || !b) return ''
  try {
    const scope = getPaperScope()

    const lhs = new scope.CompoundPath({ pathData: a, insert: false })
    const rhs = new scope.CompoundPath({ pathData: b, insert: false })

    let out: paper.Item | null = null
    if (op === 'unite') {
      out = lhs.unite(rhs, { insert: false })
    } else if (op === 'subtract') {
      // Inflate the cutter by a tiny epsilon so the boolean cut is clean at
      // path boundaries — prevents hairline remnants where the cutter exactly
      // touches the base outline.
      const SUBTRACT_EPSILON = 0.5  // canvas units (~0.01 in at 48px/in)
      const inflated = rhs.clone({ insert: false }) as paper.CompoundPath
      inflated.scale(1 + SUBTRACT_EPSILON / Math.max(inflated.bounds.width, inflated.bounds.height, 1))
      out = lhs.subtract(inflated, { insert: false })
      inflated.remove()
    } else if (op === 'intersect') {
      out = lhs.intersect(rhs, { insert: false })
    } else {
      out = lhs.exclude(rhs, { insert: false })
    }

    const toPathData = (item: paper.Item | null): string => {
      if (!item) return ''
      if (item instanceof scope.Path || item instanceof scope.CompoundPath) {
        return item.pathData?.trim() ?? ''
      }
      if ('children' in item) {
        const parts: string[] = []
        for (const child of item.children) {
          const pd = toPathData(child)
          if (pd) parts.push(pd)
        }
        return parts.join(' ')
      }
      return ''
    }

    return toPathData(out)
  } catch {
    return ''
  }
}

// ─── SVG export ───────────────────────────────────────────────────────────────

function generateGradientDef(gradient: Gradient | null, id: string): { defsStr: string; href: string } {
  if (!gradient) return { defsStr: '', href: '' }
  
  const stops = gradient.stops
    .map(s => `<stop offset="${s.position}%" stop-color="${s.color}" stop-opacity="1"/>`)
    .join('')
  
  if (gradient.type === 'linear') {
    const angle = (gradient.angle ?? 0) * (Math.PI / 180)
    const x2 = 50 + 50 * Math.cos(angle)
    const y2 = 50 + 50 * Math.sin(angle)
    return {
      defsStr: `<linearGradient id="${id}" x1="50%" y1="50%" x2="${x2}%" y2="${y2}%">${stops}</linearGradient>`,
      href: `url(#${id})`
    }
  } else {
    return {
      defsStr: `<radialGradient id="${id}" cx="50%" cy="50%" r="50%">${stops}</radialGradient>`,
      href: `url(#${id})`
    }
  }
}

function generateStrokeDashAttribute(dasharray: string, dashoffset: number): string {
  if (!dasharray) return ''
  return ` stroke-dasharray="${dasharray}" stroke-dashoffset="${dashoffset}"`
}

function shapeToSvgString(s: SvgShape): string {
  if (!s.visible) return ''
  const t = `translate(${s.x} ${s.y}) rotate(${s.rotation})`
  
  // Build base attributes with gradient support
  let fillAttr = `fill="${s.fill}"`
  let strokeAttr = `stroke="${s.stroke}"`
  let gradientDefs = ''
  
  if (s.fillGradient) {
    const { defsStr, href } = generateGradientDef(s.fillGradient, `grad-fill-${s.id}`)
    fillAttr = `fill="${href}"`
    gradientDefs += defsStr
  }
  
  if (s.strokeGradient) {
    const { defsStr, href } = generateGradientDef(s.strokeGradient, `grad-stroke-${s.id}`)
    strokeAttr = `stroke="${href}"`
    gradientDefs += defsStr
  }
  
  const dashAttr = generateStrokeDashAttribute(s.strokeDasharray, s.strokeDashoffset)
  const base = `${fillAttr} ${strokeAttr} stroke-width="${s.strokeWidth}" stroke-linejoin="${s.strokeLinejoin}" stroke-linecap="round" opacity="${s.opacity}"${dashAttr}`
  
  let svgContent = ''
  
  switch (s.kind) {
    case 'rect':
      svgContent = `<rect x="${-s.width / 2}" y="${-s.height / 2}" width="${s.width}" height="${s.height}" ${base} transform="${t}"/>`
      break
    case 'roundedrect': {
      const r = Math.min(s.cornerRadius, s.width / 2, s.height / 2)
      svgContent = `<rect x="${-s.width / 2}" y="${-s.height / 2}" width="${s.width}" height="${s.height}" rx="${r}" ${base} transform="${t}"/>`
      break
    }
    case 'circle':
      svgContent = `<circle cx="${s.x}" cy="${s.y}" r="${s.radius}" ${base}/>`
      break
    case 'ellipse':
      svgContent = `<ellipse cx="${s.x}" cy="${s.y}" rx="${s.width / 2}" ry="${s.height / 2}" ${base} transform="rotate(${s.rotation} ${s.x} ${s.y})"/>`
      break
    case 'triangle':
      svgContent = `<polygon points="${-s.width / 2},${s.height / 2} 0,${-s.height / 2} ${s.width / 2},${s.height / 2}" ${base} transform="${t}"/>`
      break
    case 'diamond':
      svgContent = `<polygon points="${diamondPts(s.width, s.height)}" ${base} transform="${t}"/>`
      break
    case 'polygon':
      svgContent = `<polygon points="${polyPts(Math.min(s.width, s.height) / 2, s.starPoints)}" ${base} transform="${t}"/>`
      break
    case 'star': {
      const o = Math.min(s.width, s.height) / 2
      svgContent = `<polygon points="${starPts(o, o * s.innerRatio, s.starPoints)}" ${base} transform="${t}"/>`
      break
    }
    case 'cross':
      svgContent = `<polygon points="${crossPts(s.width, s.height)}" ${base} transform="${t}"/>`
      break
    case 'chevron':
      svgContent = `<polygon points="${chevronPts(s.width, s.height)}" ${base} transform="${t}"/>`
      break
    case 'heart':
      svgContent = `<path d="${heartPath(s.width, s.height)}" ${base} transform="${t}"/>`
      break
    case 'ring':
      svgContent = `<path d="${ringPath(s.radius, s.innerRatio)}" ${fillAttr} ${strokeAttr} stroke-width="${s.strokeWidth}" opacity="${s.opacity}" fill-rule="evenodd" transform="${t}"/>`
      break
    case 'arrow':
      svgContent = `<polygon points="${arrowPts(s.width, s.height)}" ${base} transform="${t}"/>`
      break
    case 'line':
      svgContent = `<line x1="${-s.width / 2}" y1="0" x2="${s.width / 2}" y2="0" ${strokeAttr} stroke-width="${s.strokeWidth}" stroke-linecap="round" opacity="${s.opacity}"${dashAttr} transform="${t}"/>`
      break
    case 'path': {
      const d = visiblePathData(s.pathData, s.hiddenContours)
      if (!d) return ''
      svgContent = `<path d="${d}" ${base} fill-rule="evenodd" transform="${t}"/>`
      break
    }
    case 'image':
      if (!s.imageHref) return ''
      svgContent = `<image href="${s.imageHref}" x="${-s.width / 2}" y="${-s.height / 2}" width="${s.width}" height="${s.height}" opacity="${s.opacity}" transform="${t}" preserveAspectRatio="none"/>`
      break
    case 'text': {
      const anchorMap = { left: 'start', center: 'middle', right: 'end' } as const
      const anchor = anchorMap[s.textAlign ?? 'center']
      const align = s.textAlign ?? 'center'
      const fA = s.fontFamily ? ` font-family="${s.fontFamily}"` : ''
      const wA = s.fontWeight === 'bold' ? ' font-weight="bold"' : ''
      const iA = s.fontStyle === 'italic' ? ' font-style="italic"' : ''
      const lines = (s.text || '').split('\n')
      const lh = s.fontSize * 1.25
      const totalH = (lines.length - 1) * lh
      const curve = clamp(s.textCurve ?? 0, -100, 100)
      const { sx, sy, hw } = getTextScale(s)
      const textTransform = `translate(${s.x} ${s.y}) rotate(${s.rotation}) scale(${sx} ${sy})`
      const attr = `${fillAttr} ${strokeAttr} stroke-width="${s.strokeWidth}" stroke-linejoin="${s.strokeLinejoin}" stroke-linecap="round" paint-order="stroke fill" font-size="${s.fontSize}"${fA}${wA}${iA} text-anchor="${anchor}" dominant-baseline="middle" opacity="${s.opacity}"${dashAttr}`
      if (lines.length === 1 && Math.abs(curve) > 0.001) {
        const pathId = `curve-${s.id}`
        svgContent = `<g transform="${textTransform}"><path id="${pathId}" d="${curvedTextPathData(hw * 2, curve)}" fill="none" stroke="none"/><text ${attr}><textPath href="#${pathId}" startOffset="${textCurveStartOffset(align)}">${lines[0]}</textPath></text></g>`
      } else if (lines.length === 1) {
        svgContent = `<g transform="${textTransform}"><text x="0" y="0" ${attr}>${lines[0]}</text></g>`
      } else {
        const tspans = lines.map((l, i) => `<tspan x="0" dy="${i === 0 ? 0 : lh}">${l}</tspan>`).join('')
        svgContent = `<g transform="${textTransform}"><text x="0" y="${-totalH / 2}" ${attr}>${tspans}</text></g>`
      }
      break
    }
    default: return ''
  }
  
  // Wrap with gradient definitions if needed
  if (gradientDefs) {
    return `<g><defs>${gradientDefs}</defs>${svgContent}</g>`
  }
  return svgContent
}

// ─── Default / normalize ──────────────────────────────────────────────────────

function normalizeShape(s: SvgShape): SvgShape {
  const n = { ...s }
  n.width = Math.max(MIN_SIZE, n.width)
  n.height = Math.max(MIN_SIZE, n.height)
  n.radius = Math.max(MIN_SIZE / 2, n.radius)
  n.fontSize = Math.max(8, n.fontSize)
  n.strokeWidth = Math.max(0, n.strokeWidth)
  n.strokeDashoffset = n.strokeDashoffset ?? 0
  n.starPoints = clamp(Math.round(n.starPoints), 3, 20)
  n.innerRatio = clamp(n.innerRatio, 0.1, 0.95)
  n.cornerRadius = Math.max(0, n.cornerRadius)
  n.opacity = clamp(n.opacity, 0, 1)
  n.textCurve = clamp(n.textCurve ?? 0, -100, 100)
  n.hiddenContours = Array.isArray(n.hiddenContours)
    ? [...new Set(n.hiddenContours)].filter(v => Number.isInteger(v) && v >= 0).sort((a, b) => a - b)
    : []
  n.offsetSourceSignature = n.offsetSourceSignature ?? null
  n.attachedGroupId = n.attachedGroupId ?? null
  n.combineGroupId = n.combineGroupId ?? null
  n.groupId = n.groupId ?? null
  n.fillGradient = n.fillGradient ?? null
  n.strokeGradient = n.strokeGradient ?? null
  n.strokeDasharray = n.strokeDasharray ?? ''
  n.imageHref = n.imageHref ?? ''
  const halfW = n.kind === 'circle' || n.kind === 'ring' ? n.radius : n.width / 2
  const halfH = n.kind === 'circle' || n.kind === 'ring' ? n.radius : n.height / 2
  n.x = clamp(n.x, -halfW, AB + halfW)
  n.y = clamp(n.y, -halfH, AB + halfH)
  return n
}

function defaultShape(kind: SvgShapeKind, nameHint?: string): SvgShape {
  const isLine = kind === 'line'
  const isText = kind === 'text'
  const isImage = kind === 'image'
  return {
    id: createId(kind),
    kind,
    name: nameHint ?? (kind.charAt(0).toUpperCase() + kind.slice(1)),
    x: AB / 2, y: AB / 2,
    width: isLine ? 220 : isImage ? 300 : isText ? 220 : 220,
    height: isLine ? MIN_SIZE : isImage ? 200 : isText ? 110 : 140,
    radius: 96,
    cornerRadius: 16,
    rotation: 0,
    opacity: 1,
    fill: isText ? '#111111' : isLine ? 'none' : '#1a1a1a',
    stroke: isText ? 'none' : isLine ? '#1a1a1a' : 'none',
    strokeWidth: isText ? 0 : isLine ? 10 : 0,
    strokeDasharray: '',
    strokeDashoffset: 0,
    text: 'LOGO',
    fontSize: 96,
    fontFamily: DEFAULT_OFFSET_FONT_FAMILY,
    fontUrl: DEFAULT_OFFSET_FONT_URL,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'center',
    textCurve: 0,
    imageHref: '',
    starPoints: kind === 'polygon' ? 6 : 5,
    innerRatio: kind === 'ring' ? 0.55 : 0.42,
    pathData: '',
    hiddenContours: [],
    strokeLinejoin: 'round',
    isOffsetLayer: false,
    offsetSourceId: null,
    offsetDistance: 0,
    offsetSourceSignature: null,
    attachedGroupId: null,
    combineGroupId: null,
    groupId: null,
    fillGradient: null,
    strokeGradient: null,
    visible: true,
    locked: false,
  }
}

// ─── Clipper-based smooth offset ─────────────────────────────────────────────

// Scale factor: Clipper works in integers; we multiply coords then divide back
const CLIPPER_SCALE = 1000
// Cricut constraint: ±1.0 inch (100 px at 96 DPI)
const MAX_OFFSET_DISTANCE = 100

// Enforce distance limits (Cricut's ±1.0 inch constraint)
function constrainOffsetDistance(distance: number): number {
  return Math.max(-MAX_OFFSET_DISTANCE, Math.min(MAX_OFFSET_DISTANCE, distance))
}

// Simplify path for faster preview by reducing point density
// (Cricut does this to keep the ghost outline smooth but fast)
function simplifyPathForPreview(pathData: string): string {
  if (!pathData.trim()) return pathData
  try {
    const scope = getPaperScope()
    const path = new scope.CompoundPath({ pathData, insert: false })
    const children = path instanceof scope.CompoundPath ? path.children : [path]
    
    for (const child of children) {
      const p = child as paper.Path
      // Flatten curves to reduce point count for faster preview
      // This keeps the outline smooth while reducing computational load
      if (p.flatten && (p.curves?.length ?? 0) > 20) {
        p.flatten(2) // 2-unit tolerance = faster preview
      }
    }
    
    const result = path.pathData?.trim() ?? pathData
    path.remove()
    return result
  } catch {
    return pathData
  }
}

// Preprocess glyph outlines for stable offsetting (Cricut's approach)
// Flattens curves to a tolerance, normalizes winding, removes micro-contours
function preprocessGlyphPath(pathData: string): string {
  if (!pathData.trim()) return pathData
  try {
    const scope = getPaperScope()
    const path = new scope.CompoundPath({ pathData, insert: false })
    const children = path instanceof scope.CompoundPath ? path.children : [path]
    
    // Remove micro-contours (area < 16 sq units)
    const kept: paper.Path[] = []
    for (const child of children) {
      const p = child as paper.Path
      const area = Math.abs(p.area ?? 0)
      const bounds = p.bounds
      const minDim = Math.max(1, Math.min(bounds.width, bounds.height))
      const contourAreaFloor = clamp(bounds.width * bounds.height * 0.0015, 2, 16)
      if (area > contourAreaFloor) {
        // Small text needs tighter flatten tolerance or curved offsets get visibly faceted.
        if (p.flatten && (p.curves?.length ?? 0) > 0) {
          const flattenTolerance = clamp(minDim * 0.006, 0.08, 0.75)
          p.flatten(flattenTolerance)
        }
        kept.push(p)
      }
    }
    
    // Rebuild with kept children
    const out = new scope.CompoundPath({ insert: false })
    for (const p of kept) {
      out.addChild(p.clone() as paper.Path)
    }
    const result = out.pathData?.trim() ?? pathData
    path.remove()
    out.remove()
    return result || pathData
  } catch {
    return pathData
  }
}

// Shared paper.js scope — created once, reused for all boolean ops.
let _paperScope: paper.PaperScope | null = null
function getPaperScope(): paper.PaperScope {
  if (!_paperScope) {
    _paperScope = new paper.PaperScope()
    const canvas = document.createElement('canvas')
    canvas.width = 2; canvas.height = 2
    _paperScope.setup(canvas)
  }
  return _paperScope
}

function svgPathToClipperPoly(d: string, forPreview = false): { X: number; Y: number }[][] {
  // Flatten the SVG path to line segments by sampling along it via a temp <path>
  if (typeof document === 'undefined') return []
  const svgNS = 'http://www.w3.org/2000/svg'
  const svgEl = document.createElementNS(svgNS, 'svg')
  svgEl.setAttribute('xmlns', svgNS)
  svgEl.style.position = 'absolute'
  svgEl.style.visibility = 'hidden'
  svgEl.style.pointerEvents = 'none'
  document.body.appendChild(svgEl)
  const pathEl = document.createElementNS(svgNS, 'path')
  pathEl.setAttribute('d', d)
  svgEl.appendChild(pathEl)

  const subpaths: { X: number; Y: number }[][] = []
  try {
    const len = pathEl.getTotalLength()
    if (!len || !isFinite(len)) { document.body.removeChild(svgEl); return [] }
    // Each M subcommand is a separate polygon
    const dStr = d.trim()
    const subRaw = dStr.match(/[Mm][^Mm]*/g) ?? [dStr]
    for (const sub of subRaw) {
      const subPath = document.createElementNS(svgNS, 'path')
      subPath.setAttribute('d', sub)
      svgEl.appendChild(subPath)
      const subLen = subPath.getTotalLength()
      if (!subLen || !isFinite(subLen)) {
        svgEl.removeChild(subPath)
        continue
      }
      const pts: { X: number; Y: number }[] = []
      // Sample densely so curved glyph/shape outlines stay smooth after welding + offset.
      // For live preview use coarser sampling (faster); final apply uses dense sampling.
      const maxPts = forPreview ? 600 : 12000
      const minStep = forPreview ? 0.8 : 0.08
      const subStep = Math.max(minStep, subLen / Math.min(maxPts, Math.ceil(subLen / (forPreview ? 2.0 : 0.2))))
      for (let t = 0; t < subLen; t += subStep) {
        const pt = subPath.getPointAtLength(t)
        const sampled = { X: Math.round(pt.x * CLIPPER_SCALE), Y: Math.round(pt.y * CLIPPER_SCALE) }
        const last = pts[pts.length - 1]
        if (!last || last.X !== sampled.X || last.Y !== sampled.Y) pts.push(sampled)
      }
      const endPt = subPath.getPointAtLength(subLen)
      const endSample = { X: Math.round(endPt.x * CLIPPER_SCALE), Y: Math.round(endPt.y * CLIPPER_SCALE) }
      const last = pts[pts.length - 1]
      if (!last || last.X !== endSample.X || last.Y !== endSample.Y) pts.push(endSample)
      svgEl.removeChild(subPath)
      // Close: add first point again if not already closed
      if (pts.length > 1) {
        const first = pts[0], last = pts[pts.length - 1]
        if (Math.abs(first.X - last.X) > 1 || Math.abs(first.Y - last.Y) > 1) pts.push({ ...first })
      }
      if (pts.length >= 3) subpaths.push(pts)
    }
  } finally {
    document.body.removeChild(svgEl)
  }
  return subpaths
}

/** Compute the bounding box of an SVG path string via a temporary DOM element. Returns null on failure. */
function pathWorldBbox(d: string): { x: number; y: number; width: number; height: number } | null {
  if (!d || typeof document === 'undefined') return null
  try {
    const svgNS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(svgNS, 'svg')
    svg.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;top:-9999px;left:-9999px'
    document.body.appendChild(svg)
    const p = document.createElementNS(svgNS, 'path')
    p.setAttribute('d', d)
    svg.appendChild(p)
    let bb: { x: number; y: number; width: number; height: number } | null = null
    try {
      const r = p.getBBox()
      if (r.width > 0 || r.height > 0) bb = { x: r.x, y: r.y, width: r.width, height: r.height }
    } catch { /* ignore */ }
    document.body.removeChild(svg)
    return bb
  } catch {
    return null
  }
}

function formatOffsetDistanceLabel(distance: number) {
  const inches = distance / 100
  const sign = inches >= 0 ? '+' : ''
  return `${sign}${inches.toFixed(2)}in`
}

function formatOffsetLayerName(sourceName: string, distance: number) {
  return `${sourceName} Offset ${formatOffsetDistanceLabel(distance)}`
}

function makeStableTextOffsetFallback(source: SvgShape, distance: number, name: string, sourceSig: string): SvgShape {
  return normalizeShape({
    ...source,
    id: createId('text'),
    name,
    width: Math.max(MIN_SIZE, source.width + distance * 2),
    height: Math.max(MIN_SIZE, source.height + distance * 2),
    fill: TEXT_OFFSET_STABLE_FILL,
    stroke: 'none',
    strokeWidth: 0,
    strokeLinejoin: 'round',
    opacity: 1,
    isOffsetLayer: true,
    offsetSourceId: source.id,
    offsetDistance: distance,
    offsetSourceSignature: sourceSig,
  })
}

/**
 * Arch warp: bends a local-space path (centered at 0,0) along a circular arc.
 * `amount` ranges -1 to +1 (negative = arch down, positive = arch up).
 * `w` and `h` are the bounding box width/height of the path.
 * The path is densely sampled, each point mapped via the arch formula, then output as polyline path.
 */
function warpArchPath(d: string, amount: number, w: number, _h: number): string {
  if (!d || amount === 0) return d
  // Sample path densely using a hidden SVG path element
  const svgNS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNS, 'svg')
  svg.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;top:-9999px;left:-9999px'
  document.body.appendChild(svg)

  // Split compound path into sub-paths and warp each independently
  const subPaths = d.match(/M[^M]*/g) ?? [d]
  const result: string[] = []

  for (const sub of subPaths) {
    const p = document.createElementNS(svgNS, 'path')
    p.setAttribute('d', sub)
    svg.appendChild(p)
    const totalLen = p.getTotalLength()
    if (totalLen <= 0) { svg.removeChild(p); continue }

    // Sample every ~2px for smooth result
    const steps = Math.max(32, Math.ceil(totalLen / 2))
    const pts: { x: number; y: number }[] = []
    for (let i = 0; i <= steps; i++) {
      const pt = p.getPointAtLength((i / steps) * totalLen)
      if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue
      pts.push({ x: pt.x, y: pt.y })
    }
    svg.removeChild(p)

    if (!pts.length) continue

    // Arch formula: for each point, compute normalised x position (-0.5 to 0.5),
    // then add a vertical displacement following a parabolic/circular arc.
    // dy = amount * h * (1 - (2*nx)^2) maps to a smooth arch.
    const archScale = amount * w * 0.5 // scale arch height relative to width
    const warped = pts.map(({ x, y }) => {
      const nx = w > 0 ? x / w : 0  // normalized: -0.5 .. +0.5
      const dy = archScale * (1 - (2 * nx) ** 2)
      return { x, y: y - dy }
    }).filter(pt => Number.isFinite(pt.x) && Number.isFinite(pt.y))

    if (!warped.length) continue

    // Build polyline path string
    const pathStr = warped.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join(' ') + ' Z'
    result.push(pathStr)
  }

  document.body.removeChild(svg)
  return result.join(' ')
}

function clipperPolyToSvgPath(polys: { X: number; Y: number }[][]): string {
  return polys.map(poly => {
    if (!poly.length) return ''
    const pts = poly.map(p => `${(p.X / CLIPPER_SCALE).toFixed(3)},${(p.Y / CLIPPER_SCALE).toFixed(3)}`)
    return `M${pts[0]} L${pts.slice(1).join(' L')} Z`
  }).join(' ')
}

function bboxArea(d: string): number {
  const box = pathWorldBbox(d)
  if (!box) return 0
  return Math.max(0, box.width) * Math.max(0, box.height)
}

function prefersOutwardOffset(sourcePath: string, offsetPath: string, distance: number): boolean {
  if (!sourcePath || !offsetPath || distance === 0) return true
  const sourceArea = bboxArea(sourcePath)
  const offsetArea = bboxArea(offsetPath)
  if (sourceArea <= 0 || offsetArea <= 0) return true
  const delta = offsetArea - sourceArea
  if (distance > 0) return delta >= -0.5
  return delta <= 0.5
}

function isCollapsedTextOffsetResult(source: SvgShape, offsetPath: string, distance: number): boolean {
  if (source.kind !== 'text' || distance <= 0 || !offsetPath) return false
  const box = pathWorldBbox(offsetPath)
  if (!box || box.width <= 0 || box.height <= 0) return true
  const widthRatio = box.width / Math.max(1, source.width)
  const heightRatio = box.height / Math.max(1, source.height)
  return widthRatio < 0.55 || heightRatio < 0.45
}

// Returns an SVG path string of the shape expanded outward by `distance` px,
// placed in the shape's local coordinate space (centered at 0,0).
function computeClipperOffset(
  localPath: string,
  distance: number,
  joinType: 'round' | 'sharp',
  forPreview = false,
): string | null {
  if (!localPath || distance === 0) return null
  try {
    const ClipperLib = getClipperLib()
    if (!ClipperLib) return null

    const polys = svgPathToClipperPoly(localPath, forPreview)
    if (!polys.length) return null

    const jt = joinType === 'round' ? ClipperLib.JoinType.jtRound : ClipperLib.JoinType.jtMiter
    const runOffset = (delta: number): string | null => {
      const co = new ClipperLib.ClipperOffset(2, 0.1 * CLIPPER_SCALE)
      for (const poly of polys) {
        co.AddPath(poly, jt, ClipperLib.EndType.etClosedPolygon)
      }
      const solution: { X: number; Y: number }[][] = []
      co.Execute(solution, delta * CLIPPER_SCALE)
      if (!solution.length) return null
      return clipperPolyToSvgPath(solution)
    }

    const primary = runOffset(distance)
    if (primary && prefersOutwardOffset(localPath, primary, distance)) return primary

    const flipped = runOffset(-distance)
    if (flipped && prefersOutwardOffset(localPath, flipped, distance)) return flipped

    return primary ?? flipped
  } catch {
    return null
  }
}

// Union multiple world-space paths, then expand the merged result — single smooth offset.
// worldPaths: array of SVG path strings already in world (canvas) coordinates.
function computeClipperUnionThenOffset(
  worldPaths: string[],
  distance: number,
  joinType: 'round' | 'sharp',
  fillRule: 'nonzero' | 'evenodd' = 'nonzero',
): string | null {
  if (!worldPaths.length || distance === 0) return null
  try {
    const ClipperLib = getClipperLib()
    if (!ClipperLib) return null

    // Step 1: union all source polygons into one merged shape
    const allPolys: { X: number; Y: number }[][] = []
    for (const d of worldPaths) {
      const polys = svgPathToClipperPoly(d)
      allPolys.push(...polys)
    }
    if (!allPolys.length) return null

    let unified: { X: number; Y: number }[][] = allPolys
    if (allPolys.length > 1) {
      const clipper = new ClipperLib.Clipper()
      // Add first poly as subject, rest as clips, then union
      clipper.AddPaths(allPolys, ClipperLib.PolyType.ptSubject, true)
      const unionSolution: { X: number; Y: number }[][] = []
      const unionFill = fillRule === 'evenodd' ? ClipperLib.PolyFillType.pftEvenOdd : ClipperLib.PolyFillType.pftNonZero
      clipper.Execute(ClipperLib.ClipType.ctUnion, unionSolution, unionFill, unionFill)
      if (unionSolution.length) unified = unionSolution
    }

    // Step 2: offset the unified shape outward
    const jt = joinType === 'round' ? ClipperLib.JoinType.jtRound : ClipperLib.JoinType.jtMiter
    const unifiedPath = clipperPolyToSvgPath(unified)
    const runOffset = (delta: number): string | null => {
      const co = new ClipperLib.ClipperOffset(2, 0.1 * CLIPPER_SCALE)
      for (const poly of unified) {
        co.AddPath(poly, jt, ClipperLib.EndType.etClosedPolygon)
      }
      const solution: { X: number; Y: number }[][] = []
      co.Execute(solution, delta * CLIPPER_SCALE)
      if (!solution.length) return null
      return clipperPolyToSvgPath(solution)
    }

    const primary = runOffset(distance)
    if (primary && prefersOutwardOffset(unifiedPath, primary, distance)) return primary

    const flipped = runOffset(-distance)
    if (flipped && prefersOutwardOffset(unifiedPath, flipped, distance)) return flipped

    return primary ?? flipped
  } catch {
    return null
  }
}

// Offset each source path first, then union results.
// This is more resilient for decorative text glyphs where pre-union can collapse contours.
function computeClipperOffsetThenUnion(
  worldPaths: string[],
  distance: number,
  joinType: 'round' | 'sharp',
  fillRule: 'nonzero' | 'evenodd' = 'nonzero',
  forPreview = false,
): string | null {
  if (!worldPaths.length || distance === 0) return null
  const offsetPaths = worldPaths
    .map(path => computeClipperOffset(path, distance, joinType, forPreview))
    .filter((path): path is string => !!path)
  if (!offsetPaths.length) return null
  if (offsetPaths.length === 1) return offsetPaths[0]
  return computeClipperUnionWithFill(offsetPaths, fillRule)
}

// Union multiple world-space paths into one merged path without offset.
function computeClipperUnion(worldPaths: string[]): string | null {
  return computeClipperUnionWithFill(worldPaths, 'nonzero')
}

function computeClipperUnionWithFill(worldPaths: string[], fillRule: 'nonzero' | 'evenodd'): string | null {
  if (!worldPaths.length) return null
  try {
    const ClipperLib = getClipperLib()
    if (!ClipperLib) return null

    const allPolys: { X: number; Y: number }[][] = []
    for (const d of worldPaths) {
      const polys = svgPathToClipperPoly(d)
      allPolys.push(...polys)
    }
    if (!allPolys.length) return null

    const clipper = new ClipperLib.Clipper()
    clipper.AddPaths(allPolys, ClipperLib.PolyType.ptSubject, true)
    const unionSolution: { X: number; Y: number }[][] = []
    const unionFill = fillRule === 'evenodd' ? ClipperLib.PolyFillType.pftEvenOdd : ClipperLib.PolyFillType.pftNonZero
    clipper.Execute(
      ClipperLib.ClipType.ctUnion,
      unionSolution,
      unionFill,
      unionFill,
    )
    if (!unionSolution.length) return null
    return clipperPolyToSvgPath(unionSolution)
  } catch {
    return null
  }
}

// ─── SVG import ───────────────────────────────────────────────────────────────
// ─── opentype.js glyph path extraction ───────────────────────────────────────

// Module-level font cache keyed by absolute URL
const _opentypeFontCache = new Map<string, any>()
const _opentypeFontLoading = new Map<string, Promise<any>>()
type FontManifestEntry = { family: string; name: string; fileName: string; url: string }
let _fontManifestEntries: FontManifestEntry[] | null = null
let _fontManifestLoading: Promise<FontManifestEntry[] | null> | null = null

function normalizeFontKey(input: string): string {
  return input.trim().replace(/^['"]+|['"]+$/g, '').replace(/\s+/g, ' ').toLowerCase()
}

function normalizeFontLoose(input: string): string {
  return normalizeFontKey(input).replace(/[^a-z0-9]+/g, '')
}

function fontFamilyCandidates(fontFamily: string): string[] {
  const raw = (fontFamily || '').trim()
  if (!raw) return []
  const tokens = raw.split(',').map(t => normalizeFontKey(t)).filter(Boolean)
  const out = new Set<string>()
  for (const t of tokens) {
    if (!t || t === 'serif' || t === 'sans-serif' || t === 'monospace' || t === 'cursive' || t === 'fantasy') continue
    out.add(t)
    if (t.startsWith('mygarage ')) out.add(t.slice('mygarage '.length))
    else out.add(`mygarage ${t}`)
  }
  return [...out]
}

function resolveFontUrlFromEntries(
  fontFamily: string,
  entries: Array<{ family: string; name: string; fileName: string; url: string }>,
): string | null {
  const candidates = fontFamilyCandidates(fontFamily)
  if (!candidates.length || !entries.length) return null

  const looseCandidates = new Set(candidates.map(normalizeFontLoose).filter(Boolean))
  for (const candidate of candidates) {
    const candidateLoose = normalizeFontLoose(candidate)
    for (const e of entries) {
      const familyKey = normalizeFontKey(e.family)
      const nameKey = normalizeFontKey(e.name)
      const stemKey = normalizeFontKey(e.fileName.replace(/\.[^.]+$/, ''))
      if (familyKey === candidate || nameKey === candidate || stemKey === candidate) {
        return e.url
      }
      const familyLoose = normalizeFontLoose(e.family)
      const nameLoose = normalizeFontLoose(e.name)
      const stemLoose = normalizeFontLoose(e.fileName.replace(/\.[^.]+$/, ''))
      if (
        familyLoose === candidateLoose
        || nameLoose === candidateLoose
        || stemLoose === candidateLoose
        || looseCandidates.has(familyLoose)
        || looseCandidates.has(nameLoose)
        || looseCandidates.has(stemLoose)
      ) {
        return e.url
      }
    }
  }
  return null
}

async function loadFontManifestEntries(): Promise<FontManifestEntry[] | null> {
  if (_fontManifestEntries) return _fontManifestEntries
  if (_fontManifestLoading) return _fontManifestLoading
  _fontManifestLoading = (async () => {
    try {
      const res = await fetch('/fonts/manifest.json')
      if (!res.ok) return null
      const json = await res.json() as { items?: Array<{ family?: string; name?: string; fileName?: string; url?: string }> }
      const entries: FontManifestEntry[] = []
      for (const item of json.items ?? []) {
        const family = (item.family ?? '').trim()
        const name = (item.name ?? '').trim()
        const fileName = (item.fileName ?? '').trim()
        const url = (item.url ?? '').trim()
        if (!url) continue
        entries.push({ family, name, fileName, url })
      }
      _fontManifestEntries = entries
      return entries
    } catch {
      return null
    } finally {
      _fontManifestLoading = null
    }
  })()
  return _fontManifestLoading
}

async function resolveFontUrlByFamily(fontFamily: string): Promise<string | null> {
  const entries = await loadFontManifestEntries()
  if (!entries?.length) return null
  return resolveFontUrlFromEntries(fontFamily, entries)
}

async function loadOpentypeFont(fontUrl: string): Promise<any> {
  if (!fontUrl) return null
  const absUrl = resolveAbsoluteUrl(fontUrl)
  const cached = _opentypeFontCache.get(absUrl)
  if (cached) return cached
  const loading = _opentypeFontLoading.get(absUrl)
  if (loading) return loading
  const p: Promise<any> = (async () => {
    try {
      // Use fetch+parse instead of opentype.load (XHR) for better browser compatibility
      const resp = await fetch(absUrl)
      if (!resp.ok) return null
      const buf = await resp.arrayBuffer()
      const font = opentype.parse(buf)
      _opentypeFontCache.set(absUrl, font)
      return font
    } catch (err) {
      console.error('[MyGarage] opentype load failed:', absUrl, err)
      return null
    } finally {
      _opentypeFontLoading.delete(absUrl)
    }
  })()
  _opentypeFontLoading.set(absUrl, p)
  return p
}

function glyphPathToData(path: unknown): string {
  const pathObj = path as { toPathData?: (decimals?: number) => string } | null
  if (!pathObj || typeof pathObj.toPathData !== 'function') return ''
  // Higher precision keeps intricate font features from collapsing during offset sampling.
  const candidates = [4, 3, 2]
  for (const decimals of candidates) {
    try {
      const data = pathObj.toPathData(decimals)?.trim()
      if (data) return data
    } catch {
      // Try lower precision fallback.
    }
  }
  return ''
}

function safeAdvanceWidth(font: any, text: string, fontSize: number): number {
  const raw = font?.getAdvanceWidth?.(text, fontSize)
  if (Number.isFinite(raw) && raw > 0) return raw
  const chars = Math.max(1, Array.from(text || '').length)
  return Math.max(1, fontSize * chars * 0.6)
}

function finiteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function isValidPathData(pathData: string): boolean {
  if (!pathData.trim()) return false
  return !/(?:NaN|Infinity|-Infinity)/.test(pathData)
}

// Returns world-space SVG path strings for a text shape using actual glyph curves.
// Returns null if glyph curves cannot be produced (missing font data / parse failure).
async function textShapeToGlyphPathsAsync(s: SvgShape): Promise<string[] | null> {
  const text = s.text || ''
  if (!text.trim()) return []

  // Try to load via opentype.js for actual Bezier glyph curves
  const resolvedFontUrl = s.fontUrl || await resolveFontUrlByFamily(s.fontFamily)
  const font = resolvedFontUrl ? await loadOpentypeFont(resolvedFontUrl) : null
  if (!font) {
    console.warn('[MyGarage] textGlyphPaths: no font for', s.fontFamily, '| url:', resolvedFontUrl ?? '(none)')
    return null
  }

  const lines = text.split('\n')
  const fontSize = Math.max(1, finiteNumber(s.fontSize, 130))
  const lh = fontSize * 1.25
  const totalH = (lines.length - 1) * lh
  const unitsPerEm = finiteNumber((font as { unitsPerEm?: number }).unitsPerEm, 0)
  const scale = unitsPerEm !== 0 ? (fontSize / unitsPerEm) : 1
  // Keep a metrics fallback, but prefer per-line path bounds centering to match
  // how the SVG text is visually centered with dominant-baseline="middle".
  const os2 = (font as {
    tables?: {
      os2?: {
        sTypoAscender?: number
        sTypoDescender?: number
        usWinAscent?: number
        usWinDescent?: number
        fsSelection?: number
      }
    }
  }).tables?.os2
  let metricAscender: number
  let metricDescender: number
  if (os2) {
    const useTypoMetrics = ((os2.fsSelection ?? 0) & 0x80) !== 0
    if (useTypoMetrics && os2.sTypoAscender != null && os2.sTypoDescender != null) {
      metricAscender = os2.sTypoAscender
      metricDescender = os2.sTypoDescender
    } else if (os2.usWinAscent != null && os2.usWinDescent != null) {
      metricAscender = os2.usWinAscent
      metricDescender = -os2.usWinDescent
    } else {
      metricAscender = finiteNumber((font as { ascender?: number }).ascender, 0)
      metricDescender = finiteNumber((font as { descender?: number }).descender, 0)
    }
  } else {
    metricAscender = finiteNumber((font as { ascender?: number }).ascender, 0)
    metricDescender = finiteNumber((font as { descender?: number }).descender, 0)
  }
  const yMiddleToBaselineFallback = (metricAscender + metricDescender) / 2 * scale
  const { sx, sy } = getTextScale(s)
  const curve = clamp(s.textCurve ?? 0, -100, 100)
  const singleLineCurved = lines.length === 1 && Math.abs(curve) > 0.001
  const { hw } = getTextIntrinsicHalfSize(s)

  const pushLocalPath = (pathData: string) => {
    if (!pathData || !isValidPathData(pathData)) return
    const transformedLocal = transformPathWithPaper(pathData, sx, sy, s.rotation, 0, 0)
    const transformedWorld = transformPathWithPaperTranslate(transformedLocal, s.x, s.y)
    if (!isValidPathData(transformedWorld)) return
    worldPaths.push(transformedWorld)
  }

  const pivotX = s.x
  const pivotY = s.y

  const worldPaths: string[] = []
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    if (!line.trim()) continue

    if (singleLineCurved && li === 0) {
      const lineCenterY = -totalH / 2 + li * lh
      const baselineY = finiteNumber(lineCenterY + yMiddleToBaselineFallback, 0)
      const anchor = s.textAlign ?? 'center'
      const adv = safeAdvanceWidth(font, line, fontSize)
      let lineStartX = 0
      if (anchor === 'center') lineStartX = -adv / 2
      else if (anchor === 'right') lineStartX = -adv
      lineStartX = finiteNumber(lineStartX, 0)

      let linePathData = glyphPathToData(font.getPath(line, lineStartX, baselineY, fontSize))
      if (linePathData && !isValidPathData(linePathData)) linePathData = ''

      if (!linePathData) {
        const parts: string[] = []
        try {
          font.forEachGlyph(
            line,
            lineStartX,
            baselineY,
            fontSize,
            { kerning: true },
            (glyph: any, gx: any, gy: any, glyphFontSize: any) => {
              if (!glyph) return
              const safeGx = finiteNumber(gx, lineStartX)
              const safeGy = finiteNumber(gy, baselineY)
              const safeFs = Math.max(1, finiteNumber(glyphFontSize, fontSize))
              const glyphPath = glyphPathToData(glyph.getPath(safeGx, safeGy, safeFs))
              if (glyphPath && isValidPathData(glyphPath)) parts.push(glyphPath)
            },
          )
        } catch {
          // Keep empty fallback behavior.
        }
        linePathData = parts.join(' ')
      }

      if (linePathData && isValidPathData(linePathData)) {
        const warpWidth = Number.isFinite(adv)
          ? Math.max(40, hw * 2, adv)
          : Math.max(40, hw * 2)
        const warpedPathData = warpArchPath(linePathData, curve / 100, warpWidth, fontSize)
        const finalPath = isValidPathData(warpedPathData) ? warpedPathData : linePathData
        pushLocalPath(finalPath)
      }
      continue
    }

    // Center y for this line (relative to shape center s.y)
    const lineCenterY = s.y - totalH / 2 + li * lh
    // Use em-square metric to derive baseline – this mirrors SVG dominant-baseline="middle"
    // which sets the middle of the em box at the element's y coordinate.  Per-glyph bbox
    // centering was tried but it drifts from SVG rendering and causes visual misalignment.
    const baselineY = finiteNumber(lineCenterY + yMiddleToBaselineFallback, s.y)

    // Match SVG text anchoring semantics so applied offsets stay centered with the source text.
    let lineStartX = s.x
    const anchor = s.textAlign ?? 'center'
    const adv = safeAdvanceWidth(font, line, fontSize)
    if (anchor === 'center') lineStartX = s.x - adv / 2
    else if (anchor === 'right') lineStartX = s.x - adv
    lineStartX = finiteNumber(lineStartX, s.x)

    const pushWorldPath = (pathData: string) => {
      if (!pathData || !isValidPathData(pathData)) return
      const transformed = transformPathWithPaper(pathData, sx, sy, s.rotation, pivotX, pivotY)
      if (!isValidPathData(transformed)) return
      worldPaths.push(transformed)
    }

    let glyphCount = 0
    try {
      font.forEachGlyph(
        line,
        lineStartX,
        baselineY,
        fontSize,
        { kerning: true },
        (glyph: any, gx: any, gy: any, glyphFontSize: any) => {
          if (!glyph) return
          const safeGx = finiteNumber(gx, lineStartX)
          const safeGy = finiteNumber(gy, baselineY)
          const safeFs = Math.max(1, finiteNumber(glyphFontSize, fontSize))
          const pathData = glyphPathToData(glyph.getPath(safeGx, safeGy, safeFs))
          if (!pathData || !isValidPathData(pathData)) return
          glyphCount += 1
          pushWorldPath(pathData)
        },
      )
    } catch {
      glyphCount = 0
    }

    // Some fonts fail in per-glyph iteration; keep whole-line fallback for resilience.
    if (glyphCount === 0) {
      const linePathData = glyphPathToData(font.getPath(line, lineStartX, baselineY, fontSize))
      if (linePathData && isValidPathData(linePathData)) pushWorldPath(linePathData)
    }
  }
  return worldPaths.length ? worldPaths : null
}

// Unite multiple world-space SVG paths using paper.js (preserves Bezier curves).
function paperUniteWorldPaths(pathStrings: string[]): string | null {
  if (!pathStrings.length) return null
  try {
    const scope = getPaperScope()
    let united: paper.PathItem = new scope.CompoundPath({ pathData: pathStrings[0], insert: false })
    for (let i = 1; i < pathStrings.length; i++) {
      const next = new scope.CompoundPath({ pathData: pathStrings[i], insert: false })
      const result = united.unite(next, { insert: false })
      united = result as paper.PathItem
    }
    const pd =
      united instanceof scope.CompoundPath || united instanceof scope.Path
        ? (united as paper.Path | paper.CompoundPath).pathData?.trim() ?? null
        : null
    return pd
  } catch {
    return null
  }
}

function paperOffsetWorldPath(pathData: string, distance: number, cornerStyle: 'round' | 'sharp'): string | null {
  if (!pathData || distance === 0) return null
  try {
    const scope = getPaperScope()
    const runOffset = (delta: number): string | null => {
      const source = new scope.CompoundPath({ pathData, insert: false })
      source.fillRule = 'evenodd'
      const offset = PaperOffset.offset(source, delta, {
        join: cornerStyle === 'round' ? 'round' : 'miter',
        insert: false,
        limit: 10,
      })
      const result =
        offset instanceof scope.CompoundPath || offset instanceof scope.Path
          ? (offset as paper.Path | paper.CompoundPath).pathData?.trim() ?? null
          : null
      source.remove()
      if (offset && typeof (offset as { remove?: () => void }).remove === 'function') {
        ;(offset as { remove: () => void }).remove()
      }
      return result
    }

    const primary = runOffset(distance)
    if (primary && prefersOutwardOffset(pathData, primary, distance)) return primary

    const flipped = runOffset(-distance)
    if (flipped && prefersOutwardOffset(pathData, flipped, distance)) return flipped

    return primary ?? flipped
  } catch {
    return null
  }
}

function transformPathWithPaper(pathData: string, sx: number, sy: number, rotation: number, pivotX: number, pivotY: number): string {
  if (!pathData) return ''
  try {
    const scope = getPaperScope()
    const shape = new scope.CompoundPath({ pathData, insert: false })
    const pivot = new scope.Point(pivotX, pivotY)
    if (Math.abs(sx - 1) > 0.0001 || Math.abs(sy - 1) > 0.0001) {
      shape.scale(sx, sy, pivot)
    }
    if (rotation !== 0) {
      shape.rotate(rotation, pivot)
    }
    const out = shape.pathData?.trim() ?? ''
    shape.remove()
    return out || pathData
  } catch {
    return pathData
  }
}

function transformPathWithPaperTranslate(pathData: string, tx: number, ty: number): string {
  if (!pathData) return ''
  try {
    const scope = getPaperScope()
    const shape = new scope.CompoundPath({ pathData, insert: false })
    if (tx !== 0 || ty !== 0) {
      shape.translate(new scope.Point(tx, ty))
    }
    const out = shape.pathData?.trim() ?? ''
    shape.remove()
    return out || pathData
  } catch {
    return pathData
  }
}

// Full async offset pipeline: opentype glyph paths → paper.js Bezier union → Clipper offset.
// Returns a WORLD-SPACE path string (centered relative to the artboard, suitable for storage
// with x=AB/2, y=AB/2 after shifting by -AB/2).
async function computeFullOffsetAsync(
  selectionSources: SvgShape[],
  distance: number,
  cornerStyle: 'round' | 'sharp',
  weldOffsets = true,
  forPreview = false,
): Promise<string | null> {
  if (!selectionSources.length || distance === 0) return null
  // Enforce Cricut's ±1.0 inch (100 px) constraint for stability
  const d = constrainOffsetDistance(distance)
  if (d === 0) return null
  
  const hasText = selectionSources.some(s => s.kind === 'text')

  // Step 1: gather world-space paths (async for text, sync for shapes)
  const worldPathArrays = await Promise.all(
    selectionSources.map(async s => {
      if (s.kind === 'text') {
        const glyphPaths = await textShapeToGlyphPathsAsync(s)
        // Preprocess glyph outlines for stable offsetting (Cricut's approach)
        return glyphPaths ? glyphPaths.map(p => preprocessGlyphPath(p)) : []
      }
      const lp = shapeToLocalPath(s)
      return lp ? [transformPathData(lp, s.x, s.y, s.rotation)] : []
    })
  )
  if (worldPathArrays.some(paths => paths === null)) return null
  const worldPaths = worldPathArrays.flatMap(paths => paths ?? []).filter(Boolean)
  if (!worldPaths.length) return null

  // Text glyph contours can have mixed winding directions in decorative fonts.
  // Yield to the event loop before the heavy synchronous Paper.js/Clipper work
  // so the UI thread stays responsive (avoids UI freeze on multi-layer offset).
  await new Promise<void>(resolve => setTimeout(resolve, 0))

  // For drip/graffiti fonts, offset-each-then-union is usually more stable than union-then-offset.
  // Even-odd fill preserves counters/holes with mixed winding directions.
  if (hasText) {
    const textSafeUnion = paperUniteWorldPaths(worldPaths) ?? computeClipperUnionWithFill(worldPaths, 'evenodd')
    if (textSafeUnion && weldOffsets) {
      // Keep disconnected islands unless geometry actually overlaps after offset.
      // Using the outer contour here can create accidental bridges in decorative fonts.
      const textWeldBase = textSafeUnion
      const textSafeOffset = computeClipperOffset(textWeldBase, d, cornerStyle, forPreview)
      if (textSafeOffset) return forPreview ? simplifyPathForPreview(textSafeOffset) : textSafeOffset
      const textSafePaperOffset = paperOffsetWorldPath(textWeldBase, d, cornerStyle)
      if (textSafePaperOffset) return forPreview ? simplifyPathForPreview(textSafePaperOffset) : textSafePaperOffset
      const textSafeDirect = computeClipperUnionThenOffset([textWeldBase], d, cornerStyle, 'evenodd')
      if (textSafeDirect) return forPreview ? simplifyPathForPreview(textSafeDirect) : textSafeDirect
    }

    const textOffsetThenUnion = computeClipperOffsetThenUnion(worldPaths, d, cornerStyle, 'evenodd', forPreview)
    if (textOffsetThenUnion) return forPreview ? simplifyPathForPreview(textOffsetThenUnion) : textOffsetThenUnion

    if (textSafeUnion) {
      const textSafeOffset = computeClipperOffset(textSafeUnion, d, cornerStyle, forPreview)
      if (textSafeOffset) return forPreview ? simplifyPathForPreview(textSafeOffset) : textSafeOffset
      const textSafePaperOffset = paperOffsetWorldPath(textSafeUnion, d, cornerStyle)
      if (textSafePaperOffset) return forPreview ? simplifyPathForPreview(textSafePaperOffset) : textSafePaperOffset
      const textSafeDirect = computeClipperUnionThenOffset(worldPaths, d, cornerStyle, 'evenodd')
      if (textSafeDirect) return forPreview ? simplifyPathForPreview(textSafeDirect) : textSafeDirect
    }
  }

  // Step 2: unite with paper.js (Bezier-preserving) or fall back to Clipper union
  const united = paperUniteWorldPaths(worldPaths) ?? computeClipperUnion(worldPaths)
  if (!united) return null

  // Step 3: Clipper offset on the united Bezier path (dense sampling = smooth result)
  const offsetPath = computeClipperOffset(united, d, cornerStyle, forPreview)
  if (offsetPath) return forPreview ? simplifyPathForPreview(offsetPath) : offsetPath

  // Fallback: use Paper curve offsetting for glyph-heavy paths when sampled Clipper expansion fails.
  const paperOffset = paperOffsetWorldPath(united, d, cornerStyle)
  if (paperOffset) return forPreview ? simplifyPathForPreview(paperOffset) : paperOffset

  // Fallback: offset directly from source world paths (avoids failing hard on edge-case geometry).
  const direct = computeClipperUnionThenOffset(worldPaths, d, cornerStyle, hasText ? 'evenodd' : 'nonzero')
  return direct ? (forPreview ? simplifyPathForPreview(direct) : direct) : null
}

const OFFSET_COMPUTE_TIMEOUT_MS = 10000
const OFFSET_PREVIEW_TIMEOUT_MS = 5000

class OffsetComputeTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Offset computation timed out after ${timeoutMs}ms`)
    this.name = 'OffsetComputeTimeoutError'
  }
}

function isOffsetComputeTimeoutError(error: unknown): boolean {
  return error instanceof OffsetComputeTimeoutError
}

async function computeFullOffsetWithTimeout(
  selectionSources: SvgShape[],
  distance: number,
  cornerStyle: 'round' | 'sharp',
  weldOffsets = true,
  forPreview = false,
  timeoutMs = OFFSET_COMPUTE_TIMEOUT_MS,
): Promise<string | null> {
  if (timeoutMs <= 0) {
    return computeFullOffsetAsync(selectionSources, distance, cornerStyle, weldOffsets, forPreview)
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new OffsetComputeTimeoutError(timeoutMs))
    }, timeoutMs)
  })

  try {
    return await Promise.race([
      computeFullOffsetAsync(selectionSources, distance, cornerStyle, weldOffsets, forPreview),
      timeoutPromise,
    ])
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
  }
}

function sanitizeOffsetPath(pathData: string, distance: number): string {
  if (!pathData) return pathData
  try {
    const scope = getPaperScope()
    const source = new scope.CompoundPath({ pathData, insert: false })
    const paths = source instanceof scope.CompoundPath ? source.children : [source]
    const areas = paths.map(p => Math.abs((p as paper.Path).area ?? 0))
    const largestArea = areas.length ? Math.max(...areas) : 0
    const minArea = Math.max(10, Math.abs(distance) * Math.abs(distance) * 0.35)
    const kept = paths
      .filter((_, idx) => {
        const area = areas[idx] ?? 0
        return area >= minArea || area === largestArea
      })
      .map(p => {
        const clone = (p as paper.Path).clone({ insert: false }) as paper.Path
        return clone
      })

    let result = ''
    if (kept.length === 1) {
      result = kept[0].pathData?.trim() ?? ''
    } else if (kept.length > 1) {
      const out = new scope.CompoundPath({ insert: false })
      for (const child of kept) out.addChild(child)
      result = out.pathData?.trim() ?? ''
      out.remove()
    }

    source.remove()
    return result || pathData
  } catch {
    return pathData
  }
}

function clampPopoverPosition(top: number, left: number, width = 336, height = 430) {
  if (typeof window === 'undefined') return { top, left }
  return {
    top: clamp(top, 8, Math.max(8, window.innerHeight - height - 8)),
    left: clamp(left, 8, Math.max(8, window.innerWidth - width - 8)),
  }
}

// ─── SVG import ───────────────────────────────────────────────────────────────


function parseSvgImport(svgText: string): SvgShape[] {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const svg = doc.querySelector('svg')
  if (!svg) return []
  const vb = svg.getAttribute('viewBox')
  const [vbX, vbY, vbW, vbH] = vb
    ? vb.split(/[\s,]+/).map(p => parseFloat(p))
    : [0, 0, pn(svg.getAttribute('width'), AB), pn(svg.getAttribute('height'), AB)]
  const sx = vbW > 0 ? AB / vbW : 1
  const sy = vbH > 0 ? AB / vbH : 1
  const tx = (v: number) => (v - vbX) * sx
  const ty = (v: number) => (v - vbY) * sy
  const df = { fill: '#ffffff', stroke: 'none', sw: 0 }
  const shapes: SvgShape[] = []
  svg.querySelectorAll('rect').forEach(n => {
    const x = pn(n.getAttribute('x')), y = pn(n.getAttribute('y'))
    const w = Math.max(MIN_SIZE, pn(n.getAttribute('width'), 140) * sx)
    const h = Math.max(MIN_SIZE, pn(n.getAttribute('height'), 90) * sy)
    const cr = pn(n.getAttribute('rx')) * sx
    shapes.push(normalizeShape({ ...defaultShape(cr > 0 ? 'roundedrect' : 'rect'), id: createId('rect'), x: tx(x + pn(n.getAttribute('width')) / 2), y: ty(y + pn(n.getAttribute('height')) / 2), width: w, height: h, cornerRadius: cr, rotation: prot(n.getAttribute('transform')), fill: n.getAttribute('fill') || df.fill, stroke: n.getAttribute('stroke') || df.stroke, strokeWidth: pn(n.getAttribute('stroke-width'), df.sw) }))
  })
  svg.querySelectorAll('circle').forEach(n => {
    const cx = pn(n.getAttribute('cx')), cy = pn(n.getAttribute('cy'))
    const r = Math.max(MIN_SIZE / 2, pn(n.getAttribute('r'), 60) * ((sx + sy) / 2))
    shapes.push(normalizeShape({ ...defaultShape('circle'), id: createId('circle'), x: tx(cx), y: ty(cy), radius: r, fill: n.getAttribute('fill') || df.fill, stroke: n.getAttribute('stroke') || df.stroke, strokeWidth: pn(n.getAttribute('stroke-width'), df.sw) }))
  })
  svg.querySelectorAll('ellipse').forEach(n => {
    const cx = pn(n.getAttribute('cx')), cy = pn(n.getAttribute('cy'))
    const w = Math.max(MIN_SIZE, pn(n.getAttribute('rx'), 80) * sx * 2)
    const h = Math.max(MIN_SIZE, pn(n.getAttribute('ry'), 50) * sy * 2)
    shapes.push(normalizeShape({ ...defaultShape('ellipse'), id: createId('ellipse'), x: tx(cx), y: ty(cy), width: w, height: h, fill: n.getAttribute('fill') || df.fill, stroke: n.getAttribute('stroke') || df.stroke, strokeWidth: pn(n.getAttribute('stroke-width'), df.sw) }))
  })
  svg.querySelectorAll('polygon').forEach(n => {
    const raw = n.getAttribute('points') || ''
    const nums = raw.trim().split(/[\s,]+/).map(p => parseFloat(p)).filter(v => isFinite(v))
    if (nums.length < 6) return
    const xs: number[] = [], ys: number[] = []
    for (let i = 0; i < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]) }
    shapes.push(normalizeShape({ ...defaultShape('triangle'), id: createId('triangle'), x: tx((Math.min(...xs) + Math.max(...xs)) / 2), y: ty((Math.min(...ys) + Math.max(...ys)) / 2), width: Math.max(MIN_SIZE, (Math.max(...xs) - Math.min(...xs)) * sx), height: Math.max(MIN_SIZE, (Math.max(...ys) - Math.min(...ys)) * sy), rotation: prot(n.getAttribute('transform')), fill: n.getAttribute('fill') || df.fill, stroke: n.getAttribute('stroke') || df.stroke, strokeWidth: pn(n.getAttribute('stroke-width'), df.sw) }))
  })
  svg.querySelectorAll('text').forEach(n => {
    const x = pn(n.getAttribute('x'), vbW / 2), y = pn(n.getAttribute('y'), vbH / 2)
    shapes.push(normalizeShape({ ...defaultShape('text'), id: createId('text'), x: tx(x), y: ty(y), rotation: prot(n.getAttribute('transform')), fill: n.getAttribute('fill') || df.fill, stroke: n.getAttribute('stroke') || '#000000', strokeWidth: pn(n.getAttribute('stroke-width'), 0), text: (n.textContent || 'LOGO').trim() || 'LOGO', fontSize: Math.max(8, pn(n.getAttribute('font-size'), 130) * sy), fontFamily: n.getAttribute('font-family') || DEFAULT_OFFSET_FONT_FAMILY }))
  })
  svg.querySelectorAll('image').forEach(n => {
    const href = n.getAttribute('href') || n.getAttribute('xlink:href') || ''
    if (!href.trim()) return
    const x = pn(n.getAttribute('x'))
    const y = pn(n.getAttribute('y'))
    const w = Math.max(MIN_SIZE, pn(n.getAttribute('width'), 220) * sx)
    const h = Math.max(MIN_SIZE, pn(n.getAttribute('height'), 160) * sy)
    shapes.push(normalizeShape({
      ...defaultShape('image'),
      id: createId('image'),
      name: 'Image',
      x: tx(x + pn(n.getAttribute('width'), 220) / 2),
      y: ty(y + pn(n.getAttribute('height'), 160) / 2),
      width: w,
      height: h,
      rotation: prot(n.getAttribute('transform')),
      imageHref: href,
      fill: 'none',
      stroke: 'none',
      strokeWidth: 0,
    }))
  })
  return shapes
}

// ─── Selection handles ────────────────────────────────────────────────────────

function SelectionHandles({ shape, onStartResize }: {
  shape: SvgShape
  onStartResize: (e: React.PointerEvent, id: string, h: ResizeHandle) => void
}) {
  const fmtInches = (v: number) => `${(v / 100).toFixed(2)} in`
  const measureTag = (boxW: number, boxH: number, cx: number, topY: number) => {
    const txt = `${fmtInches(boxW)} x ${fmtInches(boxH)}`
    const tagW = Math.max(136, txt.length * 6.7 + 22)
    const tagH = 24
    return (
      <g transform={`translate(${cx} ${topY - 28})`} pointerEvents="none">
        <rect
          x={-tagW / 2}
          y={-tagH}
          width={tagW}
          height={tagH}
          rx={7}
          fill="#4f5a63"
          opacity={0.96}
        />
        <text
          x={0}
          y={-8}
          fill="#ffffff"
          fontSize={12}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontWeight: 700 }}
        >
          {txt}
        </text>
      </g>
    )
  }

  if (shape.kind === 'circle' || shape.kind === 'ring') {
    const boxSize = (shape.radius + 8) * 2
    return (
      <>
        <circle cx={shape.x} cy={shape.y} r={shape.radius + 8} fill="none" stroke={SELECTION_LINE_COLOR} strokeWidth={2} pointerEvents="none" />
        {measureTag(boxSize, boxSize, shape.x, shape.y - (shape.radius + 8))}
        <circle cx={shape.x + shape.radius + 14} cy={shape.y} r={10} className="svg-maker-handle" onPointerDown={e => { e.stopPropagation(); onStartResize(e, shape.id, 'radius') }} />
      </>
    )
  }
  if (shape.kind === 'text') {
    const hw = shape.width / 2 + 8
    const hh = shape.height / 2 + 8
    const boxW = shape.width + 16
    const boxH = shape.height + 16
    return (
      <g transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}>
        <rect x={-hw} y={-hh} width={boxW} height={boxH} fill="none" stroke={SELECTION_LINE_COLOR} strokeWidth={2} pointerEvents="none" />
        {measureTag(boxW, boxH, 0, -hh)}
        <circle cx={-hw} cy={-hh} r={8} className="svg-maker-handle" style={{ cursor: 'nwse-resize' }} onPointerDown={e => { e.stopPropagation(); onStartResize(e, shape.id, 'nw') }} />
        <circle cx={0} cy={-hh} r={7} className="svg-maker-handle" style={{ cursor: 'ns-resize' }} onPointerDown={e => { e.stopPropagation(); onStartResize(e, shape.id, 'n') }} />
        <circle cx={hw} cy={-hh} r={8} className="svg-maker-handle" style={{ cursor: 'nesw-resize' }} onPointerDown={e => { e.stopPropagation(); onStartResize(e, shape.id, 'ne') }} />
        <circle cx={hw} cy={0} r={7} className="svg-maker-handle" style={{ cursor: 'ew-resize' }} onPointerDown={e => { e.stopPropagation(); onStartResize(e, shape.id, 'e') }} />
        <circle cx={hw} cy={hh} r={8} className="svg-maker-handle" style={{ cursor: 'nwse-resize' }} onPointerDown={e => { e.stopPropagation(); onStartResize(e, shape.id, 'se') }} />
        <circle cx={0} cy={hh} r={7} className="svg-maker-handle" style={{ cursor: 'ns-resize' }} onPointerDown={e => { e.stopPropagation(); onStartResize(e, shape.id, 's') }} />
        <circle cx={-hw} cy={hh} r={8} className="svg-maker-handle" style={{ cursor: 'nesw-resize' }} onPointerDown={e => { e.stopPropagation(); onStartResize(e, shape.id, 'sw') }} />
        <circle cx={-hw} cy={0} r={7} className="svg-maker-handle" style={{ cursor: 'ew-resize' }} onPointerDown={e => { e.stopPropagation(); onStartResize(e, shape.id, 'w') }} />
      </g>
    )
  }
  const hw = shape.width / 2 + 8, hh = shape.height / 2 + 8
  return (
    <g transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}>
      <rect x={-hw} y={-hh} width={shape.width + 16} height={shape.height + 16} fill="none" stroke={SELECTION_LINE_COLOR} strokeWidth={2} pointerEvents="none" />
      {measureTag(shape.width + 16, shape.height + 16, 0, -hh)}
      <circle cx={-hw} cy={-hh} r={8} className="svg-maker-handle" style={{ cursor: 'nwse-resize' }} onPointerDown={e => { e.stopPropagation(); onStartResize(e, shape.id, 'nw') }} />
      <circle cx={0} cy={-hh} r={7} className="svg-maker-handle" style={{ cursor: 'ns-resize' }} onPointerDown={e => { e.stopPropagation(); onStartResize(e, shape.id, 'n') }} />
      <circle cx={hw} cy={-hh} r={8} className="svg-maker-handle" style={{ cursor: 'nesw-resize' }} onPointerDown={e => { e.stopPropagation(); onStartResize(e, shape.id, 'ne') }} />
      <circle cx={hw} cy={0} r={7} className="svg-maker-handle" style={{ cursor: 'ew-resize' }} onPointerDown={e => { e.stopPropagation(); onStartResize(e, shape.id, 'e') }} />
      <circle cx={hw} cy={hh} r={8} className="svg-maker-handle" style={{ cursor: 'nwse-resize' }} onPointerDown={e => { e.stopPropagation(); onStartResize(e, shape.id, 'se') }} />
      <circle cx={0} cy={hh} r={7} className="svg-maker-handle" style={{ cursor: 'ns-resize' }} onPointerDown={e => { e.stopPropagation(); onStartResize(e, shape.id, 's') }} />
      <circle cx={-hw} cy={hh} r={8} className="svg-maker-handle" style={{ cursor: 'nesw-resize' }} onPointerDown={e => { e.stopPropagation(); onStartResize(e, shape.id, 'sw') }} />
      <circle cx={-hw} cy={0} r={7} className="svg-maker-handle" style={{ cursor: 'ew-resize' }} onPointerDown={e => { e.stopPropagation(); onStartResize(e, shape.id, 'w') }} />
    </g>
  )
}

function SelectionOutline({ shape }: { shape: SvgShape }) {
  if (shape.kind === 'circle' || shape.kind === 'ring') {
    return <circle cx={shape.x} cy={shape.y} r={shape.radius + 6} fill="none" stroke={SELECTION_LINE_COLOR} strokeDasharray="6 4" strokeWidth={1.5} pointerEvents="none" />
  }
  if (shape.kind === 'text') {
    const hw = shape.width / 2 + 6
    const hh = shape.height / 2 + 6
    return (
      <g transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}>
        <rect x={-hw} y={-hh} width={shape.width + 12} height={shape.height + 12} fill="none" stroke={SELECTION_LINE_COLOR} strokeDasharray="6 4" strokeWidth={1.5} pointerEvents="none" />
      </g>
    )
  }
  const hw = shape.width / 2 + 6, hh = shape.height / 2 + 6
  return (
    <g transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}>
      <rect x={-hw} y={-hh} width={shape.width + 12} height={shape.height + 12} fill="none" stroke={SELECTION_LINE_COLOR} strokeDasharray="6 4" strokeWidth={1.5} pointerEvents="none" />
    </g>
  )
}

// ─── ShapeEl ──────────────────────────────────────────────────────────────────

type ShapeElProps = {
  shape: SvgShape
  active: boolean
  inSelection: boolean
  onSelect: (e: React.PointerEvent) => void
  onStartMove: (e: React.PointerEvent, id: string) => void
  onStartResize: (e: React.PointerEvent, id: string, h: ResizeHandle) => void
  onInlineEdit?: (id: string) => void
}

function ShapeEl({ shape, active, inSelection, onSelect, onStartMove, onStartResize, onInlineEdit }: ShapeElProps) {
  if (!shape.visible) return null
  const { fill, stroke, strokeWidth: sw, opacity } = shape
  const down = (e: React.PointerEvent) => {
    e.stopPropagation()
    onSelect(e)
    if (!shape.locked) onStartMove(e, shape.id)
  }
  const cp: React.SVGAttributes<SVGElement> = {
    fill,
    stroke,
    strokeWidth: sw,
    strokeLinejoin: shape.strokeLinejoin,
    strokeLinecap: 'round',
    opacity,
    onPointerDown: down,
    style: { cursor: 'pointer' },
  }

  let el: React.ReactNode = null
  switch (shape.kind) {
    case 'circle':
      el = <circle cx={shape.x} cy={shape.y} r={shape.radius} {...cp} />
      break
    case 'ellipse':
      el = <g transform={`rotate(${shape.rotation} ${shape.x} ${shape.y})`}><ellipse cx={shape.x} cy={shape.y} rx={shape.width / 2} ry={shape.height / 2} {...cp} /></g>
      break
    case 'triangle': {
      const pts = `${-shape.width / 2},${shape.height / 2} 0,${-shape.height / 2} ${shape.width / 2},${shape.height / 2}`
      el = <g transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}><polygon points={pts} {...cp} /></g>
      break
    }
    case 'star': {
      const o = Math.min(shape.width, shape.height) / 2
      el = <g transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}><polygon points={starPts(o, o * shape.innerRatio, shape.starPoints)} {...cp} /></g>
      break
    }
    case 'polygon':
      el = <g transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}><polygon points={polyPts(Math.min(shape.width, shape.height) / 2, shape.starPoints)} {...cp} /></g>
      break
    case 'arrow':
      el = <g transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}><polygon points={arrowPts(shape.width, shape.height)} {...cp} /></g>
      break
    case 'chevron':
      el = <g transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}><polygon points={chevronPts(shape.width, shape.height)} {...cp} /></g>
      break
    case 'cross':
      el = <g transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}><polygon points={crossPts(shape.width, shape.height)} {...cp} /></g>
      break
    case 'diamond':
      el = <g transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}><polygon points={diamondPts(shape.width, shape.height)} {...cp} /></g>
      break
    case 'heart':
      el = <g transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}><path d={heartPath(shape.width, shape.height)} {...cp} /></g>
      break
    case 'ring':
      el = <g transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}>
        <path d={ringPath(shape.radius, shape.innerRatio)} fill={fill} stroke={stroke} strokeWidth={sw} opacity={opacity} fillRule="evenodd" onPointerDown={down} style={{ cursor: 'pointer' }} />
      </g>
      break
    case 'roundedrect': {
      const r = Math.min(shape.cornerRadius, shape.width / 2, shape.height / 2)
      el = <g transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}><rect x={-shape.width / 2} y={-shape.height / 2} width={shape.width} height={shape.height} rx={r} {...cp} /></g>
      break
    }
    case 'line':
      el = <g transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}>
        <line x1={-shape.width / 2} y1={0} x2={shape.width / 2} y2={0} stroke="transparent" strokeWidth={Math.max(16, sw)} onPointerDown={down} style={{ cursor: 'pointer' }} />
        <line x1={-shape.width / 2} y1={0} x2={shape.width / 2} y2={0} stroke={stroke} strokeWidth={sw} strokeLinecap="round" opacity={opacity} pointerEvents="none" />
      </g>
      break
    case 'path':
      {
        const d = visiblePathData(shape.pathData, shape.hiddenContours)
        if (!d) return null
        el = <g transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}><path d={d} {...cp} fillRule="evenodd" /></g>
      }
      break
    case 'image':
      el = (
        <g transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`} opacity={opacity}>
          <image
            href={shape.imageHref}
            x={-shape.width / 2}
            y={-shape.height / 2}
            width={shape.width}
            height={shape.height}
            preserveAspectRatio="none"
            onPointerDown={down}
            style={{ cursor: 'pointer' }}
          />
        </g>
      )
      break
    case 'text': {
      const anchor = ({ left: 'start', center: 'middle', right: 'end' } as const)[shape.textAlign ?? 'center']
      const align = shape.textAlign ?? 'center'
      const fStyle: React.CSSProperties = {
        fontFamily: shape.fontFamily || DEFAULT_OFFSET_FONT_FAMILY,
        fontWeight: shape.fontWeight ?? 'normal',
        fontStyle: shape.fontStyle ?? 'normal',
        cursor: 'pointer',
      }
      const lines = (shape.text || '').split('\n')
      const lh = shape.fontSize * 1.25
      const totalH = (lines.length - 1) * lh
      const curve = clamp(shape.textCurve ?? 0, -100, 100)
      const { sx, sy, hw } = getTextScale(shape)
      const textTransform = `translate(${shape.x} ${shape.y}) rotate(${shape.rotation}) scale(${sx} ${sy})`
      if (lines.length === 1 && Math.abs(curve) > 0.001) {
        const curvePathId = `curve-${shape.id}`
        el = (
          <g transform={textTransform}>
            <defs>
              <path id={curvePathId} d={curvedTextPathData(hw * 2, curve)} />
            </defs>
            <text
              fill={fill}
              stroke={stroke}
              strokeWidth={sw}
              strokeLinejoin={shape.strokeLinejoin}
              strokeLinecap="round"
              paintOrder="stroke fill"
              fontSize={shape.fontSize}
              opacity={opacity}
              textAnchor={anchor}
              dominantBaseline="middle"
              onPointerDown={down}
              onDoubleClick={e => { e.stopPropagation(); if (!shape.locked) onInlineEdit?.(shape.id) }}
              style={fStyle}>
              <textPath href={`#${curvePathId}`} startOffset={textCurveStartOffset(align)}>{shape.text}</textPath>
            </text>
          </g>
        )
        break
      }
      el = lines.length === 1
        ? <g transform={textTransform}><text x={0} y={0} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin={shape.strokeLinejoin} strokeLinecap="round" paintOrder="stroke fill" fontSize={shape.fontSize} opacity={opacity} textAnchor={anchor} dominantBaseline="middle" onPointerDown={down} onDoubleClick={e => { e.stopPropagation(); if (!shape.locked) onInlineEdit?.(shape.id) }} style={fStyle}>{shape.text}</text></g>
        : <g transform={textTransform}><text x={0} y={-totalH / 2} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin={shape.strokeLinejoin} strokeLinecap="round" paintOrder="stroke fill" fontSize={shape.fontSize} opacity={opacity} textAnchor={anchor} dominantBaseline="middle" onPointerDown={down} onDoubleClick={e => { e.stopPropagation(); if (!shape.locked) onInlineEdit?.(shape.id) }} style={fStyle}>
            {lines.map((l, i) => <tspan key={i} x={0} dy={i === 0 ? 0 : lh}>{l}</tspan>)}
          </text></g>
      break
    }
    default:
      el = <g transform={`translate(${shape.x} ${shape.y}) rotate(${shape.rotation})`}><rect x={-shape.width / 2} y={-shape.height / 2} width={shape.width} height={shape.height} {...cp} /></g>
  }

  return (
    <g>
      {el}
      {active && !shape.locked && <SelectionHandles shape={shape} onStartResize={onStartResize} />}
      {!active && inSelection && !shape.locked && <SelectionOutline shape={shape} />}
    </g>
  )
}

// ─── Group header row ─────────────────────────────────────────────────────────

type SvgGroupHeaderRowProps = {
  groupId: string
  name: string
  collapsed: boolean
  onToggleCollapse: () => void
  onRename: (name: string) => void
  onUngroup: () => void
}

function SvgGroupHeaderRow({ name, collapsed, onToggleCollapse, onRename, onUngroup }: SvgGroupHeaderRowProps) {
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)
  function startRename(e: React.MouseEvent) { e.stopPropagation(); setRenameVal(name); setRenaming(true); setTimeout(() => inputRef.current?.select(), 0) }
  function commit() { if (renameVal.trim()) onRename(renameVal.trim()); setRenaming(false) }
  return (
    <div className="svg-layer-group-header" onClick={onToggleCollapse}>
      <button type="button" className="svg-layer-group-collapse" onClick={e => { e.stopPropagation(); onToggleCollapse() }} title={collapsed ? 'Expand group' : 'Collapse group'}>
        {collapsed ? '▶' : '▼'}
      </button>
      <svg className="svg-layer-group-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16" aria-hidden>
        <rect x="2" y="6" width="16" height="12" rx="2" />
        <path d="M2 8h16M6 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      </svg>
      <div className="svg-layer-info" style={{ flex: 1, minWidth: 0 }}>
        {renaming
          ? <input ref={inputRef} className="svg-layer-rename-input" value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setRenaming(false) }}
              onClick={e => e.stopPropagation()} />
          : <span className="svg-layer-name" onDoubleClick={startRename} title="Double-click to rename">{name}</span>}
        <span className="svg-layer-kind">group</span>
      </div>
      <button type="button" className="svg-layer-icon-btn" title="Ungroup" onClick={e => { e.stopPropagation(); onUngroup() }}>⊠</button>
    </div>
  )
}

// ─── Layer row ────────────────────────────────────────────────────────────────

type SvgLayerRowProps = {
  shape: SvgShape; selected: boolean; dragOver: boolean
  onSelect: (e: React.MouseEvent) => void; onToggleVisible: () => void; onToggleLocked: () => void
  onDelete: () => void; onRename: (name: string) => void
  onDragStart: () => void; onDragOver: (e: React.DragEvent) => void
  onDrop: () => void; onDragEnd: () => void
  kindSuffix?: string
}

function LayerPreviewGlyph({ shape }: { shape: SvgShape }) {
  if (shape.kind === 'text') {
    const txt = (shape.text || 'Text').replace(/\s+/g, ' ').trim() || 'Text'
    return (
      <div className={`svg-layer-preview${shape.isOffsetLayer ? ' offset' : ''}`}>
        <span
          className="svg-layer-preview-text"
          style={{
            fontFamily: shape.fontFamily || DEFAULT_OFFSET_FONT_FAMILY,
            fontWeight: shape.fontWeight,
            fontStyle: shape.fontStyle,
          }}>
          {txt.slice(0, 5)}
        </span>
        {shape.isOffsetLayer && <span className="svg-layer-preview-badge">O</span>}
      </div>
    )
  }

  const glyph = shape.kind === 'circle' || shape.kind === 'ring' ? '◯'
    : shape.kind === 'rect' || shape.kind === 'roundedrect' ? '▭'
    : shape.kind === 'triangle' ? '△'
    : shape.kind === 'diamond' ? '◇'
    : shape.kind === 'star' ? '★'
    : shape.kind === 'ellipse' ? '⬭'
    : shape.kind === 'line' ? '╱'
    : shape.kind === 'path' ? '✎'
    : '⬡'

  return (
    <div className={`svg-layer-preview${shape.isOffsetLayer ? ' offset' : ''}`}>
      <span className="svg-layer-preview-glyph">{glyph}</span>
      {shape.isOffsetLayer && <span className="svg-layer-preview-badge">O</span>}
    </div>
  )
}

function SvgLayerRow({ shape, selected, dragOver, onSelect, onToggleVisible, onToggleLocked, onDelete, onRename, onDragStart, onDragOver, onDrop, onDragEnd, kindSuffix = '' }: SvgLayerRowProps) {
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState(shape.name)
  const inputRef = useRef<HTMLInputElement>(null)
  function startRename(e: React.MouseEvent) { e.stopPropagation(); setRenameVal(shape.name); setRenaming(true); setTimeout(() => inputRef.current?.select(), 0) }
  function commit() { if (renameVal.trim()) onRename(renameVal.trim()); setRenaming(false) }
  const swatchColor = shape.kind === 'line' ? shape.stroke : shape.fill
  const textPreview = shape.kind === 'text'
    ? ((shape.text || '').replace(/\s+/g, ' ').trim() || 'Text')
    : ''
  const offsetSummary = shape.isOffsetLayer
    ? `Offset ${formatOffsetDistanceLabel(shape.offsetDistance)}`
    : null
  const rowNeedsRoom = shape.isOffsetLayer || shape.kind === 'text' || shape.name.length > 22 || textPreview.length > 14
  return (
    <div className={['svg-layer-row', rowNeedsRoom && 'roomy', selected && 'selected', dragOver && 'drag-over', !shape.visible && 'hidden', shape.locked && 'locked'].filter(Boolean).join(' ')}
      draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd} onClick={onSelect}>
      <span className="svg-layer-drag-handle" title="Drag to reorder">⠿</span>
      <div className="svg-layer-swatch-wrap">
        <span className="svg-layer-swatch" style={{ background: swatchColor }} />
        <LayerPreviewGlyph shape={shape} />
      </div>
      <div className="svg-layer-info">
        {renaming
          ? <input ref={inputRef} className="svg-layer-rename-input" value={renameVal} onChange={e => setRenameVal(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setRenaming(false) }} onClick={e => e.stopPropagation()} />
          : <span className="svg-layer-name" onDoubleClick={startRename} title="Double-click to rename">{shape.name}</span>}
        <span className="svg-layer-kind">{shape.kind}{shape.kind === 'text' ? ` "${shape.text.slice(0, 10)}"` : ''}{kindSuffix}</span>
        {shape.kind === 'text' && (
          <span
            className="svg-layer-text-preview"
            style={{
              fontFamily: shape.fontFamily || DEFAULT_OFFSET_FONT_FAMILY,
              fontWeight: shape.fontWeight,
              fontStyle: shape.fontStyle,
            }}>
            {textPreview}
          </span>
        )}
        {shape.isOffsetLayer && <span className="svg-layer-offset-preview">{offsetSummary}</span>}
      </div>
      <button type="button" className="svg-layer-icon-btn" title={shape.visible ? 'Hide' : 'Show'} onClick={e => { e.stopPropagation(); onToggleVisible() }}>{shape.visible ? '👁' : '🚫'}</button>
      <button type="button" className="svg-layer-icon-btn" title={shape.locked ? 'Unlock' : 'Lock'} onClick={e => { e.stopPropagation(); onToggleLocked() }}>{shape.locked ? '🔒' : '🔓'}</button>
      <button type="button" className="svg-layer-icon-btn danger" title="Delete" onClick={e => { e.stopPropagation(); onDelete() }}>✕</button>
    </div>
  )
}

// ─── Shape picker data ────────────────────────────────────────────────────────

type PickerKind = Exclude<SvgShapeKind, 'image'>

const SHAPE_ICONS: Record<PickerKind, React.ReactNode> = {
  rect: <svg viewBox="0 0 32 32" aria-hidden><rect x="4" y="8" width="24" height="16" fill="currentColor" /></svg>,
  roundedrect: <svg viewBox="0 0 32 32" aria-hidden><rect x="4" y="8" width="24" height="16" rx="5" fill="currentColor" /></svg>,
  circle: <svg viewBox="0 0 32 32" aria-hidden><circle cx="16" cy="16" r="11" fill="currentColor" /></svg>,
  ellipse: <svg viewBox="0 0 32 32" aria-hidden><ellipse cx="16" cy="16" rx="13" ry="8" fill="currentColor" /></svg>,
  triangle: <svg viewBox="0 0 32 32" aria-hidden><polygon points="16,4 28,28 4,28" fill="currentColor" /></svg>,
  diamond: <svg viewBox="0 0 32 32" aria-hidden><polygon points="16,3 29,16 16,29 3,16" fill="currentColor" /></svg>,
  polygon: <svg viewBox="0 0 32 32" aria-hidden><polygon points="16,3 27,9.5 27,22.5 16,29 5,22.5 5,9.5" fill="currentColor" /></svg>,
  star: <svg viewBox="0 0 32 32" aria-hidden><polygon points="16,2 19.5,12 30,12 21.5,18.5 24.5,29 16,23 7.5,29 10.5,18.5 2,12 12.5,12" fill="currentColor" /></svg>,
  cross: <svg viewBox="0 0 32 32" aria-hidden><polygon points="12,4 20,4 20,12 28,12 28,20 20,20 20,28 12,28 12,20 4,20 4,12 12,12" fill="currentColor" /></svg>,
  chevron: <svg viewBox="0 0 32 32" aria-hidden><polygon points="4,4 22,4 28,16 22,28 4,28 10,16" fill="currentColor" /></svg>,
  heart: <svg viewBox="0 0 32 32" aria-hidden><path d="M16,28C16,28 3,18 3,10.5C3,7 6,4 9.5,4C12,4 14.5,5.5 16,8C17.5,5.5 20,4 22.5,4C26,4 29,7 29,10.5C29,18 16,28 16,28Z" fill="currentColor" /></svg>,
  ring: <svg viewBox="0 0 32 32" aria-hidden><circle cx="16" cy="16" r="12" fill="currentColor" /><circle cx="16" cy="16" r="6" fill="#111" /></svg>,
  arrow: <svg viewBox="0 0 32 32" aria-hidden><polygon points="2,12 20,12 20,6 30,16 20,26 20,20 2,20" fill="currentColor" /></svg>,
  line: <svg viewBox="0 0 32 32" aria-hidden><line x1="3" y1="16" x2="29" y2="16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>,
  path: <svg viewBox="0 0 32 32" aria-hidden><path d="M4,26C4,14 12,4 20,10C28,16 22,28 14,22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>,
  text: <svg viewBox="0 0 32 32" aria-hidden><text x="16" y="23" textAnchor="middle" fontSize="20" fontWeight="bold" fill="currentColor">T</text></svg>,
}

const SHAPE_LABELS: Record<PickerKind, string> = {
  rect: 'Rect', roundedrect: 'Round', circle: 'Circle', ellipse: 'Ellipse',
  triangle: 'Tri', diamond: 'Diamond', polygon: 'Polygon', star: 'Star',
  cross: 'Cross', chevron: 'Chevron', heart: 'Heart', ring: 'Ring',
  arrow: 'Arrow', line: 'Line', path: 'Pen', text: 'Text',
}

const ALL_KINDS = Object.keys(SHAPE_LABELS) as PickerKind[]

// ─── Main Component ───────────────────────────────────────────────────────────

export function SvgMakerPage({ onClose, onSave, saveRef, undoRef, redoRef, exportRef }: SvgMakerPageProps) {
  const [name, setName] = useState('My Logo')
  const [shapes, setShapes] = useState<SvgShape[]>([])
  const [selectionSet, setSelectionSet] = useState<string[]>([])
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [snapRotation, setSnapRotation] = useState(true)
  const [importError, setImportError] = useState<string | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [marqueeState, setMarqueeState] = useState<MarqueeState | null>(null)
  const [drawState, setDrawState] = useState<DrawState | null>(null)
  const [pathAnchorDragState, setPathAnchorDragState] = useState<PathAnchorDragState | null>(null)
  const [penMode, setPenMode] = useState(false)
  const [fonts, setFonts] = useState<FontManifestItem[]>([])
  const [, setFontPreviewLoadTick] = useState(0)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [layerDragFrom, setLayerDragFrom] = useState<number | null>(null)
  const [layerDragOver, setLayerDragOver] = useState<number | null>(null)
  const [offsetAmt, setOffsetAmt] = useState(0)
  const [offsetCorner, setOffsetCorner] = useState<'round' | 'sharp'>('round')
  const [weldOffsets, setWeldOffsets] = useState(true)
  const [offsetPopoverOpen, setOffsetPopoverOpen] = useState(false)
  const [offsetDraftAmt, setOffsetDraftAmt] = useState(0)
  const [offsetPreviewScrubbing, setOffsetPreviewScrubbing] = useState(false)
  const [offsetDraftCorner, setOffsetDraftCorner] = useState<'round' | 'sharp'>('round')
  const [offsetDraftWeld, setOffsetDraftWeld] = useState(true)
  const [shadowDirectionDeg, setShadowDirectionDeg] = useState(45)
  const [contourEditorOpen, setContourEditorOpen] = useState(false)
  const [contourShapeId, setContourShapeId] = useState<string | null>(null)
  const [offsetApplying, setOffsetApplying] = useState(false)
  const [offsetPreviewPath, setOffsetPreviewPath] = useState<string | null>(null)
  const [offsetPreviewTransform, setOffsetPreviewTransform] = useState<string | null>(null)
  const [offsetPreviewText, setOffsetPreviewText] = useState<SvgShape | null>(null)
    const [warpPreviewPath, setWarpPreviewPath] = useState<string | null>(null)
  const [combineMenuOpen, setCombineMenuOpen] = useState(false)
  const [booleanApplying, setBooleanApplying] = useState(false)
  const [effectsMenuOpen, setEffectsMenuOpen] = useState(false)
  const [topCombineMenuOpen, setTopCombineMenuOpen] = useState(false)
  const [effectsMenuPos, setEffectsMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const [topCombineMenuPos, setTopCombineMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const [, forceUpdate] = useState(0)
  const [activePanel, setActivePanel] = useState<'shapes' | 'text' | 'images' | 'operations' | 'scale' | null>(null)
  const [layersPanelCollapsed, setLayersPanelCollapsed] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'warning' } | null>(null)

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const showToast = (message: string, type: 'error' | 'success' | 'warning' = 'error') => {
    setToast({ message, type })
  }

  const setOffsetDraftAmtPrecise = useCallback((value: number) => {
    setOffsetDraftAmt(normalizeOffsetDistance(value))
  }, [])

  // Inject toast animation styles once on mount
  useEffect(() => {
    if (!document.getElementById('svg-maker-animations')) {
      const style = document.createElement('style')
      style.id = 'svg-maker-animations'
      style.textContent = `
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `
      document.head.appendChild(style)
    }
  }, [])

  const historyPast = useRef<SvgShape[][]>([])
  const historyFuture = useRef<SvgShape[][]>([])
  const clipboardRef = useRef<SvgShape[]>([])
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const artboardWrapRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const offsetBtnRef = useRef<HTMLButtonElement | null>(null)
  const topEffectsBtnRef = useRef<HTMLButtonElement | null>(null)
  const topCombineBtnRef = useRef<HTMLButtonElement | null>(null)
  const topEffectsMenuPortalRef = useRef<HTMLDivElement | null>(null)
  const topCombineMenuPortalRef = useRef<HTMLDivElement | null>(null)
  const offsetPopoverPortalRef = useRef<HTMLDivElement | null>(null)
  const offsetPopoverDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originTop: number
    originLeft: number
  } | null>(null)
  const offsetPreviewJobSeqRef = useRef(0)
  const offsetPreviewInFlightRef = useRef(false)
  const offsetPreviewScrubTimerRef = useRef<number | null>(null)
  const offsetPreviewPendingRef = useRef<{
    previewSources: SvgShape[]
    distance: number
    corner: 'round' | 'sharp'
    weld: boolean
    fastPreview: boolean
  } | null>(null)
  const [offsetPopoverPos, setOffsetPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const shadowPopoverPortalRef = useRef<HTMLDivElement | null>(null)
  const [shadowPopoverOpen, setShadowPopoverOpen] = useState(false)
  const [shadowPopoverPos, setShadowPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const curvePopoverPortalRef = useRef<HTMLDivElement | null>(null)
  const [curvePopoverOpen, setCurvePopoverOpen] = useState(false)
  const [curvePopoverPos, setCurvePopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const warpBtnRef = useRef<HTMLButtonElement | null>(null)
  const warpPopoverPortalRef = useRef<HTMLDivElement | null>(null)
  const [warpPopoverOpen, setWarpPopoverOpen] = useState(false)
  const [warpPopoverPos, setWarpPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const [warpAmount, setWarpAmount] = useState(30)
  const [warpApplying, setWarpApplying] = useState(false)
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set())
  const [groupNames, setGroupNames] = useState<Record<string, string>>({})
  
  // Pro features: Gradients, stroke patterns, guides, print settings
  const [gradientEditorOpen, setGradientEditorOpen] = useState(false)
  const [gradientEditorTarget, setGradientEditorTarget] = useState<'fill' | 'stroke'>('fill')
  const [showGuides, setShowGuides] = useState(true)
  const [showRulers, setShowRulers] = useState(true)
  const [showCarScale, setShowCarScale] = useState(false)
  const [printExportOpen, setPrintExportOpen] = useState(false)
  const [printExporting, setPrintExporting] = useState(false)
  const [printExportStatus, setPrintExportStatus] = useState('')
  const [saveFormat, setSaveFormat] = useState<'svg' | 'png'>('svg')
  const [printSettings, setPrintSettings] = useState<PrintExportSettings>({
    colorSpace: 'RGB',
    dpi: 300,
    includeBleed: false,
    bleedSize: 18,
    format: 'SVG',
    quality: 'high'
  })
  const [pathEditMode, setPathEditMode] = useState(false)
  const [selectedAnchor, setSelectedAnchor] = useState<{ shapeId: string; pointIndex: number } | null>(null)
  const selectedId = selectionSet[selectionSet.length - 1] ?? null
  const selected = useMemo(() => shapes.find(s => s.id === selectedId) ?? null, [shapes, selectedId])
  const offsetTargetShapes = useMemo(() => {
    const resolved: SvgShape[] = []
    const seen = new Set<string>()
    for (const id of selectionSet) {
      const shape = shapes.find(s => s.id === id)
      if (!shape) continue
      const target = shape.isOffsetLayer && shape.offsetSourceId
        ? shapes.find(s => s.id === shape.offsetSourceId) ?? shape
        : shape
      if (seen.has(target.id)) continue
      seen.add(target.id)
      resolved.push(target)
    }
    return resolved
  }, [selectionSet, shapes])
  const offsetTargetLabel = offsetTargetShapes.length > 1
    ? `${offsetTargetShapes.length} selected`
    : offsetTargetShapes[0]?.kind ?? selected?.kind
  const selectionBounds = useMemo(() => {
    const selectedShapes = offsetTargetShapes
    if (!selectedShapes.length) return null

    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (const shape of selectedShapes) {
      const halfWidth = shape.kind === 'circle' || shape.kind === 'ring' ? shape.radius : shape.width / 2
      const halfHeight = shape.kind === 'circle' || shape.kind === 'ring' ? shape.radius : shape.height / 2
      minX = Math.min(minX, shape.x - halfWidth)
      minY = Math.min(minY, shape.y - halfHeight)
      maxX = Math.max(maxX, shape.x + halfWidth)
      maxY = Math.max(maxY, shape.y + halfHeight)
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return null
    }

    return {
      x: minX,
      y: minY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
    }
  }, [offsetTargetShapes])
  const editablePathAnchors = useMemo(
    () => (pathEditMode && selected?.kind === 'path' ? pathAnchorPoints(selected) : []),
    [pathEditMode, selected],
  )
  const carScaleXTicks = useMemo(() => {
    const step = 50
    const ticks: number[] = []
    for (let cm = 0; cm <= CAR_SCALE_LENGTH_CM; cm += step) ticks.push(cm)
    if (ticks[ticks.length - 1] !== CAR_SCALE_LENGTH_CM) ticks.push(CAR_SCALE_LENGTH_CM)
    return ticks
  }, [])
  const carScaleYTicks = useMemo(() => {
    const step = 20
    const ticks: number[] = []
    for (let cm = 0; cm <= CAR_SCALE_HEIGHT_CM; cm += step) ticks.push(cm)
    if (ticks[ticks.length - 1] !== CAR_SCALE_HEIGHT_CM) ticks.push(CAR_SCALE_HEIGHT_CM)
    return ticks
  }, [])
  const rulerTicks = useMemo(() => {
    const step = GRID_SNAP
    const ticks: number[] = []
    for (let v = 0; v <= AB; v += step) ticks.push(v)
    if (ticks[ticks.length - 1] !== AB) ticks.push(AB)
    return ticks
  }, [])
  const contourShape = useMemo(() => {
    if (!contourShapeId) return null
    const shape = shapes.find(s => s.id === contourShapeId) ?? null
    return shape?.kind === 'path' ? shape : null
  }, [shapes, contourShapeId])
  const multiSel = selectionSet.length >= 2
  const compoundable = selectionSet.length >= 2 && selectionSet.every(id => {
    const s = shapes.find(sh => sh.id === id)
    return s && s.kind !== 'text'
  })
  // Boolean ops accept text shapes too — they get rasterised via shapeToLocalPath inside booleanOp
  const booleanEnabled = !booleanApplying && selectionSet.length >= 2 && selectionSet.every(id => {
    const s = shapes.find(sh => sh.id === id)
    return !!s
  })

  useEffect(() => {
    if (!selected || selectionSet.length !== 1) {
      setContourEditorOpen(false)
      setContourShapeId(null)
    }
  }, [selected, selectionSet.length])

  useEffect(() => {
    if (pathEditMode && (!selected || selected.kind !== 'path')) {
      setPathEditMode(false)
      setSelectedAnchor(null)
      setPathAnchorDragState(null)
    }
  }, [pathEditMode, selected])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      // Close context menu if clicking outside it
      const evTarget = e.target as Element | null
      if (ctxMenu && !evTarget?.closest('.svg-ctx-menu')) setCtxMenu(null)
      if (!offsetPopoverOpen && !shadowPopoverOpen && !curvePopoverOpen && !warpPopoverOpen && !combineMenuOpen && !effectsMenuOpen && !topCombineMenuOpen) return
      const target = e.target as Node | null
      if (offsetPopoverOpen) {
        if (target && offsetBtnRef.current?.contains(target)) return
        if (target && offsetPopoverPortalRef.current?.contains(target)) return
        setOffsetPopoverOpen(false)
      }
      if (shadowPopoverOpen) {
        if (target && shadowPopoverPortalRef.current?.contains(target)) return
        setShadowPopoverOpen(false)
      }
      if (curvePopoverOpen) {
        if (target && curvePopoverPortalRef.current?.contains(target)) return
        setCurvePopoverOpen(false)
      }
      if (warpPopoverOpen) {
        if (target && warpBtnRef.current?.contains(target)) return
        if (target && warpPopoverPortalRef.current?.contains(target)) return
        setWarpPopoverOpen(false)
      }
      if (combineMenuOpen) {
        // close if click is outside any combine-wrap
        const wrap = (target as Element | null)?.closest('.svg-layer-op-combine-wrap')
        if (!wrap) setCombineMenuOpen(false)
      }
      if (effectsMenuOpen) {
        if (
          !target
          || (!topEffectsBtnRef.current?.contains(target) && !topEffectsMenuPortalRef.current?.contains(target))
        ) {
          setEffectsMenuOpen(false)
        }
      }
      if (topCombineMenuOpen) {
        if (
          !target
          || (!topCombineBtnRef.current?.contains(target) && !topCombineMenuPortalRef.current?.contains(target))
        ) {
          setTopCombineMenuOpen(false)
        }
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [offsetPopoverOpen, shadowPopoverOpen, curvePopoverOpen, warpPopoverOpen, combineMenuOpen, effectsMenuOpen, topCombineMenuOpen, ctxMenu])

  useEffect(() => {
    if (!selected) {
      setOffsetPopoverOpen(false)
      setShadowPopoverOpen(false)
      setCurvePopoverOpen(false)
    }
  }, [selected])

  useEffect(() => {
    if (!selectionSet.length) {
      setEffectsMenuOpen(false)
      setTopCombineMenuOpen(false)
    }
  }, [selectionSet.length])

  useEffect(() => {
    fetch('/fonts/manifest.json', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => setFonts(Array.isArray(j.items)
        ? j.items.map((item: FontManifestItem) => ({
            ...item,
            name: cleanFontDisplayName(item.name || item.fileName || item.family),
          }))
        : []))
      .catch(() => { })
  }, [])

  useEffect(() => {
    if (!fonts.length) return

    for (const font of fonts) {
      ensureFontFaceInjected(font.family, font.url)
    }

    setShapes(prev => {
      let changed = false
      const next = prev.map(s => {
        if (s.kind !== 'text') return s
        const resolved = resolveFontUrlFromEntries(s.fontFamily, fonts)
        if (resolved) {
          if (s.fontUrl === resolved) return s
          changed = true
          return { ...s, fontUrl: resolved }
        }
        if (s.fontFamily === DEFAULT_OFFSET_FONT_FAMILY && s.fontUrl === DEFAULT_OFFSET_FONT_URL) return s
        changed = true
        return { ...s, fontFamily: DEFAULT_OFFSET_FONT_FAMILY, fontUrl: DEFAULT_OFFSET_FONT_URL }
      })
      return changed ? next : prev
    })
  }, [fonts])

  useEffect(() => {
    if (!fonts.length || !('fonts' in document)) return

    let disposed = false

    async function loadPreviewFonts() {
      await Promise.allSettled(
        fonts.map(font => document.fonts.load(`700 48px "${font.family}"`)),
      )

      if (!disposed) {
        setFontPreviewLoadTick(value => value + 1)
      }
    }

    void loadPreviewFonts()

    return () => {
      disposed = true
    }
  }, [fonts])

  useEffect(() => {
    for (const s of shapes) {
      if (s.kind !== 'text' || !s.fontUrl) continue
      ensureFontFaceInjected(s.fontFamily, s.fontUrl)
    }
  }, [shapes])

  // ── History ────────────────────────────────────────────────────────────────

  function pushHistory(current: SvgShape[]) {
    historyPast.current = [...historyPast.current.slice(-HISTORY_LIMIT), [...current]]
    historyFuture.current = []
    forceUpdate(n => n + 1)
  }
  function doUndo() {
    if (!historyPast.current.length) return
    historyFuture.current = [...historyFuture.current, [...shapes]]
    setShapes(historyPast.current.pop()!)
    forceUpdate(n => n + 1)
  }
  function doRedo() {
    if (!historyFuture.current.length) return
    historyPast.current = [...historyPast.current, [...shapes]]
    setShapes(historyFuture.current.pop()!)
    forceUpdate(n => n + 1)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && !e.shiftKey && e.key === 'z') { e.preventDefault(); e.stopImmediatePropagation(); doUndo(); return }
      if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); e.stopImmediatePropagation(); doRedo(); return }
      if (ctrl && e.key === 'c') { copySelected(); return }
      if (ctrl && e.key === 'x') { cutSelected(); return }
      if (ctrl && e.key === 'v') { pasteClipboard(); return }
      if (ctrl && e.key === 'a') { e.preventDefault(); setSelectionSet(shapes.map(s => s.id)); return }
      if (ctrl && e.key === 'd') { e.preventDefault(); duplicateSelected(); return }
      if (ctrl && e.key === 'g') { e.preventDefault(); if (selectionSet.length >= 2) attachSelection(); return }
      if (pathEditMode && selected?.kind === 'path' && selectedAnchor && (e.key === 'Delete' || e.key === 'Backspace')) {
        const tag = (e.target as HTMLElement).tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault()
          const next = removePathAnchor(selected, selectedAnchor.pointIndex)
          pushHistory(shapes)
          setShapes(prev => prev.map(s => s.id === selected.id ? next : s))
          setSelectedAnchor(null)
          return
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectionSet.length) {
        const tag = (e.target as HTMLElement).tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault(); deleteSelected()
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  // Intentionally bind once to stable command handlers to keep keyboard UX predictable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathEditMode, selected, selectedAnchor, selectionSet, shapes])

  // ── Shape mutations ────────────────────────────────────────────────────────

  function addShape(kind: SvgShapeKind) {
    pushHistory(shapes)
    // Separate spawn zones: text lands upper-left area, shapes land lower-right area.
    // A small cascade offset per existing shape count keeps stacking readable.
    const isText = kind === 'text'
    const cascade = (shapes.length % 6) * 22
    const spawnX = isText ? AB * 0.38 + cascade : AB * 0.62 + cascade
    const spawnY = isText ? AB * 0.38 + cascade : AB * 0.62 + cascade
    const base = { ...defaultShape(kind), x: spawnX, y: spawnY }
    const seeded = kind === 'text' ? fitTextShapeToIntrinsic(base) : base
    const s = normalizeShape(seeded)
    setShapes(prev => [...prev, s])
    setSelectionSet([s.id])
  }

  function addTextShapeWithFont(fontFamily: string, fontUrl: string) {
    pushHistory(shapes)
    const cascade = (shapes.length % 6) * 22
    const spawnX = AB * 0.38 + cascade
    const spawnY = AB * 0.38 + cascade
    const base = {
      ...defaultShape('text'),
      x: spawnX,
      y: spawnY,
      fontFamily,
      fontUrl,
    }
    const seeded = fitTextShapeToIntrinsic(base)
    const shape = normalizeShape(seeded)
    setShapes(prev => [...prev, shape])
    setSelectionSet([shape.id])
  }

  function toggleVisible(id: string) { setShapes(prev => prev.map(s => s.id === id ? { ...s, visible: !s.visible } : s)) }
  function toggleLocked(id: string) { setShapes(prev => prev.map(s => s.id === id ? { ...s, locked: !s.locked } : s)) }
  function renameShape(id: string, newName: string) { setShapes(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s)) }
  function deleteShape(id: string) {
    pushHistory(shapes)
    const target = shapes.find(s => s.id === id)
    // If deleting a combine result, also delete its child group members
    const combineGid = target?.combineGroupId ?? null
    setShapes(prev => prev.filter(s => s.id !== id && (combineGid ? s.attachedGroupId !== combineGid : true)))
    setSelectionSet(prev => prev.filter(x => x !== id))
  }
  function deleteSelected() {
    if (!selectionSet.length) return
    pushHistory(shapes)
    setShapes(prev => prev.filter(s => !selectionSet.includes(s.id)))
    setSelectionSet([])
  }
  function duplicateShape(id: string) {
    const src = shapes.find(s => s.id === id)
    if (!src) return
    pushHistory(shapes)
    const dup: SvgShape = { ...src, id: createId(src.kind), x: src.x + 20, y: src.y + 20, name: src.name + ' copy' }
    setShapes(prev => [...prev, dup])
    setSelectionSet([dup.id])
  }
  // Tracks whether history has been pushed for the current "edit session" (e.g. typing in a field)
  const historyCommittedRef = useRef(false)
  function commitHistory() {
    if (!historyCommittedRef.current) {
      historyCommittedRef.current = true
      pushHistory(shapes)
    }
  }
  function resetHistoryCommit() { historyCommittedRef.current = false }

  function updateSelected(patch: Partial<SvgShape>, opts?: { snapPos?: boolean; snapAng?: boolean }) {
    if (!selected) return
    setShapes(prev => prev.map(s => {
      if (s.id !== selected.id) return s
      const m = { ...s, ...patch }
      if (opts?.snapPos && snapToGrid) { m.x = snapTo(m.x, GRID_SNAP); m.y = snapTo(m.y, GRID_SNAP) }
      if (opts?.snapAng && snapRotation) { m.rotation = snapTo(m.rotation, ANGLE_SNAP) }
      return normalizeShape(m)
    }))
  }
  function updateSelectedWithHistory(patch: Partial<SvgShape>, opts?: { snapPos?: boolean; snapAng?: boolean }) {
    pushHistory(shapes)
    updateSelected(patch, opts)
  }
  function moveSelected(delta: -1 | 1) {
    if (!selected) return
    pushHistory(shapes)
    setShapes(prev => {
      const idx = prev.findIndex(s => s.id === selected.id)
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
    setShapes(prev => [...prev, copy])
    setSelectionSet([copy.id])
  }
  function copySelected() {
    const sel = selectionSet.map(id => shapes.find(s => s.id === id)).filter((s): s is SvgShape => !!s)
    if (!sel.length) return
    clipboardRef.current = sel
  }
  function cutSelected() {
    const sel = selectionSet.map(id => shapes.find(s => s.id === id)).filter((s): s is SvgShape => !!s)
    if (!sel.length) return
    clipboardRef.current = sel
    pushHistory(shapes)
    setShapes(prev => prev.filter(s => !selectionSet.includes(s.id)))
    setSelectionSet([])
  }
  function pasteClipboard() {
    if (!clipboardRef.current.length) return
    pushHistory(shapes)
    const pasted = clipboardRef.current.map(s => normalizeShape({ ...s, id: createId(s.kind), x: s.x + 24, y: s.y + 24 }))
    setShapes(prev => [...prev, ...pasted])
    setSelectionSet(pasted.map(p => p.id))
  }
  function mirrorSelected() {
    if (!selected) return
    pushHistory(shapes)
    updateSelected({ x: AB - selected.x, rotation: -selected.rotation })
  }
  function rotateSelected(step: number) {
    if (!selected) return
    pushHistory(shapes)
    updateSelected({ rotation: selected.rotation + step }, { snapAng: true })
  }
  function alignSelected(action: 'centerH' | 'centerV' | 'left' | 'right' | 'top' | 'bottom') {
    if (!selected) return
    pushHistory(shapes)
    const isCirc = selected.kind === 'circle' || selected.kind === 'ring'
    const hw = isCirc ? selected.radius : selected.width / 2
    const hh = isCirc ? selected.radius : selected.height / 2
    const patch: Partial<SvgShape> = {}
    if (action === 'centerH') patch.x = AB / 2
    else if (action === 'centerV') patch.y = AB / 2
    else if (action === 'left') patch.x = hw
    else if (action === 'right') patch.x = AB - hw
    else if (action === 'top') patch.y = hh
    else if (action === 'bottom') patch.y = AB - hh
    updateSelected(patch)
  }

  // ── Operations ─────────────────────────────────────────────────────────────

  function addTextBg() {
    if (!selected || selected.kind !== 'text') return
    pushHistory(shapes)
    const pw = Math.max(80, selected.fontSize * (selected.text.length || 1) * 0.62)
    const bg = normalizeShape({
      ...defaultShape('roundedrect', 'Text BG'),
      x: selected.x, y: selected.y,
      width: pw + 56, height: selected.fontSize * 1.4 + 24,
      cornerRadius: 16,
      fill: '#000000', stroke: 'none', strokeWidth: 0,
    })
    const idx = shapes.findIndex(s => s.id === selected.id)
    const next = [...shapes]
    next.splice(idx, 0, bg)
    setShapes(next)
    setSelectionSet([bg.id])
  }

  function makeOffsetLayer(source: SvgShape, distance: number, cornerStyle: 'round' | 'sharp' = offsetCorner): SvgShape | null {
    if (distance === 0) return null
    // Enforce Cricut's ±1.0 inch constraint
    const d = constrainOffsetDistance(distance)
    if (d === 0) return null
    const offsetStrokeWidth = Math.max(3, Math.min(16, Math.abs(d) * 0.34))
    const offsetOpacity = Math.max(0.95, source.opacity)
    const lineJoin: SvgShape['strokeLinejoin'] = cornerStyle === 'round' ? 'round' : 'miter'
    const sourceSig = offsetSourceSignature(source)
    const offsetName = formatOffsetLayerName(source.name, d)

    // Text fallback (sync): keep a stable filled backing if contour offset cannot be built.
    if (source.kind === 'text') {
      return makeStableTextOffsetFallback(source, d, offsetName, sourceSig)
    }

    // For all geometric shapes: try Clipper first for smooth rounded offset path
    const localPath = shapeToLocalPath(source)
    if (localPath) {
      const clipperPath = computeClipperOffset(localPath, d, cornerStyle)
      if (clipperPath) {
        // Compute actual bbox so selection handles appear at the correct location.
        const bbox = pathWorldBbox(clipperPath)
        return normalizeShape({
          ...defaultShape('path', offsetName),
          id: createId('path'),
          kind: 'path',
          name: offsetName,
          pathData: clipperPath,
          hiddenContours: [],
          x: source.x,
          y: source.y,
          width: bbox ? Math.max(MIN_SIZE, bbox.width) : Math.max(MIN_SIZE, source.width + d * 2),
          height: bbox ? Math.max(MIN_SIZE, bbox.height) : Math.max(MIN_SIZE, source.height + d * 2),
          rotation: source.rotation,
          fill: TEXT_OFFSET_STABLE_FILL,
          stroke: 'none',
          strokeWidth: 0,
          strokeLinejoin: lineJoin,
          opacity: offsetOpacity,
          isOffsetLayer: true,
          offsetSourceId: source.id,
          offsetDistance: d,
          offsetSourceSignature: sourceSig,
        })
      }
    }

    // Fallback for circle/ring (Clipper not available)
    if (source.kind === 'circle' || source.kind === 'ring') {
      return normalizeShape({
        ...source,
        id: createId(source.kind),
        name: offsetName,
        radius: source.radius + d,
        fill: TEXT_OFFSET_STABLE_FILL,
        stroke: 'none',
        strokeWidth: 0,
        strokeLinejoin: lineJoin,
        opacity: offsetOpacity,
        isOffsetLayer: true,
        offsetSourceId: source.id,
        offsetDistance: d,
        offsetSourceSignature: sourceSig,
      })
    }

    // Fallback for line
    if (source.kind === 'line') {
      return normalizeShape({
        ...source,
        id: createId('line'),
        name: offsetName,
        width: source.width + d * 2,
        stroke: TEXT_OFFSET_STABLE_FILL,
        strokeWidth: Math.max(source.strokeWidth, offsetStrokeWidth),
        strokeLinejoin: lineJoin,
        opacity: offsetOpacity,
        isOffsetLayer: true,
        offsetSourceId: source.id,
        offsetDistance: d,
        offsetSourceSignature: sourceSig,
      })
    }

    // Fallback: simple size expansion
    return normalizeShape({
      ...source,
      id: createId(source.kind),
      name: offsetName,
      width: source.width + d * 2,
      height: source.height + d * 2,
      fill: TEXT_OFFSET_STABLE_FILL,
      stroke: 'none',
      strokeWidth: 0,
      strokeLinejoin: lineJoin,
      opacity: offsetOpacity,
      isOffsetLayer: true,
      offsetSourceId: source.id,
      offsetDistance: d,
      offsetSourceSignature: sourceSig,
    })
  }

  function applyOffsetWithConfig(distance: number, cornerStyle: 'round' | 'sharp', _weld: boolean): boolean {
    if (!offsetTargetShapes.length) return false
    let initialTargets = offsetTargetShapes
      .filter(s => !s.locked)
    if (!initialTargets.length) return false

    // Expand attached groups: if any selected shape is in an attach group,
    // pull in all shapes from that group so they offset as one unit.
    const groupIds = new Set(initialTargets.map(s => s.attachedGroupId).filter(Boolean))
    if (groupIds.size > 0) {
      const expanded = new Set(initialTargets.map(s => s.id))
      for (const s of shapes) {
        if (s.attachedGroupId && groupIds.has(s.attachedGroupId) && !s.locked) {
          expanded.add(s.id)
        }
      }
      initialTargets = shapes.filter(s => expanded.has(s.id))
    }
    const targets = initialTargets
    if (distance === 0) return false
    const d = distance
    const singleTarget = targets.length === 1 ? targets[0] : null
    const selectedLayer = selectionSet.length === 1
      ? (shapes.find(s => s.id === selectionSet[0]) ?? null)
      : null
    const replaceOffsetLayer = singleTarget
      && selectedLayer?.isOffsetLayer
      && selectedLayer.offsetSourceId === singleTarget.id
      ? selectedLayer
      : null
    const commitOffsetLayer = (layer: SvgShape, insertBeforeIdx: number) => {
      if (replaceOffsetLayer) {
        const updated = normalizeShape({
          ...layer,
          id: replaceOffsetLayer.id,
          visible: replaceOffsetLayer.visible,
          locked: replaceOffsetLayer.locked,
          attachedGroupId: replaceOffsetLayer.attachedGroupId,
          combineGroupId: replaceOffsetLayer.combineGroupId,
          groupId: replaceOffsetLayer.groupId,
        })
        setShapes(prev => prev.map(s => (s.id === replaceOffsetLayer.id ? updated : s)))
        setSelectionSet([replaceOffsetLayer.id])
        return
      }
      setShapes(prev => {
        const next = [...prev]
        next.splice(insertBeforeIdx < 0 ? 0 : insertBeforeIdx, 0, layer)
        return next
      })
      setSelectionSet([layer.id])
    }
    const layerJoin: SvgShape['strokeLinejoin'] = cornerStyle === 'round' ? 'round' : 'miter'
    // Any selection that includes text uses the full async path pipeline
    // (text glyph Bezier -> unite -> offset), and multi-shape always offsets as one.
    if (targets.length > 1 || targets.some(s => s.kind === 'text')) {
      const effectiveWeld = _weld
      const hasTextTarget = targets.some(t => t.kind === 'text')
      const effectiveCorner: 'round' | 'sharp' = hasTextTarget ? 'round' : cornerStyle
      // Use async full pipeline: opentype glyph paths + paper.js union + Clipper offset
      const targetIndices = targets.map(s => shapes.findIndex(x => x.id === s.id)).filter(i => i >= 0)
      const insertBeforeIdx = targetIndices.length ? Math.max(0, Math.min(...targetIndices)) : 0
      setOffsetApplying(true)
      computeFullOffsetWithTimeout(targets, d, effectiveCorner, effectiveWeld, false, OFFSET_COMPUTE_TIMEOUT_MS).then(worldPath => {
        if (!worldPath) {
          if (targets.length === 1) {
            const fallback = makeOffsetLayer(targets[0], d, cornerStyle)
            if (fallback) {
              setImportError('Using stable fill fallback for this font. Glyph outline offset is unavailable.')
              showToast('Offset: using stable fill fallback (glyph unavailable)', 'warning')
              pushHistory(shapes)
              const idx = shapes.findIndex(s => s.id === targets[0].id)
              commitOffsetLayer(fallback, idx)
              setOffsetPopoverOpen(false)
              return
            }
          }
          setImportError('Could not build a clean offset for this text/font at the current settings. Try a smaller distance or switch corner style.')
          showToast('Offset failed: try smaller distance or different corner style', 'error')
          return
        }
        setImportError(null)
        // Use same sanitization logic as preview: skip sanitization for text
        const cleanedWorldPath = hasTextTarget ? worldPath : sanitizeOffsetPath(worldPath, d)
        pushHistory(shapes)
        // Compute actual bounding box so x,y,width,height reflect the real visual extents.
        // This ensures selection handles appear at the correct position on screen.
        let worldPathForLayer = cleanedWorldPath
        let bbox = pathWorldBbox(worldPathForLayer)
        const pinToSource = targets.length === 1 && hasTextTarget
        const cx = pinToSource
          ? targets[0].x
          : (bbox ? bbox.x + bbox.width / 2 : AB / 2)
        const cy = pinToSource
          ? targets[0].y
          : (bbox ? bbox.y + bbox.height / 2 : AB / 2)
        const pw = bbox ? Math.max(MIN_SIZE, bbox.width) : MIN_SIZE
        const ph = bbox ? Math.max(MIN_SIZE, bbox.height) : MIN_SIZE
        const centeredPath = transformPathWithPaperTranslate(worldPathForLayer, -cx, -cy)
        const unified = normalizeShape({
          ...defaultShape('path', 'Offset'),
          id: createId('path'),
          kind: 'path',
          name: targets.length > 1 ? `${targets.length} Layers Offset ${formatOffsetDistanceLabel(d)}` : formatOffsetLayerName(targets[0].name, d),
          pathData: centeredPath,
          hiddenContours: [],
          fill: TEXT_OFFSET_STABLE_FILL,
          stroke: 'none',
          strokeWidth: 0,
          strokeLinejoin: layerJoin,
          opacity: 1,
          x: cx,
          y: cy,
          width: pw,
          height: ph,
          rotation: 0,
          isOffsetLayer: true,
          offsetSourceId: targets[0].id,
          offsetDistance: d,
          offsetSourceSignature: offsetSourceSignature(targets[0]),
        })
        commitOffsetLayer(unified, insertBeforeIdx)
        setOffsetPopoverOpen(false)
      }).catch((error: unknown) => {
        if (isOffsetComputeTimeoutError(error)) {
          setImportError('Offset took too long and was canceled. Try a smaller distance, disable Weld Offsets, or offset fewer layers at once.')
          showToast('Offset timed out. Try fewer layers or simpler settings.', 'warning')
          return
        }
        setImportError('Offset failed unexpectedly. Try a smaller distance, disable Weld Offsets, or simplify the selection.')
        showToast('Offset failed unexpectedly. Please try again with simpler settings.', 'error')
      }).finally(() => {
        setOffsetApplying(false)
      })
      return true // indicate async started successfully
    }

    // Single shape
    const source = targets[0]
    const offset = makeOffsetLayer(source, d, cornerStyle)
    if (!offset) {
      setImportError('Could not create offset for this shape at the current distance.')
      showToast('Offset failed: try adjusting distance or corner style', 'error')
      return false
    }
    setImportError(null)
    pushHistory(shapes)
    const idx = shapes.findIndex(s => s.id === source.id)
    commitOffsetLayer(offset, idx)
    return true
  }

  function applyOffset() {
    applyOffsetWithConfig(offsetAmt, offsetCorner, weldOffsets)  // single-shape path (sync)
  }

  const clearOffsetPreviewState = useCallback(() => {
    offsetPreviewPendingRef.current = null
    offsetPreviewJobSeqRef.current += 1
    if (offsetPreviewScrubTimerRef.current !== null) {
      window.clearTimeout(offsetPreviewScrubTimerRef.current)
      offsetPreviewScrubTimerRef.current = null
    }
    setOffsetPreviewScrubbing(false)
    setOffsetPreviewPath(null)
    setOffsetPreviewTransform(null)
    setOffsetPreviewText(null)
  }, [])

  const markOffsetPreviewScrubbing = useCallback(() => {
    setOffsetPreviewScrubbing(true)
    if (offsetPreviewScrubTimerRef.current !== null) {
      window.clearTimeout(offsetPreviewScrubTimerRef.current)
    }
    offsetPreviewScrubTimerRef.current = window.setTimeout(() => {
      setOffsetPreviewScrubbing(false)
      offsetPreviewScrubTimerRef.current = null
    }, 160)
  }, [])

  const runQueuedOffsetPreview = useCallback((job: {
    previewSources: SvgShape[]
    distance: number
    corner: 'round' | 'sharp'
    weld: boolean
    fastPreview: boolean
  }) => {
    if (offsetPreviewInFlightRef.current) {
      offsetPreviewPendingRef.current = job
      return
    }

    offsetPreviewInFlightRef.current = true
    const seq = ++offsetPreviewJobSeqRef.current

    computeFullOffsetWithTimeout(job.previewSources, job.distance, job.corner, job.weld, job.fastPreview, OFFSET_PREVIEW_TIMEOUT_MS).then(path => {
      if (offsetPreviewJobSeqRef.current !== seq) return
      if (path) {
        const singleText = job.previewSources.length === 1 && job.previewSources[0]?.kind === 'text'
          ? job.previewSources[0]
          : null
        if (singleText && isCollapsedTextOffsetResult(singleText, path, job.distance)) {
          // Keep contour preview path instead of falling back to overlapping text-stroke preview.
          // This preserves a single merged outline behavior in preview.
        }
        const hasTextPreviewSource = job.previewSources.some(s => s.kind === 'text')
        setOffsetPreviewPath(job.fastPreview || hasTextPreviewSource ? path : sanitizeOffsetPath(path, job.distance))
        setOffsetPreviewTransform(null)
        setOffsetPreviewText(null)
        return
      }

      const single = job.previewSources.length === 1 ? job.previewSources[0] : null
      if (single?.kind === 'text') {
        setOffsetPreviewPath(null)
        setOffsetPreviewTransform(null)
        setOffsetPreviewText({
          ...makeStableTextOffsetFallback(
            single,
            job.distance,
            single.name,
            offsetSourceSignature(single),
          ),
          opacity: 0.35,
        })
      } else {
        setOffsetPreviewPath(null)
        setOffsetPreviewTransform(null)
        setOffsetPreviewText(null)
      }
    }).catch(() => {
      if (offsetPreviewJobSeqRef.current !== seq) return
      const single = job.previewSources.length === 1 ? job.previewSources[0] : null
      if (single?.kind === 'text') {
        setOffsetPreviewPath(null)
        setOffsetPreviewTransform(null)
        setOffsetPreviewText({
          ...makeStableTextOffsetFallback(
            single,
            job.distance,
            single.name,
            offsetSourceSignature(single),
          ),
          opacity: 0.35,
        })
      } else {
        setOffsetPreviewPath(null)
        setOffsetPreviewTransform(null)
        setOffsetPreviewText(null)
      }
    }).finally(() => {
      // Always release the in-flight lock so the next queued job can run,
      // even when this job was superseded by a newer seq — otherwise inFlight
      // stays true forever and all subsequent previews deadlock.
      offsetPreviewInFlightRef.current = false
      const pending = offsetPreviewPendingRef.current
      if (pending) {
        offsetPreviewPendingRef.current = null
        runQueuedOffsetPreview(pending)
      }
    })
  }, [])

  // Live preview: async pipeline (opentype + paper.js + Clipper)
  useEffect(() => {
    if (!offsetPopoverOpen || offsetDraftAmt === 0) {
      clearOffsetPreviewState()
      return
    }
    const previewSources = offsetTargetShapes
      .filter((s): s is SvgShape => !!s && s.visible && !s.locked)
    if (!previewSources.length) {
      clearOffsetPreviewState()
      return
    }
    let cancelled = false
    const d = offsetDraftAmt
    const corner = offsetDraftCorner
    if (previewSources.length === 1 && previewSources[0].kind !== 'text') {
      // Single non-text shape: quick sync path
      const s = previewSources[0]
      const tid = setTimeout(() => {
        if (cancelled) return
        const localPath = shapeToLocalPath(s)
        const path = localPath ? computeClipperOffset(localPath, d, corner, offsetPreviewScrubbing) : null
        if (!cancelled) {
          setOffsetPreviewPath(path ? (offsetPreviewScrubbing ? path : sanitizeOffsetPath(path, d)) : null)
          setOffsetPreviewTransform(path ? `translate(${s.x},${s.y}) rotate(${s.rotation})` : null)
          setOffsetPreviewText(null)
        }
      }, 70)
      return () => { cancelled = true; clearTimeout(tid) }
    } else {
      // Multi-shape or text: full async pipeline
      const tid = setTimeout(() => {
        if (cancelled) return
        const previewWeld = offsetDraftWeld
        runQueuedOffsetPreview({ previewSources, distance: d, corner, weld: previewWeld, fastPreview: offsetPreviewScrubbing })
      }, 120)
      return () => {
        cancelled = true
        clearTimeout(tid)
      }
    }
  }, [clearOffsetPreviewState, offsetPopoverOpen, offsetDraftAmt, offsetDraftCorner, offsetDraftWeld, offsetPreviewScrubbing, offsetTargetShapes, runQueuedOffsetPreview])

  // Live warp preview — recomputes on every slider change
  useEffect(() => {
    if (!warpPopoverOpen || warpAmount === 0) { setWarpPreviewPath(null); return }
    const targets = selectionSet
      .map(id => shapes.find(s => s.id === id))
      .filter((s): s is SvgShape => !!s && s.visible && !s.locked)
    if (!targets.length) { setWarpPreviewPath(null); return }
    let cancelled = false
    const tid = setTimeout(() => {
      if (cancelled) return
      ;(async () => {
        const worldPaths: string[] = []
        for (const s of targets) {
          if (s.kind === 'text') {
            const glyphPaths = await textShapeToGlyphPathsAsync(s)
            if (glyphPaths) worldPaths.push(...glyphPaths)
          } else {
            const local = shapeToLocalPath(s)
            if (local) worldPaths.push(transformPathData(local, s.x, s.y, s.rotation))
          }
        }
        if (cancelled || !worldPaths.length) return
        const united = worldPaths.length === 1 ? worldPaths[0] : (paperUniteWorldPaths(worldPaths) ?? worldPaths.join(' '))
        if (!united) return
        const bbox = pathWorldBbox(united)
        if (!bbox || bbox.width < 1) return
        const cx = bbox.x + bbox.width / 2
        const cy = bbox.y + bbox.height / 2
        const centeredPath = transformPathData(united, -cx, -cy, 0)
        const warped = warpArchPath(centeredPath, warpAmount / 100, bbox.width, bbox.height)
        if (cancelled || !warped) return
        // Translate warped (centered at 0,0) back to world space
        setWarpPreviewPath(transformPathData(warped, cx, cy, 0))
      })().catch(() => { if (!cancelled) setWarpPreviewPath(null) })
    }, 80)
    return () => { cancelled = true; clearTimeout(tid) }
  }, [warpPopoverOpen, warpAmount, selectionSet, shapes])

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const drag = offsetPopoverDragRef.current
      if (!drag) return
      const next = clampPopoverPosition(
        drag.originTop + (event.clientY - drag.startY),
        drag.originLeft + (event.clientX - drag.startX),
      )
      setOffsetPopoverPos(next)
    }

    function onPointerUp(event: PointerEvent) {
      const drag = offsetPopoverDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      offsetPopoverDragRef.current = null
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [])

  function openOffsetPopover(anchorEl?: HTMLElement | null) {
    const anchor = anchorEl ?? offsetBtnRef.current
    const svgRect = svgRef.current?.getBoundingClientRect() ?? null
    const selectionRect = selectionBounds && svgRect
      ? {
          left: svgRect.left + (selectionBounds.x / AB) * svgRect.width,
          top: svgRect.top + (selectionBounds.y / AB) * svgRect.height,
          width: (selectionBounds.width / AB) * svgRect.width,
          height: (selectionBounds.height / AB) * svgRect.height,
        }
      : null
    if (selectionRect) {
      const popoverWidth = 336
      const preferredLeft = selectionRect.left + selectionRect.width / 2 > window.innerWidth / 2
        ? selectionRect.left - popoverWidth - 18
        : selectionRect.left + selectionRect.width + 18
      const preferredTop = selectionRect.top
      setOffsetPopoverPos(clampPopoverPosition(preferredTop, preferredLeft))
    } else if (anchor) {
      const r = anchor.getBoundingClientRect()
      setOffsetPopoverPos(clampPopoverPosition(r.bottom + 8, r.right - 320))
    }
    setImportError(null)
    const singleSelected = selectionSet.length === 1
      ? (shapes.find(s => s.id === selectionSet[0]) ?? null)
      : null
    const initialDistance = singleSelected?.isOffsetLayer
      ? normalizeOffsetDistance(singleSelected.offsetDistance)
      : 0
    setOffsetDraftAmt(initialDistance)
    setOffsetDraftCorner(offsetCorner)
    setOffsetDraftWeld(weldOffsets)
    setOffsetPopoverOpen(true)
    // Pre-warm font loading so glyph offset is ready before slider is moved
    offsetTargetShapes.forEach(s => {
      if (s?.kind === 'text' && s.fontUrl) loadOpentypeFont(s.fontUrl)
    })
  }

  function openShadowPopover(anchorEl?: HTMLElement | null) {
    const anchor = anchorEl ?? offsetBtnRef.current
    if (anchor) {
      const r = anchor.getBoundingClientRect()
      setShadowPopoverPos({ top: r.bottom + 8, left: Math.max(8, r.right - 320) })
    }
    setShadowPopoverOpen(true)
  }

  function startOffsetPopoverDrag(event: React.PointerEvent<HTMLDivElement>) {
    offsetPopoverDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originTop: offsetPopoverPos.top,
      originLeft: offsetPopoverPos.left,
    }
  }

  function openCurvePopover(anchorEl?: HTMLElement | null) {
    const anchor = anchorEl ?? offsetBtnRef.current
    if (anchor) {
      const r = anchor.getBoundingClientRect()
      setCurvePopoverPos({ top: r.bottom + 8, left: Math.max(8, r.right - 320) })
    }
    setCurvePopoverOpen(true)
  }

  function applyOffsetFromPopover() {
    if (offsetDraftAmt === 0) {
      setImportError('Set Offset Distance above or below 0, then click Apply.')
      return
    }
    setImportError(null)
    const d = offsetDraftAmt
    setOffsetAmt(d)
    setOffsetCorner(offsetDraftCorner)
    setWeldOffsets(offsetDraftWeld)
    applyOffsetWithConfig(d, offsetDraftCorner, offsetDraftWeld)
    // For multi-shape or text, popover closes after async completes (inside applyOffsetWithConfig).
    // For single shape it completes sync, so close here if not already closed.
    setOffsetPopoverOpen(prev => {
      const targets = selectionSet
        .map(id => shapes.find(s => s.id === id))
        .filter(Boolean)
      const hasText = targets.some(s => s?.kind === 'text')
      return (targets.length > 1 || hasText) ? prev : false
    })
  }

  function openContourEditor() {
    if (!selected) return
    // Regular (non-offset) text: try to jump to its linked path-kind offset layer
    if (selected.kind === 'text' && !selected.isOffsetLayer) {
      const linked = shapes.find(s => s.isOffsetLayer && s.offsetSourceId === selected.id && s.kind === 'path')
      if (linked) {
        setSelectionSet([linked.id])
        setContourShapeId(linked.id)
        setContourEditorOpen(true)
      }
      return
    }

    // Text offset layer (stroke-based fallback): async-convert to real glyph path, then open Contour
    if (selected.kind === 'text' && selected.isOffsetLayer) {
      const srcId = selected.offsetSourceId
      const source = srcId ? shapes.find(s => s.id === srcId) : null
      const textSrc = source?.kind === 'text' ? source : selected
      const d = selected.offsetDistance ?? 10
      const cornerStyle = (selected.strokeLinejoin === 'miter' ? 'sharp' : 'round') as 'round' | 'sharp'
      setOffsetApplying(true)
      computeFullOffsetWithTimeout([textSrc], d, cornerStyle, true, false, OFFSET_COMPUTE_TIMEOUT_MS).then(worldPath => {
        if (!worldPath) {
          setImportError('This font does not support Contour — glyph paths could not be extracted.')
          return
        }
        const bbox = pathWorldBbox(worldPath)
        const cx = bbox ? bbox.x + bbox.width / 2 : AB / 2
        const cy = bbox ? bbox.y + bbox.height / 2 : AB / 2
        const centeredPath = transformPathData(worldPath, -cx, -cy, 0)
        const pathLayer = normalizeShape({
          ...defaultShape('path', selected.name),
          id: selected.id, // replace in-place
          kind: 'path',
          name: selected.name,
          pathData: centeredPath,
          hiddenContours: [],
          fill: selected.fill,
          stroke: 'none',
          strokeWidth: 0,
          x: cx,
          y: cy,
          width: bbox ? Math.max(MIN_SIZE, bbox.width) : MIN_SIZE,
          height: bbox ? Math.max(MIN_SIZE, bbox.height) : MIN_SIZE,
          rotation: 0,
          opacity: selected.opacity,
          isOffsetLayer: true,
          offsetSourceId: selected.offsetSourceId,
          offsetDistance: d,
          offsetSourceSignature: selected.offsetSourceSignature,
        })
        pushHistory(shapes)
        setShapes(prev => prev.map(s => s.id === selected.id ? pathLayer : s))
        setSelectionSet([selected.id])
        setContourShapeId(selected.id)
        setContourEditorOpen(true)
      }).catch((error: unknown) => {
        if (isOffsetComputeTimeoutError(error)) {
          setImportError('Contour conversion timed out for this layer. Try reducing complexity or distance first.')
          showToast('Contour conversion timed out.', 'warning')
          return
        }
        setImportError('Contour conversion failed unexpectedly for this offset layer.')
        showToast('Contour conversion failed unexpectedly.', 'error')
      }).finally(() => {
        setOffsetApplying(false)
      })
      return
    }

    if (selected.kind === 'path') {
      setContourShapeId(selected.id)
      setContourEditorOpen(true)
      return
    }

    const localPath = shapeToLocalPath(selected)
    if (!localPath) return
    pushHistory(shapes)
    setShapes(prev => prev.map(s => {
      if (s.id !== selected.id) return s
      return normalizeShape({
        ...s,
        kind: 'path',
        name: s.name.endsWith(' Path') ? s.name : `${s.name} Path`,
        pathData: localPath,
        hiddenContours: [],
      })
    }))
    setSelectionSet([selected.id])
    setContourShapeId(selected.id)
    setContourEditorOpen(true)
  }

  function recomputeOffsetLayer(layerId?: string) {
    const id = layerId ?? selectedId
    if (!id) return
    const layer = shapes.find(s => s.id === id)
    if (!layer || !layer.isOffsetLayer || !layer.offsetSourceId) return
    const source = shapes.find(s => s.id === layer.offsetSourceId)
    if (!source) return

    const cornerStyle: 'round' | 'sharp' = layer.strokeLinejoin === 'miter' ? 'sharp' : 'round'
    const rebuilt = makeOffsetLayer(source, Math.max(1, layer.offsetDistance), cornerStyle)
    if (!rebuilt) return

    pushHistory(shapes)
    const updated = normalizeShape({
      ...rebuilt,
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      locked: layer.locked,
      attachedGroupId: layer.attachedGroupId,
      offsetDistance: layer.offsetDistance,
      offsetSourceId: source.id,
      offsetSourceSignature: offsetSourceSignature(source),
    })
    setShapes(prev => prev.map(s => s.id === layer.id ? updated : s))
    setSelectionSet([layer.id])
  }

  function flattenToPath() {
    if (!selected || selected.kind === 'path' || selected.kind === 'text') return
    const localPath = shapeToLocalPath(selected)
    if (!localPath) return
    pushHistory(shapes)
    const flat: SvgShape = { ...selected, id: createId('path'), kind: 'path', name: selected.name + ' (path)', pathData: localPath }
    setShapes(prev => prev.map(s => s.id === selected.id ? flat : s))
    setSelectionSet([flat.id])
  }

  function attachSelection() {
    if (selectionSet.length < 2) return
    const selectedShapes = selectionSet.map(id => shapes.find(s => s.id === id)).filter((s): s is SvgShape => !!s)
    if (selectedShapes.length < 2) return
    const currentGroup = selectedShapes[0].attachedGroupId
    const allSameGroup = !!currentGroup && selectedShapes.every(s => s.attachedGroupId === currentGroup)

    pushHistory(shapes)
    if (allSameGroup) {
      setShapes(prev => prev.map(s => selectionSet.includes(s.id) ? { ...s, attachedGroupId: null } : s))
      return
    }

    const groupId = createId('attach')
    const existingGroupCount = Object.keys(groupNames).length
    setGroupNames(prev => ({ ...prev, [groupId]: `Group ${existingGroupCount + 1}` }))
    setShapes(prev => prev.map(s => selectionSet.includes(s.id) ? { ...s, attachedGroupId: groupId } : s))
  }

  /**
   * Compound / Punch-Hole — concatenates path strings into a compound path.
   * Overlapping sub-paths follow the SVG even-odd fill rule, so they cut holes
   * in each other.  Use this for contour punch-out effects.
   * For a true geometric merge (no internal cut lines) use weldPaths().
   */
  function compoundPaths() {
    if (!compoundable) return
    const targets = selectionSet
      .map(id => shapes.find(s => s.id === id))
      .filter((s): s is SvgShape => !!s && s.kind !== 'text')
    if (targets.length < 2) return
    pushHistory(shapes)
    const parts = targets.map(s => transformPathData(shapeToLocalPath(s), s.x, s.y, s.rotation)).filter(Boolean)
    const primary = [...targets].sort((a, b) => shapes.findIndex(s => s.id === a.id) - shapes.findIndex(s => s.id === b.id))[0]
    const compound: SvgShape = {
      ...defaultShape('path', 'Compound'),
      id: createId('path'),
      kind: 'path',
      pathData: parts.join(' '),
      fill: primary.fill,
      stroke: primary.stroke,
      strokeWidth: primary.strokeWidth,
      opacity: primary.opacity,
      x: 0, y: 0, rotation: 0,
    }
    const firstIdx = Math.min(...targets.map(s => shapes.findIndex(x => x.id === s.id)).filter(i => i >= 0))
    const removed = new Set(targets.map(s => s.id))
    const kept = shapes.filter(s => !removed.has(s.id))
    const insertAt = Math.min(firstIdx, kept.length)
    const next = [...kept]
    next.splice(insertAt, 0, compound)
    setShapes(next)
    setSelectionSet([compound.id])
  }

  /**
   * Weld — true geometric boolean union via paper.js.
   * All selected shapes are merged into a single continuous outline;
   * overlapping cut lines are removed exactly like Cricut's Weld tool.
   * Uses the bottom layer's fill/stroke so the result looks consistent.
   */
  function weldPaths() {
    void booleanOp('unite', 'Weld')
  }

  function openWarpPopover(anchorEl?: HTMLElement | null) {
    const anchor = anchorEl ?? warpBtnRef.current
    if (anchor) {
      const r = anchor.getBoundingClientRect()
      setWarpPopoverPos({ top: r.bottom + 8, left: Math.max(8, r.right - 300) })
    }
    setWarpAmount(30)
    setWarpPopoverOpen(true)
  }

  async function applyWarpArch() {
    const targets = selectionSet
      .map(id => shapes.find(s => s.id === id))
      .filter((s): s is SvgShape => !!s && s.visible && !s.locked)
    if (!targets.length || warpApplying) return

    setWarpApplying(true)
    try {
      // Collect world-space paths for all targets
      const worldPaths: string[] = []
      for (const s of targets) {
        if (s.kind === 'text') {
          const glyphPaths = await textShapeToGlyphPathsAsync(s)
          if (glyphPaths) worldPaths.push(...glyphPaths)
        } else {
          const local = shapeToLocalPath(s)
          if (local) {
            const world = transformPathData(local, s.x, s.y, s.rotation)
            worldPaths.push(world)
          }
        }
      }
      if (!worldPaths.length) {
        showToast('Warp: no valid paths found', 'error')
        return
      }

      // Unite all paths into one
      const united = worldPaths.length === 1 ? worldPaths[0] : (paperUniteWorldPaths(worldPaths) ?? worldPaths.join(' '))
      if (!united) {
        showToast('Warp: could not unite shapes', 'error')
        return
      }

      const bbox = pathWorldBbox(united)
      if (!bbox || bbox.width < 1) {
        showToast('Warp: invalid shape bounds', 'error')
        return
      }

      // Center the united path at origin for warping, then warp, then re-center
      const cx = bbox.x + bbox.width / 2
      const cy = bbox.y + bbox.height / 2
      const centeredPath = transformPathData(united, -cx, -cy, 0)

      // Apply arch warp in local space (centered at 0,0)
      const warped = warpArchPath(centeredPath, warpAmount / 100, bbox.width, bbox.height)
      if (!warped) {
        showToast('Warp: could not apply arch transform', 'error')
        return
      }

      const warpedBbox = pathWorldBbox(transformPathData(warped, cx, cy, 0)) ?? bbox

      // Build the resulting shape
      const firstName = targets[0].name
      const newShape = normalizeShape({
        ...defaultShape('path', `${firstName} Arch`),
        kind: 'path',
        pathData: warped,
        hiddenContours: [],
        fill: targets[0].fill,
        stroke: targets[0].stroke,
        strokeWidth: targets[0].strokeWidth,
        x: cx,
        y: cy,
        width: Math.max(MIN_SIZE, warpedBbox.width),
        height: Math.max(MIN_SIZE, warpedBbox.height),
        rotation: 0,
        opacity: targets[0].opacity,
      })

      pushHistory(shapes)
      setShapes(prev => {
        const result = [...prev]
        // Insert above the last target, remove all targets
        const lastTargetIdx = Math.max(...targets.map(t => result.findIndex(s => s.id === t.id)))
        result.splice(lastTargetIdx + 1, 0, newShape)
        return result.filter(s => !targets.some(t => t.id === s.id))
      })
      setSelectionSet([newShape.id])
      setWarpPopoverOpen(false)
      showToast('✓ Warp applied', 'success')
    } catch (err) {
      console.error('Warp error:', err)
      showToast('Warp failed: ' + (err instanceof Error ? err.message : 'unknown error'), 'error')
    } finally {
      setWarpApplying(false)
    }
  }

  function applyShadowFromOffsetTab() {
    const targets = selectionSet
      .map(id => shapes.find(s => s.id === id))
      .filter((s): s is SvgShape => !!s && s.visible && !s.locked)
    if (!targets.length) {
      showToast('Select at least one visible, unlocked layer for shadow', 'warning')
      return
    }

    const targetIds = new Set(targets.map(s => s.id))
    const orderedTargets = shapes.filter(s => targetIds.has(s.id))
    const shadows = new Map<string, SvgShape>()
    const shadowDistance = 22
    const radians = (shadowDirectionDeg * Math.PI) / 180
    const dx = Math.cos(radians) * shadowDistance
    const dy = Math.sin(radians) * shadowDistance

    for (const src of orderedTargets) {
      const baseOpacity = clamp(src.opacity * 0.35, 0.12, 0.6)
      const isLine = src.kind === 'line'
      const shadow = normalizeShape({
        ...src,
        id: createId(src.kind),
        name: `${src.name} Shadow`,
        x: src.x + dx,
        y: src.y + dy,
        fill: isLine ? 'none' : '#000000',
        stroke: '#000000',
        strokeWidth: isLine ? Math.max(2, src.strokeWidth) : 0,
        opacity: baseOpacity,
        isOffsetLayer: false,
        offsetSourceId: null,
        offsetDistance: 0,
        offsetSourceSignature: null,
      })
      shadows.set(src.id, shadow)
    }

    pushHistory(shapes)
    setShapes(prev => {
      const next: SvgShape[] = []
      for (const s of prev) {
        const shadow = shadows.get(s.id)
        if (shadow) next.push(shadow)
        next.push(s)
      }
      return next
    })
    setSelectionSet(Array.from(shadows.values()).map(s => s.id))
    setShadowPopoverOpen(false)
    showToast('✓ Shadow layers added', 'success')
  }

  function makeSticker(distance = 20) {
    // Prefer selection (if any valid shapes are selected), else all visible unlocked shapes
    const fromSel = selectionSet
      .map(id => shapes.find(s => s.id === id))
      .filter((s): s is SvgShape => !!s && s.visible && !s.locked)
    const targets = fromSel.length >= 1 ? fromSel : shapes.filter(s => s.visible && !s.locked)
    if (!targets.length) return
    setOffsetApplying(true)
    computeFullOffsetWithTimeout(targets, distance, 'round', true, false, OFFSET_COMPUTE_TIMEOUT_MS).then(worldPath => {
      if (!worldPath) { setImportError('Could not build sticker outline for these shapes.'); return }
      setImportError(null)
      const bbox = pathWorldBbox(worldPath)
      const cx = bbox ? bbox.x + bbox.width / 2 : AB / 2
      const cy = bbox ? bbox.y + bbox.height / 2 : AB / 2
      const pw = bbox ? Math.max(MIN_SIZE, bbox.width) : MIN_SIZE
      const ph = bbox ? Math.max(MIN_SIZE, bbox.height) : MIN_SIZE
      const centeredPath = transformPathData(worldPath, -cx, -cy, 0)
      // Insert sticker layer behind all shapes (index 0 = renders first = behind everything)
      const highestIdx = Math.max(...targets.map(s => shapes.findIndex(x => x.id === s.id)).filter(i => i >= 0))
      void highestIdx // used for reference only; sticker always goes to back
      const stickerLayer = normalizeShape({
        ...defaultShape('path', 'Sticker'),
        id: createId('path'),
        kind: 'path',
        pathData: centeredPath,
        hiddenContours: [],
        fill: '#ffffff',
        stroke: 'none',
        strokeWidth: 0,
        strokeLinejoin: 'round',
        opacity: 1,
        x: cx, y: cy, width: pw, height: ph, rotation: 0,
        isOffsetLayer: true,
        offsetSourceId: targets[0].id,
        offsetDistance: distance,
        offsetSourceSignature: offsetSourceSignature(targets[0]),
      })
      pushHistory(shapes)
      setShapes(prev => {
        const next = [...prev]
        next.splice(0, 0, stickerLayer)
        return next
      })
      setSelectionSet([stickerLayer.id])
    }).catch((error: unknown) => {
      if (isOffsetComputeTimeoutError(error)) {
        setImportError('Sticker outline timed out. Try selecting fewer layers or simplifying geometry.')
        showToast('Sticker outline timed out.', 'warning')
        return
      }
      setImportError('Sticker outline failed unexpectedly. Try simplifying the selection.')
      showToast('Sticker outline failed unexpectedly.', 'error')
    }).finally(() => {
      setOffsetApplying(false)
    })
  }

  function sliceSelectedPair() {
    if (selectionSet.length !== 2) return
    const selectedShapes = selectionSet
      .map(id => shapes.find(s => s.id === id))
      .filter((s): s is SvgShape => !!s)
      .filter(s => s.kind !== 'text')
    if (selectedShapes.length !== 2) return

    const ordered = [...selectedShapes].sort((a, b) => shapes.findIndex(s => s.id === a.id) - shapes.findIndex(s => s.id === b.id))
    const base = ordered[0]
    const cutter = ordered[1]
    const basePath = transformPathData(shapeToLocalPath(base), base.x, base.y, base.rotation)
    const cutterPath = transformPathData(shapeToLocalPath(cutter), cutter.x, cutter.y, cutter.rotation)
    const sliced = slicePathData(basePath, cutterPath)
    if (!sliced) return

    const makePiece = (name: string, from: SvgShape, d: string): SvgShape | null => {
      const pathData = d.trim()
      if (!pathData) return null
      const bbox = pathWorldBbox(pathData)
      const cx = bbox ? bbox.x + bbox.width / 2 : from.x
      const cy = bbox ? bbox.y + bbox.height / 2 : from.y
      const centeredPath = transformPathWithPaperTranslate(pathData, -cx, -cy)
      return normalizeShape({
        ...defaultShape('path', name),
        id: createId('path'),
        kind: 'path',
        name,
        pathData: centeredPath,
        hiddenContours: [],
        fill: from.fill,
        stroke: from.stroke,
        strokeWidth: from.strokeWidth,
        strokeLinejoin: from.strokeLinejoin,
        opacity: from.opacity,
        x: cx,
        y: cy,
        width: bbox ? Math.max(MIN_SIZE, bbox.width) : Math.max(MIN_SIZE, from.width),
        height: bbox ? Math.max(MIN_SIZE, bbox.height) : Math.max(MIN_SIZE, from.height),
        rotation: 0,
        isOffsetLayer: false,
        offsetSourceId: null,
        offsetDistance: 0,
        attachedGroupId: null,
      })
    }

    const pieces = [
      makePiece(`${base.name} Slice A`, base, sliced.baseMinus),
      makePiece('Slice Overlap', cutter, sliced.overlap),
      makePiece(`${cutter.name} Slice B`, cutter, sliced.cutterMinus),
    ].filter((s): s is SvgShape => !!s)

    if (!pieces.length) return
    pushHistory(shapes)

    const firstIndex = Math.min(shapes.findIndex(s => s.id === base.id), shapes.findIndex(s => s.id === cutter.id))
    const remove = new Set([base.id, cutter.id])
    const kept = shapes.filter(s => !remove.has(s.id))
    const insertAt = firstIndex < 0 ? kept.length : Math.min(firstIndex, kept.length)
    const next = [...kept]
    next.splice(insertAt, 0, ...pieces)
    setShapes(next)
    setSelectionSet(pieces.map(p => p.id))
  }

  async function booleanOp(op: 'unite' | 'subtract' | 'intersect' | 'exclude', customName?: string) {
    const targets = selectionSet
      .map(id => shapes.find(s => s.id === id))
      .filter((s): s is SvgShape => !!s && s.visible)
    if (targets.length < 2) return
    if (booleanApplying) return

    setBooleanApplying(true)
    // Yield to the browser so React can render the disabled state before blocking computation
    await new Promise<void>(resolve => setTimeout(resolve, 0))

    try {
      const ordered = [...targets].sort((a, b) =>
        shapes.findIndex(s => s.id === a.id) - shapes.findIndex(s => s.id === b.id),
      )

      // Convert each shape to a world-space path string.
      // Text uses true glyph curves so boolean ops match what users see on canvas.
      const toWorldPathData = async (s: SvgShape): Promise<string | null> => {
        if (s.kind === 'text') {
          const glyphPaths = await textShapeToGlyphPathsAsync(s)
          if (glyphPaths === null) return null
          if (glyphPaths.length === 0) return ''
          return glyphPaths.join(' ')
        }
        const local = shapeToLocalPath(s)
        return local ? transformPathData(local, s.x, s.y, s.rotation) : null
      }

      const rawPaths = await Promise.all(ordered.map(toWorldPathData))
      if (rawPaths.some(d => d === null)) {
        setImportError('Combine failed: one or more text layers could not be converted to glyph outlines.')
        return
      }
      const pathStrings = rawPaths.filter((d): d is string => !!d)
      if (pathStrings.length < 2) return

      pushHistory(shapes)

      let d = pathStrings[0]
      for (let i = 1; i < pathStrings.length; i++) {
        d = paperBooleanPathData(d, pathStrings[i], op)
        if (!d) break
      }
      if (!d) return

      const primary = ordered[0]
      const bbox = pathWorldBbox(d)
      const cx = bbox ? bbox.x + bbox.width / 2 : primary.x
      const cy = bbox ? bbox.y + bbox.height / 2 : primary.y
      const centeredPath = transformPathWithPaperTranslate(d, -cx, -cy)

      const combineGid = createId('cgrp')
      const combined: SvgShape = normalizeShape({
        ...defaultShape('path', 'Combined'),
        id: createId('path'),
        kind: 'path',
        name: customName ?? `${op.charAt(0).toUpperCase() + op.slice(1)}`,
        pathData: centeredPath,
        hiddenContours: [],
        fill: primary.fill,
        stroke: primary.stroke,
        strokeWidth: primary.strokeWidth,
        opacity: primary.opacity,
        x: cx,
        y: cy,
        width: bbox ? Math.max(MIN_SIZE, bbox.width) : Math.max(MIN_SIZE, primary.width),
        height: bbox ? Math.max(MIN_SIZE, bbox.height) : Math.max(MIN_SIZE, primary.height),
        rotation: 0,
        combineGroupId: combineGid,
      })

      // Keep originals as non-destructive children under the combine result
      const firstIdx = Math.min(...targets.map(s => shapes.findIndex(x => x.id === s.id)).filter(i => i >= 0))
      const targetIds = new Set(targets.map(s => s.id))
      const next = shapes.map(s =>
        targetIds.has(s.id) ? { ...s, attachedGroupId: combineGid } : s
      )
      next.splice(firstIdx, 0, combined)
      setShapes(next)
      setSelectionSet([combined.id])
    } catch (e) {
      console.error('[booleanOp] failed:', e)
    } finally {
      setBooleanApplying(false)
    }
  }

  // ── Pointer ────────────────────────────────────────────────────────────────

  function getSvgPoint(e: React.PointerEvent): { x: number; y: number } | null {
    const el = svgRef.current
    if (!el) return null
    const ctm = el.getScreenCTM()
    if (!ctm) return null
    const inv = ctm.inverse()
    const pt = el.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const local = pt.matrixTransform(inv)
    return { x: local.x, y: local.y }
  }

  function startMove(e: React.PointerEvent, shapeId: string) {
    if (penMode || pathEditMode) return
    const pt = getSvgPoint(e); if (!pt) return
    const shape = shapes.find(s => s.id === shapeId); if (!shape) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pushHistory(shapes)
    let ids = selectionSet.includes(shapeId) ? selectionSet : [shapeId]
    if (ids.length === 1) {
      const groupId = shape.attachedGroupId
      if (groupId) {
        ids = shapes.filter(s => s.attachedGroupId === groupId && !s.locked).map(s => s.id)
      }
    }
    if (!selectionSet.includes(shapeId) && ids.length > 1) {
      setSelectionSet(ids)
    }
    const origins: Record<string, SvgShape> = {}
    for (const id of ids) {
      const s = shapes.find(sh => sh.id === id)
      if (s) origins[id] = s
    }
    setDragState({ pointerId: e.pointerId, shapeId, mode: 'move', startX: pt.x, startY: pt.y, origins })
  }

  function startResize(e: React.PointerEvent, shapeId: string, handle: ResizeHandle) {
    if (penMode || pathEditMode) return
    const pt = getSvgPoint(e); if (!pt) return
    const shape = shapes.find(s => s.id === shapeId); if (!shape) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pushHistory(shapes)
    const allSelectedIds = [...new Set([...selectionSet, shapeId])]
    const origins: Record<string, SvgShape> = {}
    for (const id of allSelectedIds) {
      const sh = shapes.find(s => s.id === id)
      if (sh) origins[id] = sh
    }
    setDragState({ pointerId: e.pointerId, shapeId, mode: 'resize', handle, startX: pt.x, startY: pt.y, origins })
  }

  function startPathAnchorDrag(e: React.PointerEvent, shapeId: string, pointIndex: number) {
    if (!pathEditMode) return
    const pt = getSvgPoint(e); if (!pt) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    pushHistory(shapes)
    setPathAnchorDragState({ pointerId: e.pointerId, shapeId, pointIndex })
    setSelectedAnchor({ shapeId, pointIndex })
    setShapes(prev => prev.map(s => s.id === shapeId ? movePathAnchor(s, pointIndex, pt.x, pt.y) : s))
  }

  function startPathHandleDrag(e: React.PointerEvent, shapeId: string, pointIndex: number, handle: 'in' | 'out') {
    if (!pathEditMode) return
    const pt = getSvgPoint(e); if (!pt) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    pushHistory(shapes)
    setPathAnchorDragState({ pointerId: e.pointerId, shapeId, pointIndex, handle })
    setSelectedAnchor({ shapeId, pointIndex })
    setShapes(prev => prev.map(s => s.id === shapeId ? movePathHandle(s, pointIndex, handle, pt.x, pt.y) : s))
  }

  function insertPathAnchorAtPointer(e: React.MouseEvent, shapeId: string) {
    if (!pathEditMode) return
    const pt = getSvgPoint(e as unknown as React.PointerEvent)
    if (!pt) return
    e.stopPropagation()
    const shape = shapes.find(s => s.id === shapeId)
    if (!shape || shape.kind !== 'path') return
    pushHistory(shapes)
    const next = insertPathAnchor(shape, pt.x, pt.y)
    setShapes(prev => prev.map(s => s.id === shapeId ? next : s))
  }

  function handlePointerMove(e: React.PointerEvent) {
    const pt = getSvgPoint(e); if (!pt) return
    if (marqueeState && marqueeState.pointerId === e.pointerId) {
      const nextMarquee = { ...marqueeState, currentX: pt.x, currentY: pt.y }
      setMarqueeState(nextMarquee)
      const box = selectionRect(nextMarquee.startX, nextMarquee.startY, nextMarquee.currentX, nextMarquee.currentY)
      const hitIds = shapes
        .filter(s => s.visible && rectsOverlap(shapeSelectionBounds(s), box))
        .map(s => s.id)
      if (nextMarquee.additive) {
        const merged = [...new Set([...nextMarquee.baseSelection, ...hitIds])]
        setSelectionSet(merged)
      } else {
        setSelectionSet(hitIds)
      }
      return
    }
    if (pathAnchorDragState && pathAnchorDragState.pointerId === e.pointerId) {
      setShapes(prev => prev.map(s => s.id === pathAnchorDragState.shapeId
        ? (pathAnchorDragState.handle
          ? movePathHandle(s, pathAnchorDragState.pointIndex, pathAnchorDragState.handle, pt.x, pt.y)
          : movePathAnchor(s, pathAnchorDragState.pointIndex, pt.x, pt.y))
        : s,
      ))
      return
    }
    if (drawState && drawState.pointerId === e.pointerId) {
      const pts = [...drawState.points, pt]
      setDrawState({ ...drawState, points: pts })
      const d = freehandPath(pts)
      setShapes(prev => prev.map(s => s.id === drawState.shapeId ? normalizeShape({ ...s, pathData: d }) : s))
      return
    }
    if (!dragState || dragState.pointerId !== e.pointerId) return
    const dx = pt.x - dragState.startX, dy = pt.y - dragState.startY
    setShapes(prev => prev.map(s => {
      if (!dragState.origins[s.id]) return s
      const base = dragState.origins[s.id]
      const next = { ...base }
      if (dragState.mode === 'move') {
        next.x = base.x + dx; next.y = base.y + dy
        return normalizeShape(next)
      }
      const h = dragState.handle
      const draggedBase = dragState.origins[dragState.shapeId]
      // Compute scale factors from the dragged (active) shape
      let scaleW = 1, scaleH = 1
      const cornerHandle = h === 'nw' || h === 'ne' || h === 'se' || h === 'sw'
      if ((draggedBase.kind === 'circle' || draggedBase.kind === 'ring') && h === 'radius') {
        scaleW = scaleH = Math.max(1, draggedBase.radius + dx) / draggedBase.radius
      } else {
        const dirX = h === 'e' || h === 'ne' || h === 'se' ? 1 : h === 'w' || h === 'nw' || h === 'sw' ? -1 : 0
        const dirY = h === 's' || h === 'se' || h === 'sw' ? 1 : h === 'n' || h === 'ne' || h === 'nw' ? -1 : 0
        const srcW = draggedBase.kind === 'text' ? Math.max(16, draggedBase.width) : Math.max(16, draggedBase.width)
        const srcH = draggedBase.kind === 'text' ? Math.max(16, draggedBase.height) : Math.max(16, draggedBase.height)
        const scaleXFromDrag = dirX !== 0 ? Math.max(0.06, srcW + dirX * dx * 2) / srcW : 1
        const scaleYFromDrag = dirY !== 0 ? Math.max(0.06, srcH + dirY * dy * 2) / srcH : 1
        if (cornerHandle) {
          const useX = Math.abs(dx / srcW) >= Math.abs(dy / srcH)
          const uniform = useX ? scaleXFromDrag : scaleYFromDrag
          scaleW = uniform
          scaleH = uniform
        } else {
          scaleW = scaleXFromDrag
          scaleH = scaleYFromDrag
        }
      }
      // Apply the same scale to this shape
      if (base.kind === 'circle' || base.kind === 'ring') next.radius = base.radius * scaleW
      else if (base.kind === 'path') {
        next.width = base.width * scaleW
        next.height = base.height * scaleH
        next.pathData = scaleLocalPathData(base.pathData, scaleW, scaleH)
      }
      else if (base.kind === 'text') {
        next.width = base.width * scaleW
        next.height = base.height * scaleH
      }
      else { next.width = base.width * scaleW; next.height = base.height * scaleH }
      return normalizeShape(next)
    }))
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (pathAnchorDragState && pathAnchorDragState.pointerId === e.pointerId) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      setPathAnchorDragState(null)
      return
    }
    if (drawState && drawState.pointerId === e.pointerId) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      setDrawState(null); return
    }
    if (marqueeState && marqueeState.pointerId === e.pointerId) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      setMarqueeState(null)
      return
    }
    if (!dragState || dragState.pointerId !== e.pointerId) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDragState(null)
  }

  function freehandPath(pts: { x: number; y: number }[]): string {
    if (pts.length < 2) return ''
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x - AB / 2},${p.y - AB / 2}`).join(' ')
  }

  const handleArtboardDown = useCallback((e: React.PointerEvent) => {
    if (e.target === e.currentTarget) {
      setActivePanel(null)
    }
    if (penMode) {
      if (e.button !== 0) return
      const pt = getSvgPoint(e); if (!pt) return
      pushHistory(shapes)
      const s = normalizeShape({ ...defaultShape('path'), pathData: '' })
      setShapes(prev => [...prev, s])
      setSelectionSet([s.id])
      e.currentTarget.setPointerCapture(e.pointerId)
      setDrawState({ pointerId: e.pointerId, shapeId: s.id, points: [pt] })
    } else {
      if (e.button !== 0) return
      const pt = getSvgPoint(e); if (!pt) return
      const additive = e.shiftKey || e.ctrlKey || e.metaKey
      const baseSelection = additive ? selectionSet : []
      setSelectionSet(baseSelection)
      e.currentTarget.setPointerCapture(e.pointerId)
      setMarqueeState({
        pointerId: e.pointerId,
        startX: pt.x,
        startY: pt.y,
        currentX: pt.x,
        currentY: pt.y,
        additive,
        baseSelection,
      })
    }
  }, [penMode, shapes, selectionSet])

  function handleShapeSelect(e: React.PointerEvent, shapeId: string) {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      setSelectionSet(prev => prev.includes(shapeId) ? prev.filter(x => x !== shapeId) : [...prev, shapeId])
    } else {
      setSelectionSet([shapeId])
    }
  }

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Could not read image file.'))
      reader.readAsDataURL(file)
    })
  }

  function getImageSize(src: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 })
      img.onerror = () => reject(new Error('Could not load imported image.'))
      img.src = src
    })
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    try {
      const isSvgFile = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)
      if (isSvgFile) {
        const text = await file.text()
        const parsed = parseSvgImport(text)
        if (!parsed.length) {
          setImportError('No supported elements found (shapes, text, or images).')
        } else {
          pushHistory(shapes)
          setImportError(null)
          setShapes(prev => [...prev, ...parsed])
          setSelectionSet(parsed.length ? [parsed[parsed.length - 1].id] : [])
          if (!name.trim()) setName(file.name.replace(/\.svg$/i, ''))
        }
      } else if (file.type.startsWith('image/')) {
        const href = await fileToDataUrl(file)
        const { width: rawW, height: rawH } = await getImageSize(href)
        const safeW = Math.max(1, rawW)
        const safeH = Math.max(1, rawH)
        const maxDim = AB * 0.62
        const scale = Math.min(1, maxDim / safeW, maxDim / safeH)
        const imported = normalizeShape({
          ...defaultShape('image', file.name.replace(/\.[^.]+$/, '') || 'Image'),
          imageHref: href,
          width: Math.max(MIN_SIZE, safeW * scale),
          height: Math.max(MIN_SIZE, safeH * scale),
          fill: 'none',
          stroke: 'none',
          strokeWidth: 0,
        })
        pushHistory(shapes)
        setImportError(null)
        setShapes(prev => [...prev, imported])
        setSelectionSet([imported.id])
      } else {
        setImportError('Unsupported file type. Import an SVG, PNG, JPG, WEBP, or GIF file.')
      }
    } catch {
      setImportError('Could not import this file.')
    }
    finally { e.target.value = '' }
  }

  function rasterizeSvgToPngDataUrl(svgMarkup: string, size = 2048): Promise<string> {
    return new Promise((resolve, reject) => {
      const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
      const blobUrl = URL.createObjectURL(blob)
      const img = new Image()
      img.decoding = 'async'

      const cleanup = () => URL.revokeObjectURL(blobUrl)

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = size
          canvas.height = size
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            cleanup()
            reject(new Error('Could not create 2D canvas context'))
            return
          }
          ctx.clearRect(0, 0, size, size)
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(img, 0, 0, size, size)
          const pngUrl = canvas.toDataURL('image/png')
          cleanup()
          resolve(pngUrl)
        } catch (err) {
          cleanup()
          reject(err)
        }
      }

      img.onerror = () => {
        cleanup()
        reject(new Error('SVG rasterization failed'))
      }

      img.src = blobUrl
    })
  }

  async function buildSvgMarkupForExport(exportShapes: SvgShape[]): Promise<string> {
    if (!exportShapes.length) {
      throw new Error('No visible shapes to export')
    }

    const exportFonts = exportShapes
      .filter((s): s is SvgShape => s.kind === 'text' && !!s.fontUrl)
      .map(s => ({ family: s.fontFamily, url: s.fontUrl }))
      .filter((f, i, arr) => arr.findIndex(x => x.family === f.family && x.url === f.url) === i)

    for (const f of exportFonts) ensureFontFaceInjected(f.family, f.url)

    if (typeof document !== 'undefined' && 'fonts' in document) {
      await Promise.all(exportFonts.map(f => document.fonts.load(`16px "${f.family}"`).catch((err) => {
        console.warn(`Font load failed for ${f.family}:`, err)
        return []
      })))
    }

    const body = exportShapes.map(shapeToSvgString).filter(Boolean).join('')
    if (!body.trim()) {
      throw new Error('No valid shapes to export')
    }

    const embeddedFontCss = (await Promise.all(exportFonts.map(async (f) => {
      try {
        const dataUri = await fontUrlToDataUri(f.url)
        const src = dataUri ?? resolveAbsoluteUrl(f.url)
        return `@font-face { font-family: "${f.family}"; src: url("${src}"); font-display: block; }`
      } catch (err) {
        console.warn(`Font embedding failed for ${f.family}:`, err)
        return `/* Font ${f.family} not embedded */`
      }
    }))).join('\n')

    const defs = embeddedFontCss ? `<defs><style><![CDATA[${embeddedFontCss}]]></style></defs>` : ''
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${AB}" height="${AB}" viewBox="0 0 ${AB} ${AB}" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">${defs}${body}</svg>`
  }

  async function exportFromPrintSettings(): Promise<boolean> {
    const exportShapes = shapes.filter(s => s.visible)
    if (!exportShapes.length) {
      showToast('All layers are hidden. Show at least one layer to export', 'warning')
      return false
    }

    const baseName = safeFileStem(name || 'custom-logo')
    try {
      setPrintExportStatus('Preparing fonts and vector data...')
      const svgMarkup = await buildSvgMarkupForExport(exportShapes)

      if (printSettings.format === 'SVG') {
        setPrintExportStatus('Writing SVG file...')
        const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
        triggerBlobDownload(svgBlob, `${baseName}.svg`)
        showToast(`✓ Exported ${baseName}.svg`, 'success')
        return true
      }

      setPrintExportStatus('Rendering high-quality PNG...')
      const dpiScale = clamp(printSettings.dpi / 150, 0.5, 4)
      const rasterSize = Math.round(clamp(2048 * dpiScale, 1024, 8192))
      const pngDataUrl = await rasterizeSvgToPngDataUrl(svgMarkup, rasterSize)

      if (printSettings.format === 'PNG') {
        setPrintExportStatus('Writing PNG file...')
        const pngBlob = await (await fetch(pngDataUrl)).blob()
        triggerBlobDownload(pngBlob, `${baseName}.png`)
        showToast(`✓ Exported ${baseName}.png (${printSettings.dpi} DPI)`, 'success')
        return true
      }

      setPrintExportStatus('Building PDF document...')
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: [AB, AB] })
      pdf.addImage(pngDataUrl, 'PNG', 0, 0, AB, AB, undefined, 'FAST')
      const pdfBlob = pdf.output('blob')
      setPrintExportStatus('Writing PDF file...')
      triggerBlobDownload(pdfBlob, `${baseName}.pdf`)
      showToast(`✓ Exported ${baseName}.pdf`, 'success')
      return true
    } catch (err) {
      console.error('Print export failed:', err)
      showToast('Print export failed: ' + (err instanceof Error ? err.message : 'Unknown error'), 'error')
      return false
    }
  }

  function handleSave(format: 'svg' | 'png' = saveFormat) {
    if (!shapes.length) {
      showToast('Add shapes or text before saving', 'warning')
      return
    }
    const visibleShapes = shapes.filter(s => s.visible)
    if (!visibleShapes.length) {
      showToast('All layers are hidden. Show at least one layer', 'warning')
      return
    }
    const presetName = name.trim() || 'Custom Logo'

    void (async () => {
      try {
        const svgMarkup = await buildSvgMarkupForExport(visibleShapes)
        const svgImageUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`
        if (format === 'svg') {
          // Preserve vector fidelity by storing the SVG data URL as the source.
          onSave({ name: presetName, imageUrl: svgImageUrl, svgMarkup })
          showToast(`✓ Saved "${presetName}" as SVG`, 'success')
          return
        }

        try {
          const pngDataUrl = await rasterizeSvgToPngDataUrl(svgMarkup, 2048)
          // Keep created presets SVG-based for reliable preview + future SVG edits,
          // while still providing a PNG file to the user when requested.
          onSave({ name: presetName, imageUrl: svgImageUrl, svgMarkup })
          const pngBlob = await (await fetch(pngDataUrl)).blob()
          triggerBlobDownload(pngBlob, `${presetName.replace(/\s+/g, '-').toLowerCase()}.png`)
          showToast(`✓ Saved "${presetName}" preset + downloaded PNG`, 'success')
        } catch (err) {
          console.warn('PNG rasterization failed, falling back to SVG:', err)
          onSave({ name: presetName, imageUrl: svgImageUrl, svgMarkup })
          showToast(`✓ Saved "${presetName}" as SVG (PNG fallback)`, 'warning')
        }
      } catch (err) {
        console.error('Export error:', err)
        showToast('Export failed: ' + (err instanceof Error ? err.message : 'Unknown error'), 'error')
      }
    })()
  }

  // Register save trigger for parent
  if (saveRef) saveRef.current = handleSave
  if (undoRef) undoRef.current = doUndo
  if (redoRef) redoRef.current = doRedo
  if (exportRef) exportRef.current = () => setPrintExportOpen(true)

  // ── Render ─────────────────────────────────────────────────────────────────

  const sliceCandidates = selectionSet
    .map(id => shapes.find(s => s.id === id))
    .filter((s): s is SvgShape => !!s)
  const sliceEnabled = sliceCandidates.length === 2 && sliceCandidates.every(s => s.kind !== 'text' && !!shapeToLocalPath(s))
  const attachEnabled = selectionSet.length >= 2
  const attachedSelection = attachEnabled
    && (() => {
      const selectedShapes = sliceCandidates
      const first = selectedShapes[0]?.attachedGroupId ?? null
      return !!first && selectedShapes.every(s => s.attachedGroupId === first)
    })()
  const flattenEnabled = !!selected && selected.kind !== 'path' && selected.kind !== 'text'
  const offsetEnabled = selectionSet.length > 0
  const combineToolbarEnabled = sliceEnabled || compoundable || flattenEnabled || booleanEnabled
  const offsetStaleIds = useMemo(() => {
    const shapeById = new Map(shapes.map(s => [s.id, s]))
    const ids = new Set<string>()
    for (const layer of shapes) {
      if (!layer.isOffsetLayer || !layer.offsetSourceId || !layer.offsetSourceSignature) continue
      const source = shapeById.get(layer.offsetSourceId)
      if (!source || offsetSourceSignature(source) !== layer.offsetSourceSignature) {
        ids.add(layer.id)
      }
    }
    return ids
  }, [shapes])
  const selectedOffsetStale = !!selected && offsetStaleIds.has(selected.id)
  const selectedOffsetSource = selected?.isOffsetLayer && selected.offsetSourceId
    ? shapes.find(s => s.id === selected.offsetSourceId) ?? null
    : null
  const selectedUsesFillOnlyOffsetStyle = !!selected
    && selected.isOffsetLayer
    && (selected.kind === 'text' || selectedOffsetSource?.kind === 'text')

  // Live offset preview — computed from draft popover values, rendered as ghost outlines
  // Contour always operates on the focused shape even when multiple are selected
  const contourTarget = selected ?? null

  return (
    <div className="svg-maker-page">
      {/* ── Contour Modal ── */}
      {contourEditorOpen && contourShape && (
        <ContourModal
          shape={contourShape}
          onClose={() => {
            setContourEditorOpen(false)
            setContourShapeId(null)
          }}
          onApply={hiddenContours => {
            pushHistory(shapes)
            setShapes(prev => prev.map(s => s.id === contourShape.id ? normalizeShape({ ...s, hiddenContours }) : s))
            setContourEditorOpen(false)
            setContourShapeId(null)
          }}
        />
      )}

      <header className="svg-maker-header">
        <div className="svg-maker-top-props">

          {/* ── No selection ── */}
          {!selected && !multiSel && (
            <span className="svg-maker-top-empty">Select a shape to edit its properties.</span>
          )}
          {multiSel && !selected && (
            <span className="svg-maker-top-empty">{selectionSet.length} shapes selected — use layer controls or Weld.</span>
          )}

          {selected && (
            <>
              {/* Kind badge */}
              <span className="svg-tb-kind">{selected.kind}</span>
              <span className="svg-tb-divider" />

              {/* ── Position ── */}
              <div className="svg-tb-section">
                <span className="svg-tb-section-label">Position</span>
                <div className="svg-tb-row">
                  <label className="svg-tb-field">
                    <span>X</span>
                    <input type="number" className="svg-tb-input" value={Math.round(selected.x)} onFocus={commitHistory} onBlur={resetHistoryCommit} onChange={e => updateSelected({ x: +e.target.value })} />
                  </label>
                  <label className="svg-tb-field">
                    <span>Y</span>
                    <input type="number" className="svg-tb-input" value={Math.round(selected.y)} onFocus={commitHistory} onBlur={resetHistoryCommit} onChange={e => updateSelected({ y: +e.target.value })} />
                  </label>
                </div>
              </div>
              <span className="svg-tb-divider" />

              {/* ── Size ── */}
              <div className="svg-tb-section">
                <span className="svg-tb-section-label">Size</span>
                <div className="svg-tb-row">
                  {(selected.kind === 'circle' || selected.kind === 'ring') ? (
                    <label className="svg-tb-field">
                      <span>R</span>
                      <input type="number" className="svg-tb-input" value={Math.round(selected.radius)} onFocus={commitHistory} onBlur={resetHistoryCommit} onChange={e => updateSelected({ radius: +e.target.value })} />
                    </label>
                  ) : selected.kind === 'line' ? (
                    <label className="svg-tb-field">
                      <span>Len</span>
                      <input type="number" className="svg-tb-input" value={Math.round(selected.width)} onFocus={commitHistory} onBlur={resetHistoryCommit} onChange={e => updateSelected({ width: +e.target.value })} />
                    </label>
                  ) : (
                    <>
                      <label className="svg-tb-field">
                        <span>W</span>
                        <input type="number" className="svg-tb-input" value={Math.round(selected.width)} onFocus={commitHistory} onBlur={resetHistoryCommit} onChange={e => updateSelected({ width: +e.target.value })} />
                      </label>
                      <label className="svg-tb-field">
                        <span>H</span>
                        <input type="number" className="svg-tb-input" value={Math.round(selected.height)} onFocus={commitHistory} onBlur={resetHistoryCommit} onChange={e => updateSelected({ height: +e.target.value })} />
                      </label>
                    </>
                  )}
                </div>
              </div>
              <span className="svg-tb-divider" />

              {/* ── Rotate ── */}
              <div className="svg-tb-section">
                <span className="svg-tb-section-label">Rotate</span>
                <div className="svg-tb-row">
                  <button type="button" className="svg-tb-mini-btn" onClick={() => rotateSelected(-ANGLE_SNAP)} title="-15°">−15°</button>
                  <label className="svg-tb-field">
                    <span>°</span>
                    <input type="number" className="svg-tb-input" value={selected.rotation} onFocus={commitHistory} onBlur={resetHistoryCommit} onChange={e => updateSelected({ rotation: +e.target.value }, { snapAng: true })} />
                  </label>
                  <button type="button" className="svg-tb-mini-btn" onClick={() => rotateSelected(ANGLE_SNAP)} title="+15°">+15°</button>
                </div>
              </div>
              <span className="svg-tb-divider" />

              {/* ── Flip ── */}
              <div className="svg-tb-section">
                <span className="svg-tb-section-label">Flip</span>
                <button type="button" className="svg-tb-mini-btn" onClick={mirrorSelected} title="Mirror horizontally">↔ X</button>
              </div>
              <span className="svg-tb-divider" />

              {/* ── Opacity ── */}
              <div className="svg-tb-section">
                <span className="svg-tb-section-label">Opacity</span>
                <div className="svg-tb-row">
                  <input type="range" min={0} max={1} step={0.05} value={selected.opacity}
                    onMouseDown={commitHistory} onMouseUp={resetHistoryCommit}
                    onChange={e => updateSelected({ opacity: +e.target.value })}
                    className="svg-tb-slider" />
                  <span className="svg-tb-val">{Math.round(selected.opacity * 100)}%</span>
                </div>
              </div>
              <span className="svg-tb-divider" />

              {/* ── Effects ── */}
              <div className="svg-tb-section">
                <span className="svg-tb-section-label">Effects</span>
                <button
                  ref={topEffectsBtnRef}
                  type="button"
                  className={`svg-tb-mini-btn${effectsMenuOpen ? ' active' : ''}`}
                  onClick={() => {
                    if (topEffectsBtnRef.current) {
                      const r = topEffectsBtnRef.current.getBoundingClientRect()
                      setEffectsMenuPos({ top: r.bottom + 8, left: Math.max(8, Math.min(window.innerWidth - 190, r.left)) })
                    }
                    setEffectsMenuOpen(v => !v)
                    setTopCombineMenuOpen(false)
                  }}
                  disabled={!offsetEnabled}
                  title="Open effects menu">
                  ✦ Effects ▾
                </button>
                {selected.isOffsetLayer && selectedOffsetStale && (
                  <button type="button" className="svg-tb-mini-btn active" onClick={() => recomputeOffsetLayer(selected.id)}>
                    Recompute
                  </button>
                )}
              </div>
              <span className="svg-tb-divider" />

              {/* ── Combine ── */}
              <div className="svg-tb-section">
                <span className="svg-tb-section-label">Combine</span>
                <button
                  ref={topCombineBtnRef}
                  type="button"
                  className={`svg-tb-mini-btn${topCombineMenuOpen ? ' active' : ''}`}
                  onClick={() => {
                    if (topCombineBtnRef.current) {
                      const r = topCombineBtnRef.current.getBoundingClientRect()
                      setTopCombineMenuPos({ top: r.bottom + 8, left: Math.max(8, Math.min(window.innerWidth - 306, r.left)) })
                    }
                    setTopCombineMenuOpen(v => !v)
                    setEffectsMenuOpen(false)
                  }}
                  disabled={!combineToolbarEnabled}
                  title="Open combine operations">
                  Combine ▾
                </button>
              </div>
              <span className="svg-tb-divider" />

              {/* ── Fill / Stroke ── */}
              <div className="svg-tb-section">
                <span className="svg-tb-section-label">Fill</span>
                <WrapColorPicker value={selected.fill === 'none' ? '#000000' : selected.fill} disabled={selected.kind === 'line'} onChange={hex => updateSelectedWithHistory({ fill: hex })} label="Fill color" />
              </div>
              {!selectedUsesFillOnlyOffsetStyle && (
                <div className="svg-tb-section">
                  <span className="svg-tb-section-label">Stroke</span>
                  <div className="svg-tb-row">
                    <WrapColorPicker value={selected.stroke === 'none' ? '#000000' : selected.stroke} onChange={hex => updateSelectedWithHistory({ stroke: hex })} label="Stroke color" />
                    <label className="svg-tb-field">
                      <span>SW</span>
                      <input type="number" className="svg-tb-input" min={0} value={selected.strokeWidth} onFocus={commitHistory} onBlur={resetHistoryCommit} onChange={e => updateSelected({ strokeWidth: +e.target.value })} />
                    </label>
                  </div>
                </div>
              )}

              {/* ── Advanced Fill / Stroke ── */}
              <div className="svg-tb-section">
                <span className="svg-tb-section-label">Fill Options</span>
                <div className="svg-tb-row">
                  <button
                    type="button"
                    className="svg-tb-mini-btn"
                    title="Edit fill gradient"
                    onClick={() => { setGradientEditorTarget('fill'); setGradientEditorOpen(true) }}>
                    ◉ Gradient
                  </button>
                  <button
                    type="button"
                    className="svg-tb-mini-btn"
                    title="Remove fill gradient"
                    onClick={() => updateSelectedWithHistory({ fillGradient: null })}
                    disabled={!selected.fillGradient}>
                    Clear
                  </button>
                </div>
              </div>

              {!selectedUsesFillOnlyOffsetStyle && (
                <div className="svg-tb-section">
                  <span className="svg-tb-section-label">Stroke Pattern</span>
                  <div className="svg-tb-row">
                    <label className="svg-tb-field">
                      <span>Dash</span>
                      <input
                        type="text"
                        className="svg-tb-input"
                        placeholder="e.g., 5,5 or 10,5,2,5"
                        value={selected.strokeDasharray}
                        onFocus={commitHistory}
                        onBlur={resetHistoryCommit}
                        onChange={e => updateSelected({ strokeDasharray: e.target.value })}
                        title="SVG stroke-dasharray: space-separated values for dash/gap pattern"
                      />
                    </label>
                    <label className="svg-tb-field">
                      <span>Offset</span>
                      <input
                        type="number"
                        className="svg-tb-input"
                        value={selected.strokeDashoffset}
                        onFocus={commitHistory}
                        onBlur={resetHistoryCommit}
                        onChange={e => updateSelected({ strokeDashoffset: +e.target.value })}
                        title="Offset animation dash pattern start position"
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* ── Text-only section ── */}
              {selected.kind === 'text' && (
                <>
                  <span className="svg-tb-divider" />
                  <div className="svg-tb-section">
                    <span className="svg-tb-section-label">Text</span>
                    <input className="svg-tb-input svg-tb-text-input" value={selected.text}
                      onFocus={commitHistory} onBlur={resetHistoryCommit}
                      onChange={e => updateSelected({ text: e.target.value })} />
                  </div>
                  <div className="svg-tb-section">
                    <div className="svg-tb-row svg-tb-font-size-row">
                      <label className="svg-tb-field svg-tb-font-field">
                        <span>Font</span>
                        <select className="svg-tb-select" value={selected.fontFamily}
                          onChange={e => {
                            const item = fonts.find(f => f.family === e.target.value)
                            updateSelectedWithHistory({ fontFamily: e.target.value, fontUrl: item?.url ?? '' })
                          }}>
                          {fonts.map(f => <option key={f.fileName} value={f.family}>{f.name}</option>)}
                        </select>
                      </label>
                      <label className="svg-tb-field">
                        <span>Size</span>
                        <input type="number" className="svg-tb-input" value={selected.fontSize} min={8}
                          onFocus={commitHistory} onBlur={resetHistoryCommit}
                          onChange={e => updateSelected({ fontSize: +e.target.value })} />
                      </label>
                    </div>
                  </div>
                  <div className="svg-tb-section">
                    <span className="svg-tb-section-label">Style</span>
                    <div className="svg-tb-row">
                      <button type="button" className={`svg-tb-mini-btn${selected.fontWeight === 'bold' ? ' active' : ''}`} style={{ fontWeight: 'bold' }}
                        onClick={() => updateSelectedWithHistory({ fontWeight: selected.fontWeight === 'bold' ? 'normal' : 'bold' })}>B</button>
                      <button type="button" className={`svg-tb-mini-btn${selected.fontStyle === 'italic' ? ' active' : ''}`} style={{ fontStyle: 'italic' }}
                        onClick={() => updateSelectedWithHistory({ fontStyle: selected.fontStyle === 'italic' ? 'normal' : 'italic' })}>I</button>
                      <button type="button" className={`svg-tb-mini-btn${selected.textAlign === 'left' ? ' active' : ''}`}
                        onClick={() => updateSelectedWithHistory({ textAlign: 'left' })}>⇤</button>
                      <button type="button" className={`svg-tb-mini-btn${selected.textAlign === 'center' ? ' active' : ''}`}
                        onClick={() => updateSelectedWithHistory({ textAlign: 'center' })}>≡</button>
                      <button type="button" className={`svg-tb-mini-btn${selected.textAlign === 'right' ? ' active' : ''}`}
                        onClick={() => updateSelectedWithHistory({ textAlign: 'right' })}>⇥</button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── Right-aligned toolbar utilities ── */}
          <span className="svg-maker-top-props-spacer" />
          <span className="svg-tb-divider" />
          <div className="svg-tb-section">
            <span className="svg-tb-section-label">Save As</span>
            <div className="svg-tb-row">
              <select
                className="svg-tb-select"
                value={saveFormat}
                onChange={(e) => setSaveFormat(e.target.value === 'png' ? 'png' : 'svg')}
                aria-label="Preset save format"
                title="Choose preset format"
              >
                <option value="svg">SVG</option>
                <option value="png">PNG</option>
              </select>
              <button
                type="button"
                className="svg-tb-mini-btn"
                onClick={() => handleSave()}
                disabled={!shapes.length}
                title={`Save preset as ${saveFormat.toUpperCase()}`}
              >
                Save
              </button>
            </div>
          </div>

          {selected?.kind === 'path' && (
            <>
              <span className="svg-tb-divider" />
              <div className="svg-tb-section">
                <span className="svg-tb-section-label">Path</span>
                <div className="svg-tb-row">
                  <button type="button" className={`svg-tb-mini-btn${pathEditMode ? ' active' : ''}`}
                    onClick={() => { if (pathEditMode) { setPathEditMode(false); setSelectedAnchor(null) } else setPathEditMode(true) }}
                    title="Toggle path anchor editing">
                    ✚ Edit
                  </button>
                  {pathEditMode && (
                    <button type="button" className="svg-tb-mini-btn"
                      onClick={() => {
                        if (!selected || selected.kind !== 'path' || !selectedAnchor) return
                        pushHistory(shapes)
                        const next = removePathAnchor(selected, selectedAnchor.pointIndex)
                        setShapes(prev => prev.map(s => s.id === selected.id ? next : s))
                        setSelectedAnchor(null)
                      }}
                      disabled={!selectedAnchor}
                      title="Delete selected anchor point">
                      − Pt
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      <div className={`svg-maker-main${layersPanelCollapsed ? ' layers-collapsed' : ''}`}>
        {/* ── Tab rail ── */}
        <aside className="svg-tab-rail">
          <div className="svg-tab-item">
            <button type="button" className={`svg-tab-btn${activePanel === 'shapes' ? ' active' : ''}`}
              onClick={() => setActivePanel(activePanel === 'shapes' ? null : 'shapes')}>
              <span className="svg-tab-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" aria-hidden>
                  <rect x="2" y="2" width="9" height="9" rx="1.5"/>
                  <circle cx="17.5" cy="6.5" r="4.5"/>
                  <polygon points="12,13 21,13 16.5,21"/>
                  <rect x="2" y="13" width="9" height="9" rx="1.5"/>
                </svg>
              </span>
            </button>
            <span className="svg-tab-label">Shapes</span>
          </div>

          <div className="svg-tab-item">
            <button type="button" className={`svg-tab-btn${activePanel === 'text' ? ' active' : ''}`}
              onClick={() => setActivePanel(activePanel === 'text' ? null : 'text')}>
              <span className="svg-tab-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" aria-hidden>
                  <text x="12" y="18" textAnchor="middle" fontSize="18" fontWeight="bold">T</text>
                </svg>
              </span>
            </button>
            <span className="svg-tab-label">Text</span>
          </div>

          <div className="svg-tab-item">
            <button type="button" className={`svg-tab-btn${activePanel === 'images' ? ' active' : ''}`}
              onClick={() => setActivePanel(activePanel === 'images' ? null : 'images')}>
              <span className="svg-tab-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22" aria-hidden>
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <path d="M3 15l4-4 4 4 4-5 6 7" strokeLinejoin="round"/>
                  <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/>
                </svg>
              </span>
            </button>
            <span className="svg-tab-label">Images</span>
          </div>

          <div className="svg-tab-item">
            <button type="button" className={`svg-tab-btn${activePanel === 'operations' ? ' active' : ''}`}
              onClick={() => setActivePanel(activePanel === 'operations' ? null : 'operations')}>
              <span className="svg-tab-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22" aria-hidden>
                  <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"/>
                </svg>
              </span>
            </button>
            <span className="svg-tab-label">Ops</span>
          </div>

          <div className="svg-tab-item">
            <button type="button" className={`svg-tab-btn${activePanel === 'scale' ? ' active' : ''}`}
              onClick={() => setActivePanel(activePanel === 'scale' ? null : 'scale')}>
              <span className="svg-tab-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22" aria-hidden>
                  <polyline points="15 3 21 3 21 9"/>
                  <polyline points="9 21 3 21 3 15"/>
                  <line x1="21" y1="3" x2="14" y2="10"/>
                  <line x1="3" y1="21" x2="10" y2="14"/>
                </svg>
              </span>
            </button>
            <span className="svg-tab-label">Scale</span>
          </div>

          {/* ── Toggle-only buttons (Guides / Rulers / Car Scale) ── */}
          <div className="svg-tab-rail-divider" />

          <div className="svg-tab-item">
            <button type="button"
              className={`svg-tab-btn${showGuides ? ' active' : ''}`}
              onClick={() => setShowGuides(v => !v)}
              title="Toggle guides">
              <span className="svg-tab-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22" aria-hidden>
                  <line x1="2" y1="12" x2="22" y2="12" strokeDasharray="3 2"/>
                  <line x1="12" y1="2" x2="12" y2="22" strokeDasharray="3 2"/>
                </svg>
              </span>
            </button>
            <span className="svg-tab-label">Guides</span>
          </div>

          <div className="svg-tab-item">
            <button type="button"
              className={`svg-tab-btn${showRulers ? ' active' : ''}`}
              onClick={() => setShowRulers(v => !v)}
              title="Toggle rulers">
              <span className="svg-tab-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22" aria-hidden>
                  <rect x="2" y="8" width="20" height="8" rx="1"/>
                  <line x1="6" y1="8" x2="6" y2="13"/>
                  <line x1="10" y1="8" x2="10" y2="11"/>
                  <line x1="14" y1="8" x2="14" y2="13"/>
                  <line x1="18" y1="8" x2="18" y2="11"/>
                </svg>
              </span>
            </button>
            <span className="svg-tab-label">Rulers</span>
          </div>

          <div className="svg-tab-item">
            <button type="button"
              className={`svg-tab-btn${showCarScale ? ' active' : ''}`}
              onClick={() => setShowCarScale(v => !v)}
              title="Toggle car-size reference overlay">
              <span className="svg-tab-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22" aria-hidden>
                  <rect x="2" y="9" width="20" height="9" rx="3"/>
                  <circle cx="7" cy="18" r="2" fill="currentColor" stroke="none"/>
                  <circle cx="17" cy="18" r="2" fill="currentColor" stroke="none"/>
                  <path d="M2 12l2-3h16l2 3"/>
                </svg>
              </span>
            </button>
            <span className="svg-tab-label">Car Scale</span>
          </div>

          {/* Popup + backdrop */}
          {activePanel && (
            <>
              <div className="svg-tab-backdrop" onClick={() => setActivePanel(null)} />
              <div className="svg-tab-popup">
                <div className="svg-tab-popup-header">
                  <span className="svg-tab-popup-title">
                    {activePanel === 'shapes' ? 'Shapes' : activePanel === 'text' ? 'Text' : activePanel === 'images' ? 'Images' : activePanel === 'scale' ? 'Scale' : 'Operations'}
                  </span>
                  <button type="button" className="svg-tab-popup-close" onClick={() => setActivePanel(null)}>✕</button>
                </div>
                <div className="svg-tab-popup-body">

                  {/* ── Shapes panel ── */}
                  {activePanel === 'shapes' && (
                    <>
                      <label className="svg-maker-label">Preset Name</label>
                      <input value={name} onChange={e => setName(e.target.value)} className="svg-maker-input" placeholder="My Logo" />

                      <label className="svg-maker-label">Click a shape to add it</label>
                      <div className="svg-shape-picker">
                        {ALL_KINDS.map(kind => (
                          <button key={kind} type="button" className="svg-shape-btn"
                            title={`Add ${SHAPE_LABELS[kind]}`}
                            onClick={() => { addShape(kind); setActivePanel(null) }}>
                            <span className="svg-shape-icon">{SHAPE_ICONS[kind]}</span>
                            <span className="svg-shape-lbl">{SHAPE_LABELS[kind]}</span>
                          </button>
                        ))}
                      </div>

                      <div className="svg-maker-toggle-row">
                        <label><input type="checkbox" checked={snapToGrid} onChange={e => setSnapToGrid(e.target.checked)} /> Snap Grid</label>
                        <label><input type="checkbox" checked={snapRotation} onChange={e => setSnapRotation(e.target.checked)} /> Snap °</label>
                      </div>
                    </>
                  )}

                  {/* ── Text panel ── */}
                  {activePanel === 'text' && (
                    <>
                      <button type="button" className="svg-maker-btn" style={{ width: '100%' }}
                        onClick={() => { addShape('text'); setActivePanel(null) }}>
                        + Add Text Shape
                      </button>

                      {selected?.kind === 'text' ? (
                        <>
                          <div className="svg-tab-section-divider" />

                          <label className="svg-maker-label">Text Content</label>
                          <textarea className="svg-maker-input svg-tab-textarea" rows={3}
                            value={selected.text}
                            onFocus={commitHistory} onBlur={resetHistoryCommit}
                            onChange={e => updateSelected({ text: e.target.value })} />

                          <label className="svg-maker-label">Font Size</label>
                          <div className="svg-tab-row">
                            <input type="range" min={8} max={600} step={2} value={selected.fontSize}
                              onMouseDown={commitHistory} onMouseUp={resetHistoryCommit}
                              onChange={e => updateSelected({ fontSize: +e.target.value })}
                              style={{ flex: 1, accentColor: '#fff' }} />
                            <input type="number" className="svg-maker-input" value={selected.fontSize}
                              onFocus={commitHistory} onBlur={resetHistoryCommit}
                              onChange={e => updateSelected({ fontSize: +e.target.value })}
                              style={{ width: 64 }} />
                          </div>

                          <label className="svg-maker-label">Style &amp; Alignment</label>
                          <div className="svg-tab-row">
                            <button type="button"
                              className={`svg-maker-btn${selected.fontWeight === 'bold' ? ' active' : ''}`}
                              style={{ fontWeight: 'bold', flex: 1 }}
                              onClick={() => updateSelectedWithHistory({ fontWeight: selected.fontWeight === 'bold' ? 'normal' : 'bold' })}>
                              B
                            </button>
                            <button type="button"
                              className={`svg-maker-btn${selected.fontStyle === 'italic' ? ' active' : ''}`}
                              style={{ fontStyle: 'italic', flex: 1 }}
                              onClick={() => updateSelectedWithHistory({ fontStyle: selected.fontStyle === 'italic' ? 'normal' : 'italic' })}>
                              I
                            </button>
                            {(['left', 'center', 'right'] as const).map(align => (
                              <button key={align} type="button"
                                className={`svg-maker-btn${selected.textAlign === align ? ' active' : ''}`}
                                style={{ flex: 1 }}
                                onClick={() => updateSelectedWithHistory({ textAlign: align })}>
                                {align === 'left' ? '⇤' : align === 'center' ? '⟺' : '⇥'}
                              </button>
                            ))}
                          </div>

                          <div className="svg-tab-section-divider" />
                          <label className="svg-maker-label">Font Library</label>
                          <div className="text-font-grid svg-text-font-grid" role="list" aria-label="Create a Logo font library">
                            {fonts.map(font => (
                              <button
                                key={font.fileName}
                                type="button"
                                className={`text-font-card${selected.fontFamily === font.family ? ' active' : ''}`}
                                style={{ fontFamily: `"${font.family}", sans-serif` }}
                                onClick={() => updateSelectedWithHistory({ fontFamily: font.family, fontUrl: font.url })}
                              >
                                <strong>{font.name} (font file)</strong>
                                <span style={{ fontFamily: `"${font.family}", sans-serif` }}>{selected.text || font.name}</span>
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="svg-maker-error" style={{ color: '#666', margin: 0 }}>
                            Pick a font preview to create a new text layer in that style.
                          </p>
                          <div className="text-font-grid svg-text-font-grid" role="list" aria-label="Create a Logo font library">
                            {fonts.map(font => (
                              <button
                                key={font.fileName}
                                type="button"
                                className="text-font-card"
                                style={{ fontFamily: `"${font.family}", sans-serif` }}
                                onClick={() => {
                                  addTextShapeWithFont(font.family, font.url)
                                  setActivePanel(null)
                                }}
                              >
                                <strong>{font.name} (font file)</strong>
                                <span style={{ fontFamily: `"${font.family}", sans-serif` }}>{font.name}</span>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {/* ── Images panel ── */}
                  {activePanel === 'images' && (
                    <>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#8a8a8a', lineHeight: 1.5 }}>
                        Import SVG files (shapes/text/images) or raster images (PNG/JPG/WEBP/GIF).
                      </p>
                      <button type="button" className="svg-maker-btn" style={{ width: '100%' }}
                        onClick={() => fileInputRef.current?.click()}>
                        ⇪ Import SVG or Image
                      </button>
                      <input ref={fileInputRef} type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp,image/gif" onChange={handleImportFile} style={{ display: 'none' }} />
                      {importError && <p className="svg-maker-error">{importError}</p>}

                      <div className="svg-tab-section-divider" />

                      <label className="svg-maker-label">Pen / Freehand</label>
                      <label className="svg-tab-checkbox-row">
                        <input type="checkbox" checked={penMode}
                          onChange={e => { setPenMode(e.target.checked); if (e.target.checked) setSelectionSet([]) }} />
                        ✏️ Enable Pen Draw Mode
                      </label>
                    </>
                  )}

                  {/* ── Operations panel ── */}
                  {activePanel === 'operations' && (
                    <>
                      <label className="svg-maker-label">View</label>
                      <div className="svg-maker-btn-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                        <button type="button"
                          className={`svg-maker-btn${!layersPanelCollapsed ? ' active' : ''}`}
                          onClick={() => setLayersPanelCollapsed(v => !v)}
                          title={layersPanelCollapsed ? 'Show layers panel' : 'Hide layers panel'}>
                          Layers
                        </button>
                        <button type="button"
                          className={`svg-maker-btn${showGuides ? ' active' : ''}`}
                          onClick={() => setShowGuides(v => !v)}
                          title="Toggle guides">
                          Guides
                        </button>
                        <button type="button"
                          className={`svg-maker-btn${showRulers ? ' active' : ''}`}
                          onClick={() => setShowRulers(v => !v)}
                          title="Toggle rulers">
                          Rulers
                        </button>
                      </div>

                      <div className="svg-tab-section-divider" />
                      <label className="svg-maker-label">Shape Operations</label>

                      <button type="button" className="svg-maker-btn"
                        disabled={selected?.kind !== 'text'} onClick={addTextBg}
                        title="Auto-add a rounded rect behind selected text">
                        ☐ Add Text Background
                      </button>

                      <button type="button" className="svg-maker-btn"
                        disabled={offsetApplying || !contourTarget || (contourTarget.kind === 'text' && !contourTarget.isOffsetLayer)}
                        onClick={openContourEditor}
                        title="Edit contour visibility (one layer at a time)">
                        {offsetApplying ? 'Computing…' : '⬡ Contour'}
                      </button>

                      <div className="svg-offset-panel">
                        <div className="svg-offset-head">
                          <span>Offset</span>
                          <span className="svg-offset-target">{selectionSet.length ? (selectionSet.length > 1 ? `${selectionSet.length} selected` : (selected?.kind ?? 'selected')) : 'none selected'}</span>
                        </div>
                        <div className="svg-offset-distance-row">
                          <label htmlFor="svg-offset-dist2">Distance</label>
                          <input id="svg-offset-dist2" type="range" min={1} max={500} step={1}
                            value={offsetAmt} onChange={e => setOffsetAmt(Math.max(1, +e.target.value))}
                            disabled={!offsetEnabled} />
                          <input type="number" className="svg-maker-input" value={offsetAmt} min={1} max={500}
                            onChange={e => setOffsetAmt(Math.max(1, +e.target.value))} disabled={!offsetEnabled} />
                          <span>px</span>
                        </div>
                        <div className="svg-offset-corner-row">
                          <span>Corner</span>
                          <button type="button"
                            className={offsetCorner === 'round' ? 'svg-offset-chip active' : 'svg-offset-chip'}
                            onClick={() => setOffsetCorner('round')} disabled={!offsetEnabled}>Round</button>
                          <button type="button"
                            className={offsetCorner === 'sharp' ? 'svg-offset-chip active' : 'svg-offset-chip'}
                            onClick={() => setOffsetCorner('sharp')} disabled={!offsetEnabled}>Sharp</button>
                          <label className="svg-offset-toggle">
                            <input type="checkbox" checked={weldOffsets} onChange={e => setWeldOffsets(e.target.checked)} />
                            Weld Offsets
                          </label>
                        </div>
                        <div className="svg-offset-apply-row">
                          <button type="button" className="svg-maker-btn" disabled={!offsetEnabled} onClick={applyOffset}>Offset</button>
                          <button type="button" className="svg-maker-btn" disabled={!offsetEnabled} onClick={applyOffset}>Apply</button>
                        </div>
                      </div>



                      <button type="button" className="svg-maker-btn"
                        disabled={!flattenEnabled} onClick={flattenToPath}
                        title="Convert shape to editable path">
                        ⬡ Flatten to Path
                      </button>

                      <div className="svg-ops-split-grid">
                        <button type="button" className="svg-maker-btn"
                          disabled={!sliceEnabled} onClick={sliceSelectedPair}
                          title="Slice two selected layers like Cricut">⊟ Slice</button>
                        <button type="button" className="svg-maker-btn"
                          disabled={!attachEnabled} onClick={attachSelection}
                          title="Attach selected layers so they move together">{attachedSelection ? '⛓ Detach' : '⛓ Attach'}</button>
                      </div>

                      <button type="button" className="svg-maker-btn"
                        disabled={!compoundable}
                        onClick={weldOffsets ? weldPaths : compoundPaths}
                        style={{
                          borderColor: compoundable ? (weldOffsets ? '#4f9a68' : '#6699ff') : undefined,
                          color: compoundable ? (weldOffsets ? '#b7f0c8' : '#aaccff') : undefined,
                        }}
                        title={weldOffsets
                          ? 'Weld: merge into one solid shape (removes overlapping cut lines)'
                          : 'Compound: join as sub-paths with even-odd fill (overlapping areas become holes)'}>
                        {weldOffsets ? '⊕ Weld / Combine' : '⊕ Compound / Punch Hole'}{multiSel ? ` (${selectionSet.length})` : ''}
                      </button>

                      <div className="svg-tab-section-divider" />
                      <label className="svg-maker-label">Transform</label>
                      <div className="svg-maker-btn-grid">
                        <button type="button" onClick={mirrorSelected} disabled={!selected}>Mirror X</button>
                        <button type="button" onClick={duplicateSelected} disabled={!selected}>Duplicate</button>
                      </div>
                      <div className="svg-maker-btn-grid" style={{ marginTop: 6 }}>
                        <button type="button" onClick={() => rotateSelected(-ANGLE_SNAP)} disabled={!selected}>−15°</button>
                        <button type="button" onClick={() => rotateSelected(ANGLE_SNAP)} disabled={!selected}>+15°</button>
                      </div>

                      <div className="svg-tab-section-divider" />
                      <label className="svg-maker-label">Align to Canvas</label>
                      <div className="svg-maker-btn-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                        <button type="button" onClick={() => alignSelected('centerH')} disabled={!selected} title="Center H">⟺ H</button>
                        <button type="button" onClick={() => alignSelected('centerV')} disabled={!selected} title="Center V">⇳ V</button>
                        <button type="button" onClick={() => alignSelected('left')} disabled={!selected} title="Left">⇤ L</button>
                        <button type="button" onClick={() => alignSelected('right')} disabled={!selected} title="Right">R ⇥</button>
                        <button type="button" onClick={() => alignSelected('top')} disabled={!selected} title="Top">⇡ T</button>
                        <button type="button" onClick={() => alignSelected('bottom')} disabled={!selected} title="Bottom">B ⇣</button>
                      </div>
                    </>
                  )}

                  {/* ── Scale panel ── */}
                  {activePanel === 'scale' && (
                    <>
                      <label className="svg-maker-label">Selected Shape Size</label>
                      {selected ? (
                        <>
                          <div className="svg-tab-row" style={{ gap: 8 }}>
                            <label className="svg-maker-label" style={{ minWidth: 16 }}>W</label>
                            <input type="number" className="svg-maker-input" style={{ flex: 1 }}
                              value={Math.round(selected.width ?? 0)}
                              onFocus={commitHistory} onBlur={resetHistoryCommit}
                              onChange={e => updateSelected({ width: +e.target.value })} />
                          </div>
                          <div className="svg-tab-row" style={{ gap: 8, marginTop: 6 }}>
                            <label className="svg-maker-label" style={{ minWidth: 16 }}>H</label>
                            <input type="number" className="svg-maker-input" style={{ flex: 1 }}
                              value={Math.round(selected.height ?? 0)}
                              onFocus={commitHistory} onBlur={resetHistoryCommit}
                              onChange={e => updateSelected({ height: +e.target.value })} />
                          </div>

                          <div className="svg-tab-section-divider" />
                          <label className="svg-maker-label">Scale %</label>
                          <div className="svg-maker-btn-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                            {[50, 75, 100, 125, 150, 200].map(pct => (
                              <button key={pct} type="button" className="svg-maker-btn"
                                onClick={() => {
                                  if (!selected) return
                                  commitHistory()
                                  const factor = pct / 100
                                  updateSelected({
                                    width: Math.round((selected.width ?? 100) * factor),
                                    height: Math.round((selected.height ?? 100) * factor),
                                  })
                                }}>
                                {pct}%
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p style={{ fontSize: '0.75rem', color: '#888', margin: 0 }}>Select a shape to scale it.</p>
                      )}

                      <div className="svg-tab-section-divider" />
                      <label className="svg-maker-label">Canvas Size</label>
                      <p style={{ fontSize: '0.72rem', color: '#888', margin: '0 0 6px' }}>Artboard: {AB} × {AB} px</p>
                      <div className="svg-maker-btn-grid" style={{ gridTemplateColumns: '1fr' }}>
                        <button type="button" className="svg-maker-btn" onClick={() => { commitHistory(); setShapes(prev => prev.map(s => ({ ...s, x: AB / 2, y: AB / 2 }))) }}>
                          Center All Layers
                        </button>
                      </div>
                    </>
                  )}

                </div>
              </div>
            </>
          )}
        </aside>

        {/* ── Artboard ── */}
        <div className="svg-maker-artboard-wrap" ref={artboardWrapRef} style={{ position: 'relative' }}>
          <div className="svg-maker-grid-bg" />
          {showRulers && (
            <>
              <div className="svg-maker-ruler-top" aria-hidden="true">
                {rulerTicks.map(v => {
                  const major = v % (GRID_SNAP * 5) === 0
                  return (
                    <div
                      key={`ruler-x-${v}`}
                      className={`svg-maker-ruler-tick${major ? ' major' : ''}`}
                      style={{ left: `${(v / AB) * 100}%` }}
                    >
                      {major && <span>{v}</span>}
                    </div>
                  )
                })}
              </div>
              <div className="svg-maker-ruler-left" aria-hidden="true">
                {rulerTicks.map(v => {
                  const major = v % (GRID_SNAP * 5) === 0
                  return (
                    <div
                      key={`ruler-y-${v}`}
                      className={`svg-maker-ruler-tick-y${major ? ' major' : ''}`}
                      style={{ top: `${(v / AB) * 100}%` }}
                    >
                      {major && <span>{v}</span>}
                    </div>
                  )
                })}
              </div>
            </>
          )}
          {showGuides && (
            <div className="svg-maker-guides" aria-hidden="true">
              <div className="svg-maker-guide-v" />
              <div className="svg-maker-guide-h" />
            </div>
          )}
          {showCarScale && (
            <>
              <div className="svg-maker-car-scale-top" aria-hidden="true">
                {carScaleXTicks.map(cm => (
                  <div
                    key={`x-${cm}`}
                    className="svg-maker-car-scale-tick"
                    style={{ left: `${(cm / CAR_SCALE_LENGTH_CM) * 100}%` }}
                  >
                    <span>{cm}</span>
                  </div>
                ))}
                <div className="svg-maker-car-scale-axis-label">cm (length approx.)</div>
              </div>
              <div className="svg-maker-car-scale-left" aria-hidden="true">
                {carScaleYTicks.map(cm => (
                  <div
                    key={`y-${cm}`}
                    className="svg-maker-car-scale-tick-y"
                    style={{ top: `${(cm / CAR_SCALE_HEIGHT_CM) * 100}%` }}
                  >
                    <span>{cm}</span>
                  </div>
                ))}
                <div className="svg-maker-car-scale-axis-label-y">cm (height approx.)</div>
              </div>
            </>
          )}
          <svg ref={svgRef} className="svg-maker-artboard" viewBox={`0 0 ${AB} ${AB}`}
            style={{ cursor: penMode ? 'crosshair' : 'default' }}
            onPointerDown={handleArtboardDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onContextMenu={e => { e.preventDefault(); const wrap = artboardWrapRef.current; if (!wrap) return; const r = wrap.getBoundingClientRect(); setCtxMenu({ x: e.clientX - r.left, y: e.clientY - r.top }) }}
          >
            {shapes.map(s => (
              <ShapeEl key={s.id} shape={s}
                active={s.id === selectedId}
                inSelection={selectionSet.includes(s.id) && s.id !== selectedId}
                onSelect={e => handleShapeSelect(e, s.id)}
                onStartMove={startMove}
                onStartResize={startResize}
                onInlineEdit={id => { setSelectionSet([id]); setEditingTextId(id) }}
              />
            ))}

            {marqueeState && (() => {
              const box = selectionRect(marqueeState.startX, marqueeState.startY, marqueeState.currentX, marqueeState.currentY)
              if (box.width < 1 && box.height < 1) return null
              return (
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  fill="rgba(59, 130, 246, 0.14)"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  strokeDasharray="7 5"
                  pointerEvents="none"
                />
              )
            })()}

            {pathEditMode && selected?.kind === 'path' && (() => {
              const d = visiblePathData(selected.pathData, selected.hiddenContours)
              return (
                <>
                  {d && (
                    <g transform={`translate(${selected.x} ${selected.y}) rotate(${selected.rotation})`}>
                      <path
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={22}
                        onDoubleClick={e => insertPathAnchorAtPointer(e, selected.id)}
                        style={{ cursor: 'copy' }}
                      />
                    </g>
                  )}
                  {editablePathAnchors.map(a => (
                    <g key={`anchor-${selected.id}-${a.index}`}>
                      {a.hasIn && (
                        <>
                          <line x1={a.x} y1={a.y} x2={a.inX} y2={a.inY} stroke="#22d3ee" strokeWidth={1.2} opacity={0.9} />
                          <circle
                            cx={a.inX}
                            cy={a.inY}
                            r={4}
                            fill="#22d3ee"
                            stroke="#0f172a"
                            strokeWidth={1.1}
                            style={{ cursor: 'grab' }}
                            onPointerDown={e => startPathHandleDrag(e, selected.id, a.index, 'in')}
                          />
                        </>
                      )}
                      {a.hasOut && (
                        <>
                          <line x1={a.x} y1={a.y} x2={a.outX} y2={a.outY} stroke="#22d3ee" strokeWidth={1.2} opacity={0.9} />
                          <circle
                            cx={a.outX}
                            cy={a.outY}
                            r={4}
                            fill="#22d3ee"
                            stroke="#0f172a"
                            strokeWidth={1.1}
                            style={{ cursor: 'grab' }}
                            onPointerDown={e => startPathHandleDrag(e, selected.id, a.index, 'out')}
                          />
                        </>
                      )}
                      <circle
                        cx={a.x}
                        cy={a.y}
                        r={selectedAnchor?.shapeId === selected.id && selectedAnchor.pointIndex === a.index ? 6.5 : 5}
                        fill={selectedAnchor?.shapeId === selected.id && selectedAnchor.pointIndex === a.index ? '#22d3ee' : '#ffffff'}
                        stroke="#0f172a"
                        strokeWidth={1.4}
                        style={{ cursor: 'grab' }}
                        onPointerDown={e => startPathAnchorDrag(e, selected.id, a.index)}
                      />
                    </g>
                  ))}
                </>
              )
            })()}

            {/* Transparent hit-catchers for offset/sticker layers rendered on top so they're clickable
                even when visually behind other shapes */}
            {shapes.filter(s => s.isOffsetLayer && s.visible && !s.locked && s.kind === 'path').map(s => {
              const d = visiblePathData(s.pathData, s.hiddenContours)
              if (!d) return null
              return (
                <g key={`hit-${s.id}`} transform={`translate(${s.x} ${s.y}) rotate(${s.rotation})`}>
                  <path
                    d={d}
                    fill="transparent"
                    stroke="none"
                    fillRule="evenodd"
                    style={{ cursor: 'pointer' }}
                    onPointerDown={e => { e.stopPropagation(); handleShapeSelect(e, s.id); if (!s.locked) startMove(e, s.id) }}
                  />
                </g>
              )
            })}

            {/* Live offset preview — outline only, inner contours (letter holes) included */}
            {offsetPreviewPath && (
              <path
                d={offsetPreviewPath}
                fill="none"
                stroke="#2563eb"
                strokeWidth={1.5}
                strokeLinejoin="round"
                fillRule="evenodd"
                transform={offsetPreviewTransform ?? undefined}
                pointerEvents="none"
              />
            )}

            {/* Live warp preview */}
            {warpPreviewPath && (
              <path
                d={warpPreviewPath}
                fill="rgba(34,211,238,0.18)"
                stroke="#22d3ee"
                strokeWidth={2}
                strokeLinejoin="round"
                pointerEvents="none"
              />
            )}

            {!offsetPreviewPath && offsetPreviewText && (() => {
              const p = offsetPreviewText
              const anchor = ({ left: 'start', center: 'middle', right: 'end' } as const)[p.textAlign ?? 'center']
              const align = p.textAlign ?? 'center'
              const lines = (p.text || '').split('\n')
              const lh = p.fontSize * 1.25
              const totalH = (lines.length - 1) * lh
              const curve = clamp(p.textCurve ?? 0, -100, 100)
              const style: React.CSSProperties = {
                fontFamily: p.fontFamily || DEFAULT_OFFSET_FONT_FAMILY,
                fontWeight: p.fontWeight ?? 'normal',
                fontStyle: p.fontStyle ?? 'normal',
              }
              if (lines.length === 1 && Math.abs(curve) > 0.001) {
                const curvePathId = `offset-preview-curve-${p.id}`
                return (
                  <g transform={`translate(${p.x} ${p.y}) rotate(${p.rotation})`}>
                    <defs>
                      <path id={curvePathId} d={curvedTextPathData(p.width, curve)} />
                    </defs>
                    <text
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth={1.5 / (svgRef.current ? svgRef.current.getBoundingClientRect().width / AB : 1)}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      fontSize={p.fontSize}
                      textAnchor={anchor}
                      dominantBaseline="middle"
                      pointerEvents="none"
                      style={style}>
                      <textPath href={`#${curvePathId}`} startOffset={textCurveStartOffset(align)}>{p.text}</textPath>
                    </text>
                  </g>
                )
              }
              const _outlineStrokeW = 1.5 / (svgRef.current ? svgRef.current.getBoundingClientRect().width / AB : 1)
              return lines.length === 1 ? (
                <text
                  x={p.x}
                  y={p.y}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth={_outlineStrokeW}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  fontSize={p.fontSize}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  transform={`rotate(${p.rotation} ${p.x} ${p.y})`}
                  pointerEvents="none"
                  style={style}
                >
                  {p.text}
                </text>
              ) : (
                <text
                  y={p.y - totalH / 2}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth={_outlineStrokeW}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  fontSize={p.fontSize}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  transform={`rotate(${p.rotation} ${p.x} ${p.y})`}
                  pointerEvents="none"
                  style={style}
                >
                  {lines.map((l, i) => <tspan key={i} x={p.x} dy={i === 0 ? 0 : lh}>{l}</tspan>)}
                </text>
              )
            })()}

          </svg>

          {/* Inline text editor */}
          {editingTextId && (() => {
            const s = shapes.find(sh => sh.id === editingTextId)
            if (!s || s.kind !== 'text') return null
            const svgEl = svgRef.current, wrapEl = artboardWrapRef.current
            if (!svgEl || !wrapEl) return null
            const svgRect = svgEl.getBoundingClientRect(), wrapRect = wrapEl.getBoundingClientRect()
            const scale = svgRect.width / AB
            const cx = s.x * scale + (svgRect.left - wrapRect.left)
            const cy = s.y * scale + (svgRect.top - wrapRect.top)
            const fs = Math.max(12, s.fontSize * scale)
            const w = Math.max(120, s.fontSize * (s.text.length + 2) * 0.62 * scale)
            return (
              <textarea className="svg-maker-inline-edit" autoFocus
                value={s.text} rows={Math.max(1, s.text.split('\n').length)}
                onFocus={commitHistory}
                onChange={e => updateSelected({ text: e.target.value })}
                onBlur={() => { resetHistoryCommit(); setEditingTextId(null) }}
                onKeyDown={e => { if (e.key === 'Escape') setEditingTextId(null); if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) e.stopPropagation() }}
                style={{ left: cx, top: cy, width: w, fontSize: fs, fontFamily: s.fontFamily, fontWeight: s.fontWeight, fontStyle: s.fontStyle, textAlign: s.textAlign, color: s.fill, transform: `translate(-50%,-50%) rotate(${s.rotation}deg)` }}
              />
            )
          })()}

          {multiSel && (
            <div className="svg-maker-multisel-hint">
              {selectionSet.length} shapes selected · Shift+click to add/remove · Use Compound to punch
            </div>
          )}

          {/* ── Right-click context menu ── */}
          {ctxMenu && (
            <div className="svg-ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}
              onContextMenu={e => e.preventDefault()}>
              {selectionSet.length >= 2 && (
                <button className="svg-ctx-item" onClick={() => { attachSelection(); setCtxMenu(null) }}>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><rect x="2" y="6" width="16" height="12" rx="2"/><path d="M2 8h16M6 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/></svg>
                  Group
                  <span className="svg-ctx-kbd">Ctrl + G</span>
                </button>
              )}
              {selectionSet.length >= 2 && <div className="svg-ctx-divider" />}
              <button className="svg-ctx-item" disabled={!selectionSet.length} onClick={() => { cutSelected(); setCtxMenu(null) }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><circle cx="6" cy="14" r="3"/><circle cx="14" cy="14" r="3"/><path d="M6 11V3m0 0 2 2M6 3 4 5M14 11V3m0 0 2 2M14 3l-2 2"/></svg>
                Cut
                <span className="svg-ctx-kbd">Ctrl + X</span>
              </button>
              <button className="svg-ctx-item" disabled={!selectionSet.length} onClick={() => { copySelected(); setCtxMenu(null) }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M4 13V4a1 1 0 0 1 1-1h9"/></svg>
                Copy
                <span className="svg-ctx-kbd">Ctrl + C</span>
              </button>
              <button className="svg-ctx-item" disabled={!clipboardRef.current.length} onClick={() => { pasteClipboard(); setCtxMenu(null) }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><rect x="4" y="6" width="12" height="12" rx="1.5"/><path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6"/></svg>
                Paste
                <span className="svg-ctx-kbd">Ctrl + V</span>
              </button>
              <button className="svg-ctx-item" disabled={!selected} onClick={() => { duplicateSelected(); setCtxMenu(null) }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M4 13V4a1 1 0 0 1 1-1h9"/></svg>
                Duplicate
                <span className="svg-ctx-kbd">Ctrl + D</span>
              </button>
              <button className="svg-ctx-item" disabled={!selectionSet.length} onClick={() => { deleteSelected(); setCtxMenu(null) }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"/></svg>
                Delete
                <span className="svg-ctx-kbd">Del</span>
              </button>
              <button className="svg-ctx-item" onClick={() => { setSelectionSet(shapes.filter(s => !s.locked).map(s => s.id)); setCtxMenu(null) }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><rect x="2" y="2" width="16" height="16" rx="2"/><path d="M6 10h8M10 6v8"/></svg>
                Select All
                <span className="svg-ctx-kbd">Ctrl + A</span>
              </button>
              <div className="svg-ctx-divider" />
              <button className="svg-ctx-item" disabled={!sliceEnabled} onClick={() => { sliceSelectedPair(); setCtxMenu(null) }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><rect x="2" y="2" width="16" height="16" rx="2"/><path d="M3 13l5-5 4 4 4-4"/></svg>
                Slice
                <span className="svg-ctx-kbd">Alt+Shift+Q</span>
              </button>
              <div className="svg-ctx-submenu-wrap">
                <button className="svg-ctx-item" disabled={!booleanEnabled}>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><rect x="2" y="2" width="10" height="10" rx="1"/><rect x="8" y="8" width="10" height="10" rx="1"/></svg>
                  Combine
                  <span className="svg-ctx-arrow">▶</span>
                </button>
                {booleanEnabled && (
                  <div className="svg-ctx-submenu">
                    {(['unite','subtract','intersect','exclude'] as const).map(op => (
                      <button key={op} className="svg-ctx-item" onClick={() => { booleanOp(op); setCtxMenu(null) }}>
                        {op.charAt(0).toUpperCase() + op.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="svg-ctx-item" disabled={!attachEnabled} onClick={() => { attachSelection(); setCtxMenu(null) }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><path d="M8 7l4 0M6 10l8 0M8 13l4 0"/><rect x="3" y="4" width="14" height="12" rx="3"/></svg>
                Attach
                <span className="svg-ctx-kbd">Alt + A</span>
              </button>
              <button className="svg-ctx-item" disabled={!flattenEnabled} onClick={() => { flattenToPath(); setCtxMenu(null) }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><path d="M3 16L7 5l5 8 3-4 2 7"/></svg>
                Flatten
                <span className="svg-ctx-kbd">Alt + F</span>
              </button>
              {selected && (
                <>
                  <div className="svg-ctx-divider" />
                  <button className="svg-ctx-item" onClick={() => { mirrorSelected(); setCtxMenu(null) }}>
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><line x1="10" y1="2" x2="10" y2="18"/><polyline points="6,5 2,10 6,15"/><polyline points="14,5 18,10 14,15"/></svg>
                    Mirror X
                  </button>
                  <button className="svg-ctx-item" onClick={() => { rotateSelected(-ANGLE_SNAP); setCtxMenu(null) }}>
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><path d="M4 12a8 8 0 1 0 1.5-4.8"/><polyline points="4,4 4,8 8,8"/></svg>
                    Rotate −15°
                  </button>
                  <button className="svg-ctx-item" onClick={() => { rotateSelected(ANGLE_SNAP); setCtxMenu(null) }}>
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><path d="M16 12a8 8 0 1 1-1.5-4.8"/><polyline points="16,4 16,8 12,8"/></svg>
                    Rotate +15°
                  </button>
                  <div className="svg-ctx-divider" />
                  <button className="svg-ctx-item" onClick={() => { alignSelected('centerH'); setCtxMenu(null) }}>
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><line x1="10" y1="2" x2="10" y2="18" strokeDasharray="2 2"/><rect x="4" y="7" width="12" height="6" rx="1"/></svg>
                    Center Horizontal
                  </button>
                  <button className="svg-ctx-item" onClick={() => { alignSelected('centerV'); setCtxMenu(null) }}>
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><line x1="2" y1="10" x2="18" y2="10" strokeDasharray="2 2"/><rect x="7" y="4" width="6" height="12" rx="1"/></svg>
                    Center Vertical
                  </button>
                  <div className="svg-ctx-divider" />
                  <button className="svg-ctx-item" onClick={() => { moveSelected(1); setCtxMenu(null) }}>
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><polyline points="4,12 10,6 16,12"/><line x1="10" y1="6" x2="10" y2="18"/></svg>
                    Bring Forward
                  </button>
                  <button className="svg-ctx-item" onClick={() => { moveSelected(-1); setCtxMenu(null) }}>
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><polyline points="4,8 10,14 16,8"/><line x1="10" y1="2" x2="10" y2="14"/></svg>
                    Send Backward
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Properties panel ── */}
        <aside className={`svg-maker-props${layersPanelCollapsed ? ' is-collapsed' : ''}`}>
          <button
            type="button"
            className={`svg-maker-props-tab${layersPanelCollapsed ? ' collapsed' : ''}`}
            onClick={() => setLayersPanelCollapsed(v => !v)}
            aria-label={layersPanelCollapsed ? 'Show layers panel' : 'Hide layers panel'}
            title={layersPanelCollapsed ? 'Show layers panel' : 'Hide layers panel'}
          >
            {layersPanelCollapsed ? '◀' : '▶'}
          </button>
          {!layersPanelCollapsed && (
          <>
          <div className="svg-maker-right-layers">
            <div className="svg-layer-header">
              <span className="svg-layer-title">Layers ({shapes.length})</span>
              <div className="svg-layer-actions">
                <button type="button" className="svg-layer-action-btn" disabled={!selectedId} onClick={() => selectedId && duplicateShape(selectedId)} title="Duplicate">⧉ Dupe</button>
                <button
                  type="button"
                  className="svg-layer-action-btn"
                  disabled={!attachEnabled}
                  onClick={attachSelection}
                  title={attachedSelection ? 'Ungroup selected layers' : 'Group selected layers'}
                >
                  {attachedSelection ? 'Ungroup' : 'Group'}
                </button>
                <button type="button" className="svg-layer-action-btn danger" disabled={!selectedId} onClick={() => selectedId && deleteShape(selectedId)} title="Delete">✕ Del</button>
              </div>
            </div>
            <div className="svg-layer-list svg-layer-list-right">
              {shapes.length === 0 && <p className="svg-maker-error" style={{ margin: 0, padding: '8px' }}>No shapes yet — click a shape above to add one</p>}
              {(() => {
                const reversed = [...shapes].reverse()
                const seenGroups = new Set<string>()
                const items: React.ReactNode[] = []

                // Pre-compute which attachedGroupIds belong to a combine result
                const combineOwnedGroups = new Set<string>()
                shapes.forEach(sh => { if (sh.combineGroupId) combineOwnedGroups.add(sh.combineGroupId) })

                reversed.forEach((s, ri) => {
                  const realIdx = shapes.length - 1 - ri
                  const staleOffset = offsetStaleIds.has(s.id)
                  const gid = s.attachedGroupId

                  // Children of a combine result are rendered under their parent — skip here
                  if (gid && combineOwnedGroups.has(gid)) return

                  // Combine result shape: render its row + its child group inline
                  if (s.combineGroupId) {
                    const cgid = s.combineGroupId
                    const isCombineCollapsed = collapsedGroupIds.has(s.id)
                    const children = shapes.filter(ch => ch.attachedGroupId === cgid)
                    items.push(
                      <div key={s.id} className="svg-layer-combine-parent">
                        <div className="svg-layer-combine-header">
                          <button type="button" className="svg-layer-group-collapse"
                            onClick={e => { e.stopPropagation(); setCollapsedGroupIds(prev => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n }) }}
                            title={isCombineCollapsed ? 'Expand' : 'Collapse'}>
                            {isCombineCollapsed ? '▶' : '▼'}
                          </button>
                          <SvgLayerRow shape={s} selected={selectionSet.includes(s.id)} dragOver={layerDragOver === realIdx}
                            onSelect={e => {
                              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                setSelectionSet(prev => prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id])
                              } else {
                                setSelectionSet([s.id])
                              }
                            }}
                            onToggleVisible={() => toggleVisible(s.id)}
                            onToggleLocked={() => toggleLocked(s.id)}
                            onDelete={() => deleteShape(s.id)}
                            onRename={newName => renameShape(s.id, newName)}
                            onDragStart={() => setLayerDragFrom(realIdx)}
                            onDragOver={e => { e.preventDefault(); setLayerDragOver(realIdx) }}
                            onDrop={() => {
                              if (layerDragFrom !== null && layerDragFrom !== realIdx) {
                                pushHistory(shapes)
                                const next = [...shapes]
                                const [moved] = next.splice(layerDragFrom, 1)
                                next.splice(realIdx, 0, moved)
                                setShapes(next)
                              }
                              setLayerDragFrom(null); setLayerDragOver(null)
                            }}
                            onDragEnd={() => { setLayerDragFrom(null); setLayerDragOver(null) }}
                            kindSuffix={staleOffset ? ' · offset stale' : ''}
                          />
                        </div>
                        {!isCombineCollapsed && (
                          <div className="svg-layer-combine-children">
                            <div className="svg-layer-group-header svg-layer-combine-subgroup">
                              <svg className="svg-layer-group-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16" aria-hidden>
                                <rect x="2" y="6" width="16" height="12" rx="2" />
                                <path d="M2 8h16M6 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                              </svg>
                              <div className="svg-layer-info"><span className="svg-layer-name">Group</span><span className="svg-layer-kind">group</span></div>
                            </div>
                            {[...children].reverse().map(ch => {
                              const chIdx = shapes.findIndex(x => x.id === ch.id)
                              return (
                                <div key={ch.id} className="svg-layer-child-wrap svg-layer-grandchild-wrap">
                                  <SvgLayerRow shape={ch} selected={selectionSet.includes(ch.id)} dragOver={layerDragOver === chIdx}
                                    onSelect={e => {
                                      if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                        setSelectionSet(prev => prev.includes(ch.id) ? prev.filter(x => x !== ch.id) : [...prev, ch.id])
                                      } else {
                                        setSelectionSet([ch.id])
                                      }
                                    }}
                                    onToggleVisible={() => toggleVisible(ch.id)}
                                    onToggleLocked={() => toggleLocked(ch.id)}
                                    onDelete={() => deleteShape(ch.id)}
                                    onRename={newName => renameShape(ch.id, newName)}
                                    onDragStart={() => setLayerDragFrom(chIdx)}
                                    onDragOver={e => { e.preventDefault(); setLayerDragOver(chIdx) }}
                                    onDrop={() => {
                                      if (layerDragFrom !== null && layerDragFrom !== chIdx) {
                                        pushHistory(shapes)
                                        const next = [...shapes]
                                        const [moved] = next.splice(layerDragFrom, 1)
                                        next.splice(chIdx, 0, moved)
                                        setShapes(next)
                                      }
                                      setLayerDragFrom(null); setLayerDragOver(null)
                                    }}
                                    onDragEnd={() => { setLayerDragFrom(null); setLayerDragOver(null) }}
                                  />
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                    return
                  }

                  if (gid) {
                    // Emit group header the first time we see this group
                    if (!seenGroups.has(gid)) {
                      seenGroups.add(gid)
                      const gName = groupNames[gid] ?? 'Group'
                      const isCollapsed = collapsedGroupIds.has(gid)
                      items.push(
                        <SvgGroupHeaderRow
                          key={`group-${gid}`}
                          groupId={gid}
                          name={gName}
                          collapsed={isCollapsed}
                          onToggleCollapse={() => setCollapsedGroupIds(prev => {
                            const next = new Set(prev)
                            if (next.has(gid)) next.delete(gid); else next.add(gid)
                            return next
                          })}
                          onRename={newName => setGroupNames(prev => ({ ...prev, [gid]: newName }))}
                          onUngroup={() => {
                            pushHistory(shapes)
                            setShapes(prev => prev.map(sh => sh.attachedGroupId === gid ? { ...sh, attachedGroupId: null } : sh))
                            setGroupNames(prev => { const n = { ...prev }; delete n[gid]; return n })
                            setCollapsedGroupIds(prev => { const n = new Set(prev); n.delete(gid); return n })
                          }}
                        />
                      )
                    }
                    // Skip children when group is collapsed
                    if (collapsedGroupIds.has(gid)) return
                    items.push(
                      <div key={s.id} className="svg-layer-child-wrap">
                        <SvgLayerRow shape={s} selected={selectionSet.includes(s.id)} dragOver={layerDragOver === realIdx}
                          onSelect={e => {
                            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                              setSelectionSet(prev => prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id])
                            } else {
                              setSelectionSet([s.id])
                            }
                          }}
                          onToggleVisible={() => toggleVisible(s.id)}
                          onToggleLocked={() => toggleLocked(s.id)}
                          onDelete={() => deleteShape(s.id)}
                          onRename={newName => renameShape(s.id, newName)}
                          onDragStart={() => setLayerDragFrom(realIdx)}
                          onDragOver={e => { e.preventDefault(); setLayerDragOver(realIdx) }}
                          onDrop={() => {
                            if (layerDragFrom !== null && layerDragFrom !== realIdx) {
                              pushHistory(shapes)
                              const next = [...shapes]
                              const [moved] = next.splice(layerDragFrom, 1)
                              next.splice(realIdx, 0, moved)
                              setShapes(next)
                            }
                            setLayerDragFrom(null); setLayerDragOver(null)
                          }}
                          onDragEnd={() => { setLayerDragFrom(null); setLayerDragOver(null) }}
                          kindSuffix={staleOffset ? ' · offset stale' : ''}
                        />
                      </div>
                    )
                  } else {
                    items.push(
                      <SvgLayerRow key={s.id} shape={s} selected={selectionSet.includes(s.id)} dragOver={layerDragOver === realIdx}
                        onSelect={e => {
                          if (e.shiftKey || e.ctrlKey || e.metaKey) {
                            setSelectionSet(prev => prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id])
                          } else {
                            setSelectionSet([s.id])
                          }
                        }}
                        onToggleVisible={() => toggleVisible(s.id)}
                        onToggleLocked={() => toggleLocked(s.id)}
                        onDelete={() => deleteShape(s.id)}
                        onRename={newName => renameShape(s.id, newName)}
                        onDragStart={() => setLayerDragFrom(realIdx)}
                        onDragOver={e => { e.preventDefault(); setLayerDragOver(realIdx) }}
                        onDrop={() => {
                          if (layerDragFrom !== null && layerDragFrom !== realIdx) {
                            pushHistory(shapes)
                            const next = [...shapes]
                            const [moved] = next.splice(layerDragFrom, 1)
                            next.splice(realIdx, 0, moved)
                            setShapes(next)
                          }
                          setLayerDragFrom(null); setLayerDragOver(null)
                        }}
                        onDragEnd={() => { setLayerDragFrom(null); setLayerDragOver(null) }}
                        kindSuffix={staleOffset ? ' · offset stale' : ''}
                      />
                    )
                  }
                })
                return items
              })()}
            </div>
          </div>

          {/* ── Bottom operation bar ── */}
          <div className="svg-layer-ops-bar">
            {/* Row 1: Slice · Weld · Flatten */}
            <button type="button" className="svg-layer-op-btn" disabled={!sliceEnabled} onClick={sliceSelectedPair} title="Slice two selected layers" aria-label="Slice two selected layers">
              <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><rect x="3" y="3" width="16" height="16" rx="2"/><path d="M4 14L10 8L14 12L18 8"/></svg>
              Slice
            </button>
            <button type="button" className="svg-layer-op-btn" disabled={!booleanEnabled} onClick={weldPaths} title="Weld shapes into one merged path (paper.js boolean union)" aria-label="Weld selected shapes into one path">
              <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><circle cx="8" cy="11" r="5"/><circle cx="14" cy="11" r="5"/></svg>
              Weld
            </button>
            <button type="button" className="svg-layer-op-btn" disabled={!flattenEnabled} onClick={flattenToPath} title="Convert shape to editable path" aria-label="Convert selected shape to editable path">
              <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M4 18 L8 6 L13 14 L16 10 L18 18"/></svg>
              Flatten
            </button>

            {/* Row 2: Combine dropdown · Attach · Contour */}
            <div className="svg-layer-op-combine-wrap" style={{ position: 'relative' }}>
              <button
                type="button"
                className={`svg-layer-op-btn${combineMenuOpen ? ' active' : ''}`}
                disabled={!booleanEnabled}
                onClick={() => setCombineMenuOpen(v => !v)}
                title="Boolean combine operations"
                aria-label="Boolean operations menu (unite, subtract, intersect, exclude)">
                <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <rect x="3" y="3" width="10" height="10" rx="1"/>
                  <rect x="9" y="9" width="10" height="10" rx="1"/>
                </svg>
                Combine
              </button>
              {combineMenuOpen && (
                <div className="svg-combine-menu">
                  {([
                    { op: 'unite', label: 'Unite', icon: <svg viewBox="0 0 22 22" fill="currentColor" width="16" height="16"><circle cx="8" cy="11" r="5"/><circle cx="14" cy="11" r="5"/></svg> },
                    { op: 'subtract', label: 'Subtract', icon: <svg viewBox="0 0 22 22" width="16" height="16"><circle cx="8" cy="11" r="5" fill="currentColor"/><circle cx="14" cy="11" r="5" fill="#1a1a1a"/><circle cx="14" cy="11" r="5" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg> },
                    { op: 'intersect', label: 'Intersect', icon: <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><circle cx="8" cy="11" r="5"/><circle cx="14" cy="11" r="5"/><path d="M11 6.5a5 5 0 0 1 0 9" strokeWidth="0"/><path d="M11 6.5a5 5 0 0 0 0 9" fill="currentColor" stroke="none"/></svg> },
                    { op: 'exclude', label: 'Exclude', icon: <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><circle cx="8" cy="11" r="5"/><circle cx="14" cy="11" r="5"/></svg> },
                  ] as const).map(({ op, label, icon }) => (
                    <button key={op} type="button" className="svg-combine-menu-item"
                      onClick={() => { booleanOp(op); setCombineMenuOpen(false) }}
                      aria-label={`${label} selected shapes`}>
                      {icon}
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button type="button" className="svg-layer-op-btn" disabled={!attachEnabled} onClick={attachSelection} title="Attach layers so they move together" aria-label={attachedSelection ? 'Detach layers' : 'Attach selected layers to move together'}>
              <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M9 8l4 0M7 11l8 0M9 14l4 0"/><rect x="4" y="5" width="14" height="12" rx="3"/></svg>
              {attachedSelection ? 'Detach' : 'Attach'}
            </button>
            <button type="button" className="svg-layer-op-btn" disabled={offsetApplying || !contourTarget || (contourTarget.kind === 'text' && !contourTarget.isOffsetLayer)} onClick={openContourEditor} title="Open contour path editor" aria-label="Edit contour - toggle internal paths visibility">
              <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><circle cx="11" cy="11" r="7"/><circle cx="11" cy="11" r="4"/></svg>
              {offsetApplying ? 'Computing…' : 'Contour'}
            </button>
            <button type="button" className="svg-layer-op-btn" disabled={offsetApplying || shapes.filter(s => s.visible && !s.locked).length === 0} onClick={() => makeSticker(20)} title="Create unified sticker border behind all shapes" aria-label="Create sticker - white offset border behind all visible shapes">
              <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M11 3C7.1 3 4 6.1 4 10c0 2.4 1.2 4.5 3 5.8V18a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.2c1.8-1.3 3-3.4 3-5.8 0-3.9-3.1-7-7-7z" strokeLinejoin="round"/></svg>
              Sticker
            </button>
          </div>
          </>
          )}
        </aside>
      </div>

      {toast && (
        <div
          role="alert"
          aria-live="polite"
          aria-atomic="true"
          className={`svg-toast svg-toast-${toast.type}`}
          style={{
            position: 'fixed',
            bottom: '100px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 20px',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            zIndex: 10000,
            animation: 'slideUp 0.3s ease-out',
            backgroundColor: toast.type === 'error' ? '#fee' : toast.type === 'success' ? '#efe' : '#fef3cd',
            color: toast.type === 'error' ? '#c33' : toast.type === 'success' ? '#3a3' : '#664d03',
            border: `1px solid ${toast.type === 'error' ? '#fcc' : toast.type === 'success' ? '#cfc' : '#ffe5a1'}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            maxWidth: '500px'
          }}>
          {toast.message}
        </div>
      )}

      <footer className="svg-maker-footer">
        <button 
          type="button" 
          className="svg-maker-btn" 
          onClick={onClose}
          aria-label="Close Create a Logo editor">
          Cancel
        </button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginRight: '10px', color: '#d8dee8', fontSize: '13px' }}>
          Save as
          <select
            value={saveFormat}
            onChange={(e) => setSaveFormat(e.target.value === 'png' ? 'png' : 'svg')}
            className="svg-select"
            aria-label="Save format"
            title="Choose preset save format"
          >
            <option value="svg">SVG</option>
            <option value="png">PNG</option>
          </select>
        </label>
        <button
          type="button"
          className="svg-maker-btn primary"
          onClick={() => handleSave()}
          disabled={!shapes.length}
          aria-label={shapes.length ? `Save design as ${saveFormat.toUpperCase()} preset decal` : 'Add shapes to enable save'}
          title={`Saves the design as a ${saveFormat.toUpperCase()} preset decal`}>
          {`Save ${saveFormat.toUpperCase()} Preset + Add Decal`}
        </button>
      </footer>

      {/* ── Gradient Editor Modal ── */}
      {gradientEditorOpen && selected && createPortal(
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }} onClick={() => setGradientEditorOpen(false)}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '450px',
            width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px', fontWeight: '600' }}>
              {gradientEditorTarget === 'fill' ? 'Fill' : 'Stroke'} Gradient Editor
            </h2>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Type</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className={`svg-tb-mini-btn${selected[gradientEditorTarget === 'fill' ? 'fillGradient' : 'strokeGradient']?.type === 'linear' ? ' active' : ''}`}
                  onClick={() => {
                    const g: Gradient = { type: 'linear', angle: 45, stops: [{ color: '#000000', position: 0 }, { color: '#ffffff', position: 100 }] }
                    updateSelectedWithHistory({ [gradientEditorTarget === 'fill' ? 'fillGradient' : 'strokeGradient']: g })
                  }}>
                  Linear
                </button>
                <button
                  type="button"
                  className={`svg-tb-mini-btn${selected[gradientEditorTarget === 'fill' ? 'fillGradient' : 'strokeGradient']?.type === 'radial' ? ' active' : ''}`}
                  onClick={() => {
                    const g: Gradient = { type: 'radial', stops: [{ color: '#000000', position: 0 }, { color: '#ffffff', position: 100 }] }
                    updateSelectedWithHistory({ [gradientEditorTarget === 'fill' ? 'fillGradient' : 'strokeGradient']: g })
                  }}>
                  Radial
                </button>
              </div>
            </div>

            {selected[gradientEditorTarget === 'fill' ? 'fillGradient' : 'strokeGradient'] && (
              <>
                {selected[gradientEditorTarget === 'fill' ? 'fillGradient' : 'strokeGradient']?.type === 'linear' && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Angle</label>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={selected[gradientEditorTarget === 'fill' ? 'fillGradient' : 'strokeGradient']?.angle ?? 0}
                      onChange={e => {
                        const g = selected[gradientEditorTarget === 'fill' ? 'fillGradient' : 'strokeGradient']
                        if (g) updateSelectedWithHistory({
                          [gradientEditorTarget === 'fill' ? 'fillGradient' : 'strokeGradient']: { ...g, angle: +e.target.value }
                        })
                      }}
                      style={{ width: '100%' }}
                    />
                    <span style={{ fontSize: '12px', color: '#666' }}>{selected[gradientEditorTarget === 'fill' ? 'fillGradient' : 'strokeGradient']?.angle ?? 0}°</span>
                  </div>
                )}

                <p style={{ fontSize: '12px', color: '#666', marginTop: '16px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                  ℹ️ Pro Tip: Gradients are exported to all formats (SVG, PDF, PNG). For wrap shops, ensure sufficient contrast for visibility on vehicle surfaces.
                </p>
              </>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                type="button"
                onClick={() => setGradientEditorOpen(false)}
                style={{ padding: '10px 20px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#f5f5f5', cursor: 'pointer', fontSize: '14px' }}>
                Close
              </button>
              <button
                type="button"
                onClick={() => updateSelectedWithHistory({ [gradientEditorTarget === 'fill' ? 'fillGradient' : 'strokeGradient']: null })}
                style={{ padding: '10px 20px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#fee', cursor: 'pointer', fontSize: '14px', color: '#c33' }}>
                Remove Gradient
              </button>
            </div>
          </div>
        </div>,
        document.body
        )}

      {/* ── Print Export Modal ── */}
      {printExportOpen && createPortal(
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }} onClick={() => setPrintExportOpen(false)}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            maxHeight: '80vh',
            overflowY: 'auto'
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>Print Export Settings</h2>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Color Space</label>
              <select value={printSettings.colorSpace} onChange={e => setPrintSettings({ ...printSettings, colorSpace: e.target.value as 'RGB' | 'CMYK' })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', fontFamily: 'sans-serif', fontSize: '14px' }}>
                <option value="RGB">RGB (Digital/Web)</option>
                <option value="CMYK">CMYK (Print Professional)</option>
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Resolution (DPI)</label>
              <select value={printSettings.dpi} onChange={e => setPrintSettings({ ...printSettings, dpi: +e.target.value as any })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', fontFamily: 'sans-serif', fontSize: '14px' }}>
                <option value={72}>72 DPI (Web)</option>
                <option value={150}>150 DPI (Standard)</option>
                <option value={300}>300 DPI (Professional Print)</option>
                <option value={600}>600 DPI (Maximum)</option>
              </select>
              <p style={{ fontSize: '12px', color: '#666', margin: '8px 0 0 0' }}>300 DPI recommended for professional print wrap shops</p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Export Format</label>
              <select value={printSettings.format} onChange={e => setPrintSettings({ ...printSettings, format: e.target.value as any })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', fontFamily: 'sans-serif', fontSize: '14px' }}>
                <option value="SVG">SVG Vector (Best for Print)</option>
                <option value="PDF">PDF (Print Optimized)</option>
                <option value="PNG">PNG Raster (Web)</option>
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Quality</label>
              <select value={printSettings.quality} onChange={e => setPrintSettings({ ...printSettings, quality: e.target.value as any })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', fontFamily: 'sans-serif', fontSize: '14px' }}>
                <option value="standard">Standard</option>
                <option value="high">High</option>
                <option value="maximum">Maximum (Slower)</option>
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                <input
                  type="checkbox"
                  checked={printSettings.includeBleed}
                  onChange={e => setPrintSettings({ ...printSettings, includeBleed: e.target.checked })}
                />
                Include Bleed/Safety Margin
              </label>
              {printSettings.includeBleed && (
                <div style={{ marginTop: '8px' }}>
                  <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Bleed Size (mm):</label>
                  <input
                    type="number"
                    value={printSettings.bleedSize}
                    onChange={e => setPrintSettings({ ...printSettings, bleedSize: +e.target.value })}
                    min={0}
                    max={50}
                    style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', fontFamily: 'monospace', fontSize: '14px' }}
                  />
                  <p style={{ fontSize: '11px', color: '#666', margin: '4px 0 0 0' }}>18mm recommended for cutting tolerance</p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={printExporting}
                onClick={() => setPrintExportOpen(false)}
                title={printExporting ? 'Export in progress' : 'Close print export settings'}
                style={{ padding: '10px 20px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#f5f5f5', cursor: printExporting ? 'not-allowed' : 'pointer', opacity: printExporting ? 0.65 : 1, fontSize: '14px', fontWeight: '500' }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (printExporting) return
                  setPrintExporting(true)
                  setPrintExportStatus('Starting export...')
                  void exportFromPrintSettings()
                    .then((ok) => {
                      if (ok) setPrintExportOpen(false)
                    })
                    .finally(() => {
                      setPrintExportStatus('')
                      setPrintExporting(false)
                    })
                }}
                disabled={printExporting}
                title={printExporting ? 'Generating export file...' : 'Export using selected settings'}
                style={{ padding: '10px 20px', borderRadius: '4px', backgroundColor: '#4a90e2', color: 'white', cursor: printExporting ? 'not-allowed' : 'pointer', opacity: printExporting ? 0.75 : 1, fontSize: '14px', fontWeight: '500', border: 'none' }}>
                {printExporting ? 'Exporting...' : 'Export File'}
              </button>
            </div>
            {printExporting && (
              <p style={{ marginTop: '10px', fontSize: '12px', color: '#44556b' }} aria-live="polite">
                {printExportStatus}
              </p>
            )}
          </div>
        </div>,
        document.body
      )}

      {effectsMenuOpen && createPortal(
        <div
          ref={topEffectsMenuPortalRef}
          className="svg-tb-menu-card svg-tb-effects-menu"
          style={{ position: 'fixed', top: effectsMenuPos.top, left: effectsMenuPos.left, zIndex: 9999 }}>
          <button
            ref={offsetBtnRef}
            type="button"
            className="svg-tb-menu-item"
            onClick={() => {
              openOffsetPopover(offsetBtnRef.current)
              setEffectsMenuOpen(false)
            }}
            disabled={!offsetEnabled}
            aria-label="Offset - expand or shrink shapes">
            <span className="svg-tb-menu-icon">⬡</span>
            <span>Offset</span>
          </button>
          <button type="button" className="svg-tb-menu-item"
            disabled={selectionSet.filter(id => {
              const s = shapes.find(sh => sh.id === id)
              return s && s.visible && !s.locked
            }).length === 0}
            title="Open shadow controls"
            aria-label="Shadow - open shadow controls"
            onClick={() => { openShadowPopover(offsetBtnRef.current); setEffectsMenuOpen(false) }}>
            <span className="svg-tb-menu-icon">◔</span>
            <span>Shadow</span>
          </button>
          <button type="button" className="svg-tb-menu-item"
            disabled={offsetApplying || shapes.filter(s => s.visible && !s.locked).length === 0}
            title="Create unified sticker border behind all shapes"
            aria-label="Sticker - create white border behind all visible shapes"
            onClick={() => { makeSticker(20); setEffectsMenuOpen(false) }}>
            <span className="svg-tb-menu-icon">◍</span>
            <span>Sticker</span>
          </button>
          <button
            ref={warpBtnRef}
            type="button"
            className="svg-tb-menu-item"
            disabled={selectionSet.filter(id => {
              const s = shapes.find(sh => sh.id === id)
              return s && s.visible && !s.locked
            }).length === 0 || warpApplying}
            title="Arch warp — bend shapes along a circular arc"
            aria-label="Warp - bend shapes along a circular arch"
            onClick={() => { openWarpPopover(warpBtnRef.current); setEffectsMenuOpen(false) }}>
            <span className="svg-tb-menu-icon">⌇</span>
            <span>Warp</span>
          </button>
          <button
            type="button"
            className="svg-tb-menu-item"
            disabled={!selected}
            title="Curve selected text or open contour editor for paths"
            aria-label="Curve - arc text or open curve editor"
            onClick={() => {
              if (!selected) {
                showToast('Select a layer first', 'warning')
                setEffectsMenuOpen(false)
                return
              }
              if (selected.kind === 'text') {
                openCurvePopover(offsetBtnRef.current)
                setEffectsMenuOpen(false)
                return
              }
              openContourEditor()
              setEffectsMenuOpen(false)
            }}>
            <span className="svg-tb-menu-icon">⌒</span>
            <span>Curve</span>
          </button>
        </div>,
        document.body
      )}

      {topCombineMenuOpen && createPortal(
        <div
          ref={topCombineMenuPortalRef}
          className="svg-tb-menu-card svg-tb-combine-dropdown"
          style={{ position: 'fixed', top: topCombineMenuPos.top, left: topCombineMenuPos.left, zIndex: 9999 }}>
          {([
            { label: 'Weld',      disabled: !booleanEnabled, icon: <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16"><circle cx="8" cy="11" r="5"/><circle cx="14" cy="11" r="5"/></svg>,                                                                                                                                                                           onClick: () => { weldPaths();              setTopCombineMenuOpen(false) } },
            { label: 'Unite',     disabled: !booleanEnabled, icon: <svg viewBox="0 0 22 22" fill="currentColor" width="16" height="16"><circle cx="8" cy="11" r="5"/><circle cx="14" cy="11" r="5"/></svg>,                                                                                                                                                                                                          onClick: () => { booleanOp('unite');       setTopCombineMenuOpen(false) } },
            { label: 'Subtract',  disabled: !booleanEnabled, icon: <svg viewBox="0 0 22 22" width="16" height="16"><circle cx="8" cy="11" r="5" fill="currentColor"/><circle cx="14" cy="11" r="5" fill="#1a1a1a"/><circle cx="14" cy="11" r="5" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>,                                                                                                        onClick: () => { booleanOp('subtract');    setTopCombineMenuOpen(false) } },
            { label: 'Intersect', disabled: !booleanEnabled, icon: <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><circle cx="8" cy="11" r="5"/><circle cx="14" cy="11" r="5"/><path d="M11 6.27a5 5 0 0 1 0 9.46A5 5 0 0 0 11 6.27Z" fill="currentColor" stroke="none"/></svg>,                                                                                onClick: () => { booleanOp('intersect');   setTopCombineMenuOpen(false) } },
            { label: 'Exclude',   disabled: !booleanEnabled, icon: <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><circle cx="8" cy="11" r="5"/><circle cx="14" cy="11" r="5"/><path d="M11 6.27a5 5 0 0 1 0 9.46A5 5 0 0 0 11 6.27Z" fill="#1a1a1a" stroke="none"/></svg>,                                                                                    onClick: () => { booleanOp('exclude');     setTopCombineMenuOpen(false) } },
          ] as const).map(({ label, disabled, icon, onClick }) => (
            <button key={label} type="button" className="svg-tb-combine-row" disabled={disabled} onClick={onClick}>
              <span className="svg-tb-combine-row-icon">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}

      {offsetPopoverOpen && createPortal(
        <div
          ref={offsetPopoverPortalRef}
          className="svg-tb-offset-popover"
          style={{ position: 'fixed', top: offsetPopoverPos.top, left: offsetPopoverPos.left, zIndex: 9999 }}>
          <div className="svg-tb-offset-tabs">
            <button type="button" className="svg-tb-offset-tab active">Offset</button>
          </div>

          <div
            className="svg-offset-head"
            onPointerDown={startOffsetPopoverDrag}
            style={{ cursor: 'grab', userSelect: 'none' }}>
            <span>Offset</span>
            <span className="svg-offset-target">{offsetTargetLabel}</span>
          </div>

          <div className="svg-offset-distance-row">
            <label htmlFor="svg-offset-top">Distance</label>
            <input
              id="svg-offset-top"
              type="range"
              min={-100}
              max={100}
              step={0.5}
              value={distanceToSliderPos(offsetDraftAmt)}
              onInput={e => {
                markOffsetPreviewScrubbing()
                setOffsetDraftAmtPrecise(sliderPosToDistance(+(e.target as HTMLInputElement).value))
              }}
              onChange={e => setOffsetDraftAmtPrecise(sliderPosToDistance(+e.target.value))}
              onPointerUp={() => markOffsetPreviewScrubbing()}
              onBlur={() => setOffsetPreviewScrubbing(false)}
            />
            <input
              type="number"
              className="svg-maker-input"
              min={-1}
              max={1}
              step={OFFSET_DISTANCE_INPUT_STEP}
              value={(offsetDraftAmt / 100).toFixed(2)}
              onChange={e => setOffsetDraftAmtPrecise(parseFloat(e.target.value) * 100)}
            />
            <span>in</span>
          </div>

          <p style={{ margin: '4px 0 6px', fontSize: 11, opacity: 0.7 }}>
            <strong>Outset (+)</strong> = expand outward &nbsp;·&nbsp; <strong>Inset (−)</strong> = shrink inward
          </p>

          <div className="svg-offset-corner-row">
            <span>Corner</span>
            <button
              type="button"
              className={offsetDraftCorner === 'round' ? 'svg-offset-chip active' : 'svg-offset-chip'}
              onClick={() => setOffsetDraftCorner('round')}
              title="Rounded corners: smooth arc joins">
              Rounded
            </button>
            <button
              type="button"
              className={offsetDraftCorner === 'sharp' ? 'svg-offset-chip active' : 'svg-offset-chip'}
              onClick={() => setOffsetDraftCorner('sharp')}
              title="Angular corners: sharp 45° bevels">
              Angular
            </button>
          </div>

          <p style={{ margin: '4px 0 6px', fontSize: 11, opacity: 0.7 }}>
            <strong>Rounded</strong> = smooth arcs &nbsp;·&nbsp; <strong>Angular</strong> = sharp points
          </p>

          <label className="svg-offset-toggle svg-offset-toggle-inline" title="Merge all offsets into one shape (vs separate layer per input)">
            <span>Weld Offsets</span>
            <input type="checkbox" checked={offsetDraftWeld} onChange={e => setOffsetDraftWeld(e.target.checked)} />
          </label>

          <p style={{ margin: '4px 0 6px', fontSize: 11, opacity: 0.7 }}>
            Merge all into one &nbsp;·&nbsp; Uncheck to keep separate
          </p>

          {importError && <p className="svg-maker-error" style={{ margin: '6px 0 0' }}>{importError}</p>}

          {(() => {
            const selTexts = selectionSet.map(id => shapes.find(s => s.id === id)).filter(s => s?.kind === 'text')
            if (!selTexts.length) return null
            const allHaveFont = selTexts.every(s => s?.fontUrl)
            return (
              <p style={{ margin: '4px 0 0', fontSize: 11, opacity: 0.7, color: allHaveFont ? '#7fff7f' : '#ffcc44' }}>
                {allHaveFont ? '✓ Glyph curves active' : '⚠ Pick a library font for letter-accurate offset'}
              </p>
            )
          })()}

          <div style={{ height: '1px', backgroundColor: 'rgba(0,0,0,0.1)', margin: '10px 0' }} />

          <div className="svg-offset-apply-row">
            <button type="button" className="svg-maker-btn" onClick={() => setOffsetPopoverOpen(false)}>Cancel</button>
            <button type="button" className="svg-maker-btn primary" onClick={applyOffsetFromPopover} disabled={!offsetEnabled || offsetApplying}>{offsetApplying ? 'Computing…' : 'Apply'}</button>
          </div>
        </div>,
        document.body
      )}

      {shadowPopoverOpen && createPortal(
        <div
          ref={shadowPopoverPortalRef}
          className="svg-tb-offset-popover"
          style={{ position: 'fixed', top: shadowPopoverPos.top, left: shadowPopoverPos.left, zIndex: 9999 }}>
          <div className="svg-tb-offset-tabs">
            <button type="button" className="svg-tb-offset-tab active">Shadow</button>
          </div>

          <div className="svg-offset-head">
            <span>Drop Shadow</span>
            <span className="svg-offset-target">{Math.round(shadowDirectionDeg)}°</span>
          </div>

          <div className="svg-offset-distance-row">
            <label htmlFor="svg-shadow-direction">Direction</label>
            <input
              id="svg-shadow-direction"
              type="range"
              min={-180}
              max={180}
              step={1}
              value={shadowDirectionDeg}
              onChange={e => setShadowDirectionDeg(+e.target.value)}
            />
            <input
              type="number"
              className="svg-maker-input"
              min={-180}
              max={180}
              value={Math.round(shadowDirectionDeg)}
              onChange={e => setShadowDirectionDeg(+e.target.value || 0)}
            />
            <span>deg</span>
          </div>

          <p style={{ margin: '6px 0 8px', fontSize: 11, opacity: 0.7 }}>
            <strong>0°</strong> = right &nbsp;·&nbsp; <strong>90°</strong> = down &nbsp;·&nbsp; <strong>-90°</strong> = up
          </p>

          <ul style={{ margin: '8px 0', paddingLeft: '16px', fontSize: 12, opacity: 0.7, lineHeight: '1.6' }}>
            <li>Direction controls shadow offset angle</li>
            <li>Places shadow behind source layer</li>
            <li>Keeps source shape untouched</li>
          </ul>

          <div style={{ height: '1px', backgroundColor: 'rgba(0,0,0,0.1)', margin: '10px 0' }} />

          <div className="svg-offset-apply-row">
            <button type="button" className="svg-maker-btn" onClick={() => setShadowPopoverOpen(false)}>Cancel</button>
            <button type="button" className="svg-maker-btn primary" onClick={applyShadowFromOffsetTab} disabled={!offsetEnabled}>Apply Shadow</button>
          </div>
        </div>,
        document.body
      )}

      {curvePopoverOpen && createPortal(
        <div
          ref={curvePopoverPortalRef}
          className="svg-tb-offset-popover"
          style={{ position: 'fixed', top: curvePopoverPos.top, left: curvePopoverPos.left, zIndex: 9999 }}>
          <div className="svg-tb-offset-tabs">
            <button type="button" className="svg-tb-offset-tab active">Curve</button>
          </div>

          {selected?.kind === 'text' ? (
            <>
              <div className="svg-offset-head">
                <span>Text Curve</span>
                <span className="svg-offset-target">{Math.round(selected.textCurve ?? 0)}</span>
              </div>

              <div className="svg-offset-distance-row">
                <label htmlFor="svg-text-curve">Curve</label>
                <input
                  id="svg-text-curve"
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={selected.textCurve ?? 0}
                  onPointerDown={commitHistory}
                  onPointerUp={resetHistoryCommit}
                  onChange={e => updateSelected({ textCurve: +e.target.value })}
                />
                <input
                  type="number"
                  className="svg-maker-input"
                  min={-100}
                  max={100}
                  value={Math.round(selected.textCurve ?? 0)}
                  onFocus={commitHistory}
                  onBlur={resetHistoryCommit}
                  onChange={e => updateSelected({ textCurve: +e.target.value || 0 })}
                />
              </div>

              <p style={{ margin: '4px 0 6px', fontSize: 11, opacity: 0.7 }}>
                <strong>Positive</strong> = arch upward &nbsp;·&nbsp; <strong>Negative</strong> = arch downward &nbsp;·&nbsp; <strong>0</strong> = straight
              </p>

              {(selected.text || '').includes('\n') && (
                <p className="svg-maker-error" style={{ margin: '6px 0 0' }}>
                  Curve currently applies to single-line text. Remove line breaks for Cricut-style arc text.
                </p>
              )}

              <div style={{ height: '1px', backgroundColor: 'rgba(0,0,0,0.1)', margin: '10px 0' }} />

              <div className="svg-offset-apply-row">
                <button type="button" className="svg-maker-btn" onClick={() => setCurvePopoverOpen(false)}>Cancel</button>
                <button type="button" className="svg-maker-btn primary" onClick={() => setCurvePopoverOpen(false)}>Done</button>
              </div>
            </>
          ) : (
            <>
              <div className="svg-offset-head">
                <span>Path Curve Editor</span>
                <span className="svg-offset-target">Advanced</span>
              </div>
              <p style={{ margin: '12px 0', fontSize: 13, opacity: 0.8, textAlign: 'center', lineHeight: '1.4' }}>
                Edit individual path control points and curves.
              </p>
              <p style={{ margin: '8px 0', fontSize: 12, opacity: 0.7 }}>
                Use the Contour editor for path control.
              </p>

              <div style={{ height: '1px', backgroundColor: 'rgba(0,0,0,0.1)', margin: '10px 0' }} />

              <div className="svg-offset-apply-row">
                <button type="button" className="svg-maker-btn" onClick={() => setCurvePopoverOpen(false)}>Cancel</button>
                <button
                  type="button"
                  className="svg-maker-btn primary"
                  onClick={() => {
                    if (!contourTarget) {
                      showToast('Select a layer first', 'warning')
                      return
                    }
                    if (contourTarget.kind === 'text' && !contourTarget.isOffsetLayer) {
                      showToast('Curve editor works on path layers. Convert to path or create an offset first.', 'warning')
                      return
                    }
                    setCurvePopoverOpen(false)
                    openContourEditor()
                  }}
                  disabled={offsetApplying}>
                  Open Curve Editor
                </button>
              </div>
            </>
          )}
        </div>,
        document.body
      )}

      {warpPopoverOpen && createPortal(
        <div
          ref={warpPopoverPortalRef}
          className="svg-tb-offset-popover"
          style={{ position: 'fixed', top: warpPopoverPos.top, left: warpPopoverPos.left, zIndex: 9999 }}>
          <div className="svg-tb-offset-tabs">
            <button type="button" className="svg-tb-offset-tab active">Warp</button>
          </div>
          <div className="svg-offset-head">
            <span>Arch Warp</span>
            <span className="svg-offset-target">
              {selectionSet.length > 1 ? `${selectionSet.length} shapes` : selected?.kind}
            </span>
          </div>

          <div className="svg-offset-distance-row">
            <label htmlFor="svg-warp-amount">Arch</label>
            <input
              id="svg-warp-amount"
              type="range"
              min={-100}
              max={100}
              step={1}
              value={warpAmount}
              onChange={e => setWarpAmount(+e.target.value)}
            />
            <input
              type="number"
              className="svg-maker-input"
              min={-100}
              max={100}
              value={warpAmount}
              onChange={e => setWarpAmount(+e.target.value || 0)}
            />
            <span>%</span>
          </div>

          <p style={{ margin: '4px 0 6px', fontSize: 11, opacity: 0.7 }}>
            <strong>Positive</strong> = arch upward &nbsp;·&nbsp; <strong>Negative</strong> = arch downward &nbsp;·&nbsp; <strong>0</strong> = no effect
          </p>

          <div className="svg-offset-apply-row">
            <button type="button" className="svg-maker-btn" onClick={() => setWarpPopoverOpen(false)}>Cancel</button>
            <button type="button" className="svg-maker-btn primary" onClick={() => void applyWarpArch()} disabled={warpAmount === 0 || warpApplying}>
              {warpApplying ? 'Warping…' : 'Apply'}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
