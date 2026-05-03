import { useRef, useState } from 'react'
import { Home, Redo2, Undo2 } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { saveFullProjectToProfile } from '../../lib/savedProjects'
import { LegalDocsModal } from './LegalDocsModal'
import type { CameraViewId, EditorProject } from '../../types/editor'
import type { LightPresetId } from '../scene/EditorCanvas'

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

type TopBarProps = {
  onScreenshot?: () => void
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
  onCaptureProfilePreview?: () => string | null
  cloudStatusLabel?: string
  cloudStatusTone?: 'neutral' | 'ok' | 'warn' | 'error'
}

const LIGHT_PRESET_LABELS: { id: LightPresetId; label: string }[] = [
  { id: 'studio', label: 'Studio' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'night', label: 'Night' },
  { id: 'showroom', label: 'Showroom' },
]

function FileMenu({ onScreenshot, onSocialExport, onVideoRecord, onPrintExport, isGuest = false, onGuestSignIn, onCaptureProfilePreview }: { onScreenshot?: () => void; onSocialExport?: () => void; onVideoRecord?: () => void; onPrintExport?: () => void; isGuest?: boolean; onGuestSignIn?: () => void; onCaptureProfilePreview?: () => string | null }) {
  const [open, setOpen] = useState(false)
  const project = useEditorStore((state) => state.project)
  const loadProject = useEditorStore((state) => state.loadProject)
  const selectedCar = useEditorStore((state) => state.selectedCar)
  const targetPaints = useEditorStore((state) => state.targetPaints)
  const targetPrints = useEditorStore((state) => state.targetPrints)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSaveToProfile = () => {
    if (isGuest) { onGuestSignIn?.(); return }
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
    if (isGuest) { onGuestSignIn?.(); return }
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
    if (isGuest) { onGuestSignIn?.(); return }
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
    if (isGuest) { onGuestSignIn?.(); return }
    onScreenshot?.()
    setOpen(false)
  }

  const handleSocialExport = () => {
    if (isGuest) { onGuestSignIn?.(); return }
    onSocialExport?.()
    setOpen(false)
  }

  const handleVideoRecord = () => {
    if (isGuest) { onGuestSignIn?.(); return }
    onVideoRecord?.()
    setOpen(false)
  }

  const handlePrintExport = () => {
    if (isGuest) { onGuestSignIn?.(); return }
    onPrintExport?.()
    setOpen(false)
  }

  return (
    <div className="file-menu-wrap">
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
            <button type="button" className="file-menu-item" onClick={handleExportPng}>
              <span className="file-menu-icon">🖼</span> Export PNG (Screenshot)
            </button>
            <button type="button" className="file-menu-item" onClick={handleSocialExport}>
              <span className="file-menu-icon">📸</span> Share / Socials…
            </button>
            <button type="button" className="file-menu-item" onClick={handleVideoRecord}>
              <span className="file-menu-icon">🎥</span> Record Video…
            </button>
            <button type="button" className="file-menu-item" onClick={handlePrintExport}>
              <span className="file-menu-icon">🖨️</span> Print / Wrap Export…
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
  onCaptureProfilePreview,
  cloudStatusLabel,
  cloudStatusTone = 'neutral',
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
  const [avatarUrl] = useState<string | null>(() => localStorage.getItem(PROFILE_AVATAR_KEY))
  const [avatarInitials] = useState(() => readAvatarInitials())
  const [legalOpen, setLegalOpen] = useState(false)
  const [legalDoc, setLegalDoc] = useState<LegalDocId>('terms')

  const openLegal = (doc: LegalDocId) => {
    setLegalDoc(doc)
    setLegalOpen(true)
  }

  return (
    <header className="top-bar">
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

        <FileMenu onScreenshot={onScreenshot} onSocialExport={onSocialExport} onVideoRecord={onVideoRecord} onPrintExport={onPrintExport} isGuest={isGuest} onGuestSignIn={onGuestSignIn} onCaptureProfilePreview={onCaptureProfilePreview} />

        <div className="top-bar-divider" />

        <button type="button" className="top-icon-btn" onClick={undo} title="Undo (Ctrl+Z)" aria-label="Undo">
          <Undo2 size={14} />
        </button>
        <button type="button" className="top-icon-btn" onClick={redo} title="Redo (Ctrl+Y)" aria-label="Redo">
          <Redo2 size={14} />
        </button>
        <HistoryMenu />
      </div>

      <div className="top-bar-center">
        <div className="tool-strip" role="toolbar" aria-label="Camera views">
          <button
            type="button"
            className="top-plain-btn change-car-bridge-btn"
            onClick={clearSelectedCar}
            title="Change car"
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
      </div>

      <div className="top-bar-right">
        <button
          type="button"
          className={isSvgMakerOpen ? 'top-card-btn top-svgmaker-btn active' : 'top-card-btn top-svgmaker-btn'}
          onClick={onOpenSvgMaker}
          title="Open SVG Maker — create custom vector decals"
        >
          ✏ SVG Maker
        </button>

        <div className="top-bar-divider" />

        <button
          type="button"
          className={is2DOpen ? 'top-card-btn active' : 'top-card-btn'}
          onClick={is2DOpen ? onOpen3DEditor : onOpen2DEditor}
          title={is2DOpen ? 'Return to 3D editor' : 'Open 2D editor'}
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
              <img src={avatarUrl} alt="Profile" className="top-profile-bubble-img" />
            ) : (
              <span className="top-profile-bubble-fallback">{avatarInitials}</span>
            )}
          </button>
        )}
      </div>

      <LegalDocsModal
        isOpen={legalOpen}
        initialDoc={legalDoc}
        onSelectDoc={setLegalDoc}
        onClose={() => setLegalOpen(false)}
      />
    </header>
  )
}
