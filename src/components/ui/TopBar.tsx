import { useEffect, useRef, useState } from 'react'
import { Home, Redo2, Undo2 } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { saveFullProjectToProfile } from '../../lib/savedProjects'
import { getAccessPrompt, getPlanLabel, isFeatureAllowed, type FeatureId, type PlanTier } from '../../lib/access'
import { LegalDocsModal } from './LegalDocsModal'
import type { CameraViewId, EditorProject } from '../../types/editor'
import type { GlbExportOptions, GlbExportResult, LightPresetId } from '../scene/EditorCanvas'
import type { ExportQuality } from '../../types/exportQuality'
import { EXPORT_QUALITY_LABELS, EXPORT_QUALITY_ORDER } from '../../types/exportQuality'

type LegalDocId = 'terms' | 'privacy' | 'acceptable'

const AUTH_LOCAL_KEY = 'mygarage-auth-local'
const AUTH_SESSION_KEY = 'mygarage-auth-session'
const PROFILE_AVATAR_KEY = 'mygarage-profile-avatar'

const cameraViews: CameraViewId[] = ['side', 'front', 'back']

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

type TopBarProps = {
  onScreenshot?: () => void
  onExportGlb?: (options?: GlbExportOptions) => Promise<GlbExportResult | void> | void
  onSocialExport?: () => void
  onVideoRecord?: () => void
  onPrintExport?: () => void
  onOpen2DEditor?: () => void
  onOpen3DEditor?: () => void
  is2DOpen?: boolean
  isSvgMakerOpen?: boolean
  onOpenSvgMaker?: () => void
  lightPreset?: LightPresetId
  onLightPreset?: (p: LightPresetId) => void
  onResetCamera?: () => void
  onGoHome?: () => void
  onOpenProfile?: () => void
  onGuestSignIn?: () => void
  isGuest?: boolean
  planTier?: PlanTier
  onUpgradeClick?: () => void
  onCaptureProfilePreview?: () => string | null
  cloudStatusLabel?: string
  cloudStatusTone?: 'neutral' | 'ok' | 'warn' | 'error'
  onSvgCancel?: () => void
  onSvgSave?: () => void
  onSvgUndo?: () => void
  onSvgRedo?: () => void
  onSvgExport?: () => void
  exportQuality?: ExportQuality
  onExportQualityChange?: (quality: ExportQuality) => void
}

const LIGHT_PRESET_LABELS: { id: LightPresetId; label: string }[] = [
  { id: 'studio', label: 'Studio' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'night', label: 'Night' },
  { id: 'showroom', label: 'Showroom' },
]

function FileMenu({ onScreenshot, onExportGlb, onSocialExport, onVideoRecord, onPrintExport, isSvgMode = false, onSvgExport, isGuest = false, planTier = 'free', onGuestNudge, onAccessNudge, onCaptureProfilePreview, exportQuality = 'high', onExportQualityChange }: { onScreenshot?: () => void; onExportGlb?: (options?: GlbExportOptions) => Promise<GlbExportResult | void> | void; onSocialExport?: () => void; onVideoRecord?: () => void; onPrintExport?: () => void; isSvgMode?: boolean; onSvgExport?: () => void; isGuest?: boolean; planTier?: PlanTier; onGuestNudge?: (feature: string) => void; onAccessNudge?: (feature: FeatureId) => void; onCaptureProfilePreview?: () => string | null; exportQuality?: ExportQuality; onExportQualityChange?: (quality: ExportQuality) => void }) {
  const [open, setOpen] = useState(false)
  const [glbBakeOverlays, setGlbBakeOverlays] = useState(true)
  const [glbIncludeLightsCamera, setGlbIncludeLightsCamera] = useState(false)
  const [glbExporting, setGlbExporting] = useState(false)
  const [glbStatus, setGlbStatus] = useState<string | null>(null)
  const menuRootRef = useRef<HTMLDivElement | null>(null)
  const project = useEditorStore((state) => state.project)
  const loadProject = useEditorStore((state) => state.loadProject)
  const selectedCar = useEditorStore((state) => state.selectedCar)
  const targetPaints = useEditorStore((state) => state.targetPaints)
  const targetPrints = useEditorStore((state) => state.targetPrints)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSaveToProfile = () => {
    if (isGuest) { onGuestNudge?.('Add to Profile'); return }
    if (selectedCar) {
      const previewImageUrl = onCaptureProfilePreview?.() ?? null
      const result = saveFullProjectToProfile(project, selectedCar, targetPaints, targetPrints, previewImageUrl)
      if (!result.ok || !result.fullSaved) {
        alert(result.error ?? 'Project save completed with warnings.')
      }
    }
    setOpen(false)
  }

  const handleDownloadProject = () => {
    if (isGuest) { onGuestNudge?.('Download Project'); return }
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.meta.name.replace(/\s+/g, '-')}-${Date.now()}.mgproject`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  const handleLoad = () => {
    if (isGuest) { onGuestNudge?.('Load Project'); return }
    fileInputRef.current?.click()
    setOpen(false)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as EditorProject
        if (!parsed?.meta?.id || !Array.isArray(parsed?.layers)) {
          alert('Invalid project file.')
          return
        }
        loadProject(parsed)
      } catch {
        alert('Could not read project file.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleExportPng = () => {
    if (isGuest) { onGuestNudge?.('Export PNG'); return }
    onScreenshot?.()
    setOpen(false)
  }

  const handleSocialExport = () => {
    if (isGuest) { onGuestNudge?.('Share / Socials'); return }
    onSocialExport?.()
    setOpen(false)
  }

  const handleExportGlb = async () => {
    if (!isFeatureAllowed(planTier, 'export-glb')) { onAccessNudge?.('export-glb'); return }
    if (!onExportGlb) {
      alert('GLB export is not available yet.')
      return
    }
    try {
      setGlbExporting(true)
      setGlbStatus('Exporting GLB...')
      const result = await onExportGlb({
        bakeCarOverlays: glbBakeOverlays,
        includeLightsAndCamera: glbIncludeLightsCamera,
      })
      setGlbStatus(result?.fileName ? `Saved ${result.fileName}` : 'GLB export completed.')
    } catch {
      setGlbStatus('GLB export failed. Please try again.')
      alert('GLB export failed. Please try again.')
    } finally {
      setGlbExporting(false)
    }
  }

  const handleVideoRecord = () => {
    if (!isFeatureAllowed(planTier, 'record-video')) { onAccessNudge?.('record-video'); return }
    onVideoRecord?.()
    setOpen(false)
  }

  const handlePrintExport = () => {
    const featureId: FeatureId = isSvgMode ? 'svg-export' : 'print-export'
    if (!isFeatureAllowed(planTier, featureId)) { onAccessNudge?.(featureId); return }
    if (isSvgMode) {
      onSvgExport?.()
    } else {
      onPrintExport?.()
    }
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (ev: PointerEvent) => {
      const target = ev.target as Node | null
      if (!target) return
      if (menuRootRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open])

  return (
    <div className="file-menu-wrap" ref={menuRootRef}>
      <button
        type="button"
        className={open ? 'top-plain-btn active' : 'top-plain-btn'}
        onClick={() => setOpen((v) => !v)}
      >
        File ▾
      </button>

      {open && (
        <>
          <div className="file-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="file-menu-dropdown">
            <button type="button" className="file-menu-item" onClick={handleSaveToProfile}>
              <span className="file-menu-icon">⭐</span> Add to Profile
            </button>
            <button type="button" className="file-menu-item" onClick={handleDownloadProject}>
              <span className="file-menu-icon">💾</span> Download Project
            </button>
            <button type="button" className="file-menu-item" onClick={handleLoad}>
              <span className="file-menu-icon">📂</span> Load Project
            </button>
            <div className="file-menu-divider" />
            <div style={{ padding: '8px 10px 6px', fontSize: '0.75rem', color: '#8ea0b4', fontWeight: 700 }}>
              Export Quality
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, padding: '0 10px 10px' }}>
              {EXPORT_QUALITY_ORDER.map((quality) => (
                <button
                  key={quality}
                  type="button"
                  className={exportQuality === quality ? 'top-card-btn active' : 'top-card-btn'}
                  style={{ padding: '6px 0', fontSize: '0.72rem' }}
                  onClick={() => onExportQualityChange?.(quality)}
                  title={`${EXPORT_QUALITY_LABELS[quality]} export quality`}
                >
                  {EXPORT_QUALITY_LABELS[quality]}
                </button>
              ))}
            </div>
            <div className="file-menu-divider" />
            <button type="button" className="file-menu-item" onClick={handleExportPng}>
              <span className="file-menu-icon">🖼</span> Export PNG (Screenshot)
            </button>
            <button type="button" className="file-menu-item" onClick={() => { void handleExportGlb() }} disabled={glbExporting}>
              <span className="file-menu-icon">🧊</span> Export GLB (Baked Layers)
            </button>
            <div style={{ padding: '8px 10px 4px', display: 'grid', gap: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.74rem', color: '#8ea0b4' }}>
                <input type="checkbox" checked={glbBakeOverlays} onChange={(e) => setGlbBakeOverlays(e.target.checked)} />
                Bake split/gradient/stripe into export
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.74rem', color: '#8ea0b4' }}>
                <input type="checkbox" checked={glbIncludeLightsCamera} onChange={(e) => setGlbIncludeLightsCamera(e.target.checked)} />
                Include lights + camera rig
              </label>
              {glbStatus ? (
                <span style={{ fontSize: '0.72rem', color: glbStatus.includes('failed') ? '#f87171' : '#8ea0b4' }}>
                  {glbStatus}
                </span>
              ) : null}
            </div>
            <button type="button" className="file-menu-item" onClick={handleSocialExport}>
              <span className="file-menu-icon">📸</span> Share / Socials…
            </button>
            <button type="button" className="file-menu-item" onClick={handleVideoRecord}>
              <span className="file-menu-icon">🎥</span> Record Video…
            </button>
            <button type="button" className="file-menu-item" onClick={handlePrintExport}>
              <span className="file-menu-icon">🖨️</span> {isSvgMode ? 'SVG Export…' : 'Print / Wrap Export…'}
            </button>
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".mgproject,.json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  )
}

function HistoryMenu() {
  const [open, setOpen] = useState(false)
  const historyPast = useEditorStore((state) => state.historyPast)
  const undoToIndex = useEditorStore((state) => state.undoToIndex)

  return (
    <div className="file-menu-wrap">
      <button
        type="button"
        className={open ? 'top-plain-btn active' : 'top-plain-btn'}
        onClick={() => setOpen((v) => !v)}
        title="Open undo history"
      >
        Undo History ▾
      </button>

      {open && (
        <>
          <div className="file-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="file-menu-dropdown top-dropdown-right">
            {historyPast.length === 0 ? (
              <button type="button" className="file-menu-item" disabled>
                No history yet
              </button>
            ) : (
              [...historyPast].reverse().map((snapshot, reversedIndex) => {
                const index = historyPast.length - 1 - reversedIndex
                return (
                  <button
                    key={`${snapshot.label ?? 'Step'}-${index}`}
                    type="button"
                    className="file-menu-item"
                    onClick={() => {
                      undoToIndex(index)
                      setOpen(false)
                    }}
                    title="Restore to this state"
                  >
                    {snapshot.label ?? `Step ${index + 1}`}
                  </button>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}

function LightingMenu({ lightPreset, onLightPreset }: { lightPreset: LightPresetId; onLightPreset?: (p: LightPresetId) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="file-menu-wrap">
      <button
        type="button"
        className={open ? 'top-plain-btn active' : 'top-plain-btn'}
        onClick={() => setOpen((v) => !v)}
        title="Lighting presets"
      >
        Lighting ▾
      </button>

      {open && (
        <>
          <div className="file-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="file-menu-dropdown top-dropdown-right">
            {LIGHT_PRESET_LABELS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={lightPreset === id ? 'file-menu-item active' : 'file-menu-item'}
                onClick={() => {
                  onLightPreset?.(id)
                  setOpen(false)
                }}
                title={`${label} lighting`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function TopBar({
  onScreenshot,
  onExportGlb,
  onSocialExport,
  onVideoRecord,
  onPrintExport,
  onOpen2DEditor,
  onOpen3DEditor,
  is2DOpen = false,
  isSvgMakerOpen = false,
  onOpenSvgMaker,
  lightPreset = 'studio',
  onLightPreset,
  onResetCamera,
  onGoHome,
  onOpenProfile,
  onGuestSignIn,
  isGuest = false,
  planTier = 'free',
  onUpgradeClick,
  onCaptureProfilePreview,
  cloudStatusLabel,
  cloudStatusTone = 'neutral',
  onSvgCancel,
  onSvgSave,
  onSvgUndo,
  onSvgRedo,
  onSvgExport,
  exportQuality = 'high',
  onExportQualityChange,
}: TopBarProps) {
  const cameraView = useEditorStore((state) => state.cameraView)
  const setCameraView = useEditorStore((state) => state.setCameraView)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const clearSelectedCar = useEditorStore((state) => state.clearSelectedCar)
  const activeTool = useEditorStore((state) => state.activeTool)
  const setTool = useEditorStore((state) => state.setTool)
  const classifyLocked = useEditorStore((state) => state.classifyLocked)
  const autoRotate = useEditorStore((state) => state.autoRotate)
  const setAutoRotate = useEditorStore((state) => state.setAutoRotate)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => readStoredAvatarDataUrl())
  const [avatarInitials] = useState(() => readAvatarInitials())
  const [legalOpen, setLegalOpen] = useState(false)
  const [legalDoc, setLegalDoc] = useState<LegalDocId>('terms')
  const [accessPrompt, setAccessPrompt] = useState<string | null>(null)
  const accessPromptTimerRef = useRef<number | null>(null)
  const isSvgMode = isSvgMakerOpen

  const openLegal = (doc: LegalDocId) => {
    setLegalDoc(doc)
    setLegalOpen(true)
  }

  useEffect(() => {
    return () => {
      if (accessPromptTimerRef.current !== null) {
        window.clearTimeout(accessPromptTimerRef.current)
      }
    }
  }, [])

  const showGuestPrompt = (feature: string) => {
    setAccessPrompt(`Create an account to use ${feature}.`)
    if (accessPromptTimerRef.current !== null) {
      window.clearTimeout(accessPromptTimerRef.current)
    }
    accessPromptTimerRef.current = window.setTimeout(() => {
      setAccessPrompt(null)
      accessPromptTimerRef.current = null
    }, 2800)
  }

  const showAccessPrompt = (feature: FeatureId) => {
    const prompt = getAccessPrompt(planTier, feature)
    setAccessPrompt(prompt.message)
    if (accessPromptTimerRef.current !== null) {
      window.clearTimeout(accessPromptTimerRef.current)
    }
    accessPromptTimerRef.current = window.setTimeout(() => {
      setAccessPrompt(null)
      accessPromptTimerRef.current = null
    }, 2800)
  }

  const handleAccessAction = () => {
    if (planTier === 'guest') {
      onGuestSignIn?.()
      return
    }
    onUpgradeClick?.()
  }

  const handleChangeCar = () => {
    if (isGuest) {
      showGuestPrompt('Change Car')
      return
    }
    clearSelectedCar()
  }

  const handleToggle2DEditor = () => {
    if (!is2DOpen && !isFeatureAllowed(planTier, 'editor-2d')) {
      showAccessPrompt('editor-2d')
      return
    }
    if (is2DOpen) {
      onOpen3DEditor?.()
    } else {
      onOpen2DEditor?.()
    }
  }

  const handleSvgMakerToggle = () => {
    if (!isSvgMode && !isFeatureAllowed(planTier, 'svg-maker')) {
      showAccessPrompt('svg-maker')
      return
    }
    onOpenSvgMaker?.()
  }

  return (
    <header className={isSvgMode ? 'top-bar top-bar-svg-mode' : 'top-bar'}>
      <div className="top-bar-left">
        <button
          type="button"
          className="top-plain-btn top-bar-home"
          onClick={() => { clearSelectedCar(); onGoHome?.() }}
          title="Back to home"
          aria-label="Home"
        >
          <Home size={15} />
        </button>

        <div className="top-bar-divider" />

        <FileMenu onScreenshot={onScreenshot} onExportGlb={onExportGlb} onSocialExport={onSocialExport} onVideoRecord={onVideoRecord} onPrintExport={onPrintExport} isSvgMode={isSvgMode} onSvgExport={onSvgExport} isGuest={isGuest} planTier={planTier} onGuestNudge={showGuestPrompt} onAccessNudge={showAccessPrompt} onCaptureProfilePreview={onCaptureProfilePreview} exportQuality={exportQuality} onExportQualityChange={onExportQualityChange} />

        <div className="top-bar-divider" />

        <button type="button" className="top-icon-btn" onClick={isSvgMode ? onSvgUndo : undo} title="Undo (Ctrl+Z)" aria-label="Undo">
          <Undo2 size={14} />
        </button>
        <button type="button" className="top-icon-btn" onClick={isSvgMode ? onSvgRedo : redo} title="Redo (Ctrl+Y)" aria-label="Redo">
          <Redo2 size={14} />
        </button>
        {!isSvgMode && <HistoryMenu />}
      </div>

      <div className="top-bar-center">
        {!isSvgMode && (
          <div className="tool-strip" role="toolbar" aria-label="Camera views">
            <button
              type="button"
              className="top-plain-btn change-car-bridge-btn"
              onClick={handleChangeCar}
              title={isGuest ? 'Sign in to change car model' : 'Change car'}
            >
              Change Car
            </button>
            <div className="top-bar-divider" />
            {cameraViews.map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setCameraView(view)}
                className={view === cameraView ? 'top-card-btn active' : 'top-card-btn'}
              >
                {view}
              </button>
            ))}
            <div className="top-bar-divider" />
            <button
              type="button"
              className="top-card-btn"
              onClick={onResetCamera}
              title="Reset camera to default position"
            >
              ↺ Reset
            </button>
            <div className="top-bar-divider" />
            <button
              type="button"
              className={autoRotate ? 'top-card-btn active' : 'top-card-btn'}
              onClick={() => setAutoRotate(!autoRotate)}
              title="Toggle turntable auto-rotate"
            >
              ⟳ Spin
            </button>
          </div>
        )}
      </div>

      <div className="top-bar-right">
        <button
          type="button"
          className={isSvgMakerOpen ? 'top-card-btn top-svgmaker-btn active' : 'top-card-btn top-svgmaker-btn'}
          onClick={handleSvgMakerToggle}
          title={isSvgMode ? 'Back to 3D editor' : isFeatureAllowed(planTier, 'svg-maker') ? 'Open Create a Logo — create custom vector decals' : 'Upgrade to Paid to open Create a Logo'}
        >
          {isSvgMode ? '↩ Back to 3D' : '✏ Create a Logo'}
        </button>

        {!isSvgMode && (
          <>
            <div className="top-bar-divider" />

            <button
              type="button"
              className={is2DOpen ? 'top-card-btn active' : 'top-card-btn'}
              onClick={handleToggle2DEditor}
              title={is2DOpen ? 'Return to 3D editor' : (isGuest ? 'Sign in to open 2D editor' : 'Open 2D editor')}
            >
              {is2DOpen ? '3D' : '2D'}
            </button>

            <div className="top-bar-divider" />

            <button
              type="button"
              className={activeTool === 'mesh-inspect' ? 'top-card-btn active' : 'top-card-btn'}
              onClick={() => setTool(activeTool === 'mesh-inspect' ? 'orbit' : 'mesh-inspect')}
              title="Hover meshes to see their names"
            >
              Mesh
            </button>
            <div className="top-bar-divider" />
            <button
              type="button"
              className={activeTool === 'mesh-classify' ? 'top-card-btn active' : 'top-card-btn'}
              onClick={() => setTool(activeTool === 'mesh-classify' ? 'orbit' : 'mesh-classify')}
              title={classifyLocked ? 'Classifications locked — click to view or unlock' : 'Classify meshes as paintable / excluded / window'}
            >
              Classify{classifyLocked ? ' 🔒' : ''}
            </button>

            <div className="top-bar-divider" />
            <LightingMenu lightPreset={lightPreset} onLightPreset={onLightPreset} />

            <div className="top-bar-divider" />
            <button
              type="button"
              className="top-plain-btn"
              onClick={() => openLegal('terms')}
              title="Open legal and licensing documents"
            >
              Legal
            </button>

            {cloudStatusLabel && (
              <>
                <div className="top-bar-divider" />
                <span className={`top-cloud-status top-cloud-status-${cloudStatusTone}`} title={cloudStatusLabel}>
                  {cloudStatusLabel}
                </span>
              </>
            )}

            {!isGuest && (
              <>
                <div className="top-bar-divider" />
                <span className={`top-plan-badge top-plan-badge-${planTier}`} title={`${getPlanLabel(planTier)} plan`}>
                  {getPlanLabel(planTier)}
                </span>
              </>
            )}

            <div className="top-bar-divider" />
            {isGuest ? (
              <button
                type="button"
                className="top-guest-signin"
                onClick={onGuestSignIn}
                title="Sign in to create an account"
                aria-label="Sign in"
              >
                Sign In
              </button>
            ) : (
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
            )}
          </>
        )}

        {isSvgMode && isGuest && (
          <>
            <div className="top-bar-divider" />
            <button
              type="button"
              className="top-guest-signin"
              onClick={onGuestSignIn}
              title="Sign in to create an account"
              aria-label="Sign in"
            >
              Sign In
            </button>
          </>
        )}

        {isSvgMode && (
          <>
            <div className="top-bar-divider" />
            <button type="button" className="top-plain-btn" onClick={onSvgCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="top-card-btn active"
              onClick={onSvgSave}
              style={{ fontWeight: 700 }}
            >
              Save + Add Decal
            </button>
          </>
        )}
      </div>

      <LegalDocsModal
        isOpen={legalOpen}
        initialDoc={legalDoc}
        onSelectDoc={setLegalDoc}
        onClose={() => setLegalOpen(false)}
      />

      {accessPrompt && (
        <div className="top-guest-prompt" role="status" aria-live="polite">
          <span>{accessPrompt}</span>
          <button type="button" className="top-guest-prompt-link" onClick={handleAccessAction}>
            {planTier === 'guest' ? 'Sign In' : 'Upgrade'}
          </button>
        </div>
      )}
    </header>
  )
}
