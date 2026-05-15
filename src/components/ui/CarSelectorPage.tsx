import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import type { ChangeEvent } from 'react'
import * as THREE from 'three'
import { NativeOrbitControls } from '../scene/NativeOrbitControls'
import { useModelScene } from '../scene/useModelScene'
import { useEditorStore } from '../../store/editorStore'

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
const EXCLUDED_SELECTOR_PATTERNS = [/gt500/i, /ford[_\s-]*mustang/i]
const IMPORTED_CARS_STORAGE_KEY = 'mygarage-imported-cars-v1'
const AUTH_LOCAL_KEY = 'mygarage-auth-local'
const AUTH_SESSION_KEY = 'mygarage-auth-session'
const PROFILE_AVATAR_KEY = 'mygarage-profile-avatar'

function isExcludedSelectorCar(item: { fileName: string; name?: string }): boolean {
  const haystack = `${item.fileName} ${item.name ?? ''}`
  return EXCLUDED_SELECTOR_PATTERNS.some((pattern) => pattern.test(haystack))
}

function shouldUseStaticSelectorThumbnails(): boolean {
  return false
}

function hashString(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function buildStaticCarThumbnailDataUrl(carName: string, fileName: string): string {
  const seed = `${fileName}:${carName}`
  const hash = hashString(seed)
  const hueA = hash % 360
  const hueB = (hueA + 38) % 360
  const label = getDisplayCarName(carName).slice(0, 22)
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hueA} 56% 43%)"/>
      <stop offset="100%" stop-color="hsl(${hueB} 52% 20%)"/>
    </linearGradient>
    <linearGradient id="car" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f7fbff" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#dbe8f5" stop-opacity="0.9"/>
    </linearGradient>
  </defs>
  <rect width="640" height="640" fill="url(#bg)"/>
  <circle cx="150" cy="120" r="130" fill="rgba(255,255,255,0.12)"/>
  <circle cx="560" cy="560" r="180" fill="rgba(0,0,0,0.18)"/>
  <path d="M86 398 L140 330 C164 300 205 282 248 282 L410 282 C452 282 488 304 516 332 L560 398 L86 398 Z" fill="url(#car)"/>
  <rect x="152" y="304" width="162" height="52" rx="18" fill="#cfe0f0" fill-opacity="0.9"/>
  <rect x="334" y="304" width="160" height="52" rx="18" fill="#cfe0f0" fill-opacity="0.9"/>
  <circle cx="196" cy="430" r="58" fill="#132537"/>
  <circle cx="196" cy="430" r="28" fill="#8da8c2"/>
  <circle cx="454" cy="430" r="58" fill="#132537"/>
  <circle cx="454" cy="430" r="28" fill="#8da8c2"/>
  <text x="320" y="556" text-anchor="middle" fill="#eff7ff" font-size="34" font-family="Segoe UI, Tahoma, sans-serif" font-weight="700">${label}</text>
</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
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

function readStoredAvatarDataUrl() {
  try {
    const raw = localStorage.getItem(PROFILE_AVATAR_KEY)
    return raw && raw.startsWith('data:image/') ? raw : null
  } catch {
    return null
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
  '2019_chevrolet_corvette_c8_stingray.glb': Math.PI,
  'dodge_charger_scatpack_widebody.glb': 0,
}

const THUMBNAIL_MODEL_SCALE_BY_FILE: Record<string, number> = {
  'dodge_charger_scatpack_widebody.glb': 3.5,
}

const THUMBNAIL_MODEL_OFFSET_X_BY_FILE: Record<string, number> = {
  'dodge_charger_scatpack_widebody.glb': -0.35,
}

// Overrides groundOffsetY for the selector thumbnail canvas ONLY.
// Does not affect how the car sits in the 3D editor.
const THUMBNAIL_GROUND_OFFSET_BY_FILE: Record<string, number> = {
  'dodge_charger_scatpack_widebody.glb': 0.12,
}

const THUMBNAIL_MODEL_OFFSET_X = -0.75

// ── Thumbnail auto-generation queue ─────────────────────────────────────────
// Single hidden Canvas renders one car at a time, caches result in
// sessionStorage so subsequent page loads show real images instantly.

const THUMB_SESSION_PREFIX = 'mg-thumb-v1-'

type ThumbJob = {
  modelUrl: string
  fileName: string
  groundOffsetY?: number
  fallbackSrc: string
}

function getThumbnailModelUrl(fileName: string, modelUrl: string): string {
  if (fileName === 'dodge_charger_scatpack_widebody.glb') {
    return '/models/dodge_charger_srt_hellcat__high_quality.glb'
  }
  return modelUrl
}

const thumbJobQueue: ThumbJob[] = []
const thumbCallbacks = new Map<string, Set<(dataUrl: string) => void>>()
let thumbQueueNotify: (() => void) | null = null

function readCachedThumb(fileName: string): string | null {
  try { return sessionStorage.getItem(THUMB_SESSION_PREFIX + fileName) } catch { return null }
}

function writeCachedThumb(fileName: string, dataUrl: string): void {
  try { sessionStorage.setItem(THUMB_SESSION_PREFIX + fileName, dataUrl) } catch {
    // Ignore quota/storage-access failures; thumbnails still work for current render.
  }
}

function enqueueThumb(job: ThumbJob, onReady: (dataUrl: string) => void): () => void {
  let set = thumbCallbacks.get(job.fileName)
  if (!set) { set = new Set(); thumbCallbacks.set(job.fileName, set) }
  set.add(onReady)
  if (!thumbJobQueue.some((j) => j.fileName === job.fileName)) {
    thumbJobQueue.push(job)
    thumbQueueNotify?.()
  }
  return () => { thumbCallbacks.get(job.fileName)?.delete(onReady) }
}

function emitThumbReady(fileName: string, dataUrl: string): void {
  writeCachedThumb(fileName, dataUrl)
  thumbCallbacks.get(fileName)?.forEach((cb) => cb(dataUrl))
  thumbCallbacks.delete(fileName)
}

// ── Thumbnail capture scene (runs inside Canvas context) ──────────────────
function ThumbnailCaptureScene({
  job,
  onCaptured,
}: {
  job: ThumbJob
  onCaptured: (fileName: string, dataUrl: string) => void
}) {
  const { gl } = useThree()
  // useModelScene suspends via React Suspense until loaded — scene is always ready here
  const { scene } = useModelScene(job.modelUrl)
  const doneRef = useRef(false)

  const positioned = useMemo(() => {
    const clone = scene.clone(true)
    const box = new THREE.Box3().setFromObject(clone)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const scale = THUMBNAIL_MODEL_SCALE_BY_FILE[job.fileName] ?? 3.8
    if (maxDim > 0) clone.scale.setScalar(scale / maxDim)
    const rebox = new THREE.Box3().setFromObject(clone)
    const center = rebox.getCenter(new THREE.Vector3())
    const explicitSnap = SNAP_MESH_LABELS[job.fileName]
    const snapY = resolveGroundSnapY(clone, explicitSnap)
    clone.position.sub(center)
    clone.position.x += THUMBNAIL_MODEL_OFFSET_X + (THUMBNAIL_MODEL_OFFSET_X_BY_FILE[job.fileName] ?? 0)
    clone.position.y = -snapY + (THUMBNAIL_GROUND_OFFSET_BY_FILE[job.fileName] ?? job.groundOffsetY ?? 0)
    clone.rotation.y = THUMBNAIL_ROTATION_Y_BY_FILE[job.fileName] ?? 0
    return clone
  }, [scene, job])

  useEffect(() => {
    if (!positioned || doneRef.current) return
    doneRef.current = true
    const id = setTimeout(() => {
      const dataUrl = (() => {
        try {
          return gl.domElement.toDataURL('image/webp', 0.88)
        } catch {
          try {
            return gl.domElement.toDataURL('image/png')
          } catch {
            return job.fallbackSrc
          }
        }
      })()
      onCaptured(job.fileName, dataUrl)
    }, 600)
    return () => clearTimeout(id)
  }, [positioned, gl, job, onCaptured])

  if (!positioned) return null
  return <primitive object={positioned} />
}

// ── Thumbnail generator (single hidden Canvas, processes queue) ───────────
function ThumbnailGenerator() {
  const [currentJob, setCurrentJob] = useState<ThumbJob | null>(null)
  const processingRef = useRef(false)

  const advance = useCallback(() => {
    processingRef.current = false
    const next = thumbJobQueue.find((j) => readCachedThumb(j.fileName) === null)
    if (next) {
      processingRef.current = true
      setCurrentJob({ ...next })
    } else {
      setCurrentJob(null)
    }
  }, [])

  useEffect(() => {
    thumbQueueNotify = () => {
      if (processingRef.current) return
      advance()
    }
    thumbQueueNotify()
    return () => { thumbQueueNotify = null }
  }, [advance])

  const handleCaptured = useCallback((fileName: string, dataUrl: string) => {
    emitThumbReady(fileName, dataUrl)
    const idx = thumbJobQueue.findIndex((j) => j.fileName === fileName)
    if (idx >= 0) thumbJobQueue.splice(idx, 1)
    advance()
  }, [advance])

  if (!currentJob) return null

  return (
    <div style={{ position: 'fixed', left: '-1200px', top: 0, width: 512, height: 512, pointerEvents: 'none' }}>
      <Canvas
        key={currentJob.fileName}
        camera={{ position: [-2.2, 1.6, 3.8], fov: 36 }}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
        style={{ width: 512, height: 512 }}
      >
        <color attach="background" args={['#111111']} />
        <ambientLight intensity={3.0} color="#dde8ff" />
        <spotLight intensity={14} position={[-5, 8, 5]} angle={0.36} penumbra={0.2} distance={40} color="#ffffff" />
        <spotLight intensity={7} position={[6, 5, 3]} angle={0.55} penumbra={0.5} distance={32} color="#fff6e8" />
        <spotLight intensity={9} position={[0, 7, -9]} angle={0.4} penumbra={0.35} distance={36} color="#eef4ff" />
        <pointLight intensity={2.2} position={[0, -0.5, 1.5]} color="#7ab0dd" distance={12} />
        <Suspense fallback={null}>
          <ThumbnailCaptureScene job={currentJob} onCaptured={handleCaptured} />
        </Suspense>
        <NativeOrbitControls enabled={false} enableRotate={false} enableZoom={false} enablePan={false} target={[0.7, 0.55, 0]} />
      </Canvas>
    </div>
  )
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

function CarModel({ modelUrl, thumbnailModelUrl, fileName, groundOffsetY = 0 }: { modelUrl: string; thumbnailModelUrl?: string; fileName: string; groundOffsetY?: number }) {
  const effectiveModelUrl = thumbnailModelUrl ?? modelUrl
  const { scene } = useModelScene(effectiveModelUrl)
  const cloned = useMemo(() => {
    const clone = scene.clone(true)

    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    const box = new THREE.Box3().setFromObject(clone)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const scale = THUMBNAIL_MODEL_SCALE_BY_FILE[fileName] ?? 3.8
    if (maxDim > 0) clone.scale.setScalar(scale / maxDim)
    const rebox = new THREE.Box3().setFromObject(clone)
    const center = rebox.getCenter(new THREE.Vector3())
    const explicitSnapLabels = SNAP_MESH_LABELS[fileName]
    const snapY = resolveGroundSnapY(clone, explicitSnapLabels)
    clone.position.sub(center)
    clone.position.x += THUMBNAIL_MODEL_OFFSET_X + (THUMBNAIL_MODEL_OFFSET_X_BY_FILE[fileName] ?? 0)
    clone.position.y = -snapY
    clone.position.y += groundOffsetY
    clone.rotation.y = THUMBNAIL_ROTATION_Y_BY_FILE[fileName] ?? 0
    return clone
  }, [scene, fileName, groundOffsetY])
  return <primitive object={cloned} />
}

function CarThumbnail({
  modelUrl,
  thumbnailModelUrl,
  fileName,
  groundOffsetY,
  carName,
  staticMode,
}: {
  modelUrl: string
  thumbnailModelUrl?: string
  fileName: string
  groundOffsetY?: number
  carName: string
  staticMode: boolean
}) {
  const effectiveModelUrl = thumbnailModelUrl ?? modelUrl
  const generatedPreviewSrc = useMemo(
    () => buildStaticCarThumbnailDataUrl(carName, fileName),
    [carName, fileName],
  )
  // Always start with the SVG immediately — avoids 404 cascade from missing static files
  const [imageSrc, setImageSrc] = useState<string>(() => {
    if (staticMode) {
      const cached = readCachedThumb(fileName)
      if (cached) return cached
    }
    return generatedPreviewSrc
  })

  // In static mode: check sessionStorage, subscribe to generator for real car image
  useEffect(() => {
    if (!staticMode) return
    const cached = readCachedThumb(fileName)
    if (cached) return
    const unsub = enqueueThumb({ modelUrl: effectiveModelUrl, fileName, groundOffsetY, fallbackSrc: generatedPreviewSrc }, (dataUrl) => {
      setImageSrc(dataUrl)
    })
    return unsub
  }, [staticMode, fileName, effectiveModelUrl, groundOffsetY, generatedPreviewSrc])

  if (staticMode) {
    return (
      <div className="car-thumbnail-fallback" aria-hidden="true">
        <img
          className="car-thumbnail-fallback-image"
          src={imageSrc}
          alt={`${getDisplayCarName(carName)} thumbnail`}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      </div>
    )
  }

  return (
    <Canvas
      camera={{ position: [-2.2, 1.6, 3.8], fov: 36 }}
      gl={{ antialias: true, alpha: true }}
      style={{ width: '100%', height: '100%', borderRadius: 8, pointerEvents: 'none' }}
    >
      {/* Static showroom rig — fixed lights so gloss reflections are consistent */}
      <color attach="background" args={['#111111']} />
      {/* Generous ambient so every car color reads clearly */}
      <ambientLight intensity={3.0} color="#dde8ff" />
      {/* Key light — left-front high, sharp specular highlight */}
      <spotLight
        intensity={14}
        position={[-5, 8, 5]}
        angle={0.36}
        penumbra={0.2}
        distance={40}
        color="#ffffff"
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

      <Suspense fallback={null}>
        <CarModel
          modelUrl={modelUrl}
          thumbnailModelUrl={thumbnailModelUrl}
          fileName={fileName}
          groundOffsetY={THUMBNAIL_GROUND_OFFSET_BY_FILE[fileName] ?? groundOffsetY}
        />
      </Suspense>
      <NativeOrbitControls
        enabled={false}
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
  isGuest?: boolean
  onGuestSignIn?: () => void
}

export function CarSelectorPage({ onGoHome, onOpenProfile, onEnterEditor, isGuest = false, onGuestSignIn }: CarSelectorPageProps) {
  const selectCar = useEditorStore((state) => state.selectCar)
  const [useStaticThumbnails] = useState(() => shouldUseStaticSelectorThumbnails())
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => readStoredAvatarDataUrl())
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
  const [guestPrompt, setGuestPrompt] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const guestPromptTimerRef = useRef<number | null>(null)

  const showGuestPrompt = (feature: string) => {
    setGuestPrompt(`Create an account to use ${feature}.`)
    if (guestPromptTimerRef.current !== null) {
      window.clearTimeout(guestPromptTimerRef.current)
    }
    guestPromptTimerRef.current = window.setTimeout(() => {
      setGuestPrompt(null)
      guestPromptTimerRef.current = null
    }, 2800)
  }

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
          ? json.items
            .filter((item) => !HIDDEN_SELECTOR_MODELS.has(item.fileName.toLowerCase()))
            .filter((item) => !isExcludedSelectorCar(item))
          : []
        setPreloadedItems(visibleItems)

        const persistedImported = loadImportedCarsFromStorage()
        const importedMapped: CarManifestItem[] = persistedImported.map((item) => ({
          name: item.name,
          fileName: item.fileName,
          modelUrl: item.modelUrl,
        }))
        const visibleImported = importedMapped.filter((item) => !isExcludedSelectorCar(item))
        if (visibleImported.length !== importedMapped.length) {
          void saveImportedCarsToStorage(visibleImported.map((item) => ({
            name: item.name,
            fileName: item.fileName,
            modelUrl: item.modelUrl,
          })))
        }
        setImportedItems(visibleImported)

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
    if (isGuest) {
      showGuestPrompt('Import GLB')
      return
    }
    fileInputRef.current?.click()
  }

  const handleImportFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    if (isGuest) {
      showGuestPrompt('Import GLB')
      event.target.value = ''
      return
    }
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
        return !importedItems.some((existing) => existing.fileName.toLowerCase() === key) && !isExcludedSelectorCar(item)
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

  const handleSelectCar = (car: CarManifestItem) => {
    selectCar({
      name: car.name,
      modelUrl: car.modelUrl,
      groundOffsetY: car.groundOffsetY,
      realWorldLengthM: car.realWorldLengthM,
      realWorldWidthM: car.realWorldWidthM,
      realWorldHeightM: car.realWorldHeightM,
    })
    onEnterEditor?.()
  }

  useEffect(() => {
    return () => {
      if (guestPromptTimerRef.current !== null) {
        window.clearTimeout(guestPromptTimerRef.current)
      }
    }
  }, [])

  return (
    <section className="car-selector-page">
      {useStaticThumbnails && <ThumbnailGenerator />}
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
          <button
            type="button"
            className="top-card-btn"
            onClick={handleImportClick}
            title={isGuest ? 'Sign in to import GLB models' : 'Import GLB'}
          >
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
              <img
                src={avatarUrl}
                alt="Profile"
                className="top-profile-bubble-img"
                onError={() => {
                  localStorage.removeItem(PROFILE_AVATAR_KEY)
                  setAvatarUrl(null)
                }}
              />
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

      {isGuest && guestPrompt && (
        <div className="top-guest-prompt" role="status" aria-live="polite">
          <span>{guestPrompt}</span>
          <button type="button" className="top-guest-prompt-link" onClick={onGuestSignIn}>
            Sign In
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
              <CarThumbnail
                modelUrl={car.modelUrl}
                thumbnailModelUrl={getThumbnailModelUrl(car.fileName, car.modelUrl)}
                fileName={car.fileName}
                groundOffsetY={car.groundOffsetY}
                carName={car.name}
                staticMode={useStaticThumbnails}
              />
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
