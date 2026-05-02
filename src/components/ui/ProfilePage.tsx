import { Suspense, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { Camera, User } from 'lucide-react'
import { readSavedProjects, removeSavedProject, type SavedProjectCard } from '../../lib/savedProjects'
import * as THREE from 'three'
import { DEFAULT_TARGET_PAINT, getMergedClassifications, getResolvedPaintForLabel } from '../../lib/paintTargets'
import type { MeshClass } from '../../types/editor'

type ProfilePageProps = {
  onGoHome: () => void
  onGoEditor: () => void
  onOpenProject: (id: string) => void
}

type AuthUser = {
  name: string
  email: string
}

const AUTH_LOCAL_KEY = 'mygarage-auth-local'
const AUTH_SESSION_KEY = 'mygarage-auth-session'
const PROFILE_BANNER_KEY = 'mygarage-profile-banner'
const PROFILE_AVATAR_KEY = 'mygarage-profile-avatar'
const PROFILE_ABOUT_KEY = 'mygarage-profile-about'

function readCurrentUser(): AuthUser | null {
  try {
    const local = localStorage.getItem(AUTH_LOCAL_KEY)
    if (local) return JSON.parse(local) as AuthUser
    const session = sessionStorage.getItem(AUTH_SESSION_KEY)
    if (session) return JSON.parse(session) as AuthUser
    return null
  } catch {
    return null
  }
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const PROFILE_GROUND_SNAP_EXCLUDE_TOKENS = [
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

const PROFILE_SNAP_MESH_LABELS: Record<string, string[]> = {
  'jeep_grand_cherokee_trackhawk.glb': ['Object 42'],
  'chrysler_300_srt_hellcat.glb': ['Object_18'],
}

const PROFILE_THUMBNAIL_ROTATION_Y_BY_FILE: Record<string, number> = {
  '2018_ford_mustang_gt.glb': Math.PI,
}

function getClassificationForLabel(
  classifications: Record<string, MeshClass>,
  label: string,
) {
  const direct = classifications[label]
  if (direct !== undefined) {
    return direct
  }

  const underscoreVariant = label.replace(/\s+/g, '_')
  const spacedVariant = label.replace(/_/g, ' ')
  return classifications[underscoreVariant] ?? classifications[spacedVariant]
}

function resolveGroundSnapY(root: THREE.Object3D, explicitSnapLabels?: string[]): number {
  let globalMinY = Number.POSITIVE_INFINITY
  let filteredMinY = Number.POSITIVE_INFINITY
  let wheelMinY = Number.POSITIVE_INFINITY

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

    const isExcluded = PROFILE_GROUND_SNAP_EXCLUDE_TOKENS.some((token) => label.includes(token))
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
    }
  })

  if (Number.isFinite(wheelMinY)) {
    return wheelMinY
  }
  if (Number.isFinite(filteredMinY)) {
    return filteredMinY
  }
  if (Number.isFinite(globalMinY)) {
    return globalMinY
  }
  return 0
}

function ProfileCarModel({ modelUrl, fileName, groundOffsetY = 0, paintColorHex }: { modelUrl: string; fileName: string; groundOffsetY?: number; paintColorHex: string }) {
  const { scene } = useGLTF(modelUrl)
  const cloned = useMemo(() => {
    const clone = scene.clone(true)
    const mergedClassifications = getMergedClassifications(fileName, {})
    const thumbnailPaint = {
      ...DEFAULT_TARGET_PAINT,
      colorHex: paintColorHex,
      colorRef: null,
    }

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

        const shouldKeepOriginal = classify === 'excluded' || classify === 'window'
        const shouldUseThumbnailPaint = classify === 'paintable'
        const shouldUseAutoResolvedPaint = classify === undefined && resolvedPaint !== fallbackPaint

        if (!shouldKeepOriginal && (shouldUseThumbnailPaint || shouldUseAutoResolvedPaint)) {
          const paintToUse = shouldUseThumbnailPaint ? thumbnailPaint : resolvedPaint
          next.color.set(paintToUse.colorHex)
          next.metalness = paintToUse.metallic
          next.roughness = paintToUse.roughness
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
        const meshLabel = child.name || ''
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
    const explicitSnapLabels = PROFILE_SNAP_MESH_LABELS[fileName]
    const snapY = resolveGroundSnapY(clone, explicitSnapLabels)

    clone.position.sub(center)
    clone.position.y = -snapY
    clone.position.y += groundOffsetY
    clone.rotation.y = PROFILE_THUMBNAIL_ROTATION_Y_BY_FILE[fileName] ?? 0
    return clone
  }, [scene, fileName, groundOffsetY, paintColorHex])

  return <primitive object={cloned} />
}

function ProfileCarThumbnail({ modelUrl, fileName, groundOffsetY, paintColorHex }: { modelUrl: string; fileName: string; groundOffsetY?: number; paintColorHex: string }) {
  return (
    <Canvas
      camera={{ position: [-2.8, 2.0, 4.8], fov: 34 }}
      shadows
      gl={{ antialias: true, alpha: true }}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#141414']} />
      <hemisphereLight intensity={1.35} color="#f5f8ff" groundColor="#5e7098" />
      <ambientLight intensity={0.9} color="#ffffff" />
      <spotLight
        castShadow
        intensity={3.6}
        position={[-6, 7, 6]}
        angle={0.5}
        penumbra={0.45}
        distance={30}
        color="#ffffff"
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <spotLight intensity={2.8} position={[6, 4, 2]} angle={0.6} penumbra={0.5} distance={24} color="#eef4ff" />
      <pointLight intensity={1.7} position={[0, -0.9, 2]} color="#9bb6e9" distance={11} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.05, 0]} receiveShadow>
        <circleGeometry args={[4.8, 64]} />
        <shadowMaterial transparent opacity={0.11} />
      </mesh>
      <Suspense fallback={null}>
        <ProfileCarModel modelUrl={modelUrl} fileName={fileName} groundOffsetY={groundOffsetY} paintColorHex={paintColorHex} />
      </Suspense>
      <OrbitControls enableRotate={false} enableZoom={false} enablePan={false} target={[0.7, 0.55, 0]} />
    </Canvas>
  )
}

export function ProfilePage({ onGoHome, onGoEditor, onOpenProject }: ProfilePageProps) {
  const [user] = useState<AuthUser | null>(() => readCurrentUser())
  const [projects, setProjects] = useState<SavedProjectCard[]>(() => readSavedProjects())
  const [bannerUrl, setBannerUrl] = useState<string | null>(() => localStorage.getItem(PROFILE_BANNER_KEY))
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => localStorage.getItem(PROFILE_AVATAR_KEY))
  const [about, setAbout] = useState<string>(() => localStorage.getItem(PROFILE_ABOUT_KEY) ?? '')
  const [aboutEditing, setAboutEditing] = useState(false)
  const [aboutDraft, setAboutDraft] = useState('')
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const initials = useMemo(() => {
    if (!user?.name) return 'MG'
    return user.name
      .split(' ')
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }, [user])

  function readFileAsDataUrl(file: File, onDone: (url: string) => void) {
    const reader = new FileReader()
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : null
      if (!url) return
      onDone(url)
    }
    reader.readAsDataURL(file)
  }

  function handleBannerPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    readFileAsDataUrl(file, (url) => {
      localStorage.setItem(PROFILE_BANNER_KEY, url)
      setBannerUrl(url)
    })
    e.target.value = ''
  }

  function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    readFileAsDataUrl(file, (url) => {
      localStorage.setItem(PROFILE_AVATAR_KEY, url)
      setAvatarUrl(url)
    })
    e.target.value = ''
  }

  function handleAboutSave() {
    const trimmed = aboutDraft.trim()
    localStorage.setItem(PROFILE_ABOUT_KEY, trimmed)
    setAbout(trimmed)
    setAboutEditing(false)
  }

  function handleAboutEdit() {
    setAboutDraft(about)
    setAboutEditing(true)
  }

  function handleRemoveProject(id: string) {
    removeSavedProject(id)
    setProjects(readSavedProjects())
  }

  return (
    <div className="profile-page">
      <header className="profile-topbar">
        <button type="button" className="profile-nav-btn" onClick={onGoHome}>
          Home
        </button>
        <button type="button" className="profile-nav-btn profile-nav-btn-primary" onClick={onGoEditor}>
          3D Editor
        </button>
      </header>

      <section className="profile-hero">
        <div
          className="profile-banner"
          style={bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : undefined}
        >
          {!bannerUrl && <div className="profile-banner-fallback" />}
          <button type="button" className="profile-banner-btn" onClick={() => bannerInputRef.current?.click()}>
            <Camera size={14} /> Change Banner
          </button>
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleBannerPick}
          />
        </div>

        <div className="profile-meta-wrap">
          <div className="profile-avatar-wrap">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" className="profile-avatar-img" />
            ) : (
              <div className="profile-avatar-fallback">{initials || <User size={22} />}</div>
            )}
            <button type="button" className="profile-avatar-btn" onClick={() => avatarInputRef.current?.click()}>
              <Camera size={12} />
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarPick}
            />
          </div>

          <div className="profile-user-text">
            <h2 className="profile-user-name">{user?.name ?? 'Guest User'}</h2>
            <p>{user?.email ?? 'Log in to personalize your profile'}</p>
          </div>
        </div>
      </section>

      <section className="profile-about-section">
        <div className="profile-about-head">
          <h3>About Me</h3>
          {!aboutEditing && (
            <button type="button" className="profile-about-edit-btn" onClick={handleAboutEdit}>
              {about ? 'Edit' : '+ Add'}
            </button>
          )}
        </div>
        {aboutEditing ? (
          <div className="profile-about-editor">
            <textarea
              className="profile-about-textarea"
              value={aboutDraft}
              onChange={(e) => setAboutDraft(e.target.value)}
              placeholder="Tell others about yourself…"
              maxLength={500}
              autoFocus
            />
            <div className="profile-about-actions">
              <span className="profile-about-count">{aboutDraft.length}/500</span>
              <button type="button" className="profile-about-cancel" onClick={() => setAboutEditing(false)}>Cancel</button>
              <button type="button" className="profile-about-save" onClick={handleAboutSave}>Save</button>
            </div>
          </div>
        ) : (
          <p className="profile-about-text">
            {about || <span className="profile-about-empty">No bio yet. Click &ldquo;+ Add&rdquo; to write one.</span>}
          </p>
        )}
      </section>

      <section className="profile-projects-section">
        <div className="profile-projects-head">
          <h2>Saved Projects</h2>
          <span>{projects.length} total</span>
        </div>

        {projects.length === 0 ? (
          <div className="profile-empty">No saved projects yet. Save a project from File -&gt; Add to Profile, then it will appear here.</div>
        ) : (
          <div className="profile-project-grid">
            {projects.map((p) => (
              <article key={p.id} className="profile-project-card">
                {p.previewImageUrl ? (
                  <div className="profile-project-visual profile-project-image-wrap">
                    <img
                      className="profile-project-image"
                      src={p.previewImageUrl}
                      alt={`${p.name} preview`}
                      loading="lazy"
                    />
                  </div>
                ) : p.modelUrl ? (
                  <div className="profile-project-visual">
                    <ProfileCarThumbnail
                      modelUrl={p.modelUrl}
                      fileName={p.modelUrl.split('/').pop() ?? ''}
                      groundOffsetY={p.groundOffsetY}
                      paintColorHex={p.paintColorHex}
                    />
                  </div>
                ) : (
                  <div className="profile-project-swatch" style={{ background: p.paintColorHex }} />
                )}
                <div className="profile-project-body">
                  <h3 title={p.name}>{p.name}</h3>
                  {p.carName && <p className="profile-project-car">{p.carName}</p>}
                  <p>Updated {fmtTime(p.updatedAt)}</p>
                  <div className="profile-project-meta">
                    <span>{p.layerCount} layers</span>
                    <span>{p.customDecalCount} decals</span>
                  </div>
                </div>
                <div className="profile-project-actions">
                  <button
                    type="button"
                    className="profile-project-open"
                    onClick={() => onOpenProject(p.id)}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="profile-project-remove"
                    onClick={() => handleRemoveProject(p.id)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
