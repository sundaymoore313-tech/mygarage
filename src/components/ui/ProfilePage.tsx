import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Camera, User } from 'lucide-react'
import { getPlanLabel, type NonGuestPlanTier } from '../../lib/access'
import { canUseBillingDevOverride, getBillingConfig, openStripeBillingPortal, startStripeCheckout } from '../../lib/billing'
import { readSavedProjects, removeSavedProject, SAVED_PROJECTS_UPDATED_EVENT, syncCloudProjectsToLocal, type SavedProjectCard } from '../../lib/savedProjects'
import { supabase, supabaseSignOut } from '../../lib/supabase'
import * as THREE from 'three'
import { DEFAULT_TARGET_PAINT, getMergedClassifications, getResolvedPaintForLabel } from '../../lib/paintTargets'
import { NativeOrbitControls } from '../scene/NativeOrbitControls'
import { useModelScene } from '../scene/useModelScene'
import type { MeshClass } from '../../types/editor'

type ProfilePageProps = {
  planTier: NonGuestPlanTier
  onPlanChange: (plan: NonGuestPlanTier) => void
  onRefreshPlan: () => Promise<NonGuestPlanTier | void>
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

function readStoredImageDataUrl(key: string) {
  try {
    const raw = localStorage.getItem(key)
    return raw && raw.startsWith('data:image/') ? raw : null
  } catch {
    return null
  }
}

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

function clearCachedAuth() {
  localStorage.removeItem(AUTH_LOCAL_KEY)
  sessionStorage.removeItem(AUTH_SESSION_KEY)
}

const CACHE_PREFIXES_SAFE = [
  'mygarage-classify-lock-',
  'mygarage-classify-lock-backup-',
  'mygarage-personal-classify-',
]

function getLocalStorageUsageKB(): number {
  let total = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i) ?? ''
    const val = localStorage.getItem(key) ?? ''
    total += key.length + val.length
  }
  // UTF-16 → bytes ×2, then →KB
  return Math.round((total * 2) / 1024)
}

function clearLocalCache(activeProjectIds: Set<string>): { keysRemoved: number; kbFreed: number } {
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    if (CACHE_PREFIXES_SAFE.some((p) => key.startsWith(p))) {
      toRemove.push(key)
    } else if (key.startsWith('mygarage-project-full-')) {
      const id = key.slice('mygarage-project-full-'.length)
      if (!activeProjectIds.has(id)) toRemove.push(key)
    }
  }
  let bytesFreed = 0
  for (const key of toRemove) {
    bytesFreed += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2
    localStorage.removeItem(key)
  }
  return { keysRemoved: toRemove.length, kbFreed: Math.round(bytesFreed / 1024) }
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
  const { scene } = useModelScene(modelUrl)
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
      shadows="percentage"
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
      <NativeOrbitControls enableRotate={false} enableZoom={false} enablePan={false} target={[0.7, 0.55, 0]} />
    </Canvas>
  )
}

export function ProfilePage({ planTier, onPlanChange, onRefreshPlan, onGoHome, onGoEditor, onOpenProject }: ProfilePageProps) {
  const [user] = useState<AuthUser | null>(() => readCurrentUser())
  const [billingConfig] = useState(() => getBillingConfig())
  const [billingNotice, setBillingNotice] = useState<string | null>(null)
  const [billingBusy, setBillingBusy] = useState<'checkout' | 'portal' | 'refresh' | null>(null)
  const [projects, setProjects] = useState<SavedProjectCard[]>(() => readSavedProjects())
  const [bannerUrl, setBannerUrl] = useState<string | null>(() => readStoredImageDataUrl(PROFILE_BANNER_KEY))
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => readStoredImageDataUrl(PROFILE_AVATAR_KEY))
  const [about, setAbout] = useState<string>(() => localStorage.getItem(PROFILE_ABOUT_KEY) ?? '')
  const [aboutEditing, setAboutEditing] = useState(false)
  const [aboutDraft, setAboutDraft] = useState('')
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [storageKB, setStorageKB] = useState<number>(() => getLocalStorageUsageKB())
  const [clearResult, setClearResult] = useState<string | null>(null)
  const canUseDevOverride = canUseBillingDevOverride()
  const [billingOpen, setBillingOpen] = useState(false)
  const billingDropdownRef = useRef<HTMLDivElement>(null)

  const initials = useMemo(() => {
    if (!user?.name) return 'MG'
    return user.name
      .split(' ')
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }, [user])

  useEffect(() => {
    let active = true

    const refreshProjects = async () => {
      if (!active) return
      setProjects(readSavedProjects())
      const result = await syncCloudProjectsToLocal()
      if (active && result.ok && result.count >= 0) {
        setProjects(readSavedProjects())
      }
    }

    const handleProjectsUpdated = () => {
      if (!active) return
      setProjects(readSavedProjects())
    }

    const handleWindowFocus = () => {
      void refreshProjects()
    }

    window.addEventListener(SAVED_PROJECTS_UPDATED_EVENT, handleProjectsUpdated)
    window.addEventListener('focus', handleWindowFocus)

    let subscription: { unsubscribe: () => void } | null = null
    if (supabase) {
      const authState = supabase.auth.onAuthStateChange(() => {
        void refreshProjects()
      })
      subscription = authState.data.subscription
    }

    void refreshProjects()

    return () => {
      active = false
      window.removeEventListener(SAVED_PROJECTS_UPDATED_EVENT, handleProjectsUpdated)
      window.removeEventListener('focus', handleWindowFocus)
      subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!billingOpen) return
    function handleOutsideClick(e: MouseEvent) {
      if (billingDropdownRef.current && !billingDropdownRef.current.contains(e.target as Node)) {
        setBillingOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [billingOpen])

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

  function handleClearCache() {
    const activeIds = new Set(projects.map((p) => p.id))
    const { keysRemoved, kbFreed } = clearLocalCache(activeIds)
    setStorageKB(getLocalStorageUsageKB())
    if (keysRemoved === 0) {
      setClearResult('Nothing to clear — cache is already clean.')
    } else {
      setClearResult(`Cleared ${keysRemoved} entr${keysRemoved === 1 ? 'y' : 'ies'}, freed ~${kbFreed} KB.`)
    }
    setTimeout(() => setClearResult(null), 4000)
  }

  async function handleLogout() {
    await supabaseSignOut()
    clearCachedAuth()
    onGoHome()
  }

  async function handleUpgradeClick() {
    setBillingBusy('checkout')
    const result = await startStripeCheckout()
    setBillingBusy(null)
    if (!result.ok) {
      setBillingNotice(result.error)
      return
    }
    setBillingNotice(null)
  }

  async function handlePortalClick() {
    setBillingBusy('portal')
    const result = await openStripeBillingPortal()
    setBillingBusy(null)
    if (!result.ok) {
      setBillingNotice(result.error)
      return
    }
    setBillingNotice(null)
  }

  async function handleRefreshPlanClick() {
    setBillingBusy('refresh')
    await onRefreshPlan()
    setBillingBusy(null)
    setBillingNotice('Billing status refreshed from Supabase.')
  }

  return (
    <div className="profile-page">
      <header className="profile-topbar">
        <div className="profile-topbar-left">
          <button type="button" className="profile-nav-btn" onClick={onGoHome}>
            Home
          </button>
          <button type="button" className="profile-nav-btn profile-nav-btn-primary" onClick={onGoEditor}>
            3D Editor
          </button>
        </div>
        <div className="profile-topbar-right">
          <div className="profile-bubble-wrap" ref={billingDropdownRef}>
            <button
              type="button"
              className="profile-top-bubble"
              onClick={() => setBillingOpen((v) => !v)}
              title="Account & Billing"
              aria-label="Account & Billing"
              aria-expanded={billingOpen}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="profile-top-bubble-img"
                  onError={() => {
                    localStorage.removeItem(PROFILE_AVATAR_KEY)
                    setAvatarUrl(null)
                  }}
                />
              ) : (
                <span className="profile-top-bubble-fallback">{initials}</span>
              )}
            </button>
            {billingOpen && (
              <div className="profile-billing-dropdown">
                <div className="profile-billing-dd-head">
                  <span>Account &amp; Billing</span>
                  <span className={`profile-plan-pill profile-plan-pill-${planTier}`}>{getPlanLabel(planTier)}</span>
                </div>
                <p className="profile-billing-dd-desc">
                  Paid unlocks Create a Logo, 2D editor, GLB export, print export, SVG export, and video recording.
                </p>
                <div className="profile-billing-actions">
                  <button type="button" className="profile-billing-primary" onClick={() => { void handleUpgradeClick() }} disabled={billingBusy !== null}>
                    {billingBusy === 'checkout' ? 'Opening Checkout...' : planTier === 'paid' ? 'Open Checkout Again' : 'Upgrade with Stripe'}
                  </button>
                  <button type="button" className="profile-billing-secondary" onClick={() => { void handlePortalClick() }} disabled={billingBusy !== null}>
                    {billingBusy === 'portal' ? 'Opening Billing...' : 'Manage Billing'}
                  </button>
                  <button type="button" className="profile-billing-secondary" onClick={() => { void handleRefreshPlanClick() }} disabled={billingBusy !== null}>
                    {billingBusy === 'refresh' ? 'Refreshing...' : 'Refresh Status'}
                  </button>
                </div>
                <div className="profile-billing-meta">
                  <span>{billingConfig.configured ? 'Stripe configured' : 'Stripe not configured'}</span>
                  {billingConfig.supportEmail ? <span>Support: {billingConfig.supportEmail}</span> : null}
                </div>
                {billingNotice && <p className="profile-plan-note">{billingNotice}</p>}
                <p className="profile-plan-note">
                  Paid access is cached on this device until Stripe webhook sync is active.
                </p>
                {canUseDevOverride && (
                  <div className="profile-dev-override">
                    <div className="profile-dev-override-head">
                      <strong>Local Billing Override</strong>
                      <span>Localhost only — for testing before webhook sync exists.</span>
                    </div>
                    <div className="profile-dev-override-actions">
                      <button
                        type="button"
                        className={planTier === 'free' ? 'profile-dev-plan-btn active' : 'profile-dev-plan-btn'}
                        onClick={() => onPlanChange('free')}
                      >
                        Force Free
                      </button>
                      <button
                        type="button"
                        className={planTier === 'paid' ? 'profile-dev-plan-btn active' : 'profile-dev-plan-btn'}
                        onClick={() => onPlanChange('paid')}
                      >
                        Force Paid
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <button type="button" className="profile-nav-btn" onClick={handleLogout}>
            Log Out
          </button>
        </div>
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
              <img
                src={avatarUrl}
                alt="Profile"
                className="profile-avatar-img"
                onError={() => {
                  localStorage.removeItem(PROFILE_AVATAR_KEY)
                  setAvatarUrl(null)
                }}
              />
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

      <section className="profile-storage-section">
        <div className="profile-storage-head">
          <h3>Local Storage</h3>
          <span className="profile-storage-usage">{storageKB} KB used</span>
        </div>
        <p className="profile-storage-desc">
          Clears cached color classifications and orphaned project data. Your saved projects, auth, and profile info are kept.
        </p>
        <div className="profile-storage-row">
          <button type="button" className="profile-clear-cache-btn" onClick={handleClearCache}>
            Clear Cache
          </button>
          {clearResult && <span className="profile-clear-result">{clearResult}</span>}
        </div>
      </section>
    </div>
  )
}
