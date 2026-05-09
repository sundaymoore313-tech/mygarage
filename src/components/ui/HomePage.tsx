import { useState, useEffect, useRef } from 'react'
import { Layers, Type, Car, Paintbrush, Download, Pen, Star, Undo2, Image, Printer, SunDim, Columns2 } from 'lucide-react'
import { HeroCarScene } from '../scene/HeroCarScene'
import { isSupabaseConfigured, supabaseSignIn, supabaseSignOut, supabaseSignUp, supabase } from '../../lib/supabase'
import { LegalDocsModal } from './LegalDocsModal'

type HomePageProps = {
  onEnter: () => void
  onOpenProfile: () => void
  onContinueAsGuest?: () => void
  onLikelyEditorPathVisible?: () => void
  onLikelyEditorPathIntent?: () => void
  heroModelUrl?: string
  heroPreviewImageUrl?: string
}

type AuthMode = 'login' | 'signup'
type LegalDocId = 'terms' | 'privacy' | 'acceptable'

type AuthUser = {
  name: string
  email: string
}

// These localStorage keys keep TopBar/ProfilePage working without changes.
// Supabase session is the source of truth; we mirror name+email here for fast reads.
const AUTH_LOCAL_KEY = 'mygarage-auth-local'
const AUTH_SESSION_KEY = 'mygarage-auth-session'
const AUTH_REMEMBER_KEY = 'mygarage-auth-remember'
const LEGAL_ACCEPTANCE_KEY = 'mygarage-legal-accepted-v1'
const PROFILE_AVATAR_KEY = 'mygarage-profile-avatar'

function readStoredAvatarDataUrl() {
  try {
    const raw = localStorage.getItem(PROFILE_AVATAR_KEY)
    return raw && raw.startsWith('data:image/') ? raw : null
  } catch {
    return null
  }
}

function isRememberedUser(): boolean {
  return localStorage.getItem(AUTH_LOCAL_KEY) !== null || sessionStorage.getItem(AUTH_SESSION_KEY) !== null
}

function readRememberPreference(defaultValue = true): boolean {
  const saved = localStorage.getItem(AUTH_REMEMBER_KEY)
  if (saved === '0') return false
  if (saved === '1') return true
  return defaultValue
}

const FEATURES = [
  {
    icon: <Car size={22} />,
    title: '3D Car Editor',
    desc: 'Load real-scale GLB models and customize every panel in a live 3D viewport.',
  },
  {
    icon: <Paintbrush size={22} />,
    title: 'Paint & Decals',
    desc: 'Project decals and stripes directly onto geometry with full UV control.',
  },
  {
    icon: <Columns2 size={22} />,
    title: 'Racing Stripes & Split Paint',
    desc: 'Add racing stripes, two-tone split paint, and gradient fills across any panel combination.',
  },
  {
    icon: <SunDim size={22} />,
    title: 'Window Tinting',
    desc: 'Dial in any tint shade on all windows with a real-time preview.',
  },
  {
    icon: <Image size={22} />,
    title: 'Print Layers',
    desc: 'Apply tiled image prints to the full car, hood or trunk with scale, opacity and tint controls.',
  },
  {
    icon: <Pen size={22} />,
    title: 'Create a Logo',
    desc: 'Draw logos and graphics from scratch with shapes, text, pen paths and a full layer stack.',
  },
  {
    icon: <Layers size={22} />,
    title: 'Layer System',
    desc: 'Non-destructive layers with visibility, lock, drag-to-reorder and grouping.',
  },
  {
    icon: <Type size={22} />,
    title: 'Text Library',
    desc: '18 custom fonts, bold, italic, multi-line, live inline editing on the canvas.',
  },
  {
    icon: <Star size={22} />,
    title: 'Shape Library',
    desc: 'Rectangles, circles, triangles, stars, arrows, freehand paths — all vectorized.',
  },
  {
    icon: <Printer size={22} />,
    title: 'Export',
    desc: 'Download final artwork as PNG, SVG, or share directly as a social card.',
  },
  {
    icon: <Download size={22} />,
    title: 'Import Your Own Car',
    desc: 'Drop in any GLB file and classify meshes yourself — paint, rims, glass and more.',
  },
  {
    icon: <Undo2 size={22} />,
    title: 'Full Undo/Redo',
    desc: 'Deep 80-step history stack across the 3D editor and Create a Logo.',
  },
]

const TAGLINES = [
  'Design. Build. Drive.',
  'Your ride, your rules.',
  'From blank canvas to showstopper.',
  'Make it yours.',
]

const LEGAL_NOTICE_ITEMS = [
  'Vehicle brand names, model names, logos, and trade dress shown in or with this tool are trademarks of their respective owners. MyGarage is an independent design platform and is not affiliated with or endorsed by those owners.',
  'You retain ownership of your original content. You may only upload, trace, reproduce, or export content that you own or are legally authorized to use.',
  'Do not upload or export infringing content, including unlicensed logos, copyrighted artwork, fonts, photos, templates, and other protected assets.',
  'Commercial printing, installation, advertising, and resale may require written licenses or permissions from trademark and copyright holders. Rights clearance is solely your responsibility.',
  '3D models, templates, and imported assets may be governed by separate third-party licenses. Review and comply with those license terms before client or commercial use.',
  'Output files are generated from user-provided content and settings. You are responsible for final review, legal compliance, and print-production suitability before release.',
  'MyGarage does not provide legal advice. If rights status is unclear, consult qualified legal counsel before publishing, printing, or selling output.',
]

const DEFAULT_DISCORD_URL = 'https://discord.gg/mygaragewrapstudio'
const CASHAPP_TAG = '$sundaymoore9'
const CASHAPP_SUPPORT_URL = 'https://cash.app/$sundaymoore9'

function cacheAuthLocally(user: AuthUser, remember: boolean) {
  const value = JSON.stringify(user)
  localStorage.setItem(AUTH_REMEMBER_KEY, remember ? '1' : '0')
  if (remember) {
    localStorage.setItem(AUTH_LOCAL_KEY, value)
    sessionStorage.removeItem(AUTH_SESSION_KEY)
  } else {
    sessionStorage.setItem(AUTH_SESSION_KEY, value)
    localStorage.removeItem(AUTH_LOCAL_KEY)
  }
}

function readCachedAuth(): AuthUser | null {
  try {
    const fromLocal = localStorage.getItem(AUTH_LOCAL_KEY)
    if (fromLocal) return JSON.parse(fromLocal) as AuthUser
    const fromSession = sessionStorage.getItem(AUTH_SESSION_KEY)
    if (fromSession) return JSON.parse(fromSession) as AuthUser
    return null
  } catch {
    return null
  }
}

function clearCachedAuth() {
  localStorage.removeItem(AUTH_LOCAL_KEY)
  sessionStorage.removeItem(AUTH_SESSION_KEY)
  localStorage.removeItem(AUTH_REMEMBER_KEY)
}

export function HomePage({ onEnter, onOpenProfile, onContinueAsGuest, onLikelyEditorPathVisible, onLikelyEditorPathIntent, heroModelUrl, heroPreviewImageUrl }: HomePageProps) {
  const [taglineIdx, setTaglineIdx] = useState(0)
  const [fading, setFading] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(() => readRememberPreference(true))
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [authConfirmPending, setAuthConfirmPending] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => readStoredAvatarDataUrl())
  const [legalDoc, setLegalDoc] = useState<LegalDocId>('terms')
  const [legalOpen, setLegalOpen] = useState(false)
  const [legalAccepted, setLegalAccepted] = useState(() => localStorage.getItem(LEGAL_ACCEPTANCE_KEY) === '1')
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => readCachedAuth())
  const [carCount, setCarCount] = useState(12)
  const [fontCount, setFontCount] = useState(49)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [heroOverlayAlpha, setHeroOverlayAlpha] = useState(0.16)
  const discordCommunityUrl = (
    (import.meta.env.VITE_DISCORD_PERMANENT_INVITE_URL as string | undefined)?.trim() ||
    (import.meta.env.VITE_DISCORD_INVITE_URL as string | undefined)?.trim() ||
    DEFAULT_DISCORD_URL
  )
  const drawerRef = useRef<HTMLDivElement | null>(null)
  const drawerTriggerRef = useRef<HTMLButtonElement | null>(null)
  const heroCtaRef = useRef<HTMLDivElement | null>(null)
  const primaryCtaRef = useRef<HTMLButtonElement | null>(null)
  const lowerCtaRef = useRef<HTMLButtonElement | null>(null)
  const touchStartYRef = useRef<number | null>(null)

  function openDrawer() {
    setDrawerOpen(true)
  }
  function closeDrawer() {
    setDrawerOpen(false)
  }
  function toggleDrawer() {
    setDrawerOpen((open) => !open)
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setTaglineIdx((i) => (i + 1) % TAGLINES.length)
        setFading(false)
      }, 400)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false)
    }

    function onPointerDown(e: PointerEvent) {
      if (!drawerOpen) return
      const target = e.target as Node | null
      if (!target) return
      if (drawerRef.current?.contains(target)) return
      if (drawerTriggerRef.current?.contains(target)) return
      setDrawerOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [drawerOpen])

  useEffect(() => {
    const sampleBrightness = () => {
      const canvas = document.querySelector<HTMLCanvasElement>('.hero-car-canvas')
      if (!canvas || canvas.width === 0 || canvas.height === 0) return

      const probe = document.createElement('canvas')
      const probeW = 42
      const probeH = 24
      probe.width = probeW
      probe.height = probeH
      const ctx = probe.getContext('2d')
      if (!ctx) return

      const srcW = Math.max(1, Math.floor(canvas.width * 0.22))
      const srcH = Math.max(1, Math.floor(canvas.height * 0.2))
      const srcX = Math.max(0, Math.floor(canvas.width * 0.39))
      const srcY = Math.max(0, Math.floor(canvas.height * 0.24))

      try {
        ctx.drawImage(canvas, srcX, srcY, srcW, srcH, 0, 0, probeW, probeH)
        const { data } = ctx.getImageData(0, 0, probeW, probeH)
        let total = 0
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i] / 255
          const g = data[i + 1] / 255
          const b = data[i + 2] / 255
          total += 0.2126 * r + 0.7152 * g + 0.0722 * b
        }
        const avg = total / (data.length / 4)
        const targetAlpha = Math.min(0.26, Math.max(0.08, 0.22 - avg * 0.16))
        setHeroOverlayAlpha((prev) => prev * 0.7 + targetAlpha * 0.3)
      } catch {
        // Ignore transient canvas read errors while WebGL frame is initializing.
      }
    }

    sampleBrightness()
    const id = window.setInterval(sampleBrightness, 1300)
    return () => window.clearInterval(id)
  }, [])

  function handleTouchStart(e: React.TouchEvent) {
    touchStartYRef.current = e.touches[0]?.clientY ?? null
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const startY = touchStartYRef.current
    touchStartYRef.current = null
    if (startY === null) return
    const endY = e.changedTouches[0]?.clientY ?? startY
    const dy = endY - startY
    if (dy <= -26) setDrawerOpen(true)
    if (dy >= 34) setDrawerOpen(false)
  }

  // Sync Supabase session on mount (handles page refresh with an active session).
  useEffect(() => {
    if (!supabase) return
    const client = supabase
    client.auth.getSession().then(({ data }) => {
      const user = data.session?.user
      if (user && !currentUser) {
        const synced: AuthUser = {
          name: (user.user_metadata?.name as string | undefined) ?? user.email?.split('@')[0] ?? 'User',
          email: user.email ?? '',
        }
        setCurrentUser(synced)
        cacheAuthLocally(synced, readRememberPreference(true))
      }
    })

    const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        const { data } = await client.auth.getSession()
        if (data.session?.user) {
          const u = data.session.user
          const synced: AuthUser = {
            name: (u.user_metadata?.name as string | undefined) ?? u.email?.split('@')[0] ?? 'User',
            email: u.email ?? '',
          }
          setCurrentUser(synced)
          cacheAuthLocally(synced, readRememberPreference(true))
          return
        }
        clearCachedAuth()
        setCurrentUser(null)
      } else if (session?.user) {
        const u = session.user
        const synced: AuthUser = {
          name: (u.user_metadata?.name as string | undefined) ?? u.email?.split('@')[0] ?? 'User',
          email: u.email ?? '',
        }
        setCurrentUser(synced)
        cacheAuthLocally(synced, readRememberPreference(true))
      }
    })

    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [carsRes, fontsRes] = await Promise.all([
          fetch('/models/manifest.json'),
          fetch('/fonts/manifest.json'),
        ])

        if (carsRes.ok) {
          const carsData = await carsRes.json() as { items?: unknown[] }
          if (!cancelled && Array.isArray(carsData.items) && carsData.items.length > 0) {
            setCarCount(carsData.items.length)
          }
        }

        if (fontsRes.ok) {
          const fontsData = await fontsRes.json() as { items?: unknown[] }
          if (!cancelled && Array.isArray(fontsData.items) && fontsData.items.length > 0) {
            setFontCount(fontsData.items.length)
          }
        }
      } catch {
        // Keep baked fallback stats when manifests are unavailable.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const target = heroCtaRef.current
    if (!target || !onLikelyEditorPathVisible) return

    let fired = false
    const observer = new IntersectionObserver((entries) => {
      if (fired) return
      if (entries.some((entry) => entry.isIntersecting)) {
        fired = true
        onLikelyEditorPathVisible()
        observer.disconnect()
      }
    }, { threshold: 0.55 })

    observer.observe(target)
    return () => observer.disconnect()
  }, [onLikelyEditorPathVisible])

  useEffect(() => {
    if (!onLikelyEditorPathIntent) return

    let fired = false
    const onIntent = () => {
      if (fired) return
      fired = true
      onLikelyEditorPathIntent()
    }
    const options: AddEventListenerOptions = { passive: true }
    const targets = [primaryCtaRef.current, lowerCtaRef.current].filter(Boolean) as HTMLButtonElement[]

    targets.forEach((target) => {
      target.addEventListener('pointerenter', onIntent, options)
      target.addEventListener('pointerdown', onIntent, options)
      target.addEventListener('touchstart', onIntent, options)
      target.addEventListener('focus', onIntent)
    })

    return () => {
      targets.forEach((target) => {
        target.removeEventListener('pointerenter', onIntent)
        target.removeEventListener('pointerdown', onIntent)
        target.removeEventListener('touchstart', onIntent)
        target.removeEventListener('focus', onIntent)
      })
    }
  }, [onLikelyEditorPathIntent])

  function openAuth(mode: AuthMode) {
    setAuthMode(mode)
    setAuthError(null)
    setAuthConfirmPending(false)
    setAuthOpen(true)
  }

  function openLegal(doc: LegalDocId) {
    setLegalDoc(doc)
    setLegalOpen(true)
  }

  function resetForm() {
    setName('')
    setEmail('')
    setPassword('')
    setRememberMe(readRememberPreference(true))
    setAuthError(null)
  }

  function closeAuth() {
    setAuthOpen(false)
    resetForm()
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAuthError(null)
    setAuthConfirmPending(false)

    if (!isSupabaseConfigured) {
      setAuthError('Auth is not configured yet. Add your Supabase credentials to .env.local and restart the dev server.')
      return
    }

    const safeName = name.trim()
    const safeEmail = email.trim().toLowerCase()
    const safePassword = password.trim()

    if (!safeEmail || !safePassword) {
      setAuthError('Email and password are required.')
      return
    }
    if (!legalAccepted) {
      setAuthError('Please accept the Terms, Privacy, and Acceptable Use notice to continue.')
      return
    }

    setAuthLoading(true)
    try {
      if (authMode === 'signup') {
        if (!safeName) { setAuthError('Name is required for sign up.'); return }
        const result = await supabaseSignUp(safeEmail, safePassword, safeName)
        if (!result.ok) { setAuthError(result.error); return }
        if (result.needsConfirmation) {
          setAuthConfirmPending(true)
          return
        }
        cacheAuthLocally({ name: result.user.name, email: result.user.email }, rememberMe)
        localStorage.setItem(LEGAL_ACCEPTANCE_KEY, '1')
        setCurrentUser({ name: result.user.name, email: result.user.email })
        closeAuth()
        return
      }

      const result = await supabaseSignIn(safeEmail, safePassword)
      if (!result.ok) { setAuthError(result.error); return }
      cacheAuthLocally({ name: result.user.name, email: result.user.email }, rememberMe)
      localStorage.setItem(LEGAL_ACCEPTANCE_KEY, '1')
      setCurrentUser({ name: result.user.name, email: result.user.email })
      closeAuth()
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleLogout() {
    await supabaseSignOut()
    clearCachedAuth()
    setCurrentUser(null)
  }

  const cloudStatus = !isSupabaseConfigured
    ? { label: 'Local Mode', tone: 'warn' as const }
    : currentUser
      ? { label: 'Cloud Sync Active', tone: 'ok' as const }
      : { label: 'Sign In For Cloud Backup', tone: 'neutral' as const }

  return (
    <div className="home-page">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="home-hero">
        <div className="home-hero-bg" aria-hidden="true">
          <HeroCarScene modelUrl={heroModelUrl} />
          {heroPreviewImageUrl ? (
            <img className="home-hero-preview-image" src={heroPreviewImageUrl} alt="Latest saved project preview" />
          ) : null}
        </div>
        <div className="home-hero-readability" aria-hidden="true" style={{ '--hero-readability-alpha': heroOverlayAlpha } as React.CSSProperties} />

        <div className="home-auth-actions">
          <div className="home-auth-actions-row">
            {currentUser ? (
              <>
                <button type="button" className="home-avatar-bubble" onClick={onOpenProfile} aria-label="Open profile">
                  {(() => {
                    if (avatarUrl) {
                      return (
                        <img
                          src={avatarUrl}
                          alt={currentUser.name}
                          className="home-avatar-img"
                          onError={() => {
                            localStorage.removeItem(PROFILE_AVATAR_KEY)
                            setAvatarUrl(null)
                          }}
                        />
                      )
                    }
                    const initials = currentUser.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
                    return <span className="home-avatar-initials">{initials}</span>
                  })()}
                </button>
                <button type="button" className="home-auth-btn" onClick={handleLogout}>Log Out</button>
              </>
            ) : (
              <>
                <button type="button" className="home-auth-btn" onClick={() => openAuth('login')}>Log In</button>
                <button type="button" className="home-auth-btn primary" onClick={() => openAuth('signup')}>Sign Up</button>
              </>
            )}
          </div>
          <span className={`home-cloud-pill home-cloud-pill-${cloudStatus.tone}`}>{cloudStatus.label}</span>
        </div>

        <div className="home-hero-stats-bar">
          <div className="home-stat">
            <span className="home-stat-num">{carCount}</span>
            <span className="home-stat-label">Built-in Cars</span>
          </div>
          <div className="home-stat-divider" />
          <div className="home-stat">
            <span className="home-stat-num">{fontCount}</span>
            <span className="home-stat-label">Fonts</span>
          </div>
          <div className="home-stat-divider" />
          <div className="home-stat">
            <span className="home-stat-num">7</span>
            <span className="home-stat-label">Shape types</span>
          </div>
          <div className="home-stat-divider" />
          <div className="home-stat">
            <span className="home-stat-num">80</span>
            <span className="home-stat-label">Undo steps</span>
          </div>
          <div className="home-stat-divider" />
          <div className="home-stat">
            <span className="home-stat-num">100%</span>
            <span className="home-stat-label">In-browser</span>
          </div>
        </div>

        <div className="home-hero-content">
          <h1 className="home-title">
            My<span className="home-title-accent">Garage</span>
          </h1>
          <p className={`home-tagline${fading ? ' fade-out' : ''}`}>
            {currentUser && isRememberedUser() ? `Welcome back, ${currentUser.name.split(' ')[0]}` : TAGLINES[taglineIdx]}
          </p>
          {!(currentUser && isRememberedUser()) && (
          <p className="home-sub">
            A full-featured browser-based studio for designing, painting and
            exporting custom car liveries — no installs, no plugins required.
          </p>
          )}

          <div
            ref={heroCtaRef}
            className={`home-cta-row${currentUser && isRememberedUser() ? ' home-cta-row--returning' : ''}`}
          >
            {currentUser && isRememberedUser() ? (
              <>
                <button ref={primaryCtaRef} type="button" className="home-cta-primary home-cta-returning" onClick={onOpenProfile}>
                  <span className="home-cta-label home-cta-label--warm">Recent Projects →</span>
                  <span className="home-cta-sub">Open saved cars in your profile</span>
                </button>
                <button type="button" className="home-cta-secondary" onClick={onEnter}>
                  Start New Project
                </button>
              </>
            ) : null}
          </div>
        </div>

        {/* Guest CTA + Discord + legal — pinned to bottom-center of hero */}
        {!(currentUser && isRememberedUser()) && (
          <div className="home-guest-cta-bottom">
            <p className="home-cta-prompt">Ready to build your dream livery?</p>
            <button ref={primaryCtaRef} type="button" className="home-cta-primary" onClick={onContinueAsGuest}>
              <span className="home-cta-label">Continue as Guest →</span>
            </button>
            <div className="home-discord-cta home-discord-cta--hero">
              <a
                className="home-discord-btn"
                href={discordCommunityUrl}
                target="_blank"
                rel="noreferrer"
              >
                Join Our Discord Community
              </a>
              <p className="home-discord-copy">
                Upload your car builds, send feedback, report bugs, and help shape future features.
              </p>
            </div>
            <div className="home-support-creator" role="group" aria-label="Support MyGarage">
              <p className="home-support-creator-title">Support MyGarage</p>
              <p className="home-support-creator-copy">If this app helps you, you can tip the creator on Cash App.</p>
              <a
                className="home-support-creator-btn"
                href={CASHAPP_SUPPORT_URL}
                target="_blank"
                rel="noreferrer"
                aria-label={`Support the app on Cash App ${CASHAPP_TAG}`}
              >
                Tip on Cash App {CASHAPP_TAG}
              </a>
            </div>
            <p className="home-legal-inline">
              For visualization and planning only. You are responsible for rights ownership, licensing, and legal clearance before commercial use, printing, or resale.
            </p>
          </div>
        )}
      </section>

      {/* ── Features grid ────────────────────────────────────── */}
      {/* ── Drawer trigger zone ──────────────────────────────── */}
      <button
        ref={drawerTriggerRef}
        type="button"
        className={`home-drawer-trigger${drawerOpen ? ' open' : ''}`}
        onMouseEnter={openDrawer}
        onClick={toggleDrawer}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        aria-expanded={drawerOpen}
        aria-controls="home-drawer-panel"
        aria-label={drawerOpen ? 'Hide details panel' : 'Show details panel'}
      >
        <span className="home-drawer-trigger-pill" aria-hidden="true">
          <span className="home-drawer-trigger-chevron" />
        </span>
      </button>

      {drawerOpen && (
        <button
          type="button"
          className="home-drawer-backdrop"
          onClick={closeDrawer}
          aria-label="Close details panel"
        />
      )}

      {/* ── Slide-up drawer ──────────────────────────────────── */}
      <div
        id="home-drawer-panel"
        ref={drawerRef}
        className={`home-drawer${drawerOpen ? ' home-drawer--open' : ''}`}
        role="region"
        aria-label="Features and quick actions"
        onMouseEnter={openDrawer}
        onMouseLeave={closeDrawer}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <button
          type="button"
          className="home-drawer-handle"
          onClick={toggleDrawer}
          aria-label={drawerOpen ? 'Collapse details panel' : 'Expand details panel'}
        />

        {/* ── Features grid ──────────────────────────────────── */}
        <section className="home-features">
          <h2 className="home-section-title">Everything you need</h2>
          <p className="home-section-sub">
            Built with React, Three.js and pure SVG — no external render services.
          </p>
          <div className="home-features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="home-feature-card">
                <div className="home-feature-icon">{f.icon}</div>
                <h3 className="home-feature-title">{f.title}</h3>
                <p className="home-feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="home-legal">
          <h2 className="home-section-title">Legal and Licensing Notice</h2>
          <p className="home-section-sub">
            Launch disclaimer: review this before uploading assets, exporting files, printing wraps, publishing previews, or using work commercially.
          </p>
          <ul className="home-legal-list">
            {LEGAL_NOTICE_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        {/* ── Bottom CTA ─────────────────────────────────────── */}
        <section className="home-bottom-cta">
          <h2>Ready to build your dream livery?</h2>
          <p>Pick a car, open the editor and start designing in seconds.</p>
          <button ref={lowerCtaRef} type="button" className="home-cta-primary large" onClick={currentUser && isRememberedUser() ? onEnter : onContinueAsGuest}>
            <span className="home-cta-label">{currentUser && isRememberedUser() ? 'Open the Garage →' : 'Continue as Guest →'}</span>
          </button>
        </section>

        {/* ── Footer ─────────────────────────────────────────── */}
        <footer className="home-footer">
          <span>MyGarage &copy; {new Date().getFullYear()}</span>
          <span className="home-footer-sep">·</span>
          <span>Built with React + Three.js + Vite</span>
          <div className="home-footer-links">
            <button type="button" className="home-auth-link" onClick={() => openLegal('terms')}>Terms</button>
            <span className="home-footer-sep">·</span>
            <button type="button" className="home-auth-link" onClick={() => openLegal('privacy')}>Privacy</button>
            <span className="home-footer-sep">·</span>
            <button type="button" className="home-auth-link" onClick={() => openLegal('acceptable')}>Acceptable Use</button>
          </div>
        </footer>
      </div>

      {authOpen && (
        <div className="home-auth-backdrop" role="dialog" aria-modal="true" aria-label="Authentication">
          <div className="home-auth-modal">
            <div className="home-auth-header">
              <div className="home-auth-tabs">
                <button
                  type="button"
                  className={`home-auth-tab${authMode === 'login' ? ' active' : ''}`}
                  onClick={() => { setAuthMode('login'); setAuthError(null) }}
                >
                  Log In
                </button>
                <button
                  type="button"
                  className={`home-auth-tab${authMode === 'signup' ? ' active' : ''}`}
                  onClick={() => { setAuthMode('signup'); setAuthError(null) }}
                >
                  Sign Up
                </button>
              </div>
              <button type="button" className="home-auth-close" aria-label="Close" onClick={closeAuth}>✕</button>
            </div>

            <h3 className="home-auth-title">{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h3>
            <p className="home-auth-subtitle">
              {authMode === 'login' ? 'Log in to continue customizing your garage.' : 'Sign up and keep your workspace synced.'}
            </p>

            <form className="home-auth-form" onSubmit={handleAuthSubmit}>
              {authMode === 'signup' && (
                <label className="home-auth-field">
                  <span>Name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Rivera"
                    autoComplete="name"
                  />
                </label>
              )}

              <label className="home-auth-field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>

              <label className="home-auth-field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                />
              </label>

              <label className="home-auth-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember me on this device</span>
              </label>

              <label className="home-auth-remember">
                <input
                  type="checkbox"
                  checked={legalAccepted}
                  onChange={(e) => setLegalAccepted(e.target.checked)}
                />
                <span>
                  I agree to the
                  {' '}
                  <button type="button" className="home-auth-link" onClick={() => openLegal('terms')}>Terms</button>
                  {', '}
                  <button type="button" className="home-auth-link" onClick={() => openLegal('privacy')}>Privacy</button>
                  {' and '}
                  <button type="button" className="home-auth-link" onClick={() => openLegal('acceptable')}>Acceptable Use</button>
                </span>
              </label>

              {authError && <p className="home-auth-error">{authError}</p>}
              {authConfirmPending && (
                <p className="home-auth-confirm">
                  Check your email for a confirmation link, then log in.
                </p>
              )}

              {!authConfirmPending && (
                <button type="submit" className="home-auth-submit" disabled={authLoading}>
                  {authLoading ? 'Please wait…' : authMode === 'login' ? 'Log In' : 'Sign Up'}
                </button>
              )}
            </form>

            <div className="home-auth-divider"><span>or</span></div>
            <button type="button" className="home-auth-guest" onClick={() => { closeAuth(); onContinueAsGuest?.() }}>
              Continue as Guest
            </button>
          </div>
        </div>
      )}

      <LegalDocsModal
        isOpen={legalOpen}
        initialDoc={legalDoc}
        onSelectDoc={setLegalDoc}
        onClose={() => setLegalOpen(false)}
      />
    </div>
  )
}
