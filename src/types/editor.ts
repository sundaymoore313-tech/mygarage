export type LayerType = 'decal' | 'text' | 'group' | 'stripe' | 'split'

export type MeshClass = 'paintable' | 'excluded' | 'window' | 'rims'

export type ToolMode = 'orbit' | 'paint' | 'decal' | 'text' | 'mesh-inspect' | 'mesh-classify'
export type TransformGizmoMode = 'translate' | 'rotate' | 'scale'
export type CameraViewId = 'side' | 'front' | 'back'

export type SelectedCar = {
  name: string
  modelUrl: string
  groundOffsetY?: number
  realWorldLengthM?: number
  realWorldWidthM?: number
  realWorldHeightM?: number
}

export type PaintTargetId = 'hood' | 'trunk' | 'fullCar' | 'rims'

export type CarObjectPart = {
  id: string
  label: string
}

export type Vec3 = {
  x: number
  y: number
  z: number
}

export type LayerTransform = {
  position: Vec3
  rotation: Vec3
  scale: Vec3
  skew: { x: number; y: number }
  opacity: number
}

export type ColorReference = {
  swatchId: string
  brand: string
  code: string
  name: string
  finish: string
}

export type LayerBase = {
  id: string
  name: string
  type: LayerType
  mirrorX: boolean
  mirrorToOtherSide: boolean
  mirrorColorHex: string | null
  mirrorMirrorX: boolean
  visible: boolean
  locked: boolean
  groupId: string | null
  createdAt: number
  updatedAt: number
  transform: LayerTransform
}

export type BlendMode = 'normal' | 'multiply' | 'additive'

export type StripeLayer = LayerBase & {
  type: 'stripe'
  colorHex: string
  colorRef: ColorReference | null
  finish: PaintFinish
  stripeWidth: number      // world-space half-width each side
  stripeGap: number        // distance between mirrored bands (0 = single stripe)
  stripeOffsetX: number    // lateral offset from car centre
  softEdge: number         // feather amount (0–0.15)
}

export type StripeLayerSeed = {
  stripeWidth: number
  stripeGap: number
  stripeOffsetX: number
  softEdge: number
  opacity: number
  angle: number
}

export type SplitLayer = LayerBase & {
  type: 'split'
  colorHex: string
  colorRef: ColorReference | null
  sideBColorHex: string
  finish: PaintFinish
  splitOffsetX: number
  softEdge: number
}

export type DecalLayer = LayerBase & {
  type: 'decal'
  imageUrl: string | null
  colorHex: string
  colorRef: ColorReference | null
  finish: PaintFinish
  targetPartId: string | null
  blendMode: BlendMode
}

export type TextLayer = LayerBase & {
  type: 'text'
  text: string
  fontFamily: string
  fontUrl: string | null
  colorHex: string
  colorRef: ColorReference | null
  finish: PaintFinish
  targetPartId: string | null
  textCurve: number
  mirroredTextReadable: boolean
}

export type GroupLayer = {
  id: string
  name: string
  type: 'group'
  visible: boolean
  locked: boolean
  collapsed: boolean
  groupId: string | null
  createdAt: number
  updatedAt: number
}

export type Layer = DecalLayer | TextLayer | GroupLayer | StripeLayer | SplitLayer

export type PaintFinish = 'gloss' | 'matte' | 'chrome' | 'satin'

/**
 * A texture-based "print" applied as the base paint over a paint target's
 * classified meshes (fullCar, hood, trunk, rims).
 * Works exactly like a base paint coat but uses a repeating pattern image
 * instead of a solid colour.
 */
export type PrintConfig = {
  imageUrl: string      // URL to the pattern/texture image
  tileScale: number     // how many times the texture repeats across the car (1–20)
  opacity: number       // 0 = transparent, 1 = fully opaque
  finish: PaintFinish   // gloss / matte / chrome / satin
  tintHex: string       // colour multiplied over the texture ('#ffffff' = no tint)
}

export type PaintConfig = {
  colorHex: string
  colorRef: ColorReference | null
  finish: PaintFinish
  metallic: number
  roughness: number
  clearcoat: number
}

export type CarGradientConfig = {
  enabled: boolean
  fromHex: string
  toHex: string
  axis: 'x' | 'y' | 'z'
  balance: number
}

export type WindowTintConfig = {
  enabled: boolean
  amount: number
  colorHex: string
}

export type CarSplitConfig = {
  enabled: boolean
  sideAHex: string
  sideBHex: string
  finish: PaintFinish
  offsetX: number
  softEdge: number
  angle: number
}

export type CarStripeConfig = {
  enabled: boolean
  colorHex: string
  finish: PaintFinish
  width: number
  gap: number
  offsetX: number
  softEdge: number
  angle: number
}

export type UnitSystem = 'mm' | 'in'

export type VehicleCalibration = {
  // Dimensions of the physical vehicle used to validate model scale.
  lengthMm: number | null
  widthMm: number | null
  heightMm: number | null
  wheelbaseMm: number | null
  source: 'manual' | 'catalog' | 'scan' | 'unknown'
  notes: string
}

export type WrapPanelOrientation = 'normal' | 'mirrored'

export type WrapPanelTemplate = {
  id: string
  label: string
  widthMm: number
  heightMm: number
  bleedMm: number
  overlapMm: number
  orientation: WrapPanelOrientation
  templateImageUrl?: string | null
  templateFitMode?: 'cover' | 'contain' | 'stretch'
  templateBlendMode?: 'normal' | 'multiply'
  templateOverlayOpacity?: number
  installOrder: number
  enabled: boolean
}

export type PrintProductionSettings = {
  unitSystem: UnitSystem
  outputDpi: 150 | 300
  mediaWidthMm: number
  tileOverlapMm: number
  defaultBleedMm: number
  defaultSafeMm: number
  colorProfileName: string
  includeCutContour: boolean
  includeRegistrationMarks: boolean
}

export type WrapJobMeta = {
  jobName: string
  customerName: string
  vehicleVin: string
  printerName: string
  mediaName: string
  approvedBy: string
  approvedAt: number | null
  revision: number
}

export type CameraPresetName =
  | 'front'
  | 'rear'
  | 'left'
  | 'right'
  | 'top'
  | 'threeQuarter'

export type CameraPreset = {
  name: CameraPresetName
  position: Vec3
  target: Vec3
}

export type ProjectMeta = {
  id: string
  name: string
  version: number
  createdAt: number
  updatedAt: number
}

export type EditorProject = {
  meta: ProjectMeta
  paint: PaintConfig
  carGradient: CarGradientConfig
  windowTint: WindowTintConfig
  carSplit: CarSplitConfig
  carStripe: CarStripeConfig
  stripeLayerSeed: StripeLayerSeed | null
  vehicleCalibration: VehicleCalibration
  wrapPanels: WrapPanelTemplate[]
  printProduction: PrintProductionSettings
  wrapJob: WrapJobMeta
  layers: Layer[]
  customDecals: CustomDecalPreset[]
  meshClassifications: Record<string, MeshClass>
}

export type CustomDecalPreset = {
  id: string
  name: string
  imageUrl: string
  svgMarkup: string
  createdAt: number
  updatedAt: number
}

export type HistorySnapshot = {
  project: EditorProject
  selectedLayerId: string | null
  transformGizmoMode: TransformGizmoMode
  selectedObjectId: string | null
  partPaintByObject: Record<string, PaintConfig>
  selectedPaintTarget: PaintTargetId | null
  targetPaints: Partial<Record<PaintTargetId, PaintConfig>>
  targetPrints: Partial<Record<PaintTargetId, PrintConfig | null>>
  label?: string
}

export type EditorState = {
  project: EditorProject
  selectedLayerId: string | null
  selectedCar: SelectedCar | null
  cameraView: CameraViewId
  availableParts: CarObjectPart[]
  transformGizmoMode: TransformGizmoMode
  selectedObjectId: string | null
  partPaintByObject: Record<string, PaintConfig>
  selectedPaintTarget: PaintTargetId | null
  targetPaints: Partial<Record<PaintTargetId, PaintConfig>>
  /** Texture-based prints applied per paint target, acting as the base paint. */
  targetPrints: Partial<Record<PaintTargetId, PrintConfig | null>>
  activeTool: ToolMode
  activeCarTool: 'split' | 'stripes' | null
  autoRotate: boolean
  orbitLockToScenePanel: boolean
  classifyLocked: boolean
  historyPast: HistorySnapshot[]
  historyFuture: HistorySnapshot[]
}

export type EditorActions = {
  selectCar: (car: SelectedCar) => void
  clearSelectedCar: () => void
  setSelectedPaintTarget: (target: PaintTargetId | null) => void
  setCameraView: (view: CameraViewId) => void
  setAvailableParts: (parts: CarObjectPart[]) => void
  setSelectedObjectId: (objectId: string | null) => void
  setTransformGizmoMode: (mode: TransformGizmoMode) => void
  setTool: (tool: ToolMode) => void
  setOrbitLockToScenePanel: (value: boolean) => void
  setAutoRotate: (v: boolean) => void
  setSelectedLayer: (layerId: string | null) => void
  setPaint: (patch: Partial<PaintConfig>) => void
  setCarGradient: (patch: Partial<CarGradientConfig>) => void
  setWindowTint: (patch: Partial<WindowTintConfig>) => void
  setCarSplit: (patch: Partial<CarSplitConfig>) => void
  setCarStripe: (patch: Partial<CarStripeConfig>) => void
  setVehicleCalibration: (patch: Partial<VehicleCalibration>) => void
  setPrintProduction: (patch: Partial<PrintProductionSettings>) => void
  setWrapJob: (patch: Partial<WrapJobMeta>) => void
  upsertWrapPanel: (panel: WrapPanelTemplate) => void
  removeWrapPanel: (panelId: string) => void
  setActiveCarTool: (tool: 'split' | 'stripes' | null) => void
  addDecalLayer: (imageUrl?: string) => void
  addCustomDecalPreset: (name: string, imageUrl: string, svgMarkup: string) => void
  renameCustomDecalPreset: (id: string, name: string) => void
  deleteCustomDecalPreset: (id: string) => void
  addTextLayer: (options?: { fontFamily?: string; fontUrl?: string | null; text?: string; scale?: number }) => void
  addStripeLayer: () => void
  addSplitLayer: () => void
  addStripeLayerPreset: (overrides: Partial<import('./editor').StripeLayer>[]) => void
  duplicateLayer: (layerId: string) => void
  groupLayers: (layerIds: string[], groupName?: string) => void
  ungroupLayer: (groupId: string) => void
  toggleGroupCollapsed: (groupId: string) => void
  updateLayerTransient: (layerId: string, patch: Partial<Layer>) => void
  updateLayer: (layerId: string, patch: Partial<Layer>) => void
  reorderLayer: (fromIndex: number, toIndex: number) => void
  toggleLayerVisibility: (layerId: string) => void
  toggleLayerLock: (layerId: string) => void
  removeLayer: (layerId: string) => void
  undo: () => void
  redo: () => void
  undoToIndex: (index: number) => void
  loadProject: (project: EditorProject) => void
  setMeshClassification: (label: string, cls: MeshClass | null) => void
  clearMeshClassifications: () => void
  lockClassify: (fileName: string, classifications: Record<string, MeshClass>) => void
  unlockClassify: (fileName: string) => void
  setTargetPrint: (target: PaintTargetId, print: PrintConfig | null) => void
  clearTargetPrint: (target: PaintTargetId) => void
}

export type EditorStore = EditorState & EditorActions
