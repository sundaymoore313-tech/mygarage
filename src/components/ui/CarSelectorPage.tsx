import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import type { ChangeEvent } from 'react'
import * as THREE from 'three'
import {
  DEFAULT_TARGET_PAINT,
  getMergedClassifications,
  getResolvedPaintForLabel,
} from '../../lib/paintTargets'
import { readResumeSnapshot } from '../../lib/resumeSnapshot'
import { useEditorStore } from '../../store/editorStore'
import type { MeshClass } from '../../types/editor'

type CarManifestItem = {
  name: string
  fileName: string
  modelUrl: string
  groundOffsetY?: number
  realWorldLengthM?: number
  realWorldWidthM?: number
  realWorldHeightM?: number
}

type CarManifest = {
  generatedAt: string
  items: CarManifestItem[]
}

type ImportedCarRecord = {
  name: string
  fileName: string
  modelUrl: string
}

type SaveImportedCarsResult = {
  ok: boolean
  error?: string
}

type SelectorNotice = {
  tone: 'info' | 'success' | 'warn' | 'error'
  text: string
}

const MANIFEST_URL = '/models/manifest.json'
const HIDDEN_SELECTOR_MODELS = new Set(['car.glb', 'dodge_charger_srt8.glb', 'unmarked_police_jeep_track_hawk.glb'])
const IMPORTED_CARS_STORAGE_KEY = 'mygarage-imported-cars-v1'
const LAST_CAR_KEY = 'mygarage-last-car'
const AUTH_LOCAL_KEY = 'mygarage-auth-local'
const AUTH_SESSION_KEY = 'mygarage-auth-session'
const PROFILE_AVATAR_KEY = 'mygarage-profile-avatar'
const THUMBNAIL_PALETTE = [
  '#66d9ff',
  '#ff6b6b',
  '#ffd166',
  '#7ae582',
  '#c77dff',
  '#ff9f1c',
  '#4cc9f0',
  '#f72585',
  '#90be6d',
  '#f9844a',
] as const
const THUMBNAIL_COLOR_BY_FILE: Record<string, string> = {
  '2012_dodge_charger_rt_sedan_4d (1).glb': '#00aaff', // electric blue
  '2018_ford_mustang_gt.glb': '#00cc55',               // performance green
  '2019_chevrolet_corvette_c8_stingray.glb': '#ff4400', // corvette orange-red
  '2020_dodge_challenger_srt_super_stock.glb': '#9b30ff', // hellcat purple
  '2021_ram_1500_trx (1).glb': '#e03000',              // TRX red-orange
  'bmw_m3_g80_2025.glb': '#1166ff',                   // M-sport blue
  'chrysler_300_srt_hellcat.glb': '#ffffff',           // pearl white
  'dodge_charger_srt_hellcat__high_quality.glb': '#00dd77', // neon green
  'dodge_durango_srt_392.glb': '#00cccc',              // teal/cyan
  'jeep_grand_cherokee_trackhawk.glb': '#dd00aa',      // magenta
}

function loadImportedCarsFromStorage(): ImportedCarRecord[] {
  try {
    const raw = localStorage.getItem(IMPORTED_CARS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is ImportedCarRecord => (
      entry &&
      typeof entry.name === 'string' &&
      typeof entry.fileName === 'string' &&
      typeof entry.modelUrl === 'string'
    ))
  } catch {
    return []
  }
}

function saveImportedCarsToStorage(importedCars: ImportedCarRecord[]): SaveImportedCarsResult {
  try {
    localStorage.setItem(IMPORTED_CARS_STORAGE_KEY, JSON.stringify(importedCars))
    return { ok: true }
  } catch {
    // If storage quota is exceeded, keep the session state in memory.
    return { ok: false, error: 'Storage is full. Imported cars are available only for this session.' }
  }
}

function loadLastCarFileName(): string | null {
  try {
    const raw = localStorage.getItem(LAST_CAR_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { fileName?: string }
    return parsed.fileName ?? null
  } catch {
    return null
  }
}

function saveLastCar(car: CarManifestItem): void {
  // Store only the fileName reference — imported car data URLs already live in IMPORTED_CARS_STORAGE_KEY
  try {
    localStorage.setItem(LAST_CAR_KEY, JSON.stringify({ fileName: car.fileName }))
  } catch {
    // Ignore quota errors
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function readAvatarInitials() {
  try {
    const raw = localStorage.getItem(AUTH_LOCAL_KEY) ?? sessionStorage.getItem(AUTH_SESSION_KEY)
    if (!raw) return 'MG'
    const user = JSON.parse(raw) as { name?: string }
    return (user.name ?? 'MG')
      .split(' ')
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'MG'
  } catch {
    return 'MG'
  }
}
function getThumbnailColor(fileName: string): string {
  const curated = THUMBNAIL_COLOR_BY_FILE[fileName]
  if (curated) {
    return curated
  }

  let hash = 0
  for (let index = 0; index < fileName.length; index += 1) {
    hash = ((hash * 31) + fileName.charCodeAt(index)) >>> 0
  }
  return THUMBNAIL_PALETTE[hash % THUMBNAIL_PALETTE.length]
}

function getThumbnailFullCarPaint(fileName: string) {
  return {
    ...DEFAULT_TARGET_PAINT,
    colorHex: getThumbnailColor(fileName),
    colorRef: null,
    metallic: 0.45,
    roughness: 0.22,
    clearcoat: 1.0,
  }
}

function getThumbnailAccentPaint() {
  return {
    ...DEFAULT_TARGET_PAINT,
    colorHex: '#0a0a0a',
    colorRef: null,
    metallic: 0.35,
    roughness: 0.22,
    clearcoat: 0.9,
  }
}

function getDisplayCarName(name: string): string {
  return name
    .replace(/^\s*\d{4}\s+/, '')
    .replace(/\s+\d{4}\s*$/, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function getClassificationForLabel(
  classifications: Record<string, MeshClass>,
  label: string,
) {
  const direct = classifications[label]
  if (direct !== undefined) {
    return direct
  }

  // Handle Object label variants across imports: "Object 42" vs "Object_42".
  const underscoreVariant = label.replace(/\s+/g, '_')
  const spacedVariant = label.replace(/_/g, ' ')
  return classifications[underscoreVariant] ?? classifications[spacedVariant]
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

// Explicit wheel labels for models with generic mesh names.
const SNAP_MESH_LABELS: Record<string, string[]> = {
  'jeep_grand_cherokee_trackhawk.glb': ['Object 42'],
  'chrysler_300_srt_hellcat.glb': ['Object_18'],
}

const THUMBNAIL_ROTATION_Y_BY_FILE: Record<string, number> = {
  '2018_ford_mustang_gt.glb': Math.PI,
  '2019_chevrolet_corvette_c8_stingray.glb': Math.PI,
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

    const label = (child.name ?? '').toLowerCase()
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
      const lowEnough = center.y < rootBox.min.y + rootSize.y * 0.62
      const sizeable = size.y > rootSize.y * 0.05 && sizeAlongShort > shortSize * 0.08

      if (longOffset > 0.42 && shortOffset > 0.22 && lowEnough && sizeable) {
        cornerCandidateMinY = Math.min(cornerCandidateMinY, box.min.y)
      }
    }
  })

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

function CarModel({ modelUrl, fileName, groundOffsetY = 0 }: { modelUrl: string; fileName: string; groundOffsetY?: number }) {
  const { scene } = useGLTF(modelUrl)
  const cloned = useMemo(() => {
    const clone = scene.clone(true)
    const mergedClassifications = getMergedClassifications(fileName, {})
    const hasFactoryClassifyPreset = Object.keys(mergedClassifications).length > 0
    const thumbnailPaint = getThumbnailFullCarPaint(fileName)
    const thumbnailAccentPaint = getThumbnailAccentPaint()

    const normalizeMaterial = (material: THREE.Material, label: string) => {
      const next = material.clone()
      if (next instanceof THREE.MeshStandardMaterial || next instanceof THREE.MeshPhysicalMaterial) {
        const classify = getClassificationForLabel(mergedClassifications, label)
        const fallbackPaint = {
          ...DEFAULT_TARGET_PAINT,
          colorHex: `#${next.color.getHexString()}`,
          metallic: next.metalness,
          roughness: next.roughness,
          clearcoat:
            next instanceof THREE.MeshPhysicalMaterial
              ? next.clearcoat
              : DEFAULT_TARGET_PAINT.clearcoat,
        }
        const resolvedPaint = getResolvedPaintForLabel(
          label,
          { fullCar: thumbnailPaint },
          fallbackPaint,
        )

        const labelLower = label.toLowerCase()
        // Check PBR transmission (physically-based glass — definitive indicator)
        const physMat = next instanceof THREE.MeshPhysicalMaterial ? next as THREE.MeshPhysicalMaterial & { transmission?: number } : null
        const hasTransmission = (physMat?.transmission ?? 0) > 0
        const looksLikeGlass = (
          classify === 'window' ||
          /wind(shield|screen)|windshld|window|glass/.test(labelLower) ||
          /head.?light|tail.?light|fog.?light|turn.?light|indicator|lens|lamp/.test(labelLower) ||
          hasTransmission ||
          // Unclassified and already transparent (opacity-based glass)
          (classify === undefined && next.transparent && next.opacity < 0.85 && next.opacity > 0.05)
        )
        const shouldUseThumbnailPaint = !looksLikeGlass && classify === 'paintable'
        const shouldUseAccentPaint = !looksLikeGlass && hasFactoryClassifyPreset && (classify === 'excluded' || classify === 'rims')
        const shouldUseAutoResolvedPaint = !looksLikeGlass && classify === undefined && resolvedPaint !== fallbackPaint

        if (looksLikeGlass) {
          // Black tint on all windows and lights for a uniform look
          next.color.set('#000000')
          next.metalness = 0.0
          next.roughness = 0.05
          next.transparent = true
          next.opacity = 0.55
          next.emissive.set('#000000')
          if (next instanceof THREE.MeshPhysicalMaterial) {
            next.clearcoat = 0.8
          }
        } else if (shouldUseThumbnailPaint || shouldUseAccentPaint || shouldUseAutoResolvedPaint) {
          const paintToUse = shouldUseAccentPaint
            ? thumbnailAccentPaint
            : shouldUseThumbnailPaint
              ? thumbnailPaint
              : resolvedPaint
          next.color.set(paintToUse.colorHex)
          next.metalness = paintToUse.metallic
          next.roughness = paintToUse.roughness
          next.emissive.set('#000000')
          if (next instanceof THREE.MeshPhysicalMaterial) {
            next.clearcoat = paintToUse.clearcoat
          }
        }
        next.needsUpdate = true
      }
      return next
    }

    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const meshLabel =
          (typeof child.userData.meshLabel === 'string' && child.userData.meshLabel) ||
          child.name ||
          ''
        if (Array.isArray(child.material)) {
          child.material = child.material.map((entry) => normalizeMaterial(entry, meshLabel))
        } else {
          child.material = normalizeMaterial(child.material, meshLabel)
        }
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    const box = new THREE.Box3().setFromObject(clone)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim > 0) clone.scale.setScalar(3.8 / maxDim)
    const rebox = new THREE.Box3().setFromObject(clone)
    const center = rebox.getCenter(new THREE.Vector3())
    const explicitSnapLabels = SNAP_MESH_LABELS[fileName]
    const snapY = resolveGroundSnapY(clone, explicitSnapLabels)
    clone.position.sub(center)
    clone.position.y = -snapY
    clone.position.y += groundOffsetY
    clone.rotation.y = THUMBNAIL_ROTATION_Y_BY_FILE[fileName] ?? 0
    return clone
  }, [scene, fileName, groundOffsetY])
  return <primitive object={cloned} />
}

function CarThumbnail({ modelUrl, fileName, groundOffsetY }: { modelUrl: string; fileName: string; groundOffsetY?: number }) {
  return (
    <Canvas
      camera={{ position: [-2.8, 2.0, 4.8], fov: 34 }}
      shadows
      gl={{ antialias: true, alpha: true }}
      style={{ width: '100%', height: '100%', borderRadius: 8 }}
    >
      {/* Static showroom rig — fixed lights so gloss reflections are consistent */}
      <color attach="background" args={['#111111']} />
      {/* Generous ambient so every car color reads clearly */}
      <ambientLight intensity={3.0} color="#dde8ff" />
      {/* Key light — left-front high, sharp specular highlight */}
      <spotLight
        castShadow
        intensity={14}
        position={[-5, 8, 5]}
        angle={0.36}
        penumbra={0.2}
        distance={40}
        color="#ffffff"
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      {/* Fill light — right side, warm-white */}
      <spotLight
        intensity={7}
        position={[6, 5, 3]}
        angle={0.55}
        penumbra={0.5}
        distance={32}
        color="#fff6e8"
      />
      {/* Rim light — rear high for clearcoat edge glow */}
      <spotLight
        intensity={9}
        position={[0, 7, -9]}
        angle={0.4}
        penumbra={0.35}
        distance={36}
        color="#eef4ff"
      />
      {/* Ground bounce */}
      <pointLight intensity={2.2} position={[0, -0.5, 1.5]} color="#7ab0dd" distance={12} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.05, 0]} receiveShadow>
        <circleGeometry args={[4.8, 64]} />
        <shadowMaterial transparent opacity={0.11} />
      </mesh>
      <Suspense fallback={null}>
        <CarModel modelUrl={modelUrl} fileName={fileName} groundOffsetY={groundOffsetY} />
      </Suspense>
      <OrbitControls
        enableRotate={false}
        enableZoom={false}
        enablePan={false}
        target={[0.7, 0.55, 0]}
      />
    </Canvas>
  )
}

type CarSelectorPageProps = {
  onGoHome?: () => void
  onOpenProfile?: () => void
  onEnterEditor?: () => void
}

export function CarSelectorPage({ onGoHome, onOpenProfile, onEnterEditor }: CarSelectorPageProps) {
  const selectCar = useEditorStore((state) => state.selectCar)
  const [avatarUrl] = useState<string | null>(() => localStorage.getItem(PROFILE_AVATAR_KEY))
  const [avatarInitials] = useState(() => readAvatarInitials())
  const [preloadedItems, setPreloadedItems] = useState<CarManifestItem[]>([])
  const [importedItems, setImportedItems] = useState<CarManifestItem[]>([])
  const [selectorView, setSelectorView] = useState<'preloaded' | 'imported'>('preloaded')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<SelectorNotice | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [renamingFileName, setRenamingFileName] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [lastUsedCar, setLastUsedCar] = useState<CarManifestItem | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadCars() {
      setLoading(true)
      setError(null)
      setNotice(null)

      try {
        const response = await fetch(MANIFEST_URL, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`Car manifest request failed (${response.status})`)
        }

        const json = (await response.json()) as CarManifest
        if (!mounted) {
          return
        }

        const visibleItems = Array.isArray(json.items)
          ? json.items.filter((item) => !HIDDEN_SELECTOR_MODELS.has(item.fileName.toLowerCase()))
          : []
        setPreloadedItems(visibleItems)

        const persistedImported = loadImportedCarsFromStorage()
        const importedMapped: CarManifestItem[] = persistedImported.map((item) => ({
          name: item.name,
          fileName: item.fileName,
          modelUrl: item.modelUrl,
        }))
        setImportedItems(importedMapped)

        // Resolve last-used car from fileName reference (works for both preloaded and imported)
        const lastFileName = loadLastCarFileName()
        if (lastFileName) {
          const found =
            visibleItems.find((item) => item.fileName === lastFileName) ??
            importedMapped.find((item) => item.fileName === lastFileName) ??
            null
          if (mounted) setLastUsedCar(found)
        }
      } catch {
        if (mounted) {
          setPreloadedItems([])
          setError('Could not load car library. Check public/models/manifest.json and reload.')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadCars()

    return () => {
      mounted = false
    }
  }, [])

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) {
      return
    }

    setError(null)
    setNotice(null)

    const selectedFiles = Array.from(files)
    const glbFiles = selectedFiles.filter((file) => file.name.toLowerCase().endsWith('.glb'))
    const invalidCount = selectedFiles.length - glbFiles.length
    if (glbFiles.length === 0) {
      setNotice({ tone: 'warn', text: 'No valid .glb files selected.' })
      event.target.value = ''
      return
    }

    const imported: CarManifestItem[] = []
    let failedReadCount = 0
    for (const file of glbFiles) {
      try {
        const dataUrl = await readFileAsDataUrl(file)
        imported.push({
          name: file.name.replace(/\.glb$/i, '').replace(/[_-]+/g, ' ').trim(),
          fileName: file.name,
          modelUrl: dataUrl,
        })
      } catch {
        // Skip unreadable file and continue processing others.
        failedReadCount += 1
      }
    }

    if (imported.length > 0) {
      const seenInBatch = new Set<string>()
      const deduped = imported.filter((item) => {
        const key = item.fileName.toLowerCase()
        if (seenInBatch.has(key)) {
          return false
        }
        seenInBatch.add(key)
        return !importedItems.some((existing) => existing.fileName.toLowerCase() === key)
      })

      const nextImported = [...importedItems, ...deduped]
      setImportedItems(nextImported)
      const saveResult = saveImportedCarsToStorage(nextImported.map((item) => ({
        name: item.name,
        fileName: item.fileName,
        modelUrl: item.modelUrl,
      })))

      const duplicateCount = imported.length - deduped.length
      const parts: string[] = []
      if (deduped.length > 0) {
        parts.push(`Imported ${deduped.length}`)
      }
      if (duplicateCount > 0) {
        parts.push(`${duplicateCount} duplicate${duplicateCount > 1 ? 's' : ''}`)
      }
      if (failedReadCount > 0) {
        parts.push(`${failedReadCount} failed`)
      }
      if (invalidCount > 0) {
        parts.push(`${invalidCount} invalid type${invalidCount > 1 ? 's' : ''}`)
      }
      if (parts.length > 0) {
        setNotice({
          tone: deduped.length > 0 ? 'success' : 'warn',
          text: parts.join(' • '),
        })
      }
      if (!saveResult.ok) {
        setNotice({ tone: 'warn', text: saveResult.error ?? 'Storage save failed for imported cars.' })
      }

      setSelectorView('imported')
      setLoading(false)

      // After successful import, jump straight into the 3D editor.
      const firstImported = deduped[0] ?? imported[0]
      if (firstImported) {
        handleSelectCar(firstImported)
      }
    } else {
      const parts: string[] = []
      if (failedReadCount > 0) {
        parts.push(`${failedReadCount} failed to read`)
      }
      if (invalidCount > 0) {
        parts.push(`${invalidCount} invalid type${invalidCount > 1 ? 's' : ''}`)
      }
      setNotice({ tone: 'warn', text: parts.length ? parts.join(' • ') : 'No cars were imported.' })
    }

    // Allow selecting the same file again in a later import action.
    event.target.value = ''
  }

  const visibleItems = useMemo(
    () => (selectorView === 'imported' ? importedItems : preloadedItems),
    [selectorView, importedItems, preloadedItems],
  )
  const filteredItems = useMemo(
    () => searchQuery.trim()
      ? visibleItems.filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : visibleItems,
    [visibleItems, searchQuery],
  )
  const hasItems = filteredItems.length > 0

  const handleDeleteImported = (fileName: string) => {
    const next = importedItems.filter((item) => item.fileName !== fileName)
    setImportedItems(next)
    const saveResult = saveImportedCarsToStorage(next.map((item) => ({
      name: item.name,
      fileName: item.fileName,
      modelUrl: item.modelUrl,
    })))
    if (!saveResult.ok) {
      setNotice({ tone: 'warn', text: saveResult.error ?? 'Storage save failed for imported cars.' })
    }
  }

  const startRename = (car: CarManifestItem) => {
    setRenamingFileName(car.fileName)
    setRenameValue(car.name)
  }

  const commitRename = () => {
    if (!renamingFileName) return
    const trimmed = renameValue.trim()
    if (!trimmed) { setRenamingFileName(null); return }
    const next = importedItems.map((item) =>
      item.fileName === renamingFileName ? { ...item, name: trimmed } : item,
    )
    setImportedItems(next)
    const saveResult = saveImportedCarsToStorage(next.map((item) => ({
      name: item.name,
      fileName: item.fileName,
      modelUrl: item.modelUrl,
    })))
    if (!saveResult.ok) {
      setNotice({ tone: 'warn', text: saveResult.error ?? 'Storage save failed for imported cars.' })
    }
    setRenamingFileName(null)
  }

  const handleSelectCar = (car: CarManifestItem, restoreResume = false) => {
    saveLastCar(car)
    setLastUsedCar(car)
    selectCar({
      name: car.name,
      modelUrl: car.modelUrl,
      groundOffsetY: car.groundOffsetY,
      realWorldLengthM: car.realWorldLengthM,
      realWorldWidthM: car.realWorldWidthM,
      realWorldHeightM: car.realWorldHeightM,
    })
    if (restoreResume) {
      const resume = readResumeSnapshot(car.fileName)
      if (resume) {
        useEditorStore.getState().loadProject(resume.project)
      }
    }
    onEnterEditor?.()
  }

  return (
    <section className="car-selector-page">
      <div className="car-selector-header">
        <div className="car-selector-header-text">
          {onGoHome ? (
            <button
              type="button"
              className="car-selector-home-btn"
              onClick={onGoHome}
              title="Go to Home"
              aria-label="Go to Home"
            >
              <h1>My Garage</h1>
            </button>
          ) : (
            <h1>My Garage</h1>
          )}
        </div>
        <div className="car-selector-header-tabs">
          <button
            type="button"
            className={selectorView === 'preloaded' ? 'chip active' : 'chip'}
            onClick={() => setSelectorView('preloaded')}
          >
            Preloaded Cars
          </button>
          <button
            type="button"
            className={selectorView === 'imported' ? 'chip active' : 'chip'}
            onClick={() => setSelectorView('imported')}
          >
            Imported Cars
          </button>
        </div>
        <div className="car-selector-search">
          <input
            type="search"
            className="car-search-input"
            placeholder="Search cars…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="car-selector-header-right">
          <button type="button" className="top-card-btn" onClick={handleImportClick}>
            Import GLB
          </button>
          <button
            type="button"
            className="top-profile-bubble"
            onClick={onOpenProfile}
            title="Open profile"
            aria-label="Open profile"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" className="top-profile-bubble-img" />
            ) : (
              <span className="top-profile-bubble-fallback">{avatarInitials}</span>
            )}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".glb,model/gltf-binary"
          multiple
          onChange={handleImportFiles}
          style={{ display: 'none' }}
        />
      </div>

      {lastUsedCar && (
        <div className="car-resume-banner">
          <span className="car-resume-label">Last edited: <strong>{getDisplayCarName(lastUsedCar.name)}</strong></span>
          <button
            type="button"
            className="chip active"
            onClick={() => handleSelectCar(lastUsedCar, true)}
          >
            Continue Editing
          </button>
        </div>
      )}

      <div className="car-selector-body">
        {loading ? <p className="selector-hint">Loading cars…</p> : null}
        {!loading && error ? <p className="selector-hint">{error}</p> : null}
        {!loading && !error && notice ? <p className={`selector-hint selector-hint-${notice.tone}`}>{notice.text}</p> : null}

        {!loading && !error && !hasItems ? (
          <p className="selector-hint">
            {searchQuery.trim()
              ? `No cars match "${searchQuery}".`
              : selectorView === 'imported'
                ? 'No imported cars yet. Click Import GLB to add one.'
                : 'Drop car .glb files in public/models then restart npm run dev.'}
          </p>
        ) : null}

        <div className="car-grid" role="list" aria-label="Car models">
        {filteredItems.map((car) => (
          <article key={car.fileName} className="car-card" role="listitem">
            <div className="car-visual">
              <CarThumbnail modelUrl={car.modelUrl} fileName={car.fileName} groundOffsetY={car.groundOffsetY} />
            </div>
            <div className="car-card-name-row">
              {selectorView === 'imported' && renamingFileName === car.fileName ? (
                <input
                  type="text"
                  className="car-rename-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setRenamingFileName(null)
                  }}
                  autoFocus
                />
              ) : (
                <h2
                  title={selectorView === 'imported' ? 'Double-click to rename' : undefined}
                  onDoubleClick={() => selectorView === 'imported' && startRename(car)}
                >
                  {getDisplayCarName(car.name)}
                </h2>
              )}
              {selectorView === 'imported' && renamingFileName !== car.fileName && (
                <button
                  type="button"
                  className="car-card-icon-btn"
                  title="Rename"
                  aria-label="Rename car"
                  onClick={() => startRename(car)}
                >
                  ✏️
                </button>
              )}
            </div>
            {(car.realWorldLengthM || car.realWorldWidthM || car.realWorldHeightM) && (
              <p className="car-card-specs">
                {[
                  car.realWorldLengthM && `${car.realWorldLengthM.toFixed(1)}m L`,
                  car.realWorldWidthM && `${car.realWorldWidthM.toFixed(1)}m W`,
                  car.realWorldHeightM && `${car.realWorldHeightM.toFixed(1)}m H`,
                ].filter(Boolean).join(' · ')}
              </p>
            )}
            <div className="car-card-actions">
              <button
                type="button"
                className="chip active"
                style={{ flex: 1 }}
                onClick={() => handleSelectCar(car)}
              >
                Edit This Car
              </button>
              {selectorView === 'imported' && (
                <button
                  type="button"
                  className="car-card-icon-btn car-card-delete-btn"
                  title="Delete"
                  aria-label="Delete imported car"
                  onClick={() => handleDeleteImported(car.fileName)}
                >
                  🗑️
                </button>
              )}
            </div>
          </article>
        ))}
        </div>
      </div>
    </section>
  )
}
