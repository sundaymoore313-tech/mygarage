import ClipperLib from 'clipper-lib'

export type Point = { x: number; y: number }
export type Polygon = Point[]

// A subpath is one continuous contour (outer or hole).
export type Subpath = {
  id: string
  points: Polygon
  isHole: boolean
  visible: boolean
}

export type Shape = {
  id: string
  subpaths: Subpath[]
}

export type CornerStyle = 'rounded' | 'angular'

export type OffsetOptions = {
  // Positive = external offset, negative = inset.
  distance: number
  // Rounded -> jtRound, Angular -> jtMiter.
  cornerStyle: CornerStyle
  // True = union all offsets into one shape.
  weldOffsets: boolean
}

type ClipperPoint = { X: number; Y: number }
type ClipperPath = ClipperPoint[]

// ---------- SVG path <-> polygon helpers (replace with your parser/flattening) ----------

// TODO: Replace with production SVG path parsing + curve flattening.
export function svgPathToPolygons(d: string): Polygon[] {
  void d
  return []
}

export function polygonsToSvgPaths(polygons: Polygon[]): string[] {
  return polygons.map(poly => {
    if (!poly.length) return ''
    const [first, ...rest] = poly
    const move = `M ${first.x} ${first.y}`
    const lines = rest.map(p => `L ${p.x} ${p.y}`).join(' ')
    return `${move} ${lines} Z`
  })
}

// ---------- Core offset logic (Cricut-like Offset tool) ----------

function toClipperPath(poly: Polygon, scale: number): ClipperPath {
  return poly.map(p => ({
    X: Math.round(p.x * scale),
    Y: Math.round(p.y * scale),
  }))
}

function fromClipperPaths(paths: ClipperPath[], scale: number): Polygon[] {
  return paths.map(path =>
    path.map(p => ({
      x: p.X / scale,
      y: p.Y / scale,
    })),
  )
}

function offsetPolygonsInternal(
  polygons: Polygon[],
  distance: number,
  cornerStyle: CornerStyle,
): Polygon[] {
  const scale = 100
  const co = new ClipperLib.ClipperOffset()

  const jt =
    cornerStyle === 'rounded'
      ? ClipperLib.JoinType.jtRound
      : ClipperLib.JoinType.jtMiter

  const et = ClipperLib.EndType.etClosedPolygon

  polygons.forEach(poly => {
    if (!poly.length) return
    co.AddPath(toClipperPath(poly, scale), jt, et)
  })

  const solution: ClipperPath[] = []
  co.Execute(solution, distance * scale)

  return fromClipperPaths(solution, scale)
}

function unionPolygonsInternal(polygons: Polygon[]): Polygon[] {
  const scale = 100
  const clipper = new ClipperLib.Clipper()

  const subject = polygons.map(poly => toClipperPath(poly, scale))

  clipper.AddPaths(subject, ClipperLib.PolyType.ptSubject, true)

  const solution: ClipperPath[] = []
  clipper.Execute(
    ClipperLib.ClipType.ctUnion,
    solution,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero,
  )

  return fromClipperPaths(solution, scale)
}

/**
 * Cricut-like Offset:
 * - Takes one or more SVG paths
 * - Converts to polygons
 * - Offsets them by distance with rounded/angular corners
 * - Optionally welds (unions) all offsets into a single outline
 * - Returns new SVG path(s) for the offset result
 */
export function createOffsetPathsFromSvg(
  svgPaths: string[],
  options: OffsetOptions,
): string[] {
  const allPolygons: Polygon[] = []

  svgPaths.forEach(d => {
    const polys = svgPathToPolygons(d)
    polys.forEach(p => allPolygons.push(p))
  })

  if (!allPolygons.length) return []

  // Step 1: offset polygons.
  const offsetPolys = offsetPolygonsInternal(
    allPolygons,
    options.distance,
    options.cornerStyle,
  )

  // Step 2: weld (union) if requested.
  const finalPolys = options.weldOffsets
    ? unionPolygonsInternal(offsetPolys)
    : offsetPolys

  // Step 3: convert back to SVG paths.
  return polygonsToSvgPaths(finalPolys)
}

// ---------- Contour behavior (hide/show subpaths) ----------

/**
 * Apply contour visibility to a shape:
 * - Only subpaths with visible === true are kept
 */
export function applyContour(shape: Shape): Shape {
  return {
    ...shape,
    subpaths: shape.subpaths.filter(sp => sp.visible),
  }
}

/**
 * Convert a Shape (with subpaths) to SVG path data.
 * - Only uses visible subpaths
 */
export function shapeToSvgPath(shape: Shape): string {
  const visibleSubpaths = shape.subpaths.filter(sp => sp.visible)
  const parts: string[] = []

  visibleSubpaths.forEach(sp => {
    const poly = sp.points
    if (!poly.length) return
    const [first, ...rest] = poly
    const move = `M ${first.x} ${first.y}`
    const lines = rest.map(p => `L ${p.x} ${p.y}`).join(' ')
    parts.push(`${move} ${lines} Z`)
  })

  return parts.join(' ')
}

/**
 * Toggle contour visibility for a clicked subpath.
 */
export function toggleSubpathVisibility(shape: Shape, subpathId: string): Shape {
  return {
    ...shape,
    subpaths: shape.subpaths.map(sp =>
      sp.id === subpathId ? { ...sp, visible: !sp.visible } : sp,
    ),
  }
}
