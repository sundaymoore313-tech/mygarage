import { create } from 'zustand'
import { makeId } from '../lib/id'
import { DEFAULT_TARGET_PAINT, resolvePaintFinishPreset, getLockedClassifications, saveLockedClassifications, clearLockedClassifications, loadPersonalClassifications, savePersonalClassifications, clearPersonalClassifications, getMergedClassifications, isSystemLockedMesh, saveGeneratedClassifyPreset } from '../lib/paintTargets'
import type {
  CarStripeConfig,
  DecalLayer,
  EditorProject,
  EditorStore,
  GroupLayer,
  HistorySnapshot,
  Layer,
  LayerTransform,
  MeshClass,
  PrintConfig,
  PrintProductionSettings,
  SplitLayer,
  StripeLayer,
  StripeLayerSeed,
  TextLayer,
  VehicleCalibration,
  WrapJobMeta,
  WrapPanelTemplate,
  BlendMode,
  PaintTargetId,
} from '../types/editor'

const now = () => Date.now()

const DEFAULT_STRIPE_LAYER_SEED: StripeLayerSeed = {
  stripeWidth: 0.18,
  stripeGap: 0,
  stripeOffsetX: 0,
  softEdge: 0.02,
  opacity: 1,
  angle: 0,
}

function carStripeFromLayer(layer: StripeLayer): CarStripeConfig {
  return {
    enabled: layer.visible,
    colorHex: layer.colorHex,
    finish: layer.finish,
    width: layer.stripeWidth,
    gap: layer.stripeGap,
    offsetX: layer.stripeOffsetX,
    softEdge: layer.softEdge,
    angle: layer.transform.rotation.z,
  }
}

const DEFAULT_VEHICLE_CALIBRATION: VehicleCalibration = {
  lengthMm: null,
  widthMm: null,
  heightMm: null,
  wheelbaseMm: null,
  source: 'unknown',
  notes: '',
}

const DEFAULT_PRINT_PRODUCTION: PrintProductionSettings = {
  unitSystem: 'mm',
  outputDpi: 150,
  mediaWidthMm: 1372, // ~54 in standard wrap roll
  tileOverlapMm: 12,
  defaultBleedMm: 10,
  defaultSafeMm: 8,
  colorProfileName: 'sRGB IEC61966-2.1',
  includeCutContour: false,
  includeRegistrationMarks: true,
}

const DEFAULT_WRAP_JOB: WrapJobMeta = {
  jobName: 'Untitled Wrap Job',
  customerName: '',
  vehicleVin: '',
  printerName: '',
  mediaName: '',
  approvedBy: '',
  approvedAt: null,
  revision: 1,
}

const DEFAULT_WRAP_PANELS: WrapPanelTemplate[] = [
  { id: 'hood', label: 'Hood', widthMm: 1700, heightMm: 1200, bleedMm: 10, overlapMm: 12, orientation: 'normal', templateImageUrl: null, templateFitMode: 'cover', templateBlendMode: 'normal', templateOverlayOpacity: 100, installOrder: 1, enabled: true },
  { id: 'roof', label: 'Roof', widthMm: 1700, heightMm: 1400, bleedMm: 10, overlapMm: 12, orientation: 'normal', templateImageUrl: null, templateFitMode: 'cover', templateBlendMode: 'normal', templateOverlayOpacity: 100, installOrder: 2, enabled: true },
  { id: 'trunk', label: 'Trunk', widthMm: 1650, heightMm: 1100, bleedMm: 10, overlapMm: 12, orientation: 'normal', templateImageUrl: null, templateFitMode: 'cover', templateBlendMode: 'normal', templateOverlayOpacity: 100, installOrder: 3, enabled: true },
  { id: 'left-side', label: 'Left Side', widthMm: 4200, heightMm: 1650, bleedMm: 10, overlapMm: 15, orientation: 'normal', templateImageUrl: null, templateFitMode: 'cover', templateBlendMode: 'normal', templateOverlayOpacity: 100, installOrder: 4, enabled: true },
  { id: 'right-side', label: 'Right Side', widthMm: 4200, heightMm: 1650, bleedMm: 10, overlapMm: 15, orientation: 'mirrored', templateImageUrl: null, templateFitMode: 'cover', templateBlendMode: 'normal', templateOverlayOpacity: 100, installOrder: 5, enabled: true },
]

const defaultTransform = (): LayerTransform => ({
  position: { x: 0, y: 1.2, z: 1.95 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 0.35, y: 0.35, z: 0.4 },
  skew: { x: 0, y: 0 },
  opacity: 1,
})

// Text/decal layers should start from a side projection direction so the first
// placement lands on body side panels instead of front fascia.
const defaultSideProjectedTransform = (): LayerTransform => ({
  position: { x: -1.95, y: 1.2, z: 0 },
  rotation: { x: 0, y: Math.PI / 2, z: 0 },
  scale: { x: 0.35, y: 0.35, z: 0.4 },
  skew: { x: 0, y: 0 },
  opacity: 1,
})

const defaultTextSideProjectedTransform = (): LayerTransform => ({
  position: { x: -1.95, y: 0.86, z: 0 },
  rotation: { x: 0, y: Math.PI / 2, z: 0 },
  scale: { x: 0.35, y: 0.35, z: 0.4 },
  skew: { x: 0, y: 0 },
  opacity: 1,
})

function nameFromImageUrl(imageUrl: string | undefined, fallbackCount: number): string {
  if (!imageUrl) {
    return `Decal ${fallbackCount}`
  }

  const fileName = imageUrl.split('/').pop() ?? ''
  const base = decodeURIComponent(fileName).replace(/\.[^.]+$/, '')
  const pretty = base.replace(/[-_]+/g, ' ').trim()
  return pretty.length > 0 ? pretty : `Decal ${fallbackCount}`
}

function findMostRecentLayerByType<T extends DecalLayer | TextLayer>(
  layers: Layer[],
  type: T['type'],
): T | null {
  let latest: T | null = null
  for (const layer of layers) {
    if (layer.type !== type) {
      continue
    }
    const typedLayer = layer as T
    if (!latest || typedLayer.updatedAt > latest.updatedAt) {
      latest = typedLayer
    }
  }
  return latest
}

const createDecalLayer = (
  count: number,
  imageUrl?: string,
  defaults?: Partial<Pick<DecalLayer, 'colorHex' | 'colorRef' | 'finish' | 'targetPartId' | 'mirrorX' | 'mirrorToOtherSide'>>,
): DecalLayer => ({
  id: makeId('decal'),
  name: nameFromImageUrl(imageUrl, count),
  type: 'decal',
  mirrorX: defaults?.mirrorX ?? false,
  mirrorToOtherSide: defaults?.mirrorToOtherSide ?? false,
  mirrorColorHex: null,
  mirrorMirrorX: false,
  imageUrl: imageUrl ?? null,
  colorHex: defaults?.colorHex ?? '#ffffff',
  colorRef: defaults?.colorRef ?? null,
  finish: defaults?.finish ?? 'gloss',
  targetPartId: defaults?.targetPartId ?? null,
  blendMode: 'normal' as BlendMode,
  visible: true,
  locked: false,
  groupId: null,
  createdAt: now(),
  updatedAt: now(),
  transform: defaultSideProjectedTransform(),
})

const createTextLayer = (
  count: number,
  options?: { fontFamily?: string; fontUrl?: string | null; text?: string; scale?: number },
  defaults?: Partial<Pick<TextLayer, 'fontFamily' | 'fontUrl' | 'colorHex' | 'colorRef' | 'finish' | 'targetPartId' | 'mirrorX' | 'mirrorToOtherSide' | 'textCurve' | 'mirroredTextReadable'>>,
): TextLayer => {
  const s = options?.scale ?? 0.85
  return {
  id: makeId('text'),
  name: `Text ${count}`,
  type: 'text',
  mirrorX: defaults?.mirrorX ?? false,
  mirrorToOtherSide: false,
  mirrorColorHex: null,
  mirrorMirrorX: false,
  text: options?.text ?? 'Text',
  fontFamily: options?.fontFamily ?? defaults?.fontFamily ?? 'Arial',
  fontUrl: options?.fontUrl ?? defaults?.fontUrl ?? null,
  colorHex: defaults?.colorHex ?? '#ffffff',
  colorRef: defaults?.colorRef ?? null,
  finish: defaults?.finish ?? 'gloss',
  targetPartId: null,
  textCurve: defaults?.textCurve ?? 0,
  mirroredTextReadable: defaults?.mirroredTextReadable ?? true,
  visible: true,
  locked: false,
  groupId: null,
  createdAt: now(),
  updatedAt: now(),
  transform: {
    ...defaultTextSideProjectedTransform(),
    scale: { x: s, y: s, z: 0.4 },
  },
  }
}

const createGroupLayer = (name: string): GroupLayer => ({
  id: makeId('group'),
  name,
  type: 'group',
  visible: true,
  locked: false,
  collapsed: false,
  groupId: null,
  createdAt: now(),
  updatedAt: now(),
})

const createProject = (): EditorProject => ({
  meta: {
    id: makeId('project'),
    name: 'Untitled Car Project',
    version: 1,
    createdAt: now(),
    updatedAt: now(),
  },
  paint: {
    colorHex: '#cc2a2a',
    colorRef: null,
    finish: 'gloss',
    metallic: 0.2,
    roughness: 0.22,
    clearcoat: 0.95,
  },
  carGradient: {
    enabled: false,
    fromHex: '#cc2a2a',
    toHex: '#6b0f0f',
    axis: 'y',
    balance: 0,
  },
  windowTint: {
    enabled: false,
    amount: 35,
    colorHex: '#101820',
  },
  carSplit: {
    enabled: false,
    sideAHex: '#000000',
    sideBHex: '#ffffff',
    finish: 'gloss',
    offsetX: 0,
    softEdge: 0.02,
    angle: 0,
  },
  carStripe: {
    enabled: false,
    colorHex: '#f5f5f5',
    finish: 'gloss',
    width: 0.14,
    gap: 0.24,
    offsetX: 0,
    softEdge: 0.02,
    angle: 0,
  },
  stripeLayerSeed: null,
  vehicleCalibration: { ...DEFAULT_VEHICLE_CALIBRATION },
  wrapPanels: DEFAULT_WRAP_PANELS.map((panel) => ({ ...panel })),
  printProduction: { ...DEFAULT_PRINT_PRODUCTION },
  wrapJob: { ...DEFAULT_WRAP_JOB },
  layers: [],
  customDecals: [],
  meshClassifications: {},
})

function pushHistory(state: EditorStore, label?: string): HistorySnapshot[] {
  return [
    ...state.historyPast,
    {
      project: state.project,
      selectedLayerId: state.selectedLayerId,
      transformGizmoMode: state.transformGizmoMode,
      selectedObjectId: state.selectedObjectId,
      partPaintByObject: state.partPaintByObject,
      selectedPaintTarget: state.selectedPaintTarget,
      targetPaints: state.targetPaints,
      targetPrints: state.targetPrints,
      label,
    },
  ]
}

function patchLayer(existing: Layer, patch: Partial<Layer>): Layer {
  if (existing.type === 'group') {
    const typedPatch = patch as Partial<GroupLayer>
    return { ...existing, ...typedPatch, type: 'group', updatedAt: now() }
  }

  const existingWithTransform = existing as DecalLayer | TextLayer | StripeLayer | SplitLayer
  const transformPatch = (patch as Partial<DecalLayer | TextLayer | StripeLayer | SplitLayer>).transform
  const fallbackTransform = defaultTransform()
  const currentTransform = existingWithTransform.transform ?? fallbackTransform
  const nextTransform = transformPatch
    ? {
        ...currentTransform,
        ...transformPatch,
        position: {
          ...(currentTransform.position ?? fallbackTransform.position),
          ...transformPatch.position,
        },
        rotation: {
          ...(currentTransform.rotation ?? fallbackTransform.rotation),
          ...transformPatch.rotation,
        },
        scale: {
          ...(currentTransform.scale ?? fallbackTransform.scale),
          ...transformPatch.scale,
        },
        skew: {
          ...(currentTransform.skew ?? fallbackTransform.skew),
          ...transformPatch.skew,
        },
      }
    : currentTransform

  if (existing.type === 'stripe') {
    const typedPatch = patch as Partial<StripeLayer>
    return {
      ...existing,
      ...typedPatch,
      type: 'stripe',
      transform: nextTransform,
      updatedAt: now(),
    }
  }

  if (existing.type === 'split') {
    const typedPatch = patch as Partial<SplitLayer>
    return {
      ...existing,
      ...typedPatch,
      type: 'split',
      transform: nextTransform,
      updatedAt: now(),
    }
  }

  if (existing.type === 'decal') {
    const typedPatch = patch as Partial<DecalLayer>
    return {
      ...existing,
      ...typedPatch,
      type: 'decal',
      transform: nextTransform,
      updatedAt: now(),
    }
  }

  const typedPatch = patch as Partial<TextLayer>
  return {
    ...existing,
    ...typedPatch,
    type: 'text',
    transform: nextTransform,
    updatedAt: now(),
  }
}

const createStripeLayer = (count: number): StripeLayer => ({
  id: makeId('stripe'),
  name: `Stripe ${count}`,
  type: 'stripe',
  mirrorX: false,
  mirrorToOtherSide: false,
  mirrorColorHex: null,
  mirrorMirrorX: false,
  colorHex: '#ffffff',
  colorRef: null,
  finish: 'gloss',
  stripeWidth: 0.18,
  stripeGap: 0,
  stripeOffsetX: 0,
  softEdge: 0.02,
  visible: true,
  locked: false,
  groupId: null,
  createdAt: now(),
  updatedAt: now(),
  transform: defaultTransform(),
})

function makeStripeSeedFromLayer(layer: StripeLayer): StripeLayerSeed {
  return {
    stripeWidth: layer.stripeWidth,
    stripeGap: layer.stripeGap,
    stripeOffsetX: layer.stripeOffsetX,
    softEdge: layer.softEdge,
    opacity: Number.isFinite(layer.transform.opacity) ? layer.transform.opacity : 1,
    angle: Number.isFinite(layer.transform.rotation.z) ? layer.transform.rotation.z : 0,
  }
}

function applyStripeSeed(layer: StripeLayer, seed: StripeLayerSeed): StripeLayer {
  return {
    ...layer,
    stripeWidth: seed.stripeWidth,
    stripeGap: seed.stripeGap,
    stripeOffsetX: seed.stripeOffsetX,
    softEdge: seed.softEdge,
    transform: {
      ...layer.transform,
      opacity: seed.opacity,
      rotation: {
        ...layer.transform.rotation,
        z: seed.angle,
      },
    },
  }
}

function sanitizeStripeOverridesForSeed(overrides: Partial<StripeLayer>): Partial<StripeLayer> {
  const {
    stripeWidth: _width,
    stripeGap: _gap,
    stripeOffsetX: _offset,
    softEdge: _soft,
    transform: _transform,
    ...rest
  } = overrides
  return rest
}

function deriveStripeSeedFromProjectLayers(layers: Layer[]): StripeLayerSeed | null {
  const stripeLayers = layers.filter((layer): layer is StripeLayer => layer.type === 'stripe')
  if (stripeLayers.length === 0) return null
  const oldestStripe = stripeLayers.reduce((oldest, current) =>
    current.createdAt < oldest.createdAt ? current : oldest,
  stripeLayers[0])
  return makeStripeSeedFromLayer(oldestStripe)
}

const createSplitLayer = (count: number): SplitLayer => ({
  id: makeId('split'),
  name: `Split ${count}`,
  type: 'split',
  mirrorX: false,
  mirrorToOtherSide: false,
  mirrorColorHex: null,
  mirrorMirrorX: false,
  colorHex: '#d13b52',
  colorRef: null,
  sideBColorHex: '#3f63d6',
  finish: 'gloss',
  splitOffsetX: 0,
  softEdge: 0.02,
  visible: true,
  locked: false,
  groupId: null,
  createdAt: now(),
  updatedAt: now(),
  transform: defaultTransform(),
})

export const useEditorStore = create<EditorStore>((set) => ({
  project: createProject(),
  selectedLayerId: null,
  selectedCar: null,
  cameraView: 'side',
  availableParts: [],
  transformGizmoMode: 'translate',
  selectedObjectId: null,
  partPaintByObject: {},
  selectedPaintTarget: 'fullCar',
  targetPaints: {},
  targetPrints: {},
  activeTool: 'orbit',
  activeCarTool: null,
  autoRotate: false,
  orbitLockToScenePanel: false,
  classifyLocked: false,
  historyPast: [],
  historyFuture: [],

  selectCar: (car) =>
    set(() => {
      const fileName = car.modelUrl.split('/').pop() ?? ''
      const locked = getLockedClassifications(fileName)
      const personal = loadPersonalClassifications(fileName)
      const merged = getMergedClassifications(fileName, personal)
      const freshProject = createProject()
      return {
        selectedCar: car,
        selectedLayerId: null,
        cameraView: 'side',
        availableParts: [],
        selectedObjectId: null,
        partPaintByObject: {},
        selectedPaintTarget: 'fullCar',
        targetPaints: {},
        targetPrints: {},
        activeTool: 'orbit',
        activeCarTool: null,
        historyPast: [],
        historyFuture: [],
        classifyLocked: locked !== null,
        project: {
          ...freshProject,
          meshClassifications: merged,
        },
      }
    }),

  clearSelectedCar: () =>
    set(() => ({
      selectedCar: null,
      selectedLayerId: null,
      cameraView: 'side',
      availableParts: [],
      selectedObjectId: null,
      partPaintByObject: {},
      selectedPaintTarget: null,
      targetPaints: {},
      targetPrints: {},
      activeTool: 'orbit',
      activeCarTool: null,
      classifyLocked: false,
      historyPast: [],
      historyFuture: [],
      project: createProject(),
    })),

  setSelectedPaintTarget: (target) =>
    set((state) => ({
      selectedPaintTarget: target,
      project: {
        ...state.project,
        paint: target ? { ...(state.targetPaints[target] ?? DEFAULT_TARGET_PAINT) } : { ...DEFAULT_TARGET_PAINT },
      },
    })),

  setCameraView: (view) => set({ cameraView: view }),

  setAvailableParts: (parts) =>
    set((state) => {
      const hasSelected = parts.some((part) => part.id === state.selectedObjectId)
      return {
        availableParts: parts,
        selectedObjectId: hasSelected ? state.selectedObjectId : null,
      }
    }),

  setSelectedObjectId: (objectId) =>
    set((state) => {
      const override = objectId ? state.partPaintByObject[objectId] : null
      return {
        selectedObjectId: objectId,
        project: override
          ? {
              ...state.project,
              paint: { ...override },
            }
          : state.project,
      }
    }),

  setTransformGizmoMode: (mode) => set({ transformGizmoMode: mode }),

  setTool: (tool) => set({ activeTool: tool }),

  setOrbitLockToScenePanel: (value) => set({ orbitLockToScenePanel: value }),
  setAutoRotate: (v) => set({ autoRotate: v }),

  setSelectedLayer: (layerId) => set({ selectedLayerId: layerId }),

  setPaint: (patch) =>
    set((state) => {
      const nextPaintBase = {
        ...state.project.paint,
        ...patch,
      }

      const nextPaint = patch.finish
        ? {
            ...nextPaintBase,
            ...resolvePaintFinishPreset(patch.finish),
          }
        : nextPaintBase

      return {
        historyPast: pushHistory(state, 'Paint Car'),
        historyFuture: [],
        project: {
          ...state.project,
          meta: { ...state.project.meta, updatedAt: now() },
          paint: nextPaint,
        },
        targetPaints: state.selectedPaintTarget
          ? {
              ...state.targetPaints,
              [state.selectedPaintTarget]: nextPaint,
            }
          : state.targetPaints,
        partPaintByObject: state.selectedObjectId
          ? {
              ...state.partPaintByObject,
              [state.selectedObjectId]: nextPaint,
            }
          : state.partPaintByObject,
      }
    }),

  setCarGradient: (patch) =>
    set((state) => ({
      historyPast: pushHistory(state, 'Car Gradient'),
      historyFuture: [],
      project: {
        ...state.project,
        meta: { ...state.project.meta, updatedAt: now() },
        carGradient: {
          ...state.project.carGradient,
          ...patch,
        },
      },
    })),

  setWindowTint: (patch) =>
    set((state) => {
      const nextTint = {
        ...state.project.windowTint,
        ...patch,
      }

      return {
        historyPast: pushHistory(state, 'Window Tint'),
        historyFuture: [],
        project: {
          ...state.project,
          meta: { ...state.project.meta, updatedAt: now() },
          windowTint: nextTint,
        },
      }
    }),

  setCarSplit: (patch) =>
    set((state) => ({
      historyPast: pushHistory(state, 'Car Split'),
      historyFuture: [],
      project: {
        ...state.project,
        meta: { ...state.project.meta, updatedAt: now() },
        carSplit: {
          ...state.project.carSplit,
          ...patch,
        },
      },
    })),

  setActiveCarTool: (tool) => set({ activeCarTool: tool }),

  setCarStripe: (patch) =>
    set((state) => ({
      historyPast: pushHistory(state, 'Car Stripes'),
      historyFuture: [],
      project: {
        ...state.project,
        meta: { ...state.project.meta, updatedAt: now() },
        carStripe: {
          ...state.project.carStripe,
          ...patch,
        },
      },
    })),

  setVehicleCalibration: (patch) =>
    set((state) => ({
      historyPast: pushHistory(state, 'Vehicle Calibration'),
      historyFuture: [],
      project: {
        ...state.project,
        meta: { ...state.project.meta, updatedAt: now() },
        vehicleCalibration: {
          ...state.project.vehicleCalibration,
          ...patch,
        },
      },
    })),

  setPrintProduction: (patch) =>
    set((state) => ({
      historyPast: pushHistory(state, 'Print Production'),
      historyFuture: [],
      project: {
        ...state.project,
        meta: { ...state.project.meta, updatedAt: now() },
        printProduction: {
          ...state.project.printProduction,
          ...patch,
        },
      },
    })),

  setWrapJob: (patch) =>
    set((state) => ({
      historyPast: pushHistory(state, 'Wrap Job'),
      historyFuture: [],
      project: {
        ...state.project,
        meta: { ...state.project.meta, updatedAt: now() },
        wrapJob: {
          ...state.project.wrapJob,
          ...patch,
        },
      },
    })),

  upsertWrapPanel: (panel) =>
    set((state) => {
      const hasExisting = state.project.wrapPanels.some((p) => p.id === panel.id)
      const nextPanels = hasExisting
        ? state.project.wrapPanels.map((p) => (p.id === panel.id ? { ...panel } : p))
        : [...state.project.wrapPanels, { ...panel }]

      return {
        historyPast: pushHistory(state, hasExisting ? 'Update Wrap Panel' : 'Add Wrap Panel'),
        historyFuture: [],
        project: {
          ...state.project,
          meta: { ...state.project.meta, updatedAt: now() },
          wrapPanels: nextPanels,
        },
      }
    }),

  removeWrapPanel: (panelId) =>
    set((state) => ({
      historyPast: pushHistory(state, 'Remove Wrap Panel'),
      historyFuture: [],
      project: {
        ...state.project,
        meta: { ...state.project.meta, updatedAt: now() },
        wrapPanels: state.project.wrapPanels.filter((panel) => panel.id !== panelId),
      },
    })),

  addDecalLayer: (imageUrl) =>
    set((state) => {
      const layerCount = state.project.layers.filter((l) => l.type === 'decal').length + 1
      const selectedLayer = state.project.layers.find((l) => l.id === state.selectedLayerId)
      const sourceLayer = selectedLayer?.type === 'decal'
        ? selectedLayer
        : findMostRecentLayerByType<DecalLayer>(state.project.layers, 'decal')
      const next = createDecalLayer(layerCount, imageUrl, sourceLayer ?? undefined)
      return {
        historyPast: pushHistory(state, 'Add Decal'),
        historyFuture: [],
        selectedLayerId: next.id,
        project: {
          ...state.project,
          meta: { ...state.project.meta, updatedAt: now() },
          layers: [...state.project.layers, next],
        },
      }
    }),

  addCustomDecalPreset: (name, imageUrl, svgMarkup) =>
    set((state) => {
      const nextPreset = {
        id: makeId('customdecal'),
        name,
        imageUrl,
        svgMarkup,
        createdAt: now(),
        updatedAt: now(),
      }

      return {
        historyPast: pushHistory(state, 'Save SVG Preset'),
        historyFuture: [],
        project: {
          ...state.project,
          meta: { ...state.project.meta, updatedAt: now() },
          customDecals: [nextPreset, ...state.project.customDecals],
        },
      }
    }),

  renameCustomDecalPreset: (id, name) =>
    set((state) => ({
      project: {
        ...state.project,
        meta: { ...state.project.meta, updatedAt: now() },
        customDecals: state.project.customDecals.map((d) =>
          d.id === id ? { ...d, name, updatedAt: now() } : d
        ),
      },
    })),

  deleteCustomDecalPreset: (id) =>
    set((state) => ({
      project: {
        ...state.project,
        meta: { ...state.project.meta, updatedAt: now() },
        customDecals: state.project.customDecals.filter((d) => d.id !== id),
      },
    })),

  addTextLayer: (options) =>
    set((state) => {
      const layerCount = state.project.layers.filter((l) => l.type === 'text').length + 1
      const selectedLayer = state.project.layers.find((l) => l.id === state.selectedLayerId)
      const sourceLayer = selectedLayer?.type === 'text'
        ? selectedLayer
        : findMostRecentLayerByType<TextLayer>(state.project.layers, 'text')
      const next = createTextLayer(layerCount, options, sourceLayer ?? undefined)
      return {
        historyPast: pushHistory(state, 'Add Text'),
        historyFuture: [],
        selectedLayerId: next.id,
        project: {
          ...state.project,
          meta: { ...state.project.meta, updatedAt: now() },
          layers: [...state.project.layers, next],
        },
      }
    }),

  addStripeLayer: () =>
    set((state) => {
      const layerCount = state.project.layers.filter((l) => l.type === 'stripe').length + 1
      const hasExistingStripeLayers = state.project.layers.some((layer) => layer.type === 'stripe')
      const existingSeed = hasExistingStripeLayers ? state.project.stripeLayerSeed : null
      const next = applyStripeSeed(createStripeLayer(layerCount), existingSeed ?? DEFAULT_STRIPE_LAYER_SEED)
      return {
        historyPast: pushHistory(state, 'Add Stripe'),
        historyFuture: [],
        selectedLayerId: next.id,
        project: {
          ...state.project,
          meta: { ...state.project.meta, updatedAt: now() },
          stripeLayerSeed: existingSeed ?? makeStripeSeedFromLayer(next),
          layers: [...state.project.layers, next],
        },
      }
    }),

  addSplitLayer: () =>
    set((state) => {
      const layerCount = state.project.layers.filter((l) => l.type === 'split').length + 1
      const next = createSplitLayer(layerCount)
      return {
        historyPast: pushHistory(state, 'Add Split'),
        historyFuture: [],
        selectedLayerId: next.id,
        project: {
          ...state.project,
          meta: { ...state.project.meta, updatedAt: now() },
          layers: [...state.project.layers, next],
        },
      }
    }),

  addStripeLayerPreset: (overrides) =>
    set((state) => {
      if (overrides.length === 0) return state
      const base = state.project.layers.filter((l) => l.type === 'stripe').length
      const hasExistingStripeLayers = state.project.layers.some((layer) => layer.type === 'stripe')
      const existingSeed = hasExistingStripeLayers ? state.project.stripeLayerSeed : null
      const newLayers = overrides.map((ov, i) => {
        const created = createStripeLayer(base + i + 1)
        const seededLayer = applyStripeSeed(created, existingSeed ?? DEFAULT_STRIPE_LAYER_SEED)
        const effectiveOverrides = existingSeed ? sanitizeStripeOverridesForSeed(ov) : ov
        const patched = patchLayer(seededLayer, effectiveOverrides as Partial<Layer>) as StripeLayer
        return {
          ...patched,
          id: makeId('stripe'),
          createdAt: now(),
          updatedAt: now(),
        }
      })

      const seedFromFirstLayer = existingSeed ?? makeStripeSeedFromLayer(newLayers[0])
      return {
        historyPast: pushHistory(state, 'Add Stripe Preset'),
        historyFuture: [],
        selectedLayerId: newLayers[newLayers.length - 1].id,
        project: {
          ...state.project,
          meta: { ...state.project.meta, updatedAt: now() },
          stripeLayerSeed: seedFromFirstLayer,
          layers: [...state.project.layers, ...newLayers],
        },
      }
    }),

  duplicateLayer: (layerId) =>
    set((state) => {
      const original = state.project.layers.find((l) => l.id === layerId)
      if (!original || original.type === 'group') return state
      const copy: Layer = {
        ...original,
        id: makeId(original.type),
        name: `${original.name} copy`,
        createdAt: now(),
        updatedAt: now(),
      }
      const origIndex = state.project.layers.indexOf(original)
      const layers = [...state.project.layers]
      layers.splice(origIndex + 1, 0, copy)
      return {
        historyPast: pushHistory(state, 'Duplicate'),
        historyFuture: [],
        selectedLayerId: copy.id,
        project: {
          ...state.project,
          meta: { ...state.project.meta, updatedAt: now() },
          layers,
        },
      }
    }),

  groupLayers: (layerIds, groupName = 'Group') =>
    set((state) => {
      if (layerIds.length === 0) return state
      const group = createGroupLayer(groupName)
      // Insert group before the first selected layer; move selected layers after it
      const firstIndex = Math.min(
        ...layerIds.map((id) => state.project.layers.findIndex((l) => l.id === id)).filter((i) => i >= 0),
      )
      const selected = state.project.layers.filter((l) => layerIds.includes(l.id))
      const rest = state.project.layers.filter((l) => !layerIds.includes(l.id))
      const withGroup: Layer[] = [
        ...rest.slice(0, firstIndex),
        group,
        ...selected.map((l) => ({ ...l, groupId: group.id })),
        ...rest.slice(firstIndex),
      ]
      return {
        historyPast: pushHistory(state, 'Group Layers'),
        historyFuture: [],
        selectedLayerId: group.id,
        project: {
          ...state.project,
          meta: { ...state.project.meta, updatedAt: now() },
          layers: withGroup,
        },
      }
    }),

  ungroupLayer: (groupId) =>
    set((state) => {
      const group = state.project.layers.find((layer) => layer.id === groupId)
      if (!group || group.type !== 'group') {
        return state
      }

      const groupChildren = state.project.layers.filter((layer) => layer.groupId === groupId)

      return {
        historyPast: pushHistory(state, 'Ungroup Layers'),
        historyFuture: [],
        selectedLayerId:
          state.selectedLayerId === groupId
            ? (groupChildren[0]?.id ?? null)
            : state.selectedLayerId,
        project: {
          ...state.project,
          meta: { ...state.project.meta, updatedAt: now() },
          layers: state.project.layers
            .filter((layer) => layer.id !== groupId)
            .map((layer) => (layer.groupId === groupId ? { ...layer, groupId: null, updatedAt: now() } : layer)),
        },
      }
    }),

  toggleGroupCollapsed: (groupId) =>
    set((state) => {
      const group = state.project.layers.find((l) => l.id === groupId)
      if (!group || group.type !== 'group') return state
      return {
        project: {
          ...state.project,
          layers: state.project.layers.map((l) =>
            l.id === groupId ? { ...l, collapsed: !(l as typeof group).collapsed, updatedAt: now() } : l,
          ),
        },
      }
    }),

  updateLayerTransient: (layerId, patch) =>
    set((state) => {
      let nextStripeLayer: StripeLayer | null = null
      let didUpdateLayer = false
      const nextLayers = state.project.layers.map((layer) => {
        if (layer.id !== layerId) {
          return layer
        }
        didUpdateLayer = true
        const updated = patchLayer(layer, patch)
        if (updated.type === 'stripe') {
          nextStripeLayer = updated
        }
        return updated
      })

      if (!didUpdateLayer) {
        return state
      }

      return {
        project: {
          ...state.project,
          meta: { ...state.project.meta, updatedAt: now() },
          carStripe: nextStripeLayer ? carStripeFromLayer(nextStripeLayer) : state.project.carStripe,
          layers: nextLayers,
        },
      }
    }),

  updateLayer: (layerId, patch) =>
    set((state) => {
      let nextStripeLayer: StripeLayer | null = null
      let didUpdateLayer = false
      const nextLayers = state.project.layers.map((layer) => {
        if (layer.id !== layerId) {
          return layer
        }
        didUpdateLayer = true
        const updated = patchLayer(layer, patch)
        if (updated.type === 'stripe') {
          nextStripeLayer = updated
        }
        return updated
      })

      if (!didUpdateLayer) {
        return state
      }

      return {
        historyPast: pushHistory(state, 'Edit Layer'),
        historyFuture: [],
        project: {
          ...state.project,
          meta: { ...state.project.meta, updatedAt: now() },
          carStripe: nextStripeLayer ? carStripeFromLayer(nextStripeLayer) : state.project.carStripe,
          layers: nextLayers,
        },
      }
    }),

  reorderLayer: (fromIndex, toIndex) =>
    set((state) => {
      const layers = [...state.project.layers]
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= layers.length ||
        toIndex >= layers.length ||
        fromIndex === toIndex
      ) {
        return state
      }

      const [moved] = layers.splice(fromIndex, 1)
      layers.splice(toIndex, 0, moved)

      return {
        historyPast: pushHistory(state, 'Reorder'),
        historyFuture: [],
        project: {
          ...state.project,
          meta: { ...state.project.meta, updatedAt: now() },
          layers,
        },
      }
    }),

  toggleLayerVisibility: (layerId) => {
    set((state) => {
      const existing = state.project.layers.find((layer) => layer.id === layerId)
      if (!existing) {
        return state
      }

      const nextVisible = !existing.visible
      const childIds = existing.type === 'group'
        ? new Set(state.project.layers.filter((layer) => layer.groupId === layerId).map((layer) => layer.id))
        : null

      return {
        historyPast: pushHistory(state, 'Layer Visibility'),
        historyFuture: [],
        project: {
          ...state.project,
          meta: { ...state.project.meta, updatedAt: now() },
          layers: state.project.layers.map((layer) => {
            if (layer.id === layerId) {
              return { ...layer, visible: nextVisible, updatedAt: now() }
            }
            if (childIds?.has(layer.id)) {
              return { ...layer, visible: nextVisible, updatedAt: now() }
            }
            return layer
          }),
        },
      }
    })
  },

  toggleLayerLock: (layerId) => {
    set((state) => {
      const existing = state.project.layers.find((layer) => layer.id === layerId)
      if (!existing) {
        return state
      }

      const nextLocked = !existing.locked
      const childIds = existing.type === 'group'
        ? new Set(state.project.layers.filter((layer) => layer.groupId === layerId).map((layer) => layer.id))
        : null

      return {
        historyPast: pushHistory(state, 'Layer Lock'),
        historyFuture: [],
        project: {
          ...state.project,
          meta: { ...state.project.meta, updatedAt: now() },
          layers: state.project.layers.map((layer) => {
            if (layer.id === layerId) {
              return { ...layer, locked: nextLocked, updatedAt: now() }
            }
            if (childIds?.has(layer.id)) {
              return { ...layer, locked: nextLocked, updatedAt: now() }
            }
            return layer
          }),
        },
      }
    })
  },

  removeLayer: (layerId) =>
    set((state) => {
      const removedLayer = state.project.layers.find((layer) => layer.id === layerId)
      const nextLayers = state.project.layers.filter((layer) => layer.id !== layerId)
      const nextStripeSeed = removedLayer?.type === 'stripe'
        ? deriveStripeSeedFromProjectLayers(nextLayers)
        : state.project.stripeLayerSeed

      return {
        historyPast: pushHistory(state, 'Delete Layer'),
        historyFuture: [],
        selectedLayerId:
          state.selectedLayerId === layerId ? null : state.selectedLayerId,
        project: {
          ...state.project,
          meta: { ...state.project.meta, updatedAt: now() },
          stripeLayerSeed: nextStripeSeed,
          layers: nextLayers,
        },
      }
    }),

  undo: () =>
    set((state) => {
      if (state.historyPast.length === 0) {
        return state
      }

      const previous = state.historyPast[state.historyPast.length - 1]
      const nextPast = state.historyPast.slice(0, -1)

      return {
        ...state,
        project: previous.project,
        selectedLayerId: previous.selectedLayerId,
        transformGizmoMode: previous.transformGizmoMode,
        selectedObjectId: previous.selectedObjectId,
        partPaintByObject: previous.partPaintByObject,
        selectedPaintTarget: previous.selectedPaintTarget,
        targetPaints: previous.targetPaints,
        targetPrints: previous.targetPrints,
        historyPast: nextPast,
        historyFuture: [
          {
            project: state.project,
            selectedLayerId: state.selectedLayerId,
            transformGizmoMode: state.transformGizmoMode,
            selectedObjectId: state.selectedObjectId,
            partPaintByObject: state.partPaintByObject,
            selectedPaintTarget: state.selectedPaintTarget,
            targetPaints: state.targetPaints,
            targetPrints: state.targetPrints,
          },
          ...state.historyFuture,
        ],
      }
    }),

  redo: () =>
    set((state) => {
      if (state.historyFuture.length === 0) {
        return state
      }

      const [next, ...restFuture] = state.historyFuture
      return {
        ...state,
        project: next.project,
        selectedLayerId: next.selectedLayerId,
        transformGizmoMode: next.transformGizmoMode,
        selectedObjectId: next.selectedObjectId,
        partPaintByObject: next.partPaintByObject,
        selectedPaintTarget: next.selectedPaintTarget,
        targetPaints: next.targetPaints,
        targetPrints: next.targetPrints,
        historyPast: [
          ...state.historyPast,
          {
            project: state.project,
            selectedLayerId: state.selectedLayerId,
            transformGizmoMode: state.transformGizmoMode,
            selectedObjectId: state.selectedObjectId,
            partPaintByObject: state.partPaintByObject,
            selectedPaintTarget: state.selectedPaintTarget,
            targetPaints: state.targetPaints,
            targetPrints: state.targetPrints,
          },
        ],
        historyFuture: restFuture,
      }
    }),

  undoToIndex: (index) =>
    set((state) => {
      if (index < 0 || index >= state.historyPast.length) return state
      const target = state.historyPast[index]
      const newPast = state.historyPast.slice(0, index)
      const skipped = state.historyPast.slice(index + 1).reverse()
      const currentSnapshot: import('../types/editor').HistorySnapshot = {
        project: state.project,
        selectedLayerId: state.selectedLayerId,
        transformGizmoMode: state.transformGizmoMode,
        selectedObjectId: state.selectedObjectId,
        partPaintByObject: state.partPaintByObject,
        selectedPaintTarget: state.selectedPaintTarget,
        targetPaints: state.targetPaints,
        targetPrints: state.targetPrints,
      }
      return {
        ...state,
        project: target.project,
        selectedLayerId: target.selectedLayerId,
        transformGizmoMode: target.transformGizmoMode,
        selectedObjectId: target.selectedObjectId,
        partPaintByObject: target.partPaintByObject,
        selectedPaintTarget: target.selectedPaintTarget,
        targetPaints: target.targetPaints,
        targetPrints: target.targetPrints,
        historyPast: newPast,
        historyFuture: [...skipped, currentSnapshot, ...state.historyFuture],
      }
    }),

  loadProject: (project) =>
    set((state) => ({
      historyPast: pushHistory(state, 'Load Project'),
      historyFuture: [],
      selectedLayerId: null,
      project: {
        ...project,
        carGradient: {
          enabled: project.carGradient?.enabled ?? false,
          fromHex: project.carGradient?.fromHex ?? '#cc2a2a',
          toHex: project.carGradient?.toHex ?? '#6b0f0f',
          axis: project.carGradient?.axis ?? 'y',
          balance: project.carGradient?.balance ?? 0,
        },
        windowTint: project.windowTint ?? {
          enabled: false,
          amount: 35,
          colorHex: '#101820',
        },
        carSplit: {
          enabled: project.carSplit?.enabled ?? false,
          sideAHex: project.carSplit?.sideAHex ?? '#000000',
          sideBHex: project.carSplit?.sideBHex ?? '#ffffff',
          finish: project.carSplit?.finish ?? 'gloss',
          offsetX: project.carSplit?.offsetX ?? 0,
          softEdge: project.carSplit?.softEdge ?? 0.02,
          angle: project.carSplit?.angle ?? 0,
        },
        carStripe: {
          enabled: project.carStripe?.enabled ?? false,
          colorHex: project.carStripe?.colorHex ?? '#f5f5f5',
          finish: project.carStripe?.finish ?? 'gloss',
          width: project.carStripe?.width ?? 0.14,
          gap: project.carStripe?.gap ?? 0.24,
          offsetX: project.carStripe?.offsetX ?? 0,
          softEdge: project.carStripe?.softEdge ?? 0.02,
          angle: project.carStripe?.angle ?? 0,
        },
        stripeLayerSeed: project.layers.some((layer) => layer.type === 'stripe')
          ? (project.stripeLayerSeed ?? deriveStripeSeedFromProjectLayers(project.layers) ?? null)
          : null,
        vehicleCalibration: {
          ...DEFAULT_VEHICLE_CALIBRATION,
          ...(project.vehicleCalibration ?? {}),
        },
        wrapPanels: Array.isArray(project.wrapPanels) && project.wrapPanels.length > 0
          ? project.wrapPanels.map((panel) => ({
              ...panel,
              templateImageUrl: panel.templateImageUrl ?? null,
              templateFitMode: panel.templateFitMode === 'contain' || panel.templateFitMode === 'stretch' ? panel.templateFitMode : 'cover',
              templateBlendMode: panel.templateBlendMode === 'multiply' ? 'multiply' : 'normal',
              templateOverlayOpacity: Math.max(0, Math.min(100, panel.templateOverlayOpacity ?? 100)),
            }))
          : DEFAULT_WRAP_PANELS.map((panel) => ({ ...panel })),
        printProduction: {
          ...DEFAULT_PRINT_PRODUCTION,
          ...(project.printProduction ?? {}),
        },
        wrapJob: {
          ...DEFAULT_WRAP_JOB,
          ...(project.wrapJob ?? {}),
        },
        customDecals: Array.isArray((project as EditorProject).customDecals) ? (project as EditorProject).customDecals : [],
        meshClassifications:
          state.selectedCar
            ? (() => {
                const fileName = state.selectedCar.modelUrl.split('/').pop() ?? ''
                const personal = loadPersonalClassifications(fileName)
                return getMergedClassifications(fileName, personal)
              })()
            : (project.meshClassifications ?? {}),
      },
    })),

  setMeshClassification: (label: string, cls: MeshClass | null) =>
    set((state) => {
      const fileName = state.selectedCar?.modelUrl.split('/').pop() ?? ''
      // System-locked meshes (admin presets) cannot be changed by the user.
      if (isSystemLockedMesh(fileName, label)) {
        return state
      }
      const next = { ...state.project.meshClassifications }
      if (cls === null) {
        delete next[label]
      } else {
        next[label] = cls
      }
      // Auto-save user's personal classify to their own localStorage key.
      const personal = loadPersonalClassifications(fileName)
      const nextPersonal = { ...personal }
      if (cls === null) {
        delete nextPersonal[label]
      } else {
        nextPersonal[label] = cls
      }
      savePersonalClassifications(fileName, nextPersonal)
      return {
        project: {
          ...state.project,
          meshClassifications: next,
        },
      }
    }),

  clearMeshClassifications: () =>
    set((state) => {
      const fileName = state.selectedCar?.modelUrl.split('/').pop() ?? ''
      // Clear only the user's personal layer; system presets remain.
      clearPersonalClassifications(fileName)
      const merged = getMergedClassifications(fileName, {})
      return {
        project: {
          ...state.project,
          meshClassifications: merged,
        },
      }
    }),

  lockClassify: (fileName, classifications) => {
    saveLockedClassifications(fileName, classifications)
    savePersonalClassifications(fileName, classifications)
    // Fire-and-forget source persistence for dev workflow. If unavailable
    // (e.g. production build), localStorage lock still works as before.
    void saveGeneratedClassifyPreset(fileName, classifications)
    set((state) => ({
      classifyLocked: true,
      project: {
        ...state.project,
        meshClassifications: { ...classifications },
      },
    }))
  },

  unlockClassify: (fileName) => {
    clearLockedClassifications(fileName)
    set({ classifyLocked: false })
  },

  setTargetPrint: (target: PaintTargetId, print: PrintConfig | null) =>
    set((state) => ({
      historyPast: pushHistory(state, 'Print Layer'),
      historyFuture: [],
      targetPrints: {
        ...state.targetPrints,
        [target]: print,
      },
    })),

  clearTargetPrint: (target: PaintTargetId) =>
    set((state) => {
      const next = { ...state.targetPrints }
      delete next[target]
      return {
        historyPast: pushHistory(state, 'Delete Print Layer'),
        historyFuture: [],
        targetPrints: next,
      }
    }),
}))

