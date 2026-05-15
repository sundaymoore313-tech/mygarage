import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import { Html } from '@react-three/drei/web/Html'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import * as THREE from 'three'
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { NativeOrbitControls, type NativeOrbitControlsHandle } from './NativeOrbitControls'
import { GarageRoom } from './GarageRoom'
import { useModelScene } from './useModelScene'
import { endPerfSpan, markPerfOnce } from '../../lib/perfDebug'
import { DEFAULT_TARGET_PAINT, getLockedClassifications, getPaintTargetsForLabel, getResolvedPaintForLabel, PAINT_FINISH_PRESETS, isSystemLockedMesh } from '../../lib/paintTargets'
import { useEditorStore } from '../../store/editorStore'
import type { CameraViewId, CarObjectPart, DecalLayer, MeshClass, PaintConfig, PaintFinish, PrintConfig, StripeLayer, TextLayer } from '../../types/editor'
import type { ExportQuality } from '../../types/exportQuality'

const CAMERA_PRESETS: Record<CameraViewId, { position: [number, number, number]; target: [number, number, number] }> = {
  side: { position: [-8.2, 0.48, 0.25], target: [0, 0.75, 0] },
  front: { position: [0.15, 1.0, 5.1], target: [0, 0.9, 0] },
  back: { position: [0.15, 1.0, -5.1], target: [0, 0.9, 0] },
}

const CAMERA_VIEW_OVERRIDES_BY_FILE: Record<string, Partial<Record<CameraViewId, CameraViewId>>> = {
}

const CAMERA_START_POSITION: [number, number, number] = CAMERA_PRESETS.side.position
const CAMERA_START_TARGET: [number, number, number] = CAMERA_PRESETS.side.target
const DECAL_UPRIGHT_ROLL = Math.PI

const PROJECTABLE_EXCLUDE_TOKENS = [
  'wheel',
  'rim',
  'rims',
  'tire',
  'tyre',
  'callipe',
  'brake',
  'hub',
  'caliper',
  'rotor',
  'disc',
  'disk',
  'interior',
  'inside',
  'inner',
  'cabin',
  'seat',
  'dashboard',
  'dash',
  'console',
  'steering',
  'pedal',
  'headliner',
  'headrest',
  'trim_in',
  'doorpanel',
  'door_panel',
  'doortrim',
  'door_trim',
  'liner',
  'cockpit',
  'int_',
  '_int',
]

// Sub-string tokens that always exclude a mesh from projection (decals/text/stripes)
const PROJECTABLE_SUBSTR_EXCLUDES = [
  '_sub0_frame_0',   // fender sub-frame pieces
  '_sub1_skin_',     // underbody skin strips (wrap under rocker/chassis)
  'light_rear_glass_galss', // rear light glass variants
  'underbody',       // generic underbody mesh names
  'floor_pan',       // floor pan / chassis floor meshes
  'chassis',         // chassis rails and underside supports
  'fenders_sub0',    // explicit fender sub-mesh
  'ext_plastic',     // bumper external plastic trim (e.g. bumper_f002_ext_plastic_0_1)
  'grille001_frame', // grille frame
  '_light_',         // headlight / taillight glass covers
]

// Exact mesh labels that must stay projectable for decal/text placement.
const PROJECTABLE_FORCE_INCLUDE_LABELS = [
  'fenders_sub1_skin_00_0',
]

// Exact mesh labels that must never receive projected layers.
const PROJECTABLE_FORCE_EXCLUDE_LABELS = [
  'light_rear_glass_galss_0',
]

const WINDOW_TINT_INCLUDE_TOKENS = ['window', 'windshield', 'glass']
const WINDOW_TINT_EXCLUDE_TOKENS = [
  'light',
  'headlight',
  'taillight',
  'rear_light',
  'rear light',
  'lamp',
  'indicator',
  'signal',
  'mirror',
  'misc_d_glass',
  'light_rear_glass_galss',
]

const GRADIENT_EXCLUDE_TOKENS = [
  'plastic',
  'ext_plastic',
  'trim',
]

function isGradientBodyMeshLabel(label: string): boolean {
  const value = label.trim().toLowerCase()
  if (GRADIENT_EXCLUDE_TOKENS.some((token) => value.includes(token))) {
    return false
  }
  // Named body panels match the allow-list; generic/unknown names default to true
  // so imported cars with non-descriptive mesh names still get gradient paint.
  return true
}

function isTintableWindowMesh(label: string, cls: MeshClass | undefined): boolean {
  if (cls === 'window') {
    return true
  }
  if (cls === 'excluded') {
    return false
  }

  const value = label.trim().toLowerCase()
  const hasWindowToken = WINDOW_TINT_INCLUDE_TOKENS.some((token) => value.includes(token))
  if (!hasWindowToken) {
    return false
  }

  return !WINDOW_TINT_EXCLUDE_TOKENS.some((token) => value.includes(token))
}



function isProjectableMeshLabel(label: string) {
  const value = label.trim().toLowerCase()
  const sideSkirtTokens = [
    'sideskirt',
    'side_skirt',
    'side skirt',
    'side_skirts',
    'side skirts',
    'sideskirts',
  ]

  if (PROJECTABLE_FORCE_INCLUDE_LABELS.includes(value)) {
    return true
  }

  // Keep rocker/side-skirt panels paintable even when mesh names include
  // shared sub-mesh tokens such as "_sub1_skin_".
  if (sideSkirtTokens.some((token) => value.includes(token))) {
    return true
  }

  if (PROJECTABLE_FORCE_EXCLUDE_LABELS.includes(value)) {
    return false
  }

  if (PROJECTABLE_SUBSTR_EXCLUDES.some((token) => value.includes(token))) {
    return false
  }

  if (PROJECTABLE_EXCLUDE_TOKENS.some((token) => value.includes(token))) {
    return false
  }

  // Named panels match the include list; generic/unknown mesh names (e.g. "Object 1")
  // default to true so imported cars work without requiring manual classification.
  return true
}

const GROUND_SNAP_EXCLUDE_TOKENS = [
  'underbody',
  'chassis',
  'sub_frame',
  'sub frame',
  'subframe',
  'floor_pan',
  'floor pan',
  'exhaust',
  'muffler',
  'pipe',
  'driveshaft',
  'drive_shaft',
  'differential',
  'axle',
  'suspension',
  'skid',
]

// Per-car explicit wheel mesh labels for ground snap.
// When set, ONLY these meshes are used for snapY — overrides all heuristics.
// Use this for models with generic mesh names (e.g. "Object N") where the
// auto wheel-detection can't find the right mesh by name tokens.
const SNAP_MESH_LABELS: Record<string, string[]> = {
  'jeep_grand_cherokee_trackhawk.glb': ['Object 42'],
  'chrysler_300_srt_hellcat.glb': ['Object_18'],
}

// Per-car Y-axis rotation overrides (radians) applied before scaling/centering/snap.
const MODEL_ROTATION_Y_BY_FILE: Record<string, number> = {
  'dodge_charger_scatpack_widebody.glb': Math.PI / 2,
}

// Models whose geometry Z-axis is the car's WIDTH (not length), so stripe X/Z axes
// must be swapped for front-to-back stripe orientation to be correct.
const STRIPE_AXIS_SWAP_FILES = new Set<string>([
])

const BASE_PAINT_COLOR_OVERRIDES: Record<string, Record<string, string>> = {
  '2017_nissain_aimgain_gtr_r35_type_2.glb': {
    'Object_48': '#000000',
  },
}

const STRICT_CLASSIFY_PROJECTION_FILES = new Set<string>([])

const RIM_COLOR_FORCE_ALBEDO_OFF_FILES = new Set([
  '2019_chevrolet_corvette_c8_stingray.glb',
  '2020_dodge_challenger_srt_super_stock.glb',
])

const MAX_STRIPE_SHADER_LAYERS = 8

function disposeClonedSceneMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return
    }

    const material = child.material
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose())
      return
    }

    material?.dispose()
  })
}

function resolveGroundSnapY(root: THREE.Object3D, explicitSnapLabels?: string[]): number {
  let globalMinY = Number.POSITIVE_INFINITY
  let filteredMinY = Number.POSITIVE_INFINITY
  let wheelMinY = Number.POSITIVE_INFINITY
  let cornerCandidateMinY = Number.POSITIVE_INFINITY

  const rootBox = new THREE.Box3().setFromObject(root)
  const rootCenter = rootBox.getCenter(new THREE.Vector3())
  const rootSize = rootBox.getSize(new THREE.Vector3())
  const useXAsLong = rootSize.x >= rootSize.z
  const halfLong = Math.max((useXAsLong ? rootSize.x : rootSize.z) * 0.5, 1e-5)
  const halfShort = Math.max((useXAsLong ? rootSize.z : rootSize.x) * 0.5, 1e-5)
  const shortSize = Math.max(useXAsLong ? rootSize.z : rootSize.x, 1e-5)

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return
    }

    const box = new THREE.Box3().setFromObject(child)
    if (!Number.isFinite(box.min.y)) {
      return
    }

    globalMinY = Math.min(globalMinY, box.min.y)

    const label = ((child.userData.meshLabel as string | undefined) ?? child.name ?? '').toLowerCase()

    // If explicit snap labels are provided, only count those meshes as wheels.
    if (explicitSnapLabels && explicitSnapLabels.length > 0) {
      if (explicitSnapLabels.some((l) => l.toLowerCase() === label)) {
        wheelMinY = Math.min(wheelMinY, box.min.y)
      }
      return
    }
    const isExcluded = GROUND_SNAP_EXCLUDE_TOKENS.some((token) => label.includes(token))
    if (!isExcluded) {
      filteredMinY = Math.min(filteredMinY, box.min.y)
    }

    const isWheelLike =
      label.includes('wheel') ||
      label.includes('rim') ||
      label.includes('rims') ||
      label.includes('tire') ||
      label.includes('tyre') ||
      label.includes('tires') ||
      label.includes('tyres')

    if (isWheelLike) {
      wheelMinY = Math.min(wheelMinY, box.min.y)
      return
    }

    if (!isExcluded) {
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const longOffset = useXAsLong
        ? Math.abs(center.x - rootCenter.x) / halfLong
        : Math.abs(center.z - rootCenter.z) / halfLong
      const shortOffset = useXAsLong
        ? Math.abs(center.z - rootCenter.z) / halfShort
        : Math.abs(center.x - rootCenter.x) / halfShort
      const sizeAlongShort = useXAsLong ? size.z : size.x
      // Loosened thresholds so geometry-based wheel detection works on models
      // with generic mesh names (e.g. "Object N") — tyres are always at corners,
      // low down, and have some minimum size regardless of naming convention.
      const lowEnough = center.y < rootBox.min.y + rootSize.y * 0.55
      const sizeable = size.y > rootSize.y * 0.03 && sizeAlongShort > shortSize * 0.05

      if (longOffset > 0.35 && shortOffset > 0.18 && lowEnough && sizeable) {
        cornerCandidateMinY = Math.min(cornerCandidateMinY, box.min.y)
      }
    }
  })

  // Priority order:
  // 1. Explicit named wheel meshes (best — handles both named and SNAP_MESH_LABELS cars)
  // 2. Corner-position candidates (geometry-based, works for any naming convention)
  // 3. filteredMinY — lowest point excluding known undercarriage/chassis tokens
  // 4. globalMinY — absolute last resort (can include low undercarriage on some models)
  if (Number.isFinite(wheelMinY)) {
    return wheelMinY
  }
  if (Number.isFinite(cornerCandidateMinY)) {
    return cornerCandidateMinY
  }
  if (Number.isFinite(filteredMinY)) {
    return filteredMinY
  }
  if (Number.isFinite(globalMinY)) {
    return globalMinY
  }
  return 0
}

function isSplitExcludedMesh(mesh: THREE.Mesh): boolean {
  // Geometrically detected interior and auto-detected glass meshes are excluded from split/stripe
  if (mesh.userData.geometricInterior === true) return true
  if (mesh.userData.autoGlass === true) return true

  const SPLIT_EXCLUDE_TOKENS = [
    'window', 'windshield', 'glass',
    'grille', 'grill',
    'ext_plastic',
    'grille001_frame',
    'wheel', 'rim', 'tire',
    'brake', 'caliper',
    'mirror',
    'underbody',
    'floor_pan',
    'chassis',
    '_light_',
    'headlight',
    'taillight',
    'rear_light',
    'lamp',
    'exhaust',
    'badge',
    'logo',
    'plate',
    'trim',
    'spoiler',
    'boot_spoiler',
    'rear_spoiler',
    'doorpanel',
    'door_panel',
    'doortrim',
    'door_trim',
    'door_inner',
    'doorinner',
    'inner',
    'trim_in',
    'panel_in',
    'interior',
    'cabin',
    'seat',
    'dashboard',
    'console',
    'pillar_int',
    'inside',
    'misc_d_glass',
    'light_rear_glass_galss',
  ]

  const label = [
    (mesh.userData.meshLabel as string | undefined) ?? '',
    mesh.name ?? '',
  ].join(' ').toLowerCase()

  if (SPLIT_EXCLUDE_TOKENS.some((token) => label.includes(token))) {
    return true
  }

  // Named body panels match the include list; generic/unknown mesh names default to
  // included so imported cars with non-descriptive names get split/stripe paint.
  return false
}

function isStripeExcludedMesh(mesh: THREE.Mesh): boolean {
  return isSplitExcludedMesh(mesh)
}

function pickPreferredDoorMesh(meshes: THREE.Mesh[]) {
  const rightTokens = ['_r', ' right', '_rf', '_rr', 'passenger']
  const leftTokens = ['_l', ' left', '_lf', '_lr', 'driver']

  const candidates = meshes
    .map((mesh) => {
      const label = ((mesh.userData.meshLabel as string | undefined) ?? '').toLowerCase()
      if (!label.includes('door')) {
        return null
      }

      let score = 10
      if (rightTokens.some((token) => label.includes(token))) {
        score += 20
      }
      if (leftTokens.some((token) => label.includes(token))) {
        score -= 5
      }

      return { mesh, score }
    })
    .filter((entry): entry is { mesh: THREE.Mesh; score: number } => Boolean(entry))

  if (candidates.length === 0) {
    return null
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates[0].mesh
}

type OrbitControllerHandle = NativeOrbitControlsHandle

function CameraPresetSync({
  cameraView,
  modelUrl,
  controlsRef,
  onResetCameraReady,
}: {
  cameraView: CameraViewId
  modelUrl: string
  controlsRef: MutableRefObject<OrbitControllerHandle | null>
  onResetCameraReady?: (fn: ResetCameraFn) => void
}) {
  const { camera, size } = useThree()

  const getResponsivePreset = useCallback((view: CameraViewId, preset: { position: [number, number, number]; target: [number, number, number] }) => {
    const aspect = size.width / Math.max(1, size.height)
    if (aspect <= 1.7) {
      return preset
    }

    const px = preset.position[0]
    const py = preset.position[1]
    const pz = preset.position[2]
    const tx = preset.target[0]
    const ty = preset.target[1]
    const tz = preset.target[2]

    const distanceScale = view === 'side' ? 0.36 : 0.48
    const yTargetOffset = view === 'side' ? -0.22 : -0.12
    const yCameraOffset = view === 'side' ? 0.16 : 0.1

    const nx = tx + (px - tx) * distanceScale
    const ny = ty + (py - ty) * distanceScale + yCameraOffset
    const nz = tz + (pz - tz) * distanceScale

    return {
      position: [nx, ny, nz] as [number, number, number],
      target: [tx, ty + yTargetOffset, tz] as [number, number, number],
    }
  }, [size.height, size.width])

  const resetToPreset = useCallback((view: CameraViewId = cameraView) => {
    const fileName = (modelUrl ?? '').split('/').pop() ?? ''
    const effectiveView = CAMERA_VIEW_OVERRIDES_BY_FILE[fileName]?.[view] ?? view
    const p = getResponsivePreset(effectiveView, CAMERA_PRESETS[effectiveView])
    camera.position.set(...p.position)
    const controls = controlsRef.current
    if (controls) {
      controls.target.set(...p.target)
      controls.update()
    }
  }, [camera, cameraView, controlsRef, getResponsivePreset, modelUrl])

  useEffect(() => { resetToPreset() }, [resetToPreset])

  useEffect(() => {
    onResetCameraReady?.(() => resetToPreset('side'))
  }, [onResetCameraReady, resetToPreset])

  return null
}

function CarBody() {
  const paint = useEditorStore((state) => state.project.paint)

  return (
    <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
      <boxGeometry args={[3.6, 1.2, 1.8]} />
      <meshPhysicalMaterial
        color={paint.colorHex}
        metalness={paint.metallic}
        roughness={paint.roughness}
        clearcoat={paint.clearcoat}
      />
    </mesh>
  )
}

function LoadedCarModel({
  modelUrl,
  groundOffsetY = 0,
  classifyWindowClickThrough = false,
  classifyBodyClickThrough = false,
  classifyShowMeshNames = false,
  controlsRef,
  onLayerDragStateChange,
}: {
  modelUrl: string
  groundOffsetY?: number
  classifyWindowClickThrough?: boolean
  classifyBodyClickThrough?: boolean
  classifyShowMeshNames?: boolean
  controlsRef?: React.RefObject<OrbitControllerHandle | null>
  onLayerDragStateChange?: (isDragging: boolean) => void
}) {
  const { scene } = useModelScene(modelUrl)
  const gl = useThree((state) => state.gl)
  const setAvailableParts = useEditorStore((state) => state.setAvailableParts)
  const targetPaints = useEditorStore((state) => state.targetPaints)
  const targetPrints = useEditorStore((state) => state.targetPrints)
  const carGradient = useEditorStore((state) => state.project.carGradient)
  const carSplit = useEditorStore((state) => state.project.carSplit)
  const carStripe = useEditorStore((state) => state.project.carStripe)
  const layers = useEditorStore((state) => state.project.layers)
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const setSelectedLayer = useEditorStore((state) => state.setSelectedLayer)
  const setTool = useEditorStore((state) => state.setTool)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const activeTool = useEditorStore((state) => state.activeTool)
  const meshClassifications = useEditorStore((state) => state.project.meshClassifications)
  const windowTint = useEditorStore((state) => state.project.windowTint)
  const setMeshClassification = useEditorStore((state) => state.setMeshClassification)
  const modelFileName = modelUrl.split('/').pop() ?? ''
  const strictProjectionClassify = STRICT_CLASSIFY_PROJECTION_FILES.has(modelFileName)

  // ── Print texture cache ────────────────────────────────────────────────────
  // Maps imageUrl → loaded THREE.Texture (or null while loading / on error).
  const [printTextures, setPrintTextures] = useState<Map<string, THREE.Texture | null>>(new Map())
  const updatePrintTextures = useCallback(
    (updater: (prev: Map<string, THREE.Texture | null>) => Map<string, THREE.Texture | null>) => {
      setPrintTextures(updater)
    },
    [],
  )

  useEffect(() => {
    // Collect all unique imageUrls that are currently active.
    const urls = new Set<string>()
    for (const cfg of Object.values(targetPrints)) {
      if (cfg?.imageUrl) urls.add(cfg.imageUrl)
    }

    if (urls.size === 0) {
      queueMicrotask(() => {
        updatePrintTextures((prev) => {
          if (prev.size === 0) return prev
          // Dispose old textures when prints are fully cleared.
          prev.forEach((tex) => tex?.dispose())
          return new Map()
        })
      })
      return
    }

    const loader = new THREE.TextureLoader()
    urls.forEach((url) => {
      queueMicrotask(() => {
        updatePrintTextures((prev) => {
          if (prev.has(url)) return prev  // already cached or loading
          const next = new Map(prev)
          next.set(url, null)  // mark as loading
          return next
        })
      })
      loader.load(
        url,
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping
          texture.wrapT = THREE.RepeatWrapping
          texture.colorSpace = THREE.SRGBColorSpace
          texture.generateMipmaps = true
          texture.minFilter = THREE.LinearMipmapLinearFilter
          texture.magFilter = THREE.LinearFilter
          texture.anisotropy = Math.max(1, gl.capabilities.getMaxAnisotropy())
          texture.needsUpdate = true
          updatePrintTextures((prev) => {
            const next = new Map(prev)
            next.set(url, texture)
            return next
          })
        },
        undefined,
        () => {
          // On error, keep null so we fall back to solid paint.
          updatePrintTextures((prev) => {
            const next = new Map(prev)
            next.set(url, null)
            return next
          })
        },
      )
    })

    // Dispose textures that are no longer referenced.
    queueMicrotask(() => {
      updatePrintTextures((prev) => {
        let changed = false
        const next = new Map(prev)
        prev.forEach((tex, cachedUrl) => {
          if (!urls.has(cachedUrl)) {
            tex?.dispose()
            next.delete(cachedUrl)
            changed = true
          }
        })
        return changed ? next : prev
      })
    })
  }, [gl, targetPrints, updatePrintTextures])

  // When the model loads, apply any locked classifications from localStorage.
  // This ensures locked settings survive hard refreshes and are applied immediately.
  useEffect(() => {
    const fileName = modelUrl.split('/').pop() ?? ''
    const locked = getLockedClassifications(fileName)
    if (locked) {
      Object.entries(locked).forEach(([label, cls]) => {
        setMeshClassification(label, cls)
      })
    }
  }, [modelUrl, setMeshClassification])

  // Version string changes whenever any filter list is edited —
  // forces useMemo to recompute even if `scene` ref is stable across HMR.
  const filterVersion = [
    ...PROJECTABLE_SUBSTR_EXCLUDES,
    ...PROJECTABLE_FORCE_EXCLUDE_LABELS,
    ...PROJECTABLE_FORCE_INCLUDE_LABELS,
  ].join('|')

  useEffect(() => {
    endPerfSpan('editor_model_loaded', { modelUrl })
  }, [modelUrl, scene])

  const prepared = useMemo(() => {
    const clone = scene.clone(true)
    const fileName = (modelUrl.split('/').pop() ?? '')

    // Apply Y-rotation BEFORE any bounding-box work so scaling/centering/snap
    // all operate on the correctly-oriented geometry.
    if (MODEL_ROTATION_Y_BY_FILE[fileName] !== undefined) {
      clone.rotation.y = MODEL_ROTATION_Y_BY_FILE[fileName]
      clone.updateMatrixWorld(true)
    }

    const parts: CarObjectPart[] = []
    const meshes: THREE.Mesh[] = []
    const projectionMeshes: THREE.Mesh[] = []
    const meshByPartId = new Map<string, THREE.Mesh>()
    let partIndex = 0

    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return
      }

      child.castShadow = true
      child.receiveShadow = true

      const material = child.material
      if (!material) {
        return
      }

      if (Array.isArray(material)) {
        child.material = material.map((entry) => entry.clone())
      } else {
        child.material = material.clone()
      }

      const primaryMaterial = Array.isArray(child.material)
        ? child.material[0]
        : child.material

      if (!primaryMaterial) {
        return
      }

      const materialWithColor = primaryMaterial as THREE.Material & {
        color?: THREE.Color
        metalness?: number
        roughness?: number
        clearcoat?: number
        transmission?: number
      }
      const fallbackColor = new THREE.Color('#c8c8c8')

      const partId = `part-${partIndex}`
      partIndex += 1
      const label = child.name?.trim().length ? child.name : `Object ${partIndex}`

      child.userData.partId = partId
      child.userData.meshLabel = label
      const baseColorHex =
        BASE_PAINT_COLOR_OVERRIDES[modelUrl.split('/').pop() ?? '']?.[label] ??
        `#${(materialWithColor.color ?? fallbackColor).getHexString()}`

      child.userData.basePaint = {
        colorHex: baseColorHex,
        colorRef: null,
        finish: 'gloss',
        metallic: materialWithColor.metalness ?? 0,
        roughness: materialWithColor.roughness ?? 0.5,
        clearcoat: materialWithColor.clearcoat ?? 0,
      } satisfies PaintConfig
      child.userData.baseMaterialState = {
        transparent: primaryMaterial.transparent,
        opacity: primaryMaterial.opacity,
        transmission: materialWithColor.transmission ?? 0,
      }
      // Meshes with transmission or significant transparency are auto-detected as glass
      // (windshields, headlight covers, etc.). This overrides the default-include rule
      // so generic-named glass on imported cars doesn't get body paint or decals.
      child.userData.autoGlass =
        (materialWithColor.transmission ?? 0) > 0.05 ||
        (primaryMaterial.transparent && primaryMaterial.opacity < 0.7)
      child.userData.projectableMesh = child.userData.autoGlass
        ? isTintableWindowMesh(label, undefined)
        : isProjectableMeshLabel(label)

      meshes.push(child)
      if (child.userData.projectableMesh) {
        projectionMeshes.push(child)
      }
      meshByPartId.set(partId, child)
      parts.push({ id: partId, label })
    })

    const box = new THREE.Box3().setFromObject(clone)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)

    if (maxDim > 0) {
      const target = 3.8
      const uniformScale = target / maxDim
      clone.scale.setScalar(uniformScale)
    }

    // updateMatrixWorld so bounding-box queries below see the final scaled positions.
    clone.updateMatrixWorld(true)

    const rebox = new THREE.Box3().setFromObject(clone)
    const recenter = rebox.getCenter(new THREE.Vector3())
    const explicitSnapLabels = SNAP_MESH_LABELS[fileName]
    const snapY = resolveGroundSnapY(clone, explicitSnapLabels)

    clone.position.x -= recenter.x
    clone.position.y -= snapY
    clone.position.y += groundOffsetY
    clone.position.z -= recenter.z
    // Rotation already applied above before bounding-box calculations.

    // Re-sync matrices after repositioning before any bounding-box work.
    clone.updateMatrixWorld(true)

    // Geometric interior detection for generic-named meshes (e.g. "Object 5").
    // A mesh whose entire bounding box fits inside the car's inner zone is very
    // likely an interior piece (seat, dashboard, etc.) — exclude it from paint.
    const finalBbox = new THREE.Box3().setFromObject(clone)
    const finalSize = finalBbox.getSize(new THREE.Vector3())
    const interiorZone = new THREE.Box3(
      new THREE.Vector3(
        finalBbox.min.x + finalSize.x * 0.14,
        finalBbox.min.y + finalSize.y * 0.05,
        finalBbox.min.z + finalSize.z * 0.14,
      ),
      new THREE.Vector3(
        finalBbox.max.x - finalSize.x * 0.14,
        finalBbox.max.y - finalSize.y * 0.08,
        finalBbox.max.z - finalSize.z * 0.14,
      ),
    )
    meshes.forEach((mesh) => {
      const lbl = (mesh.userData.meshLabel as string | undefined) ?? ''
      if (!/^object\s*\d+$/i.test(lbl.trim())) return  // only generic names
      const mb = new THREE.Box3().setFromObject(mesh)
      if (interiorZone.containsBox(mb)) {
        mesh.userData.projectableMesh = false
        mesh.userData.geometricInterior = true
      }
    })
    const finalProjectionMeshes = projectionMeshes.filter((m) => !m.userData.geometricInterior)

    return { scene: clone, parts, meshes, projectionMeshes: finalProjectionMeshes, meshByPartId }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, filterVersion, groundOffsetY, modelUrl])

  useEffect(() => {
    endPerfSpan('editor_scene_prepared', {
      modelUrl,
      meshCount: prepared.meshes.length,
      partCount: prepared.parts.length,
    })
  }, [modelUrl, prepared.meshes.length, prepared.parts.length, prepared.scene])

  useEffect(() => {
    const sceneClone = prepared.scene
    return () => {
      // Materials are cloned per-model switch and must be released to avoid
      // GPU memory spikes on mobile Safari while swapping cars.
      disposeClonedSceneMaterials(sceneClone)
    }
  }, [prepared.scene])

  // Re-stamp userData.projectableMesh when custom classifications change
  useEffect(() => {
    prepared.meshes.forEach((mesh) => {
      const label = (mesh.userData.meshLabel as string | undefined) ?? ''
      const cls = meshClassifications[label]
      if (cls === 'paintable') mesh.userData.projectableMesh = true
      else if (cls === 'window') mesh.userData.projectableMesh = true
      else if (cls === 'rims') mesh.userData.projectableMesh = false
      else if (cls === 'excluded') mesh.userData.projectableMesh = false
      else if (strictProjectionClassify) mesh.userData.projectableMesh = false
      else if (mesh.userData.geometricInterior) mesh.userData.projectableMesh = false
      else if (mesh.userData.autoGlass) mesh.userData.projectableMesh = isTintableWindowMesh(label, undefined)
      else mesh.userData.projectableMesh = isProjectableMeshLabel(label)
    })
  }, [prepared.meshes, meshClassifications, strictProjectionClassify])

  // Meshes that accept decal/text projection (respects custom classifications)
  const decalMeshes = useMemo(() => {
    return prepared.meshes.filter((mesh) => {
      const label = (mesh.userData.meshLabel as string | undefined) ?? ''
      const cls = meshClassifications[label]
      if (cls === 'paintable' || cls === 'window') return true
      if (cls === 'rims') return false
      if (cls === 'excluded') return false
      if (strictProjectionClassify) return false
      if (mesh.userData.geometricInterior) return false
      if (mesh.userData.autoGlass) return isTintableWindowMesh(label, undefined)
      return isProjectableMeshLabel(label)
    })
  }, [prepared.meshes, meshClassifications, strictProjectionClassify])

  const selectedLayer = useMemo(
    () => {
      const found = layers.find((layer) => layer.id === selectedLayerId) ?? null
      return found && found.type !== 'group' ? found as DecalLayer | TextLayer : null
    },
    [layers, selectedLayerId],
  )

  const visibleStripeLayers = useMemo(
    () => layers.filter((layer): layer is StripeLayer => layer.type === 'stripe' && layer.visible),
    [layers],
  )

  const activeStripeLayer = useMemo(() => {
    const selected = layers.find((layer) => layer.id === selectedLayerId) ?? null
    if (selected?.type === 'stripe') {
      return selected as StripeLayer
    }

    return visibleStripeLayers.length > 0 ? visibleStripeLayers[visibleStripeLayers.length - 1] : null
  }, [layers, selectedLayerId, visibleStripeLayers])

  useEffect(() => {
    setAvailableParts(prepared.parts)
  }, [prepared.parts, setAvailableParts])

  useEffect(() => {
    const modelFileName = modelUrl.split('/').pop() ?? ''
    const forceRimAlbedoOff = RIM_COLOR_FORCE_ALBEDO_OFF_FILES.has(modelFileName)
    const stripeConfigs = visibleStripeLayers.length > 0
      ? visibleStripeLayers.slice(-MAX_STRIPE_SHADER_LAYERS).map((layer) => ({
          colorHex: layer.colorHex,
          finish: layer.finish,
          width: layer.stripeWidth,
          gap: layer.stripeGap,
          offsetX: layer.stripeOffsetX,
          softEdge: layer.softEdge,
          angle: layer.transform.rotation.z,
        }))
      : carStripe.enabled
        ? [carStripe]
        : []

    const gradientPaint = targetPaints.fullCar
    const gradientAxis = carGradient.axis
    const gradientAxisIndex = gradientAxis === 'x' ? 0 : gradientAxis === 'y' ? 1 : 2
    const gradientFrom = new THREE.Color(carGradient.fromHex)
    const gradientTo = new THREE.Color(carGradient.toHex)
    const gradientBounds = new THREE.Box3().setFromObject(prepared.scene)
    const gradMin = gradientBounds.min[gradientAxis]
    const gradMax = gradientBounds.max[gradientAxis]
    const gradRange = Math.max(1e-5, gradMax - gradMin)
    const gradBalance = THREE.MathUtils.clamp(carGradient.balance / 100, -0.95, 0.95)

    prepared.scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return
      }

      const label = child.userData.meshLabel as string | undefined
      const basePaint = child.userData.basePaint as PaintConfig | undefined
      const baseMaterialState = child.userData.baseMaterialState as
        | { transparent: boolean; opacity: number; transmission: number }
        | undefined
      const material = child.material

      if (!label || !basePaint || !baseMaterialState || !material) {
        return
      }

      // For multi-material meshes, apply paint/shader to the first physically-based
      // material slot (Physical or Standard). Many imported cars use Standard only.
      const meshMaterial = (
        Array.isArray(material)
          ? material.find((m) => m instanceof THREE.MeshPhysicalMaterial || m instanceof THREE.MeshStandardMaterial)
          : material instanceof THREE.MeshPhysicalMaterial || material instanceof THREE.MeshStandardMaterial
            ? material
            : null
      ) as (THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial) | null

      if (!meshMaterial) {
        return
      }
      const cls = meshClassifications[label]

      // Pass the explicit classification so that user/preset classify decisions
      // always override name-based auto-exclusion heuristics inside the resolver.
      const resolvedPaint =
        getResolvedPaintForLabel(label, targetPaints, basePaint, cls) ??
        basePaint ??
        DEFAULT_TARGET_PAINT
      const rimsPaint = targetPaints.rims

      // When user has not explicitly classified, fall back to auto heuristics.
      const effectiveCls: typeof cls =
        cls ??
        (child.userData.autoGlass
          ? 'window'
          : child.userData.geometricInterior
            ? 'excluded'
            : isProjectableMeshLabel(label)
              ? 'paintable'
              : 'excluded')

      // Mesh classification should directly control paint eligibility.
      const paint =
        effectiveCls === 'excluded' || effectiveCls === 'window' || child.userData.geometricInterior
          ? basePaint
          : effectiveCls === 'rims'
            ? (rimsPaint ?? basePaint)
            : resolvedPaint
      const isSolidBlackRimMatch =
        effectiveCls === 'rims' &&
        (
          rimsPaint?.colorRef?.swatchId === '3m-solid-black' ||
          rimsPaint?.colorHex.trim().toLowerCase() === '#000000'
        )
      meshMaterial.color.set(isSolidBlackRimMatch ? basePaint.colorHex : paint.colorHex)

      // ── Rim mesh: clear PBR maps so our flat finish values aren't multiplied down ──
      // GLB rim materials often have roughnessMap/metalnessMap that would wash out
      // any custom finish we apply. Save originals once and clear for rim meshes.
      if (effectiveCls === 'rims') {
        if (!meshMaterial.userData._origMapsStored) {
          meshMaterial.userData._origMap = (meshMaterial as THREE.MeshStandardMaterial).map ?? null
          meshMaterial.userData._origRoughnessMap = (meshMaterial as THREE.MeshStandardMaterial).roughnessMap ?? null
          meshMaterial.userData._origMetalnessMap = (meshMaterial as THREE.MeshStandardMaterial).metalnessMap ?? null
          meshMaterial.userData._origMapsStored = true
        }
        if (forceRimAlbedoOff && (meshMaterial as THREE.MeshStandardMaterial).map !== null) {
          ;(meshMaterial as THREE.MeshStandardMaterial).map = null
          meshMaterial.needsUpdate = true
        }
        if ((meshMaterial as THREE.MeshStandardMaterial).roughnessMap !== null ||
            (meshMaterial as THREE.MeshStandardMaterial).metalnessMap !== null) {
          ;(meshMaterial as THREE.MeshStandardMaterial).roughnessMap = null
          ;(meshMaterial as THREE.MeshStandardMaterial).metalnessMap = null
          meshMaterial.needsUpdate = true
        }
      } else if (meshMaterial.userData._origMapsStored) {
        // Restore maps if mesh was re-classified away from rims
        ;(meshMaterial as THREE.MeshStandardMaterial).map = meshMaterial.userData._origMap
        ;(meshMaterial as THREE.MeshStandardMaterial).roughnessMap = meshMaterial.userData._origRoughnessMap
        ;(meshMaterial as THREE.MeshStandardMaterial).metalnessMap = meshMaterial.userData._origMetalnessMap
        meshMaterial.needsUpdate = true
        meshMaterial.userData._origMapsStored = false
      }

      // ── Print (texture-based base paint) ──────────────────────────────────
      // Prints must strictly respect classify state for the current car.
      // Only meshes resolved as paintable are eligible for prints.
      const isClassifiedPaintable =
        effectiveCls === 'paintable' &&
        !child.userData.geometricInterior &&
        !child.userData.autoGlass

      // Resolve which print config applies to this mesh, using the same
      // target-priority logic as paint (specific targets override fullCar).
      const activePrint: PrintConfig | null = (() => {
        if (!isClassifiedPaintable) {
          return null
        }

        const meshTargets = getPaintTargetsForLabel(label)

        // Specific targets win over fullCar (mirrors getResolvedPaintForLabel priority).
        for (const t of ['hood', 'trunk', 'rims'] as const) {
          if (meshTargets.includes(t) && targetPrints[t]) {
            return targetPrints[t]!
          }
        }

        if (targetPrints.fullCar) {
          return targetPrints.fullCar
        }

        return null
      })()
      const printTexture = activePrint ? (printTextures.get(activePrint.imageUrl) ?? null) : null

      if (activePrint && printTexture) {
        const repeatVal = Math.max(0.1, activePrint.tileScale)
        printTexture.repeat.set(repeatVal, repeatVal)
        meshMaterial.map = printTexture
        meshMaterial.color.set(activePrint.tintHex)
        meshMaterial.opacity = activePrint.opacity
        meshMaterial.transparent = activePrint.opacity < 1
        const printFinish = PAINT_FINISH_PRESETS[activePrint.finish]
        // Clear PBR maps baked into the GLB so our scalar finish values are
        // not multiplied down by the original roughness/metalness textures.
        if (!meshMaterial.userData._printOrigMapsStored) {
          meshMaterial.userData._printOrigRoughnessMap = (meshMaterial as THREE.MeshStandardMaterial).roughnessMap ?? null
          meshMaterial.userData._printOrigMetalnessMap = (meshMaterial as THREE.MeshStandardMaterial).metalnessMap ?? null
          if (meshMaterial instanceof THREE.MeshPhysicalMaterial) {
            meshMaterial.userData._printOrigClearcoatRoughnessMap = meshMaterial.clearcoatRoughnessMap ?? null
          }
          meshMaterial.userData._printOrigMapsStored = true
        }
        ;(meshMaterial as THREE.MeshStandardMaterial).roughnessMap = null
        ;(meshMaterial as THREE.MeshStandardMaterial).metalnessMap = null
        meshMaterial.metalness = printFinish.metallic
        meshMaterial.roughness = printFinish.roughness
        if (meshMaterial instanceof THREE.MeshPhysicalMaterial) {
          meshMaterial.clearcoat = printFinish.clearcoat
          meshMaterial.clearcoatRoughness = printFinish.roughness * 0.5
          meshMaterial.clearcoatRoughnessMap = null
        }
        meshMaterial.needsUpdate = true
      } else if (meshMaterial.userData.isPrintMap) {
        // Restore original PBR maps and clear the print texture.
        if (meshMaterial.userData._printOrigMapsStored) {
          ;(meshMaterial as THREE.MeshStandardMaterial).roughnessMap = meshMaterial.userData._printOrigRoughnessMap ?? null
          ;(meshMaterial as THREE.MeshStandardMaterial).metalnessMap = meshMaterial.userData._printOrigMetalnessMap ?? null
          if (meshMaterial instanceof THREE.MeshPhysicalMaterial) {
            meshMaterial.clearcoatRoughnessMap = meshMaterial.userData._printOrigClearcoatRoughnessMap ?? null
          }
          meshMaterial.userData._printOrigMapsStored = false
        }
        if (meshMaterial.map) {
          meshMaterial.map = null
        }
        meshMaterial.needsUpdate = true
      }
      if (activePrint && printTexture) {
        meshMaterial.userData.isPrintMap = true
      } else if (!activePrint) {
        meshMaterial.userData.isPrintMap = false
      }

      const isGeomInterior = child.userData.geometricInterior === true
      const gradientAllowedByClass = effectiveCls === 'paintable' && !isGeomInterior
      const isExplicitPaintable = cls === 'paintable'
      const gradientAllowedByMesh = isExplicitPaintable ? true : isGradientBodyMeshLabel(label)
      const splitAllowedByMesh = isExplicitPaintable ? true : (isProjectableMeshLabel(label) && !isSplitExcludedMesh(child))
      const stripeAllowedByMesh = isExplicitPaintable ? true : !isStripeExcludedMesh(child)
      const useSplit = Boolean(
        carSplit.enabled &&
        gradientAllowedByClass &&
        splitAllowedByMesh
      )
      const useGradient = Boolean(
        !useSplit &&
        carGradient.enabled &&
        gradientAllowedByClass &&
        gradientAllowedByMesh &&
        (!gradientPaint || paint === gradientPaint)
      )
      const useStripe = Boolean(
        stripeConfigs.length > 0 &&
        gradientAllowedByClass &&
        stripeAllowedByMesh
      )
      // Keep base vehicle finish independent from split/stripe overlays.
      // Overlays affect color blending only, while car body finish comes from paint target/material.
      // For rim meshes, prefer the rim paint finish; fall back to gloss (not basePaint which may
      // have metallic=0 from a GLB material that relies on a metalnessMap texture).
      const rimGloss = PAINT_FINISH_PRESETS.gloss
      const activeFinish =
        effectiveCls === 'rims'
          ? {
              metallic: isSolidBlackRimMatch ? basePaint.metallic : (rimsPaint?.metallic ?? rimGloss.metallic),
              roughness: isSolidBlackRimMatch ? basePaint.roughness : (rimsPaint?.roughness ?? rimGloss.roughness),
              clearcoat: isSolidBlackRimMatch ? basePaint.clearcoat : (rimsPaint?.clearcoat ?? rimGloss.clearcoat),
            }
          : {
              metallic: paint.metallic,
              roughness: paint.roughness,
              clearcoat: paint.clearcoat,
            }
      const splitShaderKey = useSplit
        ? `split-${carSplit.sideAHex}-${carSplit.sideBHex}-${carSplit.finish}-${carSplit.offsetX.toFixed(3)}-${carSplit.softEdge.toFixed(3)}-${carSplit.angle.toFixed(3)}`
        : 'none'
      const gradientShaderKey = useGradient
        ? `grad-${gradientAxisIndex}-${carGradient.fromHex}-${carGradient.toHex}-${carGradient.balance}`
        : 'none'
      const stripeShaderKey = useStripe
        ? `stripe-${stripeConfigs.map((stripe) => `${stripe.colorHex}-${stripe.finish}-${stripe.width.toFixed(3)}-${stripe.gap.toFixed(3)}-${stripe.offsetX.toFixed(3)}-${stripe.softEdge.toFixed(3)}-${stripe.angle.toFixed(3)}`).join('|')}`
        : 'none'
      if (
        meshMaterial.userData.gradientShaderKey !== gradientShaderKey ||
        meshMaterial.userData.splitShaderKey !== splitShaderKey ||
        meshMaterial.userData.stripeShaderKey !== stripeShaderKey
      ) {
        meshMaterial.onBeforeCompile = (shader) => {
          meshMaterial.userData.compiledShader = shader
          const useWorldPos = useSplit || useGradient || useStripe

          if (useSplit) {
            const splitFinish = PAINT_FINISH_PRESETS[carSplit.finish]
            shader.uniforms.uSplitA = { value: new THREE.Color(carSplit.sideAHex) }
            shader.uniforms.uSplitB = { value: new THREE.Color(carSplit.sideBHex) }
            shader.uniforms.uSplitOffset = { value: carSplit.offsetX }
            shader.uniforms.uSplitSoft = { value: Math.max(0.0005, carSplit.softEdge) }
            shader.uniforms.uSplitAngle = { value: carSplit.angle }
            shader.uniforms.uSplitRoughness = { value: splitFinish.roughness }
            shader.uniforms.uSplitMetallic = { value: splitFinish.metallic }
          }

          if (useGradient) {
            shader.uniforms.uGradFrom = { value: gradientFrom }
            shader.uniforms.uGradTo = { value: gradientTo }
            shader.uniforms.uGradAxis = { value: gradientAxisIndex }
            shader.uniforms.uGradMin = { value: gradMin }
            shader.uniforms.uGradRange = { value: gradRange }
            shader.uniforms.uGradBalance = { value: gradBalance }
          }

          if (useStripe) {
            shader.uniforms.uStripeAxisSwap = { value: STRIPE_AXIS_SWAP_FILES.has(modelFileName) ? 1 : 0 }
            const stripePrimaryBounds = new THREE.Box3().setFromObject(prepared.scene)
            const stripePrimaryMin = STRIPE_AXIS_SWAP_FILES.has(modelFileName) ? stripePrimaryBounds.min.z : stripePrimaryBounds.min.x
            const stripePrimaryMax = STRIPE_AXIS_SWAP_FILES.has(modelFileName) ? stripePrimaryBounds.max.z : stripePrimaryBounds.max.x
            shader.uniforms.uStripePrimaryMin = { value: stripePrimaryMin }
            shader.uniforms.uStripePrimaryMax = { value: stripePrimaryMax }
            shader.uniforms.uStripeCount = { value: stripeConfigs.length }
            shader.uniforms.uStripeColors = {
              value: Array.from({ length: MAX_STRIPE_SHADER_LAYERS }, (_, index) => new THREE.Color(stripeConfigs[index]?.colorHex ?? '#000000')),
            }
            shader.uniforms.uStripeWidths = {
              value: Array.from({ length: MAX_STRIPE_SHADER_LAYERS }, (_, index) => Math.max(0.0001, stripeConfigs[index]?.width ?? 0.0001)),
            }
            shader.uniforms.uStripeGaps = {
              value: Array.from({ length: MAX_STRIPE_SHADER_LAYERS }, (_, index) => Math.max(0, stripeConfigs[index]?.gap ?? 0)),
            }
            shader.uniforms.uStripeOffsets = {
              value: Array.from({ length: MAX_STRIPE_SHADER_LAYERS }, (_, index) => stripeConfigs[index]?.offsetX ?? 0),
            }
            shader.uniforms.uStripeSofts = {
              value: Array.from({ length: MAX_STRIPE_SHADER_LAYERS }, (_, index) => Math.max(0.0005, stripeConfigs[index]?.softEdge ?? 0.0005)),
            }
            shader.uniforms.uStripeAngles = {
              value: Array.from({ length: MAX_STRIPE_SHADER_LAYERS }, (_, index) => stripeConfigs[index]?.angle ?? 0),
            }
            shader.uniforms.uStripeRoughnesses = {
              value: Array.from({ length: MAX_STRIPE_SHADER_LAYERS }, (_, index) => PAINT_FINISH_PRESETS[stripeConfigs[index]?.finish ?? 'gloss'].roughness),
            }
            shader.uniforms.uStripeMetallics = {
              value: Array.from({ length: MAX_STRIPE_SHADER_LAYERS }, (_, index) => PAINT_FINISH_PRESETS[stripeConfigs[index]?.finish ?? 'gloss'].metallic),
            }
          }

          if (useWorldPos) {
            shader.vertexShader = `varying vec3 vWorldPos;\n${shader.vertexShader}`
            shader.vertexShader = shader.vertexShader.replace(
              '#include <worldpos_vertex>',
              '#include <worldpos_vertex>\n  vWorldPos = worldPosition.xyz;'
            )
          }
          if (useStripe) {
            shader.vertexShader = `varying vec3 vWorldNormal;\n${shader.vertexShader}`
            shader.vertexShader = shader.vertexShader.replace(
              '#include <defaultnormal_vertex>',
              '#include <defaultnormal_vertex>\n  vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);'
            )
          }

          const declarations: string[] = []
          if (useWorldPos) {
            declarations.push('varying vec3 vWorldPos;')
          }
          if (useSplit) {
            declarations.push('uniform vec3 uSplitA;')
            declarations.push('uniform vec3 uSplitB;')
            declarations.push('uniform float uSplitOffset;')
            declarations.push('uniform float uSplitSoft;')
            declarations.push('uniform float uSplitAngle;')
            declarations.push('uniform float uSplitRoughness;')
            declarations.push('uniform float uSplitMetallic;')
          }
          if (useGradient) {
            declarations.push('uniform vec3 uGradFrom;')
            declarations.push('uniform vec3 uGradTo;')
            declarations.push('uniform int uGradAxis;')
            declarations.push('uniform float uGradMin;')
            declarations.push('uniform float uGradRange;')
            declarations.push('uniform float uGradBalance;')
          }
          if (useStripe) {
            declarations.push('varying vec3 vWorldNormal;')
            declarations.push('uniform float uStripeAxisSwap;')
            declarations.push('uniform float uStripePrimaryMin;')
            declarations.push('uniform float uStripePrimaryMax;')
            declarations.push('uniform int uStripeCount;')
            declarations.push(`uniform vec3 uStripeColors[${MAX_STRIPE_SHADER_LAYERS}];`)
            declarations.push(`uniform float uStripeWidths[${MAX_STRIPE_SHADER_LAYERS}];`)
            declarations.push(`uniform float uStripeGaps[${MAX_STRIPE_SHADER_LAYERS}];`)
            declarations.push(`uniform float uStripeOffsets[${MAX_STRIPE_SHADER_LAYERS}];`)
            declarations.push(`uniform float uStripeSofts[${MAX_STRIPE_SHADER_LAYERS}];`)
            declarations.push(`uniform float uStripeAngles[${MAX_STRIPE_SHADER_LAYERS}];`)
            declarations.push(`uniform float uStripeRoughnesses[${MAX_STRIPE_SHADER_LAYERS}];`)
            declarations.push(`uniform float uStripeMetallics[${MAX_STRIPE_SHADER_LAYERS}];`)
          }

          if (declarations.length > 0) {
            shader.fragmentShader = `${declarations.join('\n')}\n${shader.fragmentShader}`
          }

          let colorFragmentChunk = '#include <color_fragment>'

          if (useSplit) {
            colorFragmentChunk += `
              float splitCa = cos(uSplitAngle);
              float splitSa = sin(uSplitAngle);
              vec2 splitP = vec2(vWorldPos.x - uSplitOffset, vWorldPos.z);
              float splitAxis = splitP.x * splitCa - splitP.y * splitSa;
              float splitT = smoothstep(-uSplitSoft, uSplitSoft, splitAxis);
              vec3 splitColor = mix(uSplitB, uSplitA, splitT);
              diffuseColor.rgb = splitColor;`
          } else if (useGradient) {
            colorFragmentChunk += `
              float gradAxisValue = uGradAxis == 0 ? vWorldPos.x : (uGradAxis == 1 ? vWorldPos.y : vWorldPos.z);
              float gradT = clamp(((gradAxisValue - uGradMin) / max(uGradRange, 0.00001)) + uGradBalance, 0.0, 1.0);
              vec3 gradColor = mix(uGradFrom, uGradTo, gradT);
              diffuseColor.rgb = gradColor;`
          }

          if (useStripe) {
            colorFragmentChunk += `
              for (int i = 0; i < ${MAX_STRIPE_SHADER_LAYERS}; i++) {
                if (i >= uStripeCount) { break; }
                float stripeCa = cos(uStripeAngles[i]);
                float stripeSa = sin(uStripeAngles[i]);
                float stripePrimary = uStripeAxisSwap > 0.5 ? vWorldPos.z : vWorldPos.x;
                float stripeDepth   = uStripeAxisSwap > 0.5 ? vWorldPos.x : vWorldPos.z;
                vec2 stripeP = vec2(stripePrimary - uStripeOffsets[i], stripeDepth);
                float stripeAxis = stripeP.x * stripeCa - stripeP.y * stripeSa;
                float stripeHalfGap = max(0.0, uStripeGaps[i] * 0.5);
                float stripeDist = abs(abs(stripeAxis) - stripeHalfGap);
                float stripeAlpha = 1.0 - smoothstep(uStripeWidths[i], uStripeWidths[i] + uStripeSofts[i], stripeDist);
                // Paint top surfaces and the front/rear bumper caps, but keep the middle side panels out.
                float stripeTopMask = smoothstep(0.0, 0.45, vWorldNormal.y);
                float stripePrimaryRange = max(0.0001, uStripePrimaryMax - uStripePrimaryMin);
                float stripePrimaryT = clamp((stripePrimary - uStripePrimaryMin) / stripePrimaryRange, 0.0, 1.0);
                float stripeEndMask = smoothstep(0.78, 1.0, max(stripePrimaryT, 1.0 - stripePrimaryT));
                stripeAlpha *= max(stripeTopMask, stripeEndMask);
                diffuseColor.rgb = mix(diffuseColor.rgb, uStripeColors[i], stripeAlpha);
              }`
          }

          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            colorFragmentChunk
          )

          // Per-fragment roughness/metalness blending for stripe and split finish
          if (useSplit || useStripe) {
            let roughnessChunk = `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
  roughnessFactor *= texelRoughness.g;
#endif`
            if (useSplit) {
              roughnessChunk += `
  roughnessFactor = uSplitRoughness;`
            }
            if (useStripe) {
              roughnessChunk += `
  for (int i = 0; i < ${MAX_STRIPE_SHADER_LAYERS}; i++) {
    if (i >= uStripeCount) { break; }
    float _srCa = cos(uStripeAngles[i]);
    float _srSa = sin(uStripeAngles[i]);
    vec2 _srP = vec2(vWorldPos.x - uStripeOffsets[i], vWorldPos.z);
    float _srAxis = _srP.x * _srCa - _srP.y * _srSa;
    float _srHg = max(0.0, uStripeGaps[i] * 0.5);
    float _srDist = abs(abs(_srAxis) - _srHg);
    float _srAlpha = 1.0 - smoothstep(uStripeWidths[i], uStripeWidths[i] + uStripeSofts[i], _srDist);
    roughnessFactor = mix(roughnessFactor, uStripeRoughnesses[i], _srAlpha);
  }`
            }
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <roughnessmap_fragment>',
              roughnessChunk
            )

            let metalnessChunk = `float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
  vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
  metalnessFactor *= texelMetalness.b;
#endif`
            if (useSplit) {
              metalnessChunk += `
  metalnessFactor = uSplitMetallic;`
            }
            if (useStripe) {
              metalnessChunk += `
  for (int i = 0; i < ${MAX_STRIPE_SHADER_LAYERS}; i++) {
    if (i >= uStripeCount) { break; }
    float _smCa = cos(uStripeAngles[i]);
    float _smSa = sin(uStripeAngles[i]);
    vec2 _smP = vec2(vWorldPos.x - uStripeOffsets[i], vWorldPos.z);
    float _smAxis = _smP.x * _smCa - _smP.y * _smSa;
    float _smHg = max(0.0, uStripeGaps[i] * 0.5);
    float _smDist = abs(abs(_smAxis) - _smHg);
    float _smAlpha = 1.0 - smoothstep(uStripeWidths[i], uStripeWidths[i] + uStripeSofts[i], _smDist);
    metalnessFactor = mix(metalnessFactor, uStripeMetallics[i], _smAlpha);
  }`
            }
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <metalnessmap_fragment>',
              metalnessChunk
            )
          }
        }

        meshMaterial.customProgramCacheKey = () => `mygarage-paint-${gradientAxisIndex}-${splitShaderKey}-${gradientShaderKey}-${stripeShaderKey}`

        meshMaterial.userData.gradientShaderKey = gradientShaderKey
        meshMaterial.userData.splitShaderKey = splitShaderKey
        meshMaterial.userData.stripeShaderKey = stripeShaderKey
        meshMaterial.needsUpdate = true
      }

      const compiledShader = meshMaterial.userData.compiledShader as {
        uniforms?: Record<string, { value: unknown }>
      } | undefined
      if (compiledShader?.uniforms) {
        if (compiledShader.uniforms.uStripeCount && useStripe) {
          compiledShader.uniforms.uStripeCount.value = stripeConfigs.length
        }
        if (compiledShader.uniforms.uStripeColors && useStripe) {
          compiledShader.uniforms.uStripeColors.value = Array.from({ length: MAX_STRIPE_SHADER_LAYERS }, (_, index) => new THREE.Color(stripeConfigs[index]?.colorHex ?? '#000000'))
        }
        if (compiledShader.uniforms.uStripeWidths && useStripe) {
          compiledShader.uniforms.uStripeWidths.value = Array.from({ length: MAX_STRIPE_SHADER_LAYERS }, (_, index) => Math.max(0.001, stripeConfigs[index]?.width ?? 0.001))
        }
        if (compiledShader.uniforms.uStripeGaps && useStripe) {
          compiledShader.uniforms.uStripeGaps.value = Array.from({ length: MAX_STRIPE_SHADER_LAYERS }, (_, index) => Math.max(0, stripeConfigs[index]?.gap ?? 0))
        }
        if (compiledShader.uniforms.uStripeOffsets && useStripe) {
          compiledShader.uniforms.uStripeOffsets.value = Array.from({ length: MAX_STRIPE_SHADER_LAYERS }, (_, index) => stripeConfigs[index]?.offsetX ?? 0)
        }
        if (compiledShader.uniforms.uStripeSofts && useStripe) {
          compiledShader.uniforms.uStripeSofts.value = Array.from({ length: MAX_STRIPE_SHADER_LAYERS }, (_, index) => Math.max(0.0005, stripeConfigs[index]?.softEdge ?? 0.0005))
        }
        if (compiledShader.uniforms.uStripeAngles && useStripe) {
          compiledShader.uniforms.uStripeAngles.value = Array.from({ length: MAX_STRIPE_SHADER_LAYERS }, (_, index) => stripeConfigs[index]?.angle ?? 0)
        }
        if (compiledShader.uniforms.uStripeRoughnesses && useStripe) {
          compiledShader.uniforms.uStripeRoughnesses.value = Array.from({ length: MAX_STRIPE_SHADER_LAYERS }, (_, index) => PAINT_FINISH_PRESETS[stripeConfigs[index]?.finish ?? 'gloss'].roughness)
        }
        if (compiledShader.uniforms.uStripeMetallics && useStripe) {
          compiledShader.uniforms.uStripeMetallics.value = Array.from({ length: MAX_STRIPE_SHADER_LAYERS }, (_, index) => PAINT_FINISH_PRESETS[stripeConfigs[index]?.finish ?? 'gloss'].metallic)
        }
      }

      meshMaterial.metalness = activeFinish.metallic
      meshMaterial.roughness = activeFinish.roughness
      if (meshMaterial instanceof THREE.MeshPhysicalMaterial) {
        meshMaterial.clearcoat = activeFinish.clearcoat
      }

      meshMaterial.transparent = baseMaterialState.transparent
      meshMaterial.opacity = baseMaterialState.opacity
      if (meshMaterial instanceof THREE.MeshPhysicalMaterial) {
        meshMaterial.transmission = baseMaterialState.transmission
      }

      if (windowTint.enabled && isTintableWindowMesh(label, cls)) {
        const tintStrength = THREE.MathUtils.clamp(windowTint.amount / 100, 0, 0.98)
        const tintedOpacity = THREE.MathUtils.clamp(1 - Math.pow(tintStrength, 0.7), 0.03, 0.98)
        meshMaterial.color.set(windowTint.colorHex)
        meshMaterial.transparent = true
        meshMaterial.opacity = tintedOpacity
        if (meshMaterial instanceof THREE.MeshPhysicalMaterial) {
          meshMaterial.transmission = 0
        }
        meshMaterial.roughness = Math.min(1, Math.max(meshMaterial.roughness, 0.24))
      }
    })
  }, [prepared.scene, targetPaints, targetPrints, printTextures, meshClassifications, windowTint, carGradient, carSplit, carStripe, visibleStripeLayers, activeStripeLayer])

  useEffect(() => {
    if (!selectedLayer || selectedLayer.targetPartId) {
      return
    }

    const isProjectable = selectedLayer.type === 'decal' || selectedLayer.type === 'text'
    if (!isProjectable || decalMeshes.length === 0) {
      return
    }

    if (selectedLayer.type === 'decal' || selectedLayer.type === 'text') {
      const preferredDoorMesh = pickPreferredDoorMesh(decalMeshes)

      if (preferredDoorMesh) {
        const sceneBounds = new THREE.Box3().setFromObject(prepared.scene)
        const sceneCenter = sceneBounds
          .getCenter(new THREE.Vector3())
        const preferredDoorBounds = new THREE.Box3().setFromObject(preferredDoorMesh)
        const point = preferredDoorBounds.getCenter(new THREE.Vector3())

        if (selectedLayer.type === 'text') {
          // Start text lower on the body side so first placement is near rocker
          // height instead of upper-door height.
          const lowerDoorY = THREE.MathUtils.lerp(preferredDoorBounds.min.y, preferredDoorBounds.max.y, 0.28)
          const minSceneY = sceneBounds.min.y + 0.04
          point.y = Math.max(minSceneY, lowerDoorY)
        }

        const normal = point.clone().sub(sceneCenter)
        normal.y = 0
        if (normal.lengthSq() < 1e-6) {
          normal.set(1, 0, 0)
        }
        normal.normalize()
        point.addScaledVector(normal, 0.015)

        const partId = (preferredDoorMesh.userData.partId as string | undefined) ?? null
        if (partId) {
          const rotationQ = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            normal,
          )
          const nextRotation = new THREE.Euler().setFromQuaternion(rotationQ, 'XYZ')

          updateLayer(selectedLayer.id, {
            targetPartId: partId,
            transform: {
              ...selectedLayer.transform,
              position: { x: point.x, y: point.y, z: point.z },
              rotation: {
                x: nextRotation.x,
                y: nextRotation.y,
                z: selectedLayer.type === 'text' ? 0 : selectedLayer.transform.rotation.z,
              },
            },
          })
          return
        }
      }
    }

    const origin = new THREE.Vector3(...CAMERA_START_POSITION)
    const lookAt = new THREE.Vector3(...CAMERA_START_TARGET)
    const direction = lookAt.sub(origin).normalize()
    const raycaster = new THREE.Raycaster(origin, direction)
    const intersections = raycaster.intersectObjects(decalMeshes, false)
    const hit = intersections[0]

    if (!hit || !hit.face || !(hit.object instanceof THREE.Mesh)) {
      return
    }

    const normal = hit.face.normal
      .clone()
      .transformDirection(hit.object.matrixWorld)
      .normalize()
    const point = hit.point.clone().addScaledVector(normal, 0.015)
    const partId = (hit.object.userData.partId as string | undefined) ?? null

    if (!partId) {
      return
    }

    const rotationQ = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      normal,
    )
    const nextRotation = new THREE.Euler().setFromQuaternion(rotationQ, 'XYZ')

    updateLayer(selectedLayer.id, {
      targetPartId: partId,
      transform: {
        ...selectedLayer.transform,
        position: {
          x: point.x,
          y: selectedLayer.type === 'text'
            ? THREE.MathUtils.lerp(
                new THREE.Box3().setFromObject(hit.object).min.y,
                new THREE.Box3().setFromObject(hit.object).max.y,
                0.28,
              )
            : point.y,
          z: point.z,
        },
        rotation: {
          x: nextRotation.x,
          y: nextRotation.y,
          z: selectedLayer.type === 'text' ? 0 : nextRotation.z,
        },
      },
    })
  }, [decalMeshes, prepared.scene, selectedLayer, updateLayer])

  const visibleLayers = useMemo(
    () => layers.filter((layer): layer is DecalLayer | TextLayer => layer.visible && (layer.type === 'decal' || layer.type === 'text')),
    [layers],
  )

  const groupMirrorState = useMemo(() => {
    const state = new Map<string, boolean>()
    for (const layer of layers) {
      if (layer.type === 'group' || !layer.groupId) {
        continue
      }
      if (layer.mirrorToOtherSide) {
        state.set(layer.groupId, true)
      } else if (!state.has(layer.groupId)) {
        state.set(layer.groupId, false)
      }
    }
    return state
  }, [layers])

  // Drag-to-move state: tracks which layer is being dragged on the car surface.
  // Only set when the user presses directly on a projected decal/text mesh.
  // Clicking empty car areas does nothing — you must click the decal itself to select,
  // then drag it to reposition.
  const decalDragRef = useRef<{ layerId: string } | null>(null)

  const handleDecalDragStart = (layerId: string) => {
    decalDragRef.current = { layerId }
    onLayerDragStateChange?.(true)
    // Disable orbit so the drag moves the decal instead of rotating the car
    if (controlsRef?.current) {
      ;(controlsRef.current as unknown as { enabled: boolean }).enabled = false
    }
  }

  const handleScenePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!decalDragRef.current) return
    if (!event.face || !(event.object instanceof THREE.Mesh)) return
    if (!event.object.userData.projectableMesh) return
    event.stopPropagation()
    const layer = layers.find((l) => l.id === decalDragRef.current?.layerId)
    if (!layer || (layer.type !== 'decal' && layer.type !== 'text')) return
    const normal = event.face.normal
      .clone()
      .transformDirection(event.object.matrixWorld)
      .normalize()
    const point = event.point.clone().addScaledVector(normal, 0.015)
    const partId = (event.object.userData.partId as string | undefined) ?? null
    const rotationQ = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      normal,
    )
    const nextRotation = new THREE.Euler().setFromQuaternion(rotationQ, 'XYZ')
    updateLayer(layer.id, {
      targetPartId: partId,
      transform: {
        ...layer.transform,
        position: { x: point.x, y: point.y, z: point.z },
        rotation: { x: nextRotation.x, y: nextRotation.y, z: nextRotation.z },
      },
    })
  }

  const handleScenePointerUp = () => {
    if (!decalDragRef.current) return
    decalDragRef.current = null
    onLayerDragStateChange?.(false)
    // Re-enable orbit controls after drag ends
    if (controlsRef?.current) {
      ;(controlsRef.current as unknown as { enabled: boolean }).enabled = true
    }
  }

  useEffect(() => {
    return () => onLayerDragStateChange?.(false)
  }, [onLayerDragStateChange])

  return (
    <>
      <primitive
        object={prepared.scene}
        onPointerDown={() => {
          // Clicking empty car body deselects. Decal/text clicks stopPropagation so they won't reach here.
          setSelectedLayer(null)
        }}
        onPointerMove={handleScenePointerMove}
        onPointerUp={handleScenePointerUp}
      />

      {visibleLayers.map((layer, index) => {
        if (decalMeshes.length === 0) {
          return null
        }

        const effectiveMirrorToOtherSide =
          layer.mirrorToOtherSide ||
          (layer.groupId ? (groupMirrorState.get(layer.groupId) ?? false) : false)

        if (layer.type === 'text') {
          return (
            <ProjectedTextLayer
              key={layer.id}
              layer={layer}
              mirrorToOtherSide={effectiveMirrorToOtherSide}
              targetMeshes={decalMeshes}
              index={index}
              onSelect={(layerId) => {
                setSelectedLayer(layerId)
                setTool('text')
              }}
              onDragStart={handleDecalDragStart}
            />
          )
        }

        if (layer.imageUrl) {
          return (
            <ProjectedImageDecalLayer
              key={layer.id}
              layer={layer}
              mirrorToOtherSide={effectiveMirrorToOtherSide}
              targetMeshes={decalMeshes}
              index={index}
              onSelect={(layerId) => {
                setSelectedLayer(layerId)
                setTool('decal')
              }}
              onDragStart={handleDecalDragStart}
            />
          )
        }

        return (
          <ProjectedSolidDecalLayer
            key={layer.id}
            layer={layer}
            mirrorToOtherSide={effectiveMirrorToOtherSide}
            targetMeshes={decalMeshes}
            index={index}
            onSelect={(layerId) => {
              setSelectedLayer(layerId)
              setTool('decal')
            }}
            onDragStart={handleDecalDragStart}
          />
        )
      })}

      {/* ── Mesh Inspector overlay ── */}
      {activeTool === 'mesh-inspect' && <MeshInspector scene={prepared.scene} />}

      {/* ── Mesh Classify overlay ── */}
      {activeTool === 'mesh-classify' && (
        <MeshClassifyOverlay
          scene={prepared.scene}
          meshClassifications={meshClassifications}
          onClassify={setMeshClassification}
          carFileName={modelUrl.split('/').pop() ?? ''}
          classifyWindowClickThrough={classifyWindowClickThrough}
          classifyBodyClickThrough={classifyBodyClickThrough}
          classifyShowMeshNames={classifyShowMeshNames}
        />
      )}
    </>
  )
}

function MeshInspector({ scene }: { scene: THREE.Object3D }) {
  const [hovered, setHovered] = useState<{ mesh: THREE.Mesh; label: string } | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)

  const allMeshes = useMemo(() => {
    const out: THREE.Mesh[] = []
    scene.traverse((c) => { if (c instanceof THREE.Mesh) out.push(c) })
    return out
  }, [scene])

  return (
    <>
      {allMeshes.map((mesh) => {
        const label = (mesh.userData.meshLabel as string | undefined) ?? mesh.name ?? mesh.uuid
        const isHov = hovered?.mesh === mesh
        const isPinned = pinned === mesh.uuid

        return (
          <mesh
            key={mesh.uuid}
            geometry={mesh.geometry}
            matrixAutoUpdate={false}
            matrix={mesh.matrixWorld}
            renderOrder={300}
            onPointerEnter={(e) => { e.stopPropagation(); setHovered({ mesh, label }) }}
            onPointerLeave={() => setHovered(null)}
            onClick={(e) => { e.stopPropagation(); setPinned(isPinned ? null : mesh.uuid) }}
          >
            <meshBasicMaterial
              color={isPinned ? '#ff4400' : isHov ? '#00ccff' : '#ffffff'}
              transparent
              opacity={isPinned ? 0.45 : isHov ? 0.35 : 0}
              depthWrite={false}
              side={THREE.FrontSide}
            />
            {(isHov || isPinned) && (
              <Html
                position={[0, 0, 0]}
                center
                style={{ pointerEvents: 'none' }}
              >
                <div style={{
                  background: isPinned ? 'rgba(200,50,0,0.92)' : 'rgba(0,20,40,0.88)',
                  color: '#fff',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                  border: `1px solid ${isPinned ? '#ff4400' : '#00ccff'}`,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                }}>
                  {label}
                </div>
              </Html>
            )}
          </mesh>
        )
      })}
    </>
  )
}

// ── Mesh Classify Overlay ─────────────────────────────────────────────────────
const CLASSIFY_CYCLE: MeshClass[] = ['paintable', 'excluded', 'window', 'rims']

function getNextClassifyClass(current: MeshClass | null, reverse = false): MeshClass {
  const idx = current ? CLASSIFY_CYCLE.indexOf(current) : -1
  if (idx < 0) {
    return reverse ? CLASSIFY_CYCLE[CLASSIFY_CYCLE.length - 1] : CLASSIFY_CYCLE[0]
  }
  const nextIdx = reverse
    ? (idx - 1 + CLASSIFY_CYCLE.length) % CLASSIFY_CYCLE.length
    : (idx + 1) % CLASSIFY_CYCLE.length
  return CLASSIFY_CYCLE[nextIdx]
}

function meshEffectiveClass(
  mesh: THREE.Mesh,
  meshClassifications: Record<string, MeshClass>,
): { cls: MeshClass | null; isAuto: boolean } {
  const label = (mesh.userData.meshLabel as string | undefined) ?? ''
  const custom = meshClassifications[label]
  if (custom !== undefined) return { cls: custom, isAuto: false }
  // Auto-detected glass (windshield, headlight covers) shows as window in classify overlay
  if (mesh.userData.autoGlass) return { cls: 'window', isAuto: true }
  // Geometrically detected interior shows as excluded
  if (mesh.userData.geometricInterior) return { cls: 'excluded', isAuto: true }
  // auto heuristic
  if (isProjectableMeshLabel(label)) return { cls: 'paintable', isAuto: true }
  return { cls: 'excluded', isAuto: true }
}

const CLASSIFY_COLORS: Record<MeshClass, string> = {
  paintable: '#22c55e',
  excluded: '#ef4444',
  window: '#facc15',
  rims: '#ec4899',
}
const CLASSIFY_OPACITY: Record<MeshClass, number> = {
  paintable: 0.28,
  excluded: 0.28,
  window: 0.35,
  rims: 0.32,
}
const CLASSIFY_OPACITY_HOV: Record<MeshClass, number> = {
  paintable: 0.5,
  excluded: 0.5,
  window: 0.55,
  rims: 0.55,
}

function MeshClassifyOverlay({
  scene,
  meshClassifications,
  onClassify,
  carFileName,
  classifyWindowClickThrough,
  classifyBodyClickThrough,
  classifyShowMeshNames,
}: {
  scene: THREE.Object3D
  meshClassifications: Record<string, MeshClass>
  onClassify: (label: string, cls: MeshClass | null) => void
  carFileName: string
  classifyWindowClickThrough: boolean
  classifyBodyClickThrough: boolean
  classifyShowMeshNames: boolean
}) {
  const [hovered, setHovered] = useState<THREE.Mesh | null>(null)

  const allMeshes = useMemo(() => {
    const out: THREE.Mesh[] = []
    scene.traverse((c) => { if (c instanceof THREE.Mesh) out.push(c) })
    return out
  }, [scene])

  const classifyMeshes = useMemo(() => {
    return allMeshes
      .filter((mesh) => mesh.visible && mesh.geometry != null)
      .sort((a, b) => {
        const aLabel = ((a.userData.meshLabel as string | undefined) ?? a.name ?? a.uuid).toLowerCase()
        const bLabel = ((b.userData.meshLabel as string | undefined) ?? b.name ?? b.uuid).toLowerCase()
        return aLabel.localeCompare(bLabel)
      })
  }, [allMeshes])

  const [selectedMeshId, setSelectedMeshId] = useState<string | null>(null)

  useEffect(() => {
    if (classifyMeshes.length === 0) {
      setSelectedMeshId(null)
      return
    }
    if (!selectedMeshId || !classifyMeshes.some((mesh) => mesh.uuid === selectedMeshId)) {
      setSelectedMeshId(classifyMeshes[0].uuid)
    }
  }, [classifyMeshes, selectedMeshId])

  const selectedMesh = useMemo(
    () => classifyMeshes.find((mesh) => mesh.uuid === selectedMeshId) ?? null,
    [classifyMeshes, selectedMeshId],
  )

  const selectedMeshLabel = useMemo(() => {
    if (!selectedMesh) return ''
    return (selectedMesh.userData.meshLabel as string | undefined) ?? selectedMesh.name ?? selectedMesh.uuid
  }, [selectedMesh])

  const cycleSelectedMesh = useCallback((step: number) => {
    if (classifyMeshes.length === 0) return
    setSelectedMeshId((prev) => {
      const currentIndex = prev ? classifyMeshes.findIndex((mesh) => mesh.uuid === prev) : -1
      const safeIndex = currentIndex < 0 ? 0 : currentIndex
      const nextIndex = (safeIndex + step + classifyMeshes.length) % classifyMeshes.length
      return classifyMeshes[nextIndex].uuid
    })
  }, [classifyMeshes])

  const applyClassToSelectedMesh = useCallback((action: MeshClass | 'cycle' | 'clear', cycleReverse = false) => {
    if (!selectedMesh) return
    const label = (selectedMesh.userData.meshLabel as string | undefined) ?? selectedMesh.name ?? selectedMesh.uuid
    if (isSystemLockedMesh(carFileName, label)) return

    if (action === 'clear') {
      onClassify(label, null)
      return
    }

    if (action === 'paintable' || action === 'excluded' || action === 'window' || action === 'rims') {
      onClassify(label, action)
      return
    }

    const current = meshEffectiveClass(selectedMesh, meshClassifications).cls
    if (selectedMesh.userData.geometricInterior === true && current === null) {
      onClassify(label, 'excluded')
      return
    }
    const next = getNextClassifyClass(current, cycleReverse)
    onClassify(label, next)
  }, [carFileName, meshClassifications, onClassify, selectedMesh])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return

      if (event.key === '[' || event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault()
        cycleSelectedMesh(-1)
        return
      }
      if (event.key === ']' || event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault()
        cycleSelectedMesh(1)
        return
      }

      if (event.key === '1') {
        event.preventDefault()
        applyClassToSelectedMesh('paintable')
        return
      }
      if (event.key === '2') {
        event.preventDefault()
        applyClassToSelectedMesh('excluded')
        return
      }
      if (event.key === '3') {
        event.preventDefault()
        applyClassToSelectedMesh('window')
        return
      }
      if (event.key === '4') {
        event.preventDefault()
        applyClassToSelectedMesh('rims')
        return
      }

      if (event.key === ' ' || event.key.toLowerCase() === 'c') {
        event.preventDefault()
        applyClassToSelectedMesh('cycle', event.shiftKey)
        return
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        applyClassToSelectedMesh('clear')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [applyClassToSelectedMesh, cycleSelectedMesh])

  return (
    <>
      {classifyMeshes.map((mesh) => {
        const { cls, isAuto } = meshEffectiveClass(mesh, meshClassifications)
        const isHov = hovered === mesh
        const isSelected = selectedMeshId === mesh.uuid
        const label = (mesh.userData.meshLabel as string | undefined) ?? mesh.name ?? mesh.uuid
        const isSysLocked = isSystemLockedMesh(carFileName, label)
        const passThroughWindow = classifyWindowClickThrough && (cls === 'window' || mesh.userData.autoGlass === true)
        const passThroughBody = classifyBodyClickThrough && cls === 'paintable'
        const color = cls ? CLASSIFY_COLORS[cls] : '#ffffff'
        const opacity = cls
          ? (isHov ? CLASSIFY_OPACITY_HOV[cls] : CLASSIFY_OPACITY[cls])
          : (isHov ? 0.15 : 0.04)

        return (
          <mesh
            key={mesh.uuid}
            geometry={mesh.geometry}
            matrixAutoUpdate={false}
            matrix={mesh.matrixWorld}
            renderOrder={300}
            raycast={(passThroughWindow || passThroughBody) ? () => {} : undefined}
            onPointerEnter={(e) => { e.stopPropagation(); setHovered(mesh) }}
            onPointerLeave={() => setHovered(null)}
            onClick={(e) => {
              e.stopPropagation()
              setSelectedMeshId(mesh.uuid)
              // System-locked meshes cannot be changed by the user.
              if (isSysLocked) return
              const current = meshClassifications[label] ?? null
              // Interior meshes with no custom override snap straight to excluded on
              // first click. Once the user has set any custom class, normal cycling
              // applies so they can reach rims / paintable / etc.
              if (mesh.userData.geometricInterior === true && current === null) {
                onClassify(label, 'excluded')
                return
              }
              // Cycle concrete classes only so classify never clears to auto/null.
              const reverse = Boolean((e.nativeEvent as MouseEvent).shiftKey)
              const next = getNextClassifyClass(current, reverse)
              onClassify(label, next)
            }}
            onContextMenu={(e) => {
              e.nativeEvent.preventDefault()
              e.stopPropagation()
              if (isSysLocked) return
              const current = meshClassifications[label] ?? null
              if (mesh.userData.geometricInterior === true && current === null) {
                onClassify(label, 'excluded')
                return
              }
              const next = getNextClassifyClass(current, true)
              onClassify(label, next)
            }}
          >
            <meshBasicMaterial
              color={color}
              transparent
              opacity={isSelected ? Math.min(0.72, opacity + 0.14) : opacity}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
            {(isHov || isSelected || classifyShowMeshNames) && (
              <Html position={[0, 0, 0]} center style={{ pointerEvents: 'none' }}>
                <div style={{
                  background: isHov ? 'rgba(8,16,28,0.92)' : 'rgba(8,16,28,0.72)',
                  color: '#fff',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: isHov ? 11 : 10,
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                  border: `1px solid ${color}`,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                }}>
                  <span style={{ color, fontWeight: 700 }}>
                    {cls ? cls.toUpperCase() : 'AUTO'}
                  </span>
                  {isSelected && <span style={{ color: '#93c5fd', marginLeft: 5 }}>[selected]</span>}
                  {isSysLocked && <span style={{ color: '#f59e0b', marginLeft: 5 }}>🔒 system</span>}
                  {!isSysLocked && isAuto && <span style={{ color: '#8ea0b4', marginLeft: 5 }}>(auto)</span>}
                  <br />
                  <span style={{ color: '#8ea0b4', fontSize: 10 }}>{label}</span>
                </div>
              </Html>
            )}
          </mesh>
        )
      })}

      {selectedMesh && (
        <Html position={[0, 0, 0]} fullscreen style={{ pointerEvents: 'none' }}>
          <div style={{
            position: 'absolute',
            right: 16,
            bottom: 16,
            maxWidth: 360,
            background: 'rgba(8,16,28,0.9)',
            border: '1px solid rgba(148, 163, 184, 0.5)',
            borderRadius: 10,
            padding: '10px 12px',
            color: '#dbe3ef',
            fontSize: 12,
            lineHeight: 1.35,
            boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
            pointerEvents: 'auto',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Classify Mesh Queue</div>
            <div style={{ color: '#9fb1c7', marginBottom: 6 }}>{selectedMeshLabel}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="classify-clear-btn" onClick={() => cycleSelectedMesh(-1)}>Prev Mesh ([)</button>
              <button type="button" className="classify-clear-btn" onClick={() => cycleSelectedMesh(1)}>Next Mesh (])</button>
              <button type="button" className="classify-clear-btn" onClick={() => applyClassToSelectedMesh('cycle', false)}>Cycle Class (C)</button>
              <button type="button" className="classify-clear-btn" onClick={() => applyClassToSelectedMesh('paintable')}>Paintable (1)</button>
              <button type="button" className="classify-clear-btn" onClick={() => applyClassToSelectedMesh('excluded')}>Excluded (2)</button>
              <button type="button" className="classify-clear-btn" onClick={() => applyClassToSelectedMesh('window')}>Window (3)</button>
              <button type="button" className="classify-clear-btn" onClick={() => applyClassToSelectedMesh('rims')}>Rims (4)</button>
            </div>
          </div>
        </Html>
      )}

      {/* Floating legend HUD — rendered as DOM overlay in App.tsx, not here */}
    </>
  )
}

function makeDecalGeometry(targetMesh: THREE.Mesh, layer: DecalLayer | TextLayer) {
  const rollCorrection = DECAL_UPRIGHT_ROLL
  const projectorRotation = new THREE.Euler(
    layer.transform.rotation.x,
    layer.transform.rotation.y,
    layer.transform.rotation.z + rollCorrection,
    'XYZ',
  )
  const depth = Math.max(0.04, layer.transform.scale.z)

  return new DecalGeometry(
    targetMesh,
    new THREE.Vector3(
      layer.transform.position.x,
      layer.transform.position.y,
      layer.transform.position.z,
    ),
    projectorRotation,
    new THREE.Vector3(
      Math.max(0.08, layer.transform.scale.x),
      Math.max(0.08, layer.transform.scale.y),
      depth,
    ),
  )
}

function createMirroredLayer<T extends DecalLayer | TextLayer>(layer: T): T {
  const normal = new THREE.Vector3(0, 0, 1)
    .applyEuler(new THREE.Euler(
      layer.transform.rotation.x,
      layer.transform.rotation.y,
      layer.transform.rotation.z,
      'XYZ',
    ))
  const up = new THREE.Vector3(0, 1, 0)
    .applyEuler(new THREE.Euler(
      layer.transform.rotation.x,
      layer.transform.rotation.y,
      layer.transform.rotation.z,
      'XYZ',
    ))

  normal.x *= -1
  up.x *= -1
  normal.normalize()
  up.normalize()

  let xAxis = new THREE.Vector3().crossVectors(up, normal)
  if (xAxis.lengthSq() < 1e-6) {
    xAxis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal)
  }
  xAxis.normalize()

  const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize()
  const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, normal)
  const mirroredEuler = new THREE.Euler().setFromRotationMatrix(basis, 'XYZ')

  return {
    ...layer,
    transform: {
      ...layer.transform,
      position: {
        ...layer.transform.position,
        x: -layer.transform.position.x,
      },
      rotation: {
        x: mirroredEuler.x,
        y: mirroredEuler.y,
        z: mirroredEuler.z,
      },
    },
  }
}

function getLayerFinishMaterialProps(finish: PaintFinish | undefined) {
  if (finish === 'chrome') {
    return { metalness: 1.0, roughness: 0.05, envMapIntensity: 1.5 }
  }
  if (finish === 'matte') {
    return { metalness: 0.05, roughness: 0.86, envMapIntensity: 0.25 }
  }
  if (finish === 'satin') {
    return { metalness: 0.15, roughness: 0.48, envMapIntensity: 0.6 }
  }
  return { metalness: 0.2, roughness: 0.24, envMapIntensity: 0.9 }
}

type ProjectedLayerProps<TLayer extends DecalLayer | TextLayer> = {
  layer: TLayer
  mirrorToOtherSide: boolean
  targetMeshes: THREE.Mesh[]
  index: number
  onSelect: (layerId: string) => void
  onDragStart: (layerId: string) => void
}

function useProjectedGeometries(
  targetMeshes: THREE.Mesh[],
  layer: DecalLayer | TextLayer,
) {
  // Only rebuild geometry when transform or type changes — NOT when visual-only
  // properties like colorHex, text, or mirrorX change.
  const { position, rotation, scale } = layer.transform
  const geometries = useMemo(
    () => targetMeshes.map((mesh) => makeDecalGeometry(mesh, layer)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      targetMeshes,
      layer.type,
      position.x, position.y, position.z,
      rotation.x, rotation.y, rotation.z,
      scale.x, scale.y, scale.z,
    ],
  )

  useEffect(() => {
    return () => {
      geometries.forEach((geometry) => geometry.dispose())
    }
  }, [geometries])

  return geometries
}

function ProjectedImageDecalLayer({
  layer,
  mirrorToOtherSide,
  targetMeshes,
  index,
  onSelect,
  onDragStart,
}: ProjectedLayerProps<DecalLayer>) {
  const sourceTexture = useLoader(THREE.TextureLoader, layer.imageUrl as string)
  const geometries = useProjectedGeometries(targetMeshes, layer)
  const mirroredLayer = useMemo(
    () => (mirrorToOtherSide ? createMirroredLayer(layer) : null),
    [layer, mirrorToOtherSide],
  )
  const mirroredGeometries = useProjectedGeometries(targetMeshes, mirroredLayer ?? layer)

  const texture = useMemo(() => {
    const tex = sourceTexture.clone()
    tex.colorSpace = THREE.SRGBColorSpace
    tex.flipY = false
    tex.wrapS = THREE.RepeatWrapping
    // Flip X to compensate for Math.PI roll correction so decals appear correctly oriented
    tex.repeat.x = layer.mirrorX ? 1 : -1
    tex.offset.x = layer.mirrorX ? 0 : 1
    tex.needsUpdate = true
    return tex
  }, [layer.mirrorX, sourceTexture])

  const mirroredSideTexture = useMemo(() => {
    if (!mirrorToOtherSide) {
      return null
    }
    const tex = sourceTexture.clone()
    tex.colorSpace = THREE.SRGBColorSpace
    tex.flipY = false
    tex.wrapS = THREE.RepeatWrapping
    // Invert on mirrored side, then apply mirrorMirrorX for additional flip if needed
    const shouldFlip = (layer.mirrorX && !layer.mirrorMirrorX) || (!layer.mirrorX && layer.mirrorMirrorX)
    tex.repeat.x = shouldFlip ? -1 : 1
    tex.offset.x = shouldFlip ? 1 : 0
    tex.needsUpdate = true
    return tex
  }, [mirrorToOtherSide, layer.mirrorX, layer.mirrorMirrorX, sourceTexture])

  useEffect(() => {
    return () => {
      texture.dispose()
      mirroredSideTexture?.dispose()
    }
  }, [mirroredSideTexture, texture])

  // Colorize shader: use only the texture alpha channel, let material color supply RGB.
  // Applied whenever the user has set a non-white color so their pick shows correctly.
  // When color is #ffffff (default), we skip the override so multi-color PNG logos
  // still render with their original image colors.
  const isColorized =
    layer.colorHex.toLowerCase() !== '#ffffff'
    || (layer.mirrorColorHex?.toLowerCase() ?? '#ffffff') !== '#ffffff'
  const colorizeCompile = useMemo(() => {
    if (!isColorized) return undefined
    return (shader: { fragmentShader: string }) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D( map, vMapUv );
          diffuseColor.a *= sampledDiffuseColor.a;
        #endif`,
      )
    }
  }, [isColorized])

  const hitRadius = Math.min(layer.transform.scale.x, layer.transform.scale.y) * 0.38

  return (
    <group>
      {/* Small invisible hit sphere — tighter click target than the full projected area */}
      <mesh
        position={[layer.transform.position.x, layer.transform.position.y, layer.transform.position.z]}
        renderOrder={250 + index}
        raycast={layer.locked ? () => {} : undefined}
        onPointerDown={(event) => {
          if (layer.locked) {
            return
          }
          event.stopPropagation()
          onSelect(layer.id)
          onDragStart(layer.id)
        }}
      >
        <sphereGeometry args={[hitRadius, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {geometries.map((geometry, geometryIndex) => (
        <mesh
          key={`${layer.id}-img-${geometryIndex}-${layer.colorHex}`}
          geometry={geometry}
          renderOrder={200 + index}
          raycast={() => { /* hit detection handled by hit sphere above */ }}
        >
          <meshStandardMaterial
            map={texture}
            color={layer.colorHex}
            transparent
            opacity={Math.max(0.1, layer.transform.opacity)}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-4}
            metalness={getLayerFinishMaterialProps(layer.finish).metalness}
            roughness={getLayerFinishMaterialProps(layer.finish).roughness}
            envMapIntensity={getLayerFinishMaterialProps(layer.finish).envMapIntensity}
            blending={layer.blendMode === 'multiply' ? THREE.MultiplyBlending : layer.blendMode === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending}
            onBeforeCompile={colorizeCompile}
            customProgramCacheKey={isColorized ? () => `colorize-${layer.finish}-${layer.colorHex}-${layer.mirrorColorHex ?? 'default'}` : undefined}
          />
        </mesh>
      ))}

      {mirrorToOtherSide && mirroredLayer
        ? mirroredGeometries.map((geometry, geometryIndex) => (
            <mesh
              key={`${layer.id}-img-mirror-${geometryIndex}-${layer.mirrorColorHex ?? layer.colorHex}`}
              geometry={geometry}
              renderOrder={200 + index}
              raycast={() => { /* hit detection handled by hit sphere */ }}
            >
              <meshStandardMaterial
                map={mirroredSideTexture ?? texture}
                color={layer.mirrorColorHex ?? layer.colorHex}
                transparent
                opacity={Math.max(0.1, layer.transform.opacity)}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-4}
                metalness={getLayerFinishMaterialProps(layer.finish).metalness}
                roughness={getLayerFinishMaterialProps(layer.finish).roughness}
                envMapIntensity={getLayerFinishMaterialProps(layer.finish).envMapIntensity}
                blending={layer.blendMode === 'multiply' ? THREE.MultiplyBlending : layer.blendMode === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending}
                onBeforeCompile={colorizeCompile}
                customProgramCacheKey={isColorized ? () => `colorize-${layer.finish}-${layer.colorHex}-${layer.mirrorColorHex ?? 'default'}` : undefined}
              />
            </mesh>
          ))
        : null}
    </group>
  )
}

function ProjectedSolidDecalLayer({
  layer,
  mirrorToOtherSide,
  targetMeshes,
  index,
  onSelect,
  onDragStart,
}: ProjectedLayerProps<DecalLayer>) {
  const geometries = useProjectedGeometries(targetMeshes, layer)
  const mirroredLayer = useMemo(
    () => (mirrorToOtherSide ? createMirroredLayer(layer) : null),
    [layer, mirrorToOtherSide],
  )
  const mirroredGeometries = useProjectedGeometries(targetMeshes, mirroredLayer ?? layer)

  const hitRadius = Math.min(layer.transform.scale.x, layer.transform.scale.y) * 0.38

  return (
    <group>
      {/* Small invisible hit sphere — tighter click target than the full projected area */}
      <mesh
        position={[layer.transform.position.x, layer.transform.position.y, layer.transform.position.z]}
        renderOrder={250 + index}
        raycast={layer.locked ? () => {} : undefined}
        onPointerDown={(event) => {
          if (layer.locked) {
            return
          }
          event.stopPropagation()
          onSelect(layer.id)
          onDragStart(layer.id)
        }}
      >
        <sphereGeometry args={[hitRadius, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {geometries.map((geometry, geometryIndex) => (
        // key includes colorHex so R3F creates a fresh material on color change;
        // geometry is external and stable — no DecalGeometry rebuild.
        <mesh
          key={`${layer.id}-solid-${geometryIndex}-${layer.colorHex}`}
          geometry={geometry}
          renderOrder={200 + index}
          raycast={() => { /* hit detection handled by hit sphere above */ }}
        >
          <meshStandardMaterial
            color={layer.colorHex}
            transparent
            opacity={Math.max(0.15, layer.transform.opacity)}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-4}
            metalness={getLayerFinishMaterialProps(layer.finish).metalness}
            roughness={getLayerFinishMaterialProps(layer.finish).roughness}
            envMapIntensity={getLayerFinishMaterialProps(layer.finish).envMapIntensity}
          />
        </mesh>
      ))}

      {mirrorToOtherSide && mirroredLayer
        ? mirroredGeometries.map((geometry, geometryIndex) => (
            <mesh
              key={`${layer.id}-solid-mirror-${geometryIndex}-${layer.mirrorColorHex ?? layer.colorHex}`}
              geometry={geometry}
              renderOrder={200 + index}
              raycast={() => { /* hit detection handled by hit sphere */ }}
            >
              <meshStandardMaterial
                color={layer.mirrorColorHex ?? layer.colorHex}
                transparent
                opacity={Math.max(0.15, layer.transform.opacity)}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-4}
                metalness={getLayerFinishMaterialProps(layer.finish).metalness}
                roughness={getLayerFinishMaterialProps(layer.finish).roughness}
                envMapIntensity={getLayerFinishMaterialProps(layer.finish).envMapIntensity}
              />
            </mesh>
          ))
        : null}
    </group>
  )
}

function ProjectedTextLayer({
  layer,
  mirrorToOtherSide,
  targetMeshes,
  index,
  onSelect,
  onDragStart,
}: ProjectedLayerProps<TextLayer>) {
  const geometries = useProjectedGeometries(targetMeshes, layer)
  const mirroredLayer = useMemo(
    () => (mirrorToOtherSide ? createMirroredLayer(layer) : null),
    [layer, mirrorToOtherSide],
  )
  const mirroredGeometries = useProjectedGeometries(targetMeshes, mirroredLayer ?? layer)
  const [fontLoadedTick, setFontLoadedTick] = useState(0)
  const [, setEmbeddedFontDataUrl] = useState<string | null>(null)
  const gl = useThree((state) => state.gl)

  useEffect(() => {
    let disposed = false

    function inferFontMime(url: string) {
      const value = url.toLowerCase()
      if (value.endsWith('.woff2')) return 'font/woff2'
      if (value.endsWith('.woff')) return 'font/woff'
      if (value.endsWith('.otf')) return 'font/otf'
      return 'font/ttf'
    }

    function inferFontFormat(url: string) {
      const value = url.toLowerCase()
      if (value.endsWith('.woff2')) return 'woff2'
      if (value.endsWith('.woff')) return 'woff'
      if (value.endsWith('.otf')) return 'opentype'
      return 'truetype'
    }

    function arrayBufferToBase64(buffer: ArrayBuffer) {
      const bytes = new Uint8Array(buffer)
      let binary = ''
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) {
        const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length))
        binary += String.fromCharCode(...slice)
      }
      return btoa(binary)
    }

    async function loadEmbeddedFont() {
      if (!layer.fontUrl) {
        setEmbeddedFontDataUrl(null)
        return
      }

      try {
        const response = await fetch(layer.fontUrl)
        if (!response.ok) {
          throw new Error('Failed to load font file')
        }

        const buffer = await response.arrayBuffer()
        const base64 = arrayBufferToBase64(buffer)
        const mime = inferFontMime(layer.fontUrl)
        const format = inferFontFormat(layer.fontUrl)
        const dataUrl = `data:${mime};base64,${base64}`

        if (!disposed) {
          // Register the font in the document so canvas can use layer.fontFamily directly
          const fontFace = new FontFace(layer.fontFamily, `url("${dataUrl}") format("${format}")`)
          const loaded = await fontFace.load()
          document.fonts.add(loaded)
          setEmbeddedFontDataUrl(dataUrl)
          setFontLoadedTick((v) => v + 1)
        }
      } catch {
        if (!disposed) {
          setEmbeddedFontDataUrl(null)
        }
      }
    }

    loadEmbeddedFont()

    return () => {
      disposed = true
    }
  }, [layer.fontFamily, layer.fontUrl])

  useEffect(() => {
    let disposed = false

    async function ensureFontLoaded() {
      if (!('fonts' in document)) {
        return
      }

      try {
        await document.fonts.load(`700 64px "${layer.fontFamily || 'Arial'}"`)
        if (!disposed) {
          setFontLoadedTick((value) => value + 1)
        }
      } catch {
        // Keep fallback behavior if font loading fails.
      }
    }

    ensureFontLoaded()

    return () => {
      disposed = true
    }
  }, [layer.fontFamily])

  const textCanvas = useMemo(() => {
    void fontLoadedTick
    const W = 4096
    const H = 1024
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return canvas

    ctx.clearRect(0, 0, W, H)

    const fontFamily = layer.fontFamily || 'Arial'
    const fontSize = 500
    ctx.font = `700 ${fontSize}px "${fontFamily}", sans-serif`
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 16
    ctx.lineJoin = 'round'
    ctx.fillStyle = layer.colorHex

    const text = layer.text || ''
    const curve = layer.textCurve ?? 0

    if (Math.abs(curve) < 0.01) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.strokeText(text, W / 2, H / 2)
      ctx.fillText(text, W / 2, H / 2)
    } else {
      ctx.textBaseline = 'alphabetic'
      const chars = Array.from(text)
      const charWidths = chars.map((c) => ctx.measureText(c).width)
      const totalWidth = charWidths.reduce((a, b) => a + b, 0)
      const curveStrength = Math.min(2.6, Math.pow(Math.abs(curve), 0.9) * 2.5)
      const R = (W * 0.34) / curveStrength
      const totalAngle = totalWidth / R
      const cx = W / 2

      let angle = -totalAngle / 2
      for (let i = 0; i < chars.length; i++) {
        const charAngle = charWidths[i] / R
        const a = angle + charAngle / 2

        ctx.save()
        if (curve > 0) {
          // Arch up: circle center is below canvas centre
          const cy = H / 2 + R
          ctx.translate(cx + R * Math.sin(a), cy - R * Math.cos(a))
          ctx.rotate(a)
        } else {
          // Arch down: circle center is above canvas centre
          const cy = H / 2 - R
          ctx.translate(cx + R * Math.sin(a), cy + R * Math.cos(a))
          ctx.rotate(-a)
        }
        ctx.strokeText(chars[i], -charWidths[i] / 2, 0)
        ctx.fillText(chars[i], -charWidths[i] / 2, 0)
        ctx.restore()

        angle += charAngle
      }
    }

    return canvas
  }, [fontLoadedTick, layer.colorHex, layer.fontFamily, layer.text, layer.textCurve])

  const texture = useMemo(() => {
    const tex = new THREE.CanvasTexture(textCanvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.flipY = false
    tex.wrapS = THREE.RepeatWrapping
    tex.repeat.x = layer.mirrorX ? 1 : -1
    tex.offset.x = layer.mirrorX ? 0 : 1
    tex.generateMipmaps = true
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.anisotropy = Math.max(1, gl.capabilities.getMaxAnisotropy())
    tex.needsUpdate = true
    return tex
  }, [gl, layer.mirrorX, textCanvas])

  const mirroredSideTexture = useMemo(() => {
    if (!mirrorToOtherSide) return null
    const tex = new THREE.CanvasTexture(textCanvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.flipY = false
    tex.wrapS = THREE.RepeatWrapping
    const mirroredTextReadable = layer.mirroredTextReadable ?? true
    // Apply mirrorMirrorX: when true, flip the mirrored side independently
    const effectiveFlip = (layer.mirrorX && !layer.mirrorMirrorX) || (!layer.mirrorX && layer.mirrorMirrorX)
    if (mirroredTextReadable) {
      // Invert on mirrored side so text stays readable, then apply mirrorMirrorX for additional flip if needed.
      tex.repeat.x = effectiveFlip ? -1 : 1
      tex.offset.x = effectiveFlip ? 1 : 0
    } else {
      // Match the front-side texture orientation, but apply mirrorMirrorX for additional flip if needed.
      tex.repeat.x = effectiveFlip ? 1 : -1
      tex.offset.x = effectiveFlip ? 0 : 1
    }
    tex.generateMipmaps = true
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.anisotropy = Math.max(1, gl.capabilities.getMaxAnisotropy())
    tex.needsUpdate = true
    return tex
  }, [gl, mirrorToOtherSide, layer.mirrorX, layer.mirrorMirrorX, layer.mirroredTextReadable, textCanvas])

  useEffect(() => {
    return () => {
      texture.dispose()
      mirroredSideTexture?.dispose()
    }
  }, [mirroredSideTexture, texture])

  const hitRadius = Math.min(layer.transform.scale.x, layer.transform.scale.y) * 0.38

  return (
    <group>
      {/* Small invisible hit sphere — tighter click target than the full projected area */}
      <mesh
        position={[layer.transform.position.x, layer.transform.position.y, layer.transform.position.z]}
        renderOrder={250 + index}
        raycast={layer.locked ? () => {} : undefined}
        onPointerDown={(event) => {
          if (layer.locked) {
            return
          }
          event.stopPropagation()
          onSelect(layer.id)
          onDragStart(layer.id)
        }}
      >
        <sphereGeometry args={[hitRadius, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {geometries.map((geometry, geometryIndex) => (
        <mesh
          key={`${layer.id}-text-${geometryIndex}`}
          geometry={geometry}
          renderOrder={200 + index}
          raycast={() => { /* hit detection handled by hit sphere above */ }}
        >
          <meshStandardMaterial
            map={texture}
            color="#ffffff"
            transparent
            opacity={Math.max(0.1, layer.transform.opacity)}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-4}
            metalness={getLayerFinishMaterialProps(layer.finish).metalness}
            roughness={getLayerFinishMaterialProps(layer.finish).roughness}
            envMapIntensity={getLayerFinishMaterialProps(layer.finish).envMapIntensity}
          />
        </mesh>
      ))}

      {mirrorToOtherSide && mirroredLayer
        ? mirroredGeometries.map((geometry, geometryIndex) => (
            <mesh
              key={`${layer.id}-text-mirror-${geometryIndex}`}
              geometry={geometry}
              renderOrder={200 + index}
              raycast={() => { /* hit detection handled by hit sphere */ }}
            >
              <meshStandardMaterial
                map={mirroredSideTexture ?? texture}
                color={layer.mirrorColorHex ?? '#ffffff'}
                transparent
                opacity={Math.max(0.1, layer.transform.opacity)}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-4}
                metalness={getLayerFinishMaterialProps(layer.finish).metalness}
                roughness={getLayerFinishMaterialProps(layer.finish).roughness}
                envMapIntensity={getLayerFinishMaterialProps(layer.finish).envMapIntensity}
              />
            </mesh>
          ))
        : null}
    </group>
  )
}

export type PrintViewSpec = {
  id: string
  label: string
  position: [number, number, number]
  target: [number, number, number]
  orthoHeight: number
  upVector?: [number, number, number]
}
export type PrintCaptureResult = { id: string; label: string; dataUrl: string }
export type PrintCaptureFn = (
  views: PrintViewSpec[],
  width: number,
  height: number
) => Promise<PrintCaptureResult[]>

export type GlbExportOptions = {
  bakeCarOverlays?: boolean
  includeLightsAndCamera?: boolean
}

export type GlbExportResult = {
  fileName: string
}

export type LightPresetId = 'studio' | 'sunset' | 'night' | 'showroom' | 'garage'
export type ResetCameraFn = () => void

const LIGHT_PRESETS: Record<LightPresetId, {
  ambient: number
  dirIntensity: number
  dirPosition: [number, number, number]
  extraLights?: Array<{ position: [number, number, number]; intensity: number; color: string }>
}> = {
  studio: {
    ambient: 0.42,
    dirIntensity: 1.2,
    dirPosition: [5, 6, 4],
  },
  sunset: {
    ambient: 0.35,
    dirIntensity: 1.6,
    dirPosition: [8, 3, -2],
    extraLights: [{ position: [-4, 2, 3], intensity: 0.5, color: '#ff9944' }],
  },
  night: {
    ambient: 0.18,
    dirIntensity: 0.5,
    dirPosition: [2, 8, 2],
    extraLights: [
      { position: [-3, 3, 2], intensity: 0.9, color: '#4488ff' },
      { position: [3, 3, -2], intensity: 0.7, color: '#ff4466' },
    ],
  },
  showroom: {
    ambient: 0.55,
    dirIntensity: 1.4,
    dirPosition: [0, 8, 0],
    extraLights: [
      { position: [-4, 5, 4], intensity: 0.8, color: '#ffffff' },
      { position: [4, 5, -4], intensity: 0.8, color: '#ffffff' },
    ],
  },
  garage: {
    ambient: 0.5,
    dirIntensity: 0.4,
    dirPosition: [3, 7, 4],
    extraLights: [
      { position: [-4.5, 5.2, -4], intensity: 0.7, color: '#eef4ff' },
      { position: [4.5, 5.2, -4], intensity: 0.7, color: '#eef4ff' },
      { position: [-4.5, 5.2, 2], intensity: 0.6, color: '#eef4ff' },
      { position: [4.5, 5.2, 2], intensity: 0.6, color: '#eef4ff' },
      { position: [0, 5.2, -1], intensity: 0.5, color: '#f4f8ff' },
    ],
  },
}

type EditorCanvasProps = {
  modelUrl: string
  groundOffsetY?: number
  classifyWindowClickThrough?: boolean
  classifyBodyClickThrough?: boolean
  classifyShowMeshNames?: boolean
  orbitEnabled?: boolean
  lightPreset?: LightPresetId
  isRecording?: boolean
  recordingQuality?: ExportQuality
  onRendererReady?: (fn: (quality?: ExportQuality) => string) => void
  onGlbExportReady?: (fn: (options?: GlbExportOptions) => Promise<GlbExportResult>) => void
  onPrintCaptureReady?: (fn: PrintCaptureFn) => void
  onResetCameraReady?: (fn: ResetCameraFn) => void
  onVideoRecorderReady?: (fn: (quality?: ExportQuality) => MediaStream) => void
  onFirstInteraction?: () => void
}

function RendererExposer({
  onReady,
  onGlbExportReady,
  onPrintCaptureReady,
  onVideoRecorderReady,
  onFirstInteraction,
}: {
  onReady?: (fn: (quality?: ExportQuality) => string) => void
  onGlbExportReady?: (fn: (options?: GlbExportOptions) => Promise<GlbExportResult>) => void
  onPrintCaptureReady?: (fn: PrintCaptureFn) => void
  onVideoRecorderReady?: (fn: (quality?: ExportQuality) => MediaStream) => void
  onFirstInteraction?: () => void
}) {
  const layers = useEditorStore((state) => state.project.layers)
  const { gl, scene, camera } = useThree()
  const meshClassifications = useEditorStore((state) => state.project.meshClassifications)
  const carGradient = useEditorStore((state) => state.project.carGradient)
  const carSplit = useEditorStore((state) => state.project.carSplit)
  const carStripe = useEditorStore((state) => state.project.carStripe)
  const visibleStripeLayers = useMemo(
    () => layers.filter((layer): layer is StripeLayer => layer.type === 'stripe' && layer.visible),
    [layers],
  )

  const PNG_LONG_EDGE_BY_QUALITY: Record<ExportQuality, number> = {
    standard: 1920,
    high: 3840,
    ultra: 5760,
  }

  const VIDEO_FPS_BY_QUALITY: Record<ExportQuality, number> = {
    standard: 30,
    high: 30,
    ultra: 45,
  }

  const toFlatMaterial = (source: THREE.Material) => {
    const materialLike = source as THREE.Material & {
      map?: THREE.Texture | null
      color?: THREE.Color
      emissive?: THREE.Color
      opacity?: number
      transparent?: boolean
      alphaTest?: number
      side?: THREE.Side
      visible?: boolean
      wireframe?: boolean
    }

    const flat = new THREE.MeshBasicMaterial({
      map: materialLike.map ?? null,
      color: materialLike.color?.clone() ?? materialLike.emissive?.clone() ?? new THREE.Color('#d6dbe2'),
      transparent: materialLike.transparent ?? false,
      opacity: materialLike.opacity ?? 1,
      alphaTest: materialLike.alphaTest ?? 0,
      side: materialLike.side ?? THREE.FrontSide,
      wireframe: materialLike.wireframe ?? false,
      depthTest: true,
      depthWrite: true,
      toneMapped: false,
    })

    return flat
  }

  const smoothstep = (edge0: number, edge1: number, x: number) => {
    const t = THREE.MathUtils.clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)
  }

  const resolveEffectiveClass = (mesh: THREE.Mesh): MeshClass => {
    const label = ((mesh.userData.meshLabel as string | undefined) ?? '').trim()
    const cls = meshClassifications[label]
    if (cls) return cls
    if (mesh.userData.autoGlass) return 'window'
    if (mesh.userData.geometricInterior) return 'excluded'
    return isProjectableMeshLabel(label) ? 'paintable' : 'excluded'
  }

  const bakeCarOverlayVertexColors = (
    mesh: THREE.Mesh,
    sceneBounds: THREE.Box3,
  ) => {
    const label = ((mesh.userData.meshLabel as string | undefined) ?? '').trim()
    if (!label) return

    const cls = resolveEffectiveClass(mesh)
    if (cls !== 'paintable') return

    const isExplicitPaintable = meshClassifications[label] === 'paintable'
    const splitAllowed = isExplicitPaintable ? true : (isProjectableMeshLabel(label) && !isSplitExcludedMesh(mesh))
    const gradientAllowed = isExplicitPaintable ? true : isGradientBodyMeshLabel(label)
    const stripeAllowed = isExplicitPaintable ? true : !isStripeExcludedMesh(mesh)

    const useSplit = Boolean(carSplit.enabled && splitAllowed)
    const useGradient = Boolean(!useSplit && carGradient.enabled && gradientAllowed)
    const stripeConfigs = visibleStripeLayers.length > 0
      ? visibleStripeLayers.slice(-MAX_STRIPE_SHADER_LAYERS).map((layer) => ({
          colorHex: layer.colorHex,
          width: layer.stripeWidth,
          gap: layer.stripeGap,
          offsetX: layer.stripeOffsetX,
          softEdge: layer.softEdge,
          angle: layer.transform.rotation.z,
        }))
      : carStripe.enabled
        ? [carStripe]
        : []
    const useStripe = Boolean(stripeConfigs.length > 0 && stripeAllowed)
    if (!useSplit && !useGradient && !useStripe) return

    const sourceGeometry = mesh.geometry
    const bakedGeometry = sourceGeometry.index ? (sourceGeometry.toNonIndexed() ?? sourceGeometry.clone()) : sourceGeometry
    if (bakedGeometry !== sourceGeometry) {
      mesh.geometry = bakedGeometry
      sourceGeometry.dispose()
    }

    const position = bakedGeometry.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!position) return

    const axis = carGradient.axis === 'x' ? 0 : carGradient.axis === 'y' ? 1 : 2
    const gradMin = carGradient.axis === 'x'
      ? sceneBounds.min.x
      : carGradient.axis === 'y'
        ? sceneBounds.min.y
        : sceneBounds.min.z
    const gradMax = carGradient.axis === 'x'
      ? sceneBounds.max.x
      : carGradient.axis === 'y'
        ? sceneBounds.max.y
        : sceneBounds.max.z
    const gradRange = Math.max(1e-5, gradMax - gradMin)
    const gradBalance = THREE.MathUtils.clamp(carGradient.balance / 100, -0.95, 0.95)

    const splitA = new THREE.Color(carSplit.sideAHex)
    const splitB = new THREE.Color(carSplit.sideBHex)
    const gradFrom = new THREE.Color(carGradient.fromHex)
    const gradTo = new THREE.Color(carGradient.toHex)

    const baseMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    const baseColor = (baseMaterial as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial)?.color?.clone() ?? new THREE.Color('#ffffff')

    const matrixWorld = mesh.matrixWorld.clone()
    const v = new THREE.Vector3()
    const color = new THREE.Color()
    const colors = new Float32Array(position.count * 3)

    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(matrixWorld)
      color.copy(baseColor)

      if (useSplit) {
        const splitCa = Math.cos(carSplit.angle)
        const splitSa = Math.sin(carSplit.angle)
        const x = v.x - carSplit.offsetX
        const z = v.z
        const splitAxis = x * splitCa - z * splitSa
        const splitT = smoothstep(-Math.max(0.0005, carSplit.softEdge), Math.max(0.0005, carSplit.softEdge), splitAxis)
        color.copy(splitB).lerp(splitA, splitT)
      } else if (useGradient) {
        const axisValue = axis === 0 ? v.x : axis === 1 ? v.y : v.z
        const gradT = THREE.MathUtils.clamp(((axisValue - gradMin) / gradRange) + gradBalance, 0, 1)
        color.copy(gradFrom).lerp(gradTo, gradT)
      }

      if (useStripe) {
        stripeConfigs.forEach((stripeConfig) => {
          const stripeColor = new THREE.Color(stripeConfig.colorHex)
          const stripeCa = Math.cos(stripeConfig.angle)
          const stripeSa = Math.sin(stripeConfig.angle)
          const x = v.x - stripeConfig.offsetX
          const z = v.z
          const stripeAxis = x * stripeCa - z * stripeSa
          const stripeHalfGap = Math.max(0, stripeConfig.gap * 0.5)
          const stripeDist = Math.abs(Math.abs(stripeAxis) - stripeHalfGap)
          const stripeAlpha = 1 - smoothstep(stripeConfig.width, stripeConfig.width + Math.max(0.0005, stripeConfig.softEdge), stripeDist)
          color.lerp(stripeColor, stripeAlpha)
        })
      }

      const idx = i * 3
      colors[idx] = color.r
      colors[idx + 1] = color.g
      colors[idx + 2] = color.b
    }

    bakedGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.forEach((m) => {
      const std = m as THREE.MeshStandardMaterial
      std.vertexColors = true
      std.color.set('#ffffff')
      std.onBeforeCompile = () => {}
      std.needsUpdate = true
    })
  }

  useEffect(() => {
    if (onReady) {
      markPerfOnce('scene_renderer_ready')
      onReady((quality: ExportQuality = 'high') => {
        const srcCanvas = gl.domElement as HTMLCanvasElement
        const srcW = Math.max(1, srcCanvas.width)
        const srcH = Math.max(1, srcCanvas.height)
        const aspect = srcW / srcH

        const maxLongEdge = PNG_LONG_EDGE_BY_QUALITY[quality] ?? PNG_LONG_EDGE_BY_QUALITY.high
        const width = maxLongEdge
        const height = Math.max(1, Math.round(width / aspect))

        const rt = new THREE.WebGLRenderTarget(width, height, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
        })

        const pixels = new Uint8Array(width * height * 4)
        gl.setRenderTarget(rt)
        gl.render(scene, camera)
        gl.readRenderTargetPixels(rt, 0, 0, width, height, pixels)
        gl.setRenderTarget(null)
        rt.dispose()

        const canvas2d = document.createElement('canvas')
        canvas2d.width = width
        canvas2d.height = height
        const ctx = canvas2d.getContext('2d')
        if (!ctx) return srcCanvas.toDataURL('image/png')

        const imageData = ctx.createImageData(width, height)
        for (let row = 0; row < height; row++) {
          const srcRow = height - 1 - row
          imageData.data.set(
            pixels.subarray(srcRow * width * 4, (srcRow + 1) * width * 4),
            row * width * 4,
          )
        }
        ctx.putImageData(imageData, 0, 0)

        return canvas2d.toDataURL('image/png')
      })
    }
  }, [camera, gl, onReady, scene])

  useEffect(() => {
    if (!onGlbExportReady) return

    onGlbExportReady(async (options) => {
      const bakeCarOverlays = options?.bakeCarOverlays ?? true
      const includeLightsAndCamera = options?.includeLightsAndCamera ?? false
      const exporter = new GLTFExporter()
      const exportRoot = new THREE.Group()
      const ownedGeometries: THREE.BufferGeometry[] = []
      const ownedMaterials: THREE.Material[] = []
      const sceneBounds = new THREE.Box3().setFromObject(scene)

      scene.updateMatrixWorld(true)

      scene.traverse((obj) => {
        if (includeLightsAndCamera && obj instanceof THREE.Light) {
          const lightClone = obj.clone()
          const worldPos = new THREE.Vector3()
          const worldQuat = new THREE.Quaternion()
          const worldScale = new THREE.Vector3()
          obj.matrixWorld.decompose(worldPos, worldQuat, worldScale)
          lightClone.position.copy(worldPos)
          lightClone.quaternion.copy(worldQuat)
          lightClone.scale.copy(worldScale)
          exportRoot.add(lightClone)
          return
        }

        if (!(obj instanceof THREE.Mesh)) {
          return
        }
        if (!obj.visible || obj.userData?.isFloor) {
          return
        }

        const sourceMaterial = obj.material
        const materials = Array.isArray(sourceMaterial) ? sourceMaterial : [sourceMaterial]
        const isOverlayMesh =
          obj.renderOrder >= 300 &&
          materials.some((m) => m instanceof THREE.MeshBasicMaterial && m.transparent)
        if (isOverlayMesh) {
          return
        }

        const cloned = new THREE.Mesh(
          obj.geometry.clone(),
          Array.isArray(sourceMaterial)
            ? sourceMaterial.map((m) => m.clone())
            : sourceMaterial.clone(),
        )

        cloned.userData = { ...obj.userData }

        if (Array.isArray(cloned.material)) ownedMaterials.push(...cloned.material)
        else ownedMaterials.push(cloned.material)

        const worldPos = new THREE.Vector3()
        const worldQuat = new THREE.Quaternion()
        const worldScale = new THREE.Vector3()
        obj.matrixWorld.decompose(worldPos, worldQuat, worldScale)
        cloned.position.copy(worldPos)
        cloned.quaternion.copy(worldQuat)
        cloned.scale.copy(worldScale)
        cloned.updateMatrixWorld(true)

        if (bakeCarOverlays) {
          bakeCarOverlayVertexColors(cloned, sceneBounds)
        }

        ownedGeometries.push(cloned.geometry)

        exportRoot.add(cloned)
      })

      if (includeLightsAndCamera) {
        const camClone = camera.clone()
        camClone.name = 'ExportCamera'
        exportRoot.add(camClone)
      }

      const result = await new Promise<ArrayBuffer>((resolve, reject) => {
        exporter.parse(
          exportRoot,
          (output) => {
            if (output instanceof ArrayBuffer) {
              resolve(output)
              return
            }
            const json = JSON.stringify(output)
            resolve(new TextEncoder().encode(json).buffer)
          },
          (error) => reject(error),
          {
            binary: true,
            onlyVisible: true,
            truncateDrawRange: true,
            maxTextureSize: 4096,
          },
        )
      })

      ownedGeometries.forEach((g) => g.dispose())
      ownedMaterials.forEach((m) => m.dispose())

      const blob = new Blob([result], { type: 'model/gltf-binary' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const fileName = `mygarage-layered-${Date.now()}.glb`
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      return { fileName }
    })
  }, [camera, carGradient, carSplit, carStripe, meshClassifications, onGlbExportReady, scene])

  useEffect(() => {
    if (!onFirstInteraction) return

    const handlePointerDown = () => {
      markPerfOnce('scene_first_interaction')
      onFirstInteraction()
    }

    gl.domElement.addEventListener('pointerdown', handlePointerDown, { once: true })
    return () => gl.domElement.removeEventListener('pointerdown', handlePointerDown)
  }, [gl, onFirstInteraction])

  useEffect(() => {
    if (onVideoRecorderReady) {
      onVideoRecorderReady((quality: ExportQuality = 'high') => {
        const fps = VIDEO_FPS_BY_QUALITY[quality] ?? VIDEO_FPS_BY_QUALITY.high
        return (gl.domElement as HTMLCanvasElement).captureStream(fps)
      })
    }
  }, [gl, onVideoRecorderReady])

  useEffect(() => {
    if (!onPrintCaptureReady) return

    onPrintCaptureReady(async (views, width, height) => {
      const results: PrintCaptureResult[] = []
      const aspect = width / height

      // Save scene background
      const origBackground = scene.background
      const originalMaterials: Array<{ mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }> = []
      const generatedMaterials: THREE.Material[] = []

      // Hide grid and shadow-plane meshes for clean print output
      const hiddenObjects: THREE.Object3D[] = []
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const mat = obj.material as THREE.Material & { uniforms?: Record<string, unknown> }
          if (mat instanceof THREE.ShadowMaterial || obj.userData?.isFloor) {
            obj.visible = false
            hiddenObjects.push(obj)
          } else {
            const isVehicleMesh = typeof obj.userData?.meshLabel === 'string'

            // Keep vehicle shader materials (split/gradient/stripe) so print captures
            // match what the user sees in the live editor.
            if (!isVehicleMesh) {
              originalMaterials.push({ mesh: obj, material: obj.material })

              if (Array.isArray(obj.material)) {
                const flatMaterials = obj.material.map((entry) => {
                  const flat = toFlatMaterial(entry)
                  generatedMaterials.push(flat)
                  return flat
                })
                obj.material = flatMaterials
              } else {
                const flat = toFlatMaterial(obj.material)
                generatedMaterials.push(flat)
                obj.material = flat
              }
            }
          }
        }
      })

      // White background keeps captures print-ready and panel-like.
      scene.background = new THREE.Color(0xffffff)

      for (const view of views) {
        const orthoW = view.orthoHeight * aspect
        const cam = new THREE.OrthographicCamera(
          -orthoW, orthoW,
          view.orthoHeight, -view.orthoHeight,
          0.1, 500
        )
        if (view.upVector) cam.up.set(...view.upVector)
        cam.position.set(...view.position)
        cam.lookAt(new THREE.Vector3(...view.target))
        cam.updateProjectionMatrix()

        // Render to offscreen target (doesn't affect visible canvas)
        const rt = new THREE.WebGLRenderTarget(width, height, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
        })

        gl.setRenderTarget(rt)
        gl.render(scene, cam)
        gl.setRenderTarget(null)

        // Read pixels from render target
        const pixels = new Uint8Array(width * height * 4)
        gl.readRenderTargetPixels(rt, 0, 0, width, height, pixels)
        rt.dispose()

        // Flip Y (WebGL is bottom-up, images are top-down)
        const canvas2d = document.createElement('canvas')
        canvas2d.width = width
        canvas2d.height = height
        const ctx = canvas2d.getContext('2d')!
        const imageData = ctx.createImageData(width, height)
        for (let row = 0; row < height; row++) {
          const srcRow = height - 1 - row
          imageData.data.set(
            pixels.subarray(srcRow * width * 4, (srcRow + 1) * width * 4),
            row * width * 4
          )
        }
        ctx.putImageData(imageData, 0, 0)

        results.push({ id: view.id, label: view.label, dataUrl: canvas2d.toDataURL('image/png') })
      }

      // Restore scene state
      scene.background = origBackground
      hiddenObjects.forEach((obj) => { obj.visible = true })
      originalMaterials.forEach(({ mesh, material }) => {
        mesh.material = material
      })
      generatedMaterials.forEach((material) => material.dispose())

      return results
    })
  }, [gl, scene, onPrintCaptureReady])

  return null
}

// Drives smooth camera orbit using absolute clock time,
// bypassing OrbitControls delta-based autoRotate which can jitter under variable frame rate.
function SmoothAutoRotator({
  active,
  controlsRef,
}: {
  active: boolean
  controlsRef: MutableRefObject<OrbitControllerHandle | null>
}) {
  const { camera } = useThree()
  const startRef = useRef<{
    time: number
    angle: number
    radius: number
    yOffset: number
    target: THREE.Vector3
  } | null>(null)
  // autoRotateSpeed=2.4 → one full orbit every 60/2.4 = 25 seconds
  const ORBIT_PERIOD = 60 / 2.4

  useFrame(({ clock }) => {
    if (!active) {
      startRef.current = null
      return
    }
    const elapsed = clock.getElapsedTime()
    const controls = controlsRef.current
    const target = controls ? controls.target.clone() : new THREE.Vector3(0, camera.position.y * 0.45, 0)

    if (!startRef.current) {
      // Capture current camera position relative to the current controls target.
      const dx = camera.position.x - target.x
      const dz = camera.position.z - target.z
      startRef.current = {
        time: elapsed,
        angle: Math.atan2(dx, dz),
        radius: Math.sqrt(dx * dx + dz * dz),
        yOffset: camera.position.y - target.y,
        target,
      }
    }

    // If target moves (camera preset/reset), resync so orbit remains smooth.
    if (startRef.current.target.distanceToSquared(target) > 1e-6) {
      startRef.current = null
      return
    }

    const { time, angle: startAngle, radius, yOffset } = startRef.current
    const omega = (2 * Math.PI) / ORBIT_PERIOD
    const a = startAngle + omega * (elapsed - time)
    camera.position.set(
      target.x + radius * Math.sin(a),
      target.y + yOffset,
      target.z + radius * Math.cos(a),
    )
    camera.lookAt(target)
    controls?.update()
  })

  return null
}

export function EditorCanvas({ modelUrl, groundOffsetY = 0, classifyWindowClickThrough = false, classifyBodyClickThrough = false, classifyShowMeshNames = false, orbitEnabled = true, lightPreset = 'garage', isRecording = false, recordingQuality = 'high', onRendererReady, onGlbExportReady, onPrintCaptureReady, onResetCameraReady, onVideoRecorderReady, onFirstInteraction }: EditorCanvasProps) {
  const preset = LIGHT_PRESETS[lightPreset]
  const resetCameraRef = useRef<ResetCameraFn | null>(null)
  const cameraView = useEditorStore((state) => state.cameraView)
  const setSelectedLayer = useEditorStore((state) => state.setSelectedLayer)
  const autoRotate = useEditorStore((state) => state.autoRotate)
  const controlsRef = useRef<OrbitControllerHandle | null>(null)
  const [isLayerDragging, setIsLayerDragging] = useState(false)
  const renderProfile = useMemo(() => {
    if (typeof navigator === 'undefined') {
      return {
        isMobile: false,
        idleDpr: [1, 2] as [number, number],
        shadowMode: 'percentage' as const,
        shadowMapSize: 2048,
        antialias: true,
        powerPreference: 'high-performance' as const,
      }
    }

    const ua = navigator.userAgent
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    const isIOS = /iPhone|iPad|iPod/i.test(ua)
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
    const lowMemory = typeof memory === 'number' && memory <= 4
    const highMemory = typeof memory === 'number' && memory >= 8

    if (!isMobile) {
      return {
        isMobile: false,
        idleDpr: [1, 2] as [number, number],
        shadowMode: 'percentage' as const,
        shadowMapSize: 2048,
        antialias: true,
        powerPreference: 'high-performance' as const,
      }
    }

    if (lowMemory) {
      return {
        isMobile: true,
        idleDpr: [1, 1.25] as [number, number],
        shadowMode: false as const,
        shadowMapSize: 1024,
        antialias: false,
        powerPreference: 'low-power' as const,
      }
    }

    if (isIOS && !highMemory) {
      return {
        isMobile: true,
        idleDpr: [1, 1.55] as [number, number],
        shadowMode: false as const,
        shadowMapSize: 1024,
        antialias: false,
        powerPreference: 'low-power' as const,
      }
    }

    return {
      isMobile: true,
      idleDpr: [1, 1.9] as [number, number],
      shadowMode: 'percentage' as const,
      shadowMapSize: 2048,
      antialias: true,
      powerPreference: 'high-performance' as const,
    }
  }, [])

  // Keep recording DPR conservative to avoid GPU stalls/freeze on start.
  const recordingDpr: number = recordingQuality === 'ultra' ? 2.5 : recordingQuality === 'standard' ? 1.5 : 2

  return (
    <Canvas
      shadows={renderProfile.shadowMode}
      camera={{ position: CAMERA_START_POSITION, fov: 35 }}
      dpr={isRecording ? recordingDpr : renderProfile.idleDpr}
      gl={{
        antialias: renderProfile.antialias,
        alpha: false,
        preserveDrawingBuffer: isRecording,
        powerPreference: renderProfile.powerPreference,
      }}
      onPointerMissed={() => {
        setSelectedLayer(null)
      }}
    >
      <RendererExposer onReady={onRendererReady} onGlbExportReady={onGlbExportReady} onPrintCaptureReady={onPrintCaptureReady} onVideoRecorderReady={onVideoRecorderReady} onFirstInteraction={onFirstInteraction} />
      <CameraPresetSync cameraView={cameraView} modelUrl={modelUrl} controlsRef={controlsRef} onResetCameraReady={(fn) => {
        resetCameraRef.current = fn
        onResetCameraReady?.(fn)
      }} />

      <color attach="background" args={[lightPreset === 'garage' ? '#1a1410' : '#101927']} />
      <fog attach="fog" args={[lightPreset === 'garage' ? '#1a1410' : '#101927', lightPreset === 'garage' ? 14 : 10, lightPreset === 'garage' ? 30 : 26]} />
      <ambientLight intensity={preset.ambient + 0.1} />
      <hemisphereLight
        args={['#dbe8f8', '#2f4358', 0.75]}
      />
      <directionalLight
        intensity={preset.dirIntensity}
        position={preset.dirPosition}
        castShadow
        shadow-mapSize-width={renderProfile.shadowMapSize}
        shadow-mapSize-height={renderProfile.shadowMapSize}
      />
      <directionalLight
        intensity={0.65}
        position={[-6, 4, -5]}
        color="#dbe7f5"
      />
      {preset.extraLights?.map((light, i) => (
        <pointLight key={i} position={light.position} intensity={light.intensity} color={light.color} />
      ))}

      <Suspense fallback={null}>
        <Environment preset="city" />
      </Suspense>

      {lightPreset === 'garage' ? (
        <>
          <GarageRoom />
          {/* Wide mobile landscape can expose beyond the room bounds; keep a large enclosure behind the main garage. */}
          <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow userData={{ isFloor: true }}>
            <planeGeometry args={[120, 120]} />
            <meshStandardMaterial color="#18222d" roughness={0.96} metalness={0} />
          </mesh>
          <mesh position={[0, 12, -38]} receiveShadow>
            <planeGeometry args={[140, 34]} />
            <meshStandardMaterial color="#2a3340" roughness={0.98} metalness={0} />
          </mesh>
          <mesh position={[-58, 11, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[120, 30]} />
            <meshStandardMaterial color="#252e39" roughness={1} metalness={0} />
          </mesh>
          <mesh position={[58, 11, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[120, 30]} />
            <meshStandardMaterial color="#252e39" roughness={1} metalness={0} />
          </mesh>
        </>
      ) : (
        <>
          {/* Studio backdrop — large dark cylinder surrounds the scene */}
          <mesh userData={{ isFloor: true }}>
            <cylinderGeometry args={[14, 14, 12, 32, 1, true]} />
            <meshStandardMaterial color="#101927" roughness={1} metalness={0} side={2} />
          </mesh>
          <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow userData={{ isFloor: true }}>
            <planeGeometry args={[30, 30]} />
            <meshStandardMaterial color="#182434" roughness={0.62} metalness={0.0} />
          </mesh>
        </>
      )}

      <Suspense fallback={<CarBody />}>
        <LoadedCarModel
          modelUrl={modelUrl}
          groundOffsetY={groundOffsetY}
          classifyWindowClickThrough={classifyWindowClickThrough}
          classifyBodyClickThrough={classifyBodyClickThrough}
          classifyShowMeshNames={classifyShowMeshNames}
          controlsRef={controlsRef}
          onLayerDragStateChange={setIsLayerDragging}
        />
      </Suspense>

      <SmoothAutoRotator active={autoRotate} controlsRef={controlsRef} />
      <NativeOrbitControls
        ref={controlsRef}
        target={CAMERA_START_TARGET}
        minDistance={2.5}
        maxDistance={5}
        maxPolarAngle={Math.PI / 2 - 0.05}
        enableDamping={!isRecording}
        dampingFactor={0.08}
        enabled={isRecording ? false : orbitEnabled && !isLayerDragging}
        autoRotate={false}
        autoRotateSpeed={2.4}
        onChange={() => {
          const ctrl = controlsRef.current as unknown as { target: THREE.Vector3 } | null
          if (ctrl && ctrl.target.y < 0) ctrl.target.y = 0
        }}
      />
    </Canvas>
  )
}
