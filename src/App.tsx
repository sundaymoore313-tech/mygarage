import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Layers, Type, Palette } from 'lucide-react'
import { useEditorStore } from './store/editorStore'
import type { GlbExportOptions, GlbExportResult, LightPresetId } from './components/scene/EditorCanvas'
import { clearModelSceneCache, preloadModelScene } from './components/scene/useModelScene'
import { readCachedPlanTier, writeCachedPlanTier } from './lib/billing'
import { endPerfSpan, markPerfOnce, startPerfSpan } from './lib/perfDebug'
import { isOwnerEmail } from './lib/access'
import type { NonGuestPlanTier } from './lib/access'
import { saveGeneratedClassifyPreset } from './lib/paintTargets'
import { loadFullProjectByIdWithCloud, migrateLocalProjectsToCloud, saveFullProjectToProfile, syncCloudProjectsToLocal } from './lib/savedProjects'
import { getCurrentUser, getCurrentUserPlanTier, isSupabaseConfigured, supabase } from './lib/supabase'
import { writeSession, saveDraftProject, readDraftProject, clearDraftProject, getRecoverableSession, confirmSession, clearSession } from './lib/sessionPersistence'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ExportQuality } from './types/exportQuality'
import './App.css'

const GUEST_MODEL_URL = '/models/dodge_charger_srt_hellcat__high_quality.glb'
const SCREEN_QUERY_KEY = 'screen'
const PROJECT_ID_QUERY_KEY = 'projectId'
const DISABLE_EXPORT_QUERY_KEY = 'disableExport'
const MOBILE_EDITOR_MEDIA_QUERY = '(max-width: 860px) and (orientation: portrait)'
const MOBILE_LANDSCAPE_BASE_WIDTH = 1280
const CHUNK_RELOAD_SESSION_KEY = 'mygarage-chunk-reload-attempted'
// Lock mobile version - prevents mobile layout from rendering regardless of viewport size
const LOCK_MOBILE_VERSION = false

function isChunkLoadFailure(error: unknown): boolean {
  if (!error) return false
  const message = error instanceof Error ? error.message : String(error)
  return /ChunkLoadError|Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed|dynamically imported module/i.test(message)
}

function detectMobileEditorViewport(): boolean {
  if (LOCK_MOBILE_VERSION) return false

  if (typeof window === 'undefined') return false

  const isPortrait = typeof window.matchMedia === 'function'
    ? window.matchMedia('(orientation: portrait)').matches
    : window.innerHeight >= window.innerWidth

  if (!isPortrait) return false

  const mediaMatch = typeof window.matchMedia === 'function'
    ? window.matchMedia(MOBILE_EDITOR_MEDIA_QUERY).matches
    : false

  const coarsePointer = typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const uaMobile = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua)
  const shortEdge = Math.min(window.innerWidth || 0, window.innerHeight || 0)
  const touchMobileLike = coarsePointer && shortEdge > 0 && shortEdge <= 1024

  return mediaMatch || uaMobile || touchMobileLike
}

function detectMobileLandscapeViewport(): boolean {
  if (LOCK_MOBILE_VERSION) return false
  if (typeof window === 'undefined') return false

  const isLandscape = typeof window.matchMedia === 'function'
    ? window.matchMedia('(orientation: landscape)').matches
    : window.innerWidth > window.innerHeight

  if (!isLandscape) return false

  const shortEdge = Math.min(window.innerWidth || 0, window.innerHeight || 0)
  const touchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0
  const touchMobileLike = touchPoints > 0 && shortEdge > 0 && shortEdge <= 1200

  return touchMobileLike
}

type AppScreen = 'home' | 'profile' | 'selector' | 'editor'
type LeaveAction = 'home' | 'change-car'

type GarageProjectRealtimeRow = {
  user_id?: string | null
  updated_at_ms?: number | null
  project_json?: unknown
  target_paints_json?: unknown
  target_prints_json?: unknown
}

function isAppScreen(value: unknown): value is AppScreen {
  return value === 'home' || value === 'profile' || value === 'selector' || value === 'editor'
}

function readScreenFromUrl(): AppScreen | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const value = params.get(SCREEN_QUERY_KEY)
  return isAppScreen(value) ? value : null
}

function readProjectIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  return params.get(PROJECT_ID_QUERY_KEY)
}

function readDisableExportFromUrl(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  const raw = (params.get(DISABLE_EXPORT_QUERY_KEY) ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

function buildUrlForScreen(screen: AppScreen, projectId?: string | null): string {
  if (typeof window === 'undefined') return ''
  const url = new URL(window.location.href)
  if (screen === 'home') {
    url.searchParams.delete(SCREEN_QUERY_KEY)
    url.searchParams.delete(PROJECT_ID_QUERY_KEY)
  } else {
    url.searchParams.set(SCREEN_QUERY_KEY, screen)
    if (screen === 'editor' && projectId) {
      url.searchParams.set(PROJECT_ID_QUERY_KEY, projectId)
    } else {
      url.searchParams.delete(PROJECT_ID_QUERY_KEY)
    }
  }
  return `${url.pathname}${url.search}${url.hash}`
}

const loadEditorCanvasModule = async () => import('./components/scene/EditorCanvas')

const CarSelectorPage = lazy(async () => {
  const mod = await import('./components/ui/CarSelectorPage')
  return { default: mod.CarSelectorPage }
})

const HomePage = lazy(async () => {
  const mod = await import('./components/ui/HomePage')
  return { default: mod.HomePage }
})

const ProfilePage = lazy(async () => {
  const mod = await import('./components/ui/ProfilePage')
  return { default: mod.ProfilePage }
})

const MobileEditorLayout = lazy(async () => {
  const mod = await import('./components/ui/MobileEditorLayout')
  return { default: mod.MobileEditorLayout }
})

const LayerPanel = lazy(async () => {
  const mod = await import('./components/ui/LayerPanel')
  return { default: mod.LayerPanel }
})

const TopBar = lazy(async () => {
  const mod = await import('./components/ui/TopBar')
  return { default: mod.TopBar }
})

const GuestAuthModal = lazy(async () => {
  const mod = await import('./components/ui/GuestAuthModal')
  return { default: mod.GuestAuthModal }
})

const SvgMakerPage = lazy(async () => {
  const mod = await import('./components/ui/SvgMakerModal')
  return { default: mod.SvgMakerPage }
})

const EditorCanvas = lazy(async () => {
  const mod = await loadEditorCanvasModule()
  return { default: mod.EditorCanvas }
})

const PrintExportModal = lazy(async () => {
  const mod = await import('./components/ui/PrintExportModal')
  return { default: mod.PrintExportModal }
})

const SocialExportModal = lazy(async () => {
  const mod = await import('./components/ui/SocialExportModal')
  return { default: mod.SocialExportModal }
})

const VideoRecordModal = lazy(async () => {
  const mod = await import('./components/ui/VideoRecordModal')
  return { default: mod.VideoRecordModal }
})

const PrintLibraryPanel = lazy(async () => {
  const mod = await import('./components/ui/PrintLibraryPanel')
  return { default: mod.PrintLibraryPanel }
})

function ClassifyLegend({
  classifyWindowClickThrough,
  classifyBodyClickThrough,
  classifyShowMeshNames,
  setClassifyWindowClickThrough,
  setClassifyBodyClickThrough,
  setClassifyShowMeshNames,
}: {
  classifyWindowClickThrough: boolean
  classifyBodyClickThrough: boolean
  classifyShowMeshNames: boolean
  setClassifyWindowClickThrough: (value: boolean) => void
  setClassifyBodyClickThrough: (value: boolean) => void
  setClassifyShowMeshNames: (value: boolean) => void
}) {
  const activeTool = useEditorStore((state) => state.activeTool)
  const setTool = useEditorStore((state) => state.setTool)
  const clearMeshClassifications = useEditorStore((state) => state.clearMeshClassifications)
  const selectedCar = useEditorStore((state) => state.selectedCar)
  const meshClassifications = useEditorStore((state) => state.project.meshClassifications)
  const [baselineSaving, setBaselineSaving] = useState(false)
  const [baselineStatus, setBaselineStatus] = useState<string | null>(null)
  if (activeTool !== 'mesh-classify') return null

  const fileName = selectedCar?.modelUrl.split('/').pop() ?? ''
  const canSaveBaseline = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  )

  const handleSaveBaseline = async () => {
    if (!fileName) return
    setBaselineSaving(true)
    setBaselineStatus('Saving baseline...')
    const ok = await saveGeneratedClassifyPreset(fileName, meshClassifications)
    setBaselineSaving(false)
    setBaselineStatus(ok ? 'Baseline saved for this car.' : 'Baseline save failed (dev API unavailable).')
  }

  return (
    <div className="classify-legend">
      <div className="classify-legend-title">Mesh Classifier - click to cycle</div>
      <div className="classify-legend-row">
        <span className="classify-dot" style={{ background: '#22c55e' }} />
        <span>Paintable (decals &amp; stripes)</span>
      </div>
      <div className="classify-legend-row">
        <span className="classify-dot" style={{ background: '#ef4444' }} />
        <span>Excluded (no paint/decals)</span>
      </div>
      <div className="classify-legend-row">
        <span className="classify-dot" style={{ background: '#facc15' }} />
        <span>Window (decals ok, no stripes)</span>
      </div>
      <div className="classify-legend-row">
        <span className="classify-dot" style={{ background: '#ec4899' }} />
        <span>Rims (uses Rims target color)</span>
      </div>
      <div className="classify-legend-row" style={{ color: '#8ea0b4', fontSize: '0.72rem' }}>
        Dim = auto-detected &nbsp;|&nbsp; Bright = your override
      </div>
      <div className="classify-legend-row" style={{ color: '#8ea0b4', fontSize: '0.72rem' }}>
        Clicking interior meshes sets them to Excluded
      </div>
      <div className="classify-legend-row" style={{ color: '#8ea0b4', fontSize: '0.72rem' }}>
        Left click = next class, Shift or right click = previous class
      </div>
      <div className="classify-legend-row" style={{ color: '#8ea0b4', fontSize: '0.72rem' }}>
        [ / ] = prev/next mesh, C = cycle class, 1-4 = set class
      </div>
      <button
        type="button"
        className="classify-clear-btn"
        onClick={() => setClassifyWindowClickThrough(!classifyWindowClickThrough)}
      >
        {classifyWindowClickThrough ? 'Pass Through Window: On' : 'Pass Through Window: Off'}
      </button>
      <button
        type="button"
        className="classify-clear-btn"
        onClick={() => setClassifyBodyClickThrough(!classifyBodyClickThrough)}
      >
        {classifyBodyClickThrough ? 'Pass Through Outer Body: On' : 'Pass Through Outer Body: Off'}
      </button>
      <button
        type="button"
        className="classify-clear-btn"
        onClick={() => setClassifyShowMeshNames(!classifyShowMeshNames)}
      >
        {classifyShowMeshNames ? 'Show Mesh Names: On' : 'Show Mesh Names: Off'}
      </button>
      <button type="button" className="classify-clear-btn" onClick={() => { clearMeshClassifications(); setTool('orbit') }}>
        Reset My Classify
      </button>
      {canSaveBaseline && fileName && (
        <button
          type="button"
          className="classify-clear-btn"
          style={{ marginTop: 6, background: '#166534' }}
          onClick={() => { void handleSaveBaseline() }}
          disabled={baselineSaving}
        >
          {baselineSaving ? 'Saving Baseline...' : 'Set Current As Baseline (Dev)'}
        </button>
      )}
      {baselineStatus && (
        <div className="classify-legend-row" style={{ color: baselineStatus.includes('failed') ? '#f87171' : '#8ea0b4', fontSize: '0.72rem', marginTop: 4 }}>
          {baselineStatus}
        </div>
      )}
    </div>
  )
}

function App() {
  const selectCar = useEditorStore((state) => state.selectCar)
  const clearSelectedCar = useEditorStore((state) => state.clearSelectedCar)
  const selectedCar = useEditorStore((state) => state.selectedCar)
  const project = useEditorStore((state) => state.project)
  const [screen, setScreen] = useState<AppScreen>(() => readScreenFromUrl() ?? 'home')
  const [projectId, setProjectId] = useState<string | null>(() => readProjectIdFromUrl())
  const [isGuest, setIsGuest] = useState(false)
  const [userPlan, setUserPlan] = useState<NonGuestPlanTier>(() => readCachedPlanTier())
  const [classifyWindowClickThrough, setClassifyWindowClickThrough] = useState(false)
  const [classifyBodyClickThrough, setClassifyBodyClickThrough] = useState(false)
  const [classifyShowMeshNames, setClassifyShowMeshNames] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaveMs, setLastSaveMs] = useState(() => Date.now())
  const [showRecoveryPrompt, setShowRecoveryPrompt] = useState(false)
  const [recoverableProjectId, setRecoverableProjectId] = useState<string | null>(null)
  const [tabSyncNotification, setTabSyncNotification] = useState<string | null>(null)
  const [editorProjectHydrated, setEditorProjectHydrated] = useState(false)
  const hasCheckedRecoveryRef = useRef(false)
  const orbitLockToScenePanel = useEditorStore((state) => state.orbitLockToScenePanel)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const removeLayer = useEditorStore((state) => state.removeLayer)
  const activeTool = useEditorStore((state) => state.activeTool)
  const [floatingPanel, setFloatingPanel] = useState<'elements' | 'text' | 'car' | 'split' | 'stripes' | 'tint' | 'prints' | null>(null)
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    return detectMobileEditorViewport()
  })
  const [isMobileLandscapeViewport, setIsMobileLandscapeViewport] = useState(() => {
    return detectMobileLandscapeViewport()
  })
  const [mobileLandscapeScale, setMobileLandscapeScale] = useState(1)
  const [mobileLandscapeBaseHeight, setMobileLandscapeBaseHeight] = useState(620)
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const [sceneHovered, setSceneHovered] = useState(false)
  const [layerPanelCollapsed, setLayerPanelCollapsed] = useState(false)
  const [layerPanelWidth, setLayerPanelWidth] = useState(320)
  const [lightPreset, setLightPreset] = useState<LightPresetId>('garage')
  const screenshotRef = useRef<((quality?: ExportQuality) => string) | null>(null)
  const exportGlbRef = useRef<((options?: GlbExportOptions) => Promise<GlbExportResult>) | null>(null)
  const printCaptureRef = useRef<import('./components/scene/EditorCanvas').PrintCaptureFn | null>(null)
  const resetCameraRef = useRef<import('./components/scene/EditorCanvas').ResetCameraFn | null>(null)
  const [videoStreamGetter, setVideoStreamGetter] = useState<((quality?: ExportQuality) => MediaStream) | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [exportQuality, setExportQuality] = useState<ExportQuality>('high')
  const [printExportOpen, setPrintExportOpen] = useState(false)
  const [svgMakerOpen, setSvgMakerOpen] = useState(false)
  const svgSaveRef = useRef<(() => void) | null>(null)
  const svgUndoRef = useRef<(() => void) | null>(null)
  const svgRedoRef = useRef<(() => void) | null>(null)
  const svgExportRef = useRef<(() => void) | null>(null)
  const [socialPreviewUrl, setSocialPreviewUrl] = useState<string | null>(null)
  const [videoRecordOpen, setVideoRecordOpen] = useState(false)
  const [guestAuthOpen, setGuestAuthOpen] = useState(false)
  const [cloudStatusLabel, setCloudStatusLabel] = useState('Cloud: checking...')
  const [cloudStatusTone, setCloudStatusTone] = useState<'neutral' | 'ok' | 'warn' | 'error'>('neutral')
  const [isCarSwitching, setIsCarSwitching] = useState(false)
  const [pendingLeaveAction, setPendingLeaveAction] = useState<LeaveAction | null>(null)
  const [leavePromptSaving, setLeavePromptSaving] = useState(false)
  const [leavePromptError, setLeavePromptError] = useState<string | null>(null)
  const [disableExportActions] = useState(() => readDisableExportFromUrl())
  const is2DOpen = printExportOpen
  const editorWarmRef = useRef(false)
  const skipHistoryPushRef = useRef(false)
  const historyHydratedRef = useRef(false)
  const autoSaveIntervalRef = useRef<number | null>(null)
  const lastAutoSaveStateRef = useRef<string>('')
  const lastRealtimeUpdateMsRef = useRef<number>(0)
  const lastSaveMsRef = useRef<number>(lastSaveMs)
  const accountPlan = isGuest ? 'guest' : userPlan

  // Log mobile lock status on mount
  useEffect(() => {
    if (LOCK_MOBILE_VERSION) {
      console.log('🔒 Mobile version is LOCKED - desktop layout only')
    }
  }, [])

  useEffect(() => {
    lastSaveMsRef.current = lastSaveMs
  }, [lastSaveMs])

  useEffect(() => {
    if (!disableExportActions) {
      return
    }

    setPrintExportOpen(false)
    setSvgMakerOpen(false)
  }, [disableExportActions])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleChunkLoadFailure = (event: ErrorEvent) => {
      if (!isChunkLoadFailure(event.error ?? event.message)) return
      if (sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY) === '1') return
      sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, '1')
      window.location.reload()
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isChunkLoadFailure(event.reason)) return
      if (sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY) === '1') return
      sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, '1')
      window.location.reload()
    }

    window.addEventListener('error', handleChunkLoadFailure)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    return () => {
      window.removeEventListener('error', handleChunkLoadFailure)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const initialScreen = readScreenFromUrl() ?? 'home'
    const initialProjectId = readProjectIdFromUrl()
    
    window.history.replaceState({ mygarage: true, screen: initialScreen, projectId: initialProjectId }, '', buildUrlForScreen(initialScreen, initialProjectId))

    if (initialScreen !== screen || initialProjectId !== projectId) {
      skipHistoryPushRef.current = true
      setScreen(initialScreen)
      setProjectId(initialProjectId)
    }

    const onPopState = (event: PopStateEvent) => {
      const stateScreen = (event.state as { screen?: unknown; projectId?: unknown } | null)?.screen
      const stateProjectId = (event.state as { screen?: unknown; projectId?: unknown } | null)?.projectId as string | null | undefined
      const nextScreen = isAppScreen(stateScreen) ? stateScreen : (readScreenFromUrl() ?? 'home')
      const nextProjectId = stateProjectId ?? readProjectIdFromUrl()
      skipHistoryPushRef.current = true
      setScreen(nextScreen)
      setProjectId(nextProjectId ?? null)
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!historyHydratedRef.current) {
      historyHydratedRef.current = true
      return
    }
    if (skipHistoryPushRef.current) {
      skipHistoryPushRef.current = false
      return
    }

    window.history.pushState({ mygarage: true, screen, projectId }, '', buildUrlForScreen(screen, projectId))
  }, [screen, projectId])

  useEffect(() => {
    if (screen !== 'editor' || !projectId) {
      setEditorProjectHydrated(false)
      return
    }

    if (!selectedCar && editorProjectHydrated) {
      setScreen('selector')
    }
  }, [screen, selectedCar, projectId, editorProjectHydrated])

  // Recovery prompt on first load
  useEffect(() => {
    if (hasCheckedRecoveryRef.current) return
    hasCheckedRecoveryRef.current = true
    if (screen !== 'home') return // Only check on home screen
    const recoverable = getRecoverableSession()
    if (recoverable) {
      setRecoverableProjectId(recoverable.projectId)
      setShowRecoveryPrompt(true)
    }
  }, [screen])

  // Tab sync: Listen for draft updates from other tabs (Phase 4)
  useEffect(() => {
    if (typeof window === 'undefined' || screen !== 'editor' || !projectId) return

    const handleStorageChange = (event: StorageEvent) => {
      const draftKey = `mygarage-draft-${projectId}`
      if (event.key === draftKey && event.newValue && event.oldValue !== event.newValue) {
        try {
          const newDraft = JSON.parse(event.newValue) as { project?: typeof project; savedAtMs?: number }
          if (!newDraft?.project) return
          const loadProject = useEditorStore.getState().loadProject
          loadProject(newDraft.project)
          if (typeof newDraft.savedAtMs === 'number') {
            setLastSaveMs(newDraft.savedAtMs)
          }
          setTabSyncNotification('Project synced from another tab')
          setTimeout(() => setTabSyncNotification(null), 3000)
        } catch (err) {
          console.error('Failed to sync project from another tab:', err)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [projectId, screen])

  // Phase 5: Collaborative editing via Supabase realtime
  useEffect(() => {
    if (screen !== 'editor' || !projectId || isGuest || !isSupabaseConfigured || !supabase) return
    const supabaseClient = supabase

    let isDisposed = false
    let clearNotificationTimer: number | null = null
    let channel: RealtimeChannel | null = null

    const setupRealtime = async () => {
      const authUser = await getCurrentUser()
      if (!authUser || isDisposed) return

      channel = supabaseClient
        .channel(`garage-project-${projectId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'garage_projects',
            filter: `project_id=eq.${projectId}`,
          },
          (payload) => {
            if (isDisposed) return
            const row = (payload.new ?? null) as GarageProjectRealtimeRow | null
            if (!row || !row.project_json) return
            if (row.user_id && row.user_id !== authUser.id) return

            const incomingUpdatedAtMs = Number(row.updated_at_ms ?? 0)
            if (!Number.isFinite(incomingUpdatedAtMs) || incomingUpdatedAtMs <= 0) return

            // Ignore stale events and local echoes; apply only newer remote states.
            if (incomingUpdatedAtMs <= lastRealtimeUpdateMsRef.current || incomingUpdatedAtMs <= lastSaveMsRef.current) {
              return
            }

            const store = useEditorStore.getState()
            const incomingProject = row.project_json as typeof store.project
            const incomingJson = JSON.stringify(incomingProject)
            const currentJson = JSON.stringify(store.project)
            if (incomingJson === currentJson) {
              lastRealtimeUpdateMsRef.current = incomingUpdatedAtMs
              return
            }

            store.loadProject(incomingProject)
            useEditorStore.setState({
              targetPaints: (row.target_paints_json as typeof store.targetPaints) ?? store.targetPaints,
              targetPrints: (row.target_prints_json as typeof store.targetPrints) ?? store.targetPrints,
            })

            lastRealtimeUpdateMsRef.current = incomingUpdatedAtMs
            lastAutoSaveStateRef.current = incomingJson
            setLastSaveMs(incomingUpdatedAtMs)
            setTabSyncNotification('Live update synced from another session')

            if (clearNotificationTimer) window.clearTimeout(clearNotificationTimer)
            clearNotificationTimer = window.setTimeout(() => setTabSyncNotification(null), 3000)
          },
        )
        .subscribe()
    }

    void setupRealtime()

    return () => {
      isDisposed = true
      if (clearNotificationTimer) window.clearTimeout(clearNotificationTimer)
      if (channel) {
        void supabaseClient.removeChannel(channel)
      }
    }
  }, [projectId, screen, isGuest])

  // Load project when projectId changes and restore editor state
  useEffect(() => {
    if (screen !== 'editor' || !projectId) return

    const loadProjectAndRestore = async () => {
      try {
        const full = await loadFullProjectByIdWithCloud(projectId)
        const draft = readDraftProject(projectId)
        if (full) {
          selectCar({
            name: full.carName,
            modelUrl: full.modelUrl,
            groundOffsetY: full.groundOffsetY,
          })
        } else if (draft?.car) {
          selectCar(draft.car)
        }

        if (draft) {
          const store = useEditorStore.getState()
          store.loadProject(draft.project)
          useEditorStore.setState({
            targetPaints: draft.targetPaints ?? full?.targetPaints ?? store.targetPaints,
            targetPrints: draft.targetPrints ?? full?.targetPrints ?? store.targetPrints,
          })
          setLastSaveMs(draft.savedAtMs)
        } else if (full) {
          const store = useEditorStore.getState()
          store.loadProject(full.project)
          useEditorStore.setState({
            targetPaints: full.targetPaints,
            targetPrints: full.targetPrints,
          })
          setLastSaveMs(full.updatedAt)
        }

        // Update session
        writeSession({
          projectId,
          screen: 'editor',
          lastSaveMs: Date.now(),
          lastAutoSaveMs: Date.now(),
        })
        confirmSession()
      } catch (err) {
        console.error('Failed to load project:', err)
      } finally {
        setEditorProjectHydrated(true)
      }
    }

    void loadProjectAndRestore()
  }, [projectId, screen, selectCar])

  // Auto-save effect: periodically save state to localStorage
  useEffect(() => {
    if (screen !== 'editor' || !projectId) {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current)
        autoSaveIntervalRef.current = null
      }
      return
    }

    const performAutoSave = () => {
      const liveState = useEditorStore.getState()
      const currentStateJson = JSON.stringify({
        project: liveState.project,
        targetPaints: liveState.targetPaints,
        targetPrints: liveState.targetPrints,
      })
      if (currentStateJson !== lastAutoSaveStateRef.current) {
        lastAutoSaveStateRef.current = currentStateJson
        setIsSaving(true)
        try {
          saveDraftProject(
            projectId,
            liveState.project,
            liveState.selectedCar ?? undefined,
            liveState.targetPaints,
            liveState.targetPrints,
          )
          setLastSaveMs(Date.now())
          setIsSaving(false)
          // Update session
          writeSession({
            projectId,
            screen: 'editor',
            lastSaveMs: Date.now(),
            lastAutoSaveMs: Date.now(),
          })
        } catch (err) {
          console.error('Auto-save failed:', err)
          setIsSaving(false)
        }
      }
    }

    autoSaveIntervalRef.current = window.setInterval(performAutoSave, 15000) // 15 seconds

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current)
        autoSaveIntervalRef.current = null
      }
    }
  }, [screen, projectId])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const updateMobileViewport = () => {
      const mobileViewport = detectMobileEditorViewport()
      const mobileLandscapeViewport = detectMobileLandscapeViewport()
      setIsMobileViewport(mobileViewport)
      setIsMobileLandscapeViewport(mobileLandscapeViewport)

      if (mobileLandscapeViewport) {
        const viewportW = Math.max(1, window.innerWidth - 12)
        const viewportH = Math.max(1, window.innerHeight - 10)
        const targetBaseHeight = Math.max(
          540,
          Math.round((MOBILE_LANDSCAPE_BASE_WIDTH * viewportH) / viewportW),
        )
        setMobileLandscapeBaseHeight(targetBaseHeight)

        const fitScale = Math.min(
          viewportW / MOBILE_LANDSCAPE_BASE_WIDTH,
          viewportH / targetBaseHeight,
        )
        setMobileLandscapeScale(Math.max(0.5, Math.min(1, fitScale)))
      } else {
        setMobileLandscapeScale(1)
        setMobileLandscapeBaseHeight(620)
      }
    }

    updateMobileViewport()
    window.addEventListener('resize', updateMobileViewport)
    window.addEventListener('orientationchange', updateMobileViewport)

    return () => {
      window.removeEventListener('resize', updateMobileViewport)
      window.removeEventListener('orientationchange', updateMobileViewport)
    }
  }, [])

  useEffect(() => {
    if (isMobileViewport || screen !== 'editor' || !selectedLayerId) {
      return
    }

    const selectedLayer = project.layers.find((layer) => layer.id === selectedLayerId)
    if (!selectedLayer || selectedLayer.type === 'group') {
      return
    }

    // Only auto-switch panel when the selected layer type changes, not on every floatingPanel change.
    // This allows the user to manually switch tabs while a layer is selected.
    if (selectedLayer.type === 'stripe') {
      setFloatingPanel((cur) => cur === 'stripes' ? cur : 'stripes')
      return
    }

    if (selectedLayer.type === 'split') {
      setFloatingPanel((cur) => cur === 'split' ? cur : 'split')
      return
    }

    if (selectedLayer.type === 'text') {
      setFloatingPanel((cur) => cur === 'text' ? cur : 'text')
      return
    }

    if (selectedLayer.type === 'decal') {
      setFloatingPanel((cur) => cur === 'elements' ? cur : 'elements')
    }
  }, [isMobileViewport, screen, selectedLayerId])

  const refreshPlanFromCloud = useCallback(async () => {
    // Owner always gets paid - read from the authenticated session so it cannot be spoofed.
    const authUser = await getCurrentUser()
    if (authUser && isOwnerEmail(authUser.email)) {
      writeCachedPlanTier('paid')
      setUserPlan('paid')
      return 'paid' as NonGuestPlanTier
    }

    if (!isSupabaseConfigured) {
      const cached = readCachedPlanTier()
      setUserPlan(cached)
      return cached
    }

    const plan = await getCurrentUserPlanTier()
    if (plan) {
      writeCachedPlanTier(plan)
      setUserPlan(plan)
      return plan
    }

    const cached = readCachedPlanTier()
    setUserPlan(cached)
    return cached
  }, [])

  useEffect(() => {
    markPerfOnce('app_rendered', { screen })
    endPerfSpan('app_boot', { screen })
  }, [screen])

  const warmLikelyEditorPath = useCallback((source: string) => {
    if (editorWarmRef.current) return
    editorWarmRef.current = true
    markPerfOnce('editor_preload_started', { source })
    void loadEditorCanvasModule()
    preloadModelScene(GUEST_MODEL_URL)
  }, [])

  useEffect(() => {
    if (screen === 'selector' || screen === 'profile') {
      warmLikelyEditorPath(screen)
    }
  }, [screen, warmLikelyEditorPath])

  const beginEditorOpen = (source: string) => {
    startPerfSpan('editor_open', { source })
    startPerfSpan('editor_first_interaction', { source })
    startPerfSpan('editor_canvas_ready', { source })
    startPerfSpan('editor_model_loaded', { source })
    startPerfSpan('editor_scene_prepared', { source })
  }

  const handleResizeDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = layerPanelWidth
    const onMove = (mv: MouseEvent) => {
      const delta = startX - mv.clientX
      setLayerPanelWidth(Math.max(200, Math.min(600, startWidth + delta)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const orbitEnabled = !orbitLockToScenePanel || sceneHovered

  const runCloudSync = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setCloudStatusLabel('Cloud: off')
      setCloudStatusTone('warn')
      return
    }

    const user = await getCurrentUser()
    if (!user) {
      setCloudStatusLabel('Cloud: sign in')
      setCloudStatusTone('warn')
      return
    }

    await refreshPlanFromCloud()

    setCloudStatusLabel('Cloud: syncing...')
    setCloudStatusTone('neutral')

    const migrated = await migrateLocalProjectsToCloud()
    const synced = await syncCloudProjectsToLocal()

    if (migrated.ok && synced.ok) {
      const migratedPart = migrated.migrated > 0 ? `migrated ${migrated.migrated}` : 'up to date'
      setCloudStatusLabel(`Cloud: synced (${migratedPart}, ${synced.count} cached)`)
      setCloudStatusTone('ok')
    } else {
      setCloudStatusLabel('Cloud: fallback local')
      setCloudStatusTone('error')
    }
  }, [refreshPlanFromCloud])

  useEffect(() => {
    void runCloudSync()
  }, [runCloudSync])

  useEffect(() => {
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void runCloudSync()
    })
    return () => subscription.unsubscribe()
  }, [runCloudSync])

  useEffect(() => {
    if (screen === 'selector' || screen === 'profile') {
      void runCloudSync()
    }
  }, [screen, runCloudSync])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return
      if (document.querySelector('.svg-maker-page')) return

      if (screen === 'editor' && selectedLayerId && activeTool !== 'mesh-classify' && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault()
        removeLayer(selectedLayerId)
        return
      }

      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo() }
      if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, screen, selectedLayerId, removeLayer, activeTool])

  const handleScreenshot = () => {
    const dataUrl = screenshotRef.current?.(exportQuality)
    if (!dataUrl) return
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `mygarage-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleContinueAsGuest = () => {
    beginEditorOpen('continue_as_guest')
    setIsGuest(true)
    selectCar({
      name: 'Dodge Charger SRT Hellcat',
      modelUrl: GUEST_MODEL_URL,
    })
    const liveState = useEditorStore.getState()
    const freshProject = liveState.project
    setProjectId(freshProject.meta.id)
    saveDraftProject(freshProject.meta.id, freshProject, {
      name: 'Dodge Charger SRT Hellcat',
      modelUrl: GUEST_MODEL_URL,
    }, liveState.targetPaints, liveState.targetPrints)
    writeSession({
      projectId: freshProject.meta.id,
      screen: 'editor',
      lastSaveMs: Date.now(),
      lastAutoSaveMs: Date.now(),
    })
    setScreen('editor')
  }

  const handleOpenProject = async (id: string) => {
    const full = await loadFullProjectByIdWithCloud(id)
    if (!full || !full.modelUrl) {
      alert('This project could not be opened on this device right now. Please try again after syncing or saving once more.')
      return
    }
    beginEditorOpen('profile_project')
    selectCar({
      name: full.carName,
      modelUrl: full.modelUrl,
      groundOffsetY: full.groundOffsetY,
    })
    useEditorStore.getState().loadProject(full.project)
    useEditorStore.setState({ targetPaints: full.targetPaints, targetPrints: full.targetPrints })
    setProjectId(full.id)
    saveDraftProject(full.id, full.project, {
      name: full.carName,
      modelUrl: full.modelUrl,
      groundOffsetY: full.groundOffsetY,
    }, full.targetPaints, full.targetPrints)
    writeSession({
      projectId: full.id,
      screen: 'editor',
      lastSaveMs: Date.now(),
      lastAutoSaveMs: Date.now(),
    })
    setScreen('editor')
  }

  const handleGuestSignIn = () => {
    setGuestAuthOpen(true)
  }

  const handleGuestAuthSuccess = async () => {
    const nextPlan = await refreshPlanFromCloud()
    writeCachedPlanTier(nextPlan)
    setUserPlan(nextPlan)
    setIsGuest(false)
    setGuestAuthOpen(false)
  }

  const handlePlanChange = (plan: NonGuestPlanTier) => {
    writeCachedPlanTier(plan)
    setUserPlan(plan)
  }

  const executeLeaveAction = useCallback((action: LeaveAction) => {
    if (action === 'home') {
      setScreen('home')
      return
    }

    // Ensure no heavy editor overlays survive into the selector route on mobile.
    if (isMobileViewport) {
      setIsCarSwitching(true)
    }
    if (projectId) {
      clearDraftProject(projectId)
    }
    clearSession()
    setShowRecoveryPrompt(false)
    setRecoverableProjectId(null)
    lastAutoSaveStateRef.current = ''
    setFloatingPanel(null)
    setPrintExportOpen(false)
    setSvgMakerOpen(false)
    setSocialPreviewUrl(null)
    setVideoRecordOpen(false)
    setIsRecording(false)
    clearModelSceneCache()
    clearSelectedCar()
    setProjectId(null)
    setScreen('selector')
  }, [isMobileViewport, clearSelectedCar, projectId])

  const handleChangeCar = useCallback(() => {
    setLeavePromptError(null)
    setPendingLeaveAction('change-car')
  }, [])

  const handleGoHome = useCallback(() => {
    setLeavePromptError(null)
    setPendingLeaveAction('home')
  }, [])

  const handleCancelLeavePrompt = useCallback(() => {
    if (leavePromptSaving) return
    setPendingLeaveAction(null)
    setLeavePromptError(null)
  }, [leavePromptSaving])

  const handleLeaveWithoutSaving = useCallback(() => {
    if (!pendingLeaveAction || leavePromptSaving) return
    const action = pendingLeaveAction
    setPendingLeaveAction(null)
    setLeavePromptError(null)
    executeLeaveAction(action)
  }, [pendingLeaveAction, leavePromptSaving, executeLeaveAction])

  const handleSaveBeforeLeaving = useCallback(async () => {
    if (!pendingLeaveAction || leavePromptSaving) return

    setLeavePromptSaving(true)
    setLeavePromptError(null)
    try {
      const liveState = useEditorStore.getState()
      const liveCar = liveState.selectedCar ?? selectedCar

      if (!liveCar) {
        setLeavePromptError('No car selected to save. You can still leave without saving.')
        return
      }

      if (isGuest) {
        const draftId = projectId ?? liveState.project.meta.id
        saveDraftProject(
          draftId,
          liveState.project,
          liveCar,
          liveState.targetPaints,
          liveState.targetPrints,
        )
      } else {
        const result = await saveFullProjectToProfile(
          liveState.project,
          liveCar,
          liveState.targetPaints,
          liveState.targetPrints,
          screenshotRef.current?.() ?? null,
        )
        if (!result.ok) {
          setLeavePromptError(result.error ?? 'Save failed. Please try again or leave without saving.')
          return
        }
      }

      const action = pendingLeaveAction
      setPendingLeaveAction(null)
      executeLeaveAction(action)
    } finally {
      setLeavePromptSaving(false)
    }
  }, [pendingLeaveAction, leavePromptSaving, isGuest, projectId, selectedCar, executeLeaveAction])

  // Handle recovery prompt
  const handleRecoverProject = async () => {
    if (recoverableProjectId) {
      setShowRecoveryPrompt(false)
      setProjectId(recoverableProjectId)
      setScreen('editor')
    }
  }

  const handleDiscardRecovery = () => {
    if (recoverableProjectId) {
      clearDraftProject(recoverableProjectId)
    }
    setShowRecoveryPrompt(false)
    setRecoverableProjectId(null)
  }

  const leavePromptModal = pendingLeaveAction ? (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.56)',
      zIndex: 10020,
      padding: 16,
    }}>
      <div style={{
        width: 'min(460px, 100%)',
        backgroundColor: '#0f141b',
        border: '1px solid rgba(62, 201, 255, 0.24)',
        borderRadius: 12,
        padding: 20,
        color: '#d7e2ec',
        boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
      }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
          Save before leaving?
        </h2>
        <p style={{ margin: '10px 0 0', opacity: 0.84, lineHeight: 1.45 }}>
          {pendingLeaveAction === 'change-car' ? 'You are about to switch cars.' : 'You are about to go back home.'} Save now so your layers and car colors are preserved.
        </p>
        {isGuest && (
          <p style={{ margin: '8px 0 0', opacity: 0.72, fontSize: '0.9rem' }}>
            Guest mode will save a local draft on this device.
          </p>
        )}
        {leavePromptError && (
          <p style={{ margin: '10px 0 0', color: '#fca5a5', fontSize: '0.9rem' }}>{leavePromptError}</p>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleCancelLeavePrompt}
            disabled={leavePromptSaving}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid rgba(138, 160, 180, 0.35)',
              background: 'rgba(255,255,255,0.04)',
              color: '#c7d4e0',
              cursor: leavePromptSaving ? 'default' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleLeaveWithoutSaving}
            disabled={leavePromptSaving}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid rgba(248, 113, 113, 0.45)',
              background: 'rgba(120, 25, 25, 0.2)',
              color: '#fca5a5',
              cursor: leavePromptSaving ? 'default' : 'pointer',
            }}
          >
            Leave Without Saving
          </button>
          <button
            type="button"
            onClick={() => { void handleSaveBeforeLeaving() }}
            disabled={leavePromptSaving}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: '#3ec9ff',
              color: '#0a0f14',
              fontWeight: 700,
              cursor: leavePromptSaving ? 'default' : 'pointer',
            }}
          >
            {leavePromptSaving ? 'Saving...' : 'Save and Leave'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  // Recovery modal
  if (showRecoveryPrompt && recoverableProjectId) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 9999,
      }}>
        <div style={{
          backgroundColor: '#0e1218',
          border: '1px solid rgba(62,201,255,0.2)',
          borderRadius: 12,
          padding: 24,
          maxWidth: 400,
          color: '#c8dae8',
        }}>
          <h2 style={{ marginTop: 0, fontSize: '1.25rem', fontWeight: 600, color: '#fff' }}>
            Resume your project?
          </h2>
          <p style={{ marginBottom: 24, opacity: 0.8 }}>
            We found an unsaved draft of your project. Would you like to resume editing it?
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleDiscardRecovery}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid rgba(62,201,255,0.25)',
                background: 'rgba(255,255,255,0.05)',
                color: '#c8dae8',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleRecoverProject}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                background: '#3ec9ff',
                color: '#000',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 600,
              }}
            >
              Resume
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'home') {
    return <HomePage
      onEnter={() => { beginEditorOpen('home_enter'); setScreen('selector') }}
      onOpenProfile={() => setScreen('profile')}
      onContinueAsGuest={handleContinueAsGuest}
      onLikelyEditorPathVisible={() => warmLikelyEditorPath('home_cta_visible')}
      onLikelyEditorPathIntent={() => warmLikelyEditorPath('home_pointer_intent')}
    />
  }

  if (screen === 'profile' && !isGuest) {
    return <ProfilePage planTier={userPlan} onPlanChange={handlePlanChange} onRefreshPlan={refreshPlanFromCloud} onGoHome={() => setScreen('home')} onGoEditor={() => { beginEditorOpen('profile_editor'); setScreen('selector') }} onOpenProject={handleOpenProject} />
  }

  if (screen === 'selector' || !selectedCar) {
    return <CarSelectorPage onGoHome={() => setScreen('home')} onOpenProfile={() => setScreen('profile')} onEnterEditor={() => {
      beginEditorOpen('selector_enter')
      const liveState = useEditorStore.getState()
      const freshProject = liveState.project
      setProjectId(freshProject.meta.id)
      saveDraftProject(
        freshProject.meta.id,
        freshProject,
        liveState.selectedCar ?? undefined,
        liveState.targetPaints,
        liveState.targetPrints,
      )
      writeSession({
        projectId: freshProject.meta.id,
        screen: 'editor',
        lastSaveMs: Date.now(),
        lastAutoSaveMs: Date.now(),
      })
      setScreen('editor')
    }} isGuest={isGuest} onGuestSignIn={handleGuestSignIn} />
  }

  // EditorCanvas component for both layouts
  const editorCanvasElement = (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading 3D scene...</div>}>
      <EditorCanvas
        modelUrl={selectedCar.modelUrl}
        groundOffsetY={selectedCar.groundOffsetY}
        classifyWindowClickThrough={classifyWindowClickThrough}
        classifyBodyClickThrough={classifyBodyClickThrough}
        classifyShowMeshNames={classifyShowMeshNames}
        orbitEnabled={orbitEnabled}
        lightPreset={lightPreset}
        isRecording={isRecording}
        recordingQuality={exportQuality}
        onRendererReady={(fn) => {
          screenshotRef.current = fn
          setIsCarSwitching(false)
          endPerfSpan('editor_canvas_ready', { carModel: selectedCar.modelUrl })
          endPerfSpan('editor_open', { carModel: selectedCar.modelUrl })
        }}
        onGlbExportReady={(fn) => { exportGlbRef.current = fn }}
        onPrintCaptureReady={(fn) => { printCaptureRef.current = fn }}
        onResetCameraReady={(fn) => { resetCameraRef.current = fn }}
        onVideoRecorderReady={(fn) => setVideoStreamGetter(() => fn)}
        onFirstInteraction={() => endPerfSpan('editor_first_interaction', { carModel: selectedCar.modelUrl })}
      />
    </Suspense>
  )

  // Mobile layout
  if (isMobileViewport) {
    const mobileGuestFullAccess = isGuest
    const mobileIsGuest = mobileGuestFullAccess ? false : isGuest
    const mobilePlanTier = mobileGuestFullAccess ? 'paid' : accountPlan

    return (
      <div className="app-root">
        <TopBar
          mobileCompact
          onScreenshot={handleScreenshot}
          onExportGlb={disableExportActions ? undefined : (options) => exportGlbRef.current?.(options)}
          onSocialExport={disableExportActions ? undefined : () => {
            const url = screenshotRef.current?.()
            if (url) setSocialPreviewUrl(url)
          }}
          onVideoRecord={disableExportActions ? undefined : () => {
            setExportQuality((prev) => (prev === 'standard' ? 'high' : prev))
            setVideoRecordOpen(true)
          }}
          onPrintExport={disableExportActions ? undefined : () => setPrintExportOpen(true)}
          onOpen2DEditor={disableExportActions ? undefined : () => setPrintExportOpen(true)}
          onOpen3DEditor={disableExportActions ? undefined : () => setPrintExportOpen(false)}
          is2DOpen={is2DOpen}
          isSvgMakerOpen={svgMakerOpen}
          onOpenSvgMaker={disableExportActions ? undefined : () => { setSvgMakerOpen((v) => !v); setPrintExportOpen(false) }}
          onSvgCancel={disableExportActions ? undefined : () => setSvgMakerOpen(false)}
          onSvgSave={disableExportActions ? undefined : () => svgSaveRef.current?.()}
          onSvgUndo={disableExportActions ? undefined : () => svgUndoRef.current?.()}
          onSvgRedo={disableExportActions ? undefined : () => svgRedoRef.current?.()}
          onSvgExport={disableExportActions ? undefined : () => svgExportRef.current?.()}
          lightPreset={lightPreset}
          onLightPreset={setLightPreset}
          onResetCamera={() => resetCameraRef.current?.()}
          onChangeCar={handleChangeCar}
          onGoHome={handleGoHome}
          onOpenProfile={() => setScreen('profile')}
          onGuestSignIn={handleGuestSignIn}
          isGuest={mobileIsGuest}
          planTier={mobilePlanTier}
          onUpgradeClick={() => setScreen('profile')}
          onCaptureProfilePreview={() => screenshotRef.current?.() ?? null}
          cloudStatusLabel={cloudStatusLabel}
          cloudStatusTone={cloudStatusTone}
          exportQuality={exportQuality}
          onExportQualityChange={setExportQuality}
          blockGuestSaveToProfile={isGuest}
          disableExportActions={disableExportActions}
          isSaving={isSaving}
          lastSaveMs={lastSaveMs}
        />

        <MobileEditorLayout
          editorCanvas={editorCanvasElement}
          isGuest={mobileIsGuest}
          onGuestSignIn={handleGuestSignIn}
          simplified
        />

        {/* Modals and overlays - same for desktop and mobile */}
        {!disableExportActions && printExportOpen && (
          <Suspense fallback={null}>
            <PrintExportModal
              captureRef={printCaptureRef}
              onClose={() => setPrintExportOpen(false)}
              isGuest={mobileIsGuest}
              onGuestSignIn={handleGuestSignIn}
              planTier={mobilePlanTier}
              onUpgradeClick={() => setScreen('profile')}
            />
          </Suspense>
        )}

        {!disableExportActions && svgMakerOpen && (
          <Suspense fallback={<div style={{ padding: 16 }}>Loading Create a Logo...</div>}>
            <SvgMakerPage
              onClose={() => setSvgMakerOpen(false)}
              saveRef={svgSaveRef}
              undoRef={svgUndoRef}
              redoRef={svgRedoRef}
              exportRef={svgExportRef}
              onSave={({ name, imageUrl, svgMarkup }) => {
                const store = useEditorStore.getState()
                store.addCustomDecalPreset(name, imageUrl, svgMarkup)
                store.addDecalLayer(imageUrl)
                store.setTool('decal')
                setSvgMakerOpen(false)
              }}
            />
          </Suspense>
        )}

        {socialPreviewUrl && (
          <Suspense fallback={null}>
            <SocialExportModal
              dataUrl={socialPreviewUrl}
              onClose={() => setSocialPreviewUrl(null)}
            />
          </Suspense>
        )}

        {videoRecordOpen && (
          <Suspense fallback={null}>
            <VideoRecordModal
              getStream={videoStreamGetter}
              initialQuality={exportQuality}
              onQualityChange={setExportQuality}
              onClose={() => { setVideoRecordOpen(false); setIsRecording(false) }}
              onRecordingChange={setIsRecording}
            />
          </Suspense>
        )}

        <Suspense fallback={null}>
          <GuestAuthModal
            isOpen={guestAuthOpen}
            onClose={() => setGuestAuthOpen(false)}
            onSuccess={handleGuestAuthSuccess}
          />
        </Suspense>

        {isCarSwitching && (
          <div className="car-loading-shield" aria-label="Loading car...">
            <div className="car-loading-spinner">
              <div className="spinner" />
              <p>Loading car...</p>
            </div>
          </div>
        )}

        {leavePromptModal}
      </div>
    )
  }

  // Desktop layout
  const fitCarInView = () => {
    setTimeout(() => resetCameraRef.current?.(), 300)
  }

  const toggleDockPanel = (panel: NonNullable<typeof floatingPanel>) => {
    setFloatingPanel((v) => (v === panel ? null : panel))
    fitCarInView()
  }

  const landscapeRootStyle: CSSProperties | undefined = isMobileLandscapeViewport
    ? {
      '--mobile-landscape-scale': String(mobileLandscapeScale),
      '--mobile-landscape-base-width': `${MOBILE_LANDSCAPE_BASE_WIDTH}px`,
      '--mobile-landscape-base-height': `${mobileLandscapeBaseHeight}px`,
    } as CSSProperties
    : undefined

  return (
    <div className={isMobileLandscapeViewport ? 'app-root app-root-landscape-desktop' : 'app-root'} style={landscapeRootStyle}>
      <TopBar
        onScreenshot={handleScreenshot}
        onExportGlb={disableExportActions ? undefined : (options) => exportGlbRef.current?.(options)}
        onSocialExport={disableExportActions ? undefined : () => {
          const url = screenshotRef.current?.()
          if (url) setSocialPreviewUrl(url)
        }}
        onVideoRecord={disableExportActions ? undefined : () => {
          setExportQuality((prev) => (prev === 'standard' ? 'high' : prev))
          setVideoRecordOpen(true)
        }}
        onPrintExport={disableExportActions ? undefined : () => setPrintExportOpen(true)}
        onOpen2DEditor={disableExportActions ? undefined : () => setPrintExportOpen(true)}
        onOpen3DEditor={disableExportActions ? undefined : () => setPrintExportOpen(false)}
        is2DOpen={is2DOpen}
        isSvgMakerOpen={svgMakerOpen}
        onOpenSvgMaker={disableExportActions ? undefined : () => { setSvgMakerOpen((v) => !v); setPrintExportOpen(false) }}
        onSvgCancel={disableExportActions ? undefined : () => setSvgMakerOpen(false)}
        onSvgSave={disableExportActions ? undefined : () => svgSaveRef.current?.()}
        onSvgUndo={disableExportActions ? undefined : () => svgUndoRef.current?.()}
        onSvgRedo={disableExportActions ? undefined : () => svgRedoRef.current?.()}
        onSvgExport={disableExportActions ? undefined : () => svgExportRef.current?.()}
        lightPreset={lightPreset}
        onLightPreset={setLightPreset}
        onResetCamera={() => resetCameraRef.current?.()}
        onChangeCar={handleChangeCar}
        onGoHome={handleGoHome}
        onOpenProfile={() => setScreen('profile')}
        onGuestSignIn={handleGuestSignIn}
        isGuest={isGuest}
        planTier={accountPlan}
        onUpgradeClick={() => setScreen('profile')}
        onCaptureProfilePreview={() => screenshotRef.current?.() ?? null}
        cloudStatusLabel={cloudStatusLabel}
        cloudStatusTone={cloudStatusTone}
        exportQuality={exportQuality}
        onExportQualityChange={setExportQuality}
        disableExportActions={disableExportActions}
        isSaving={isSaving}
        lastSaveMs={lastSaveMs}
      />

      {!disableExportActions && printExportOpen && (
        <Suspense fallback={null}>
          <PrintExportModal
            captureRef={printCaptureRef}
            onClose={() => setPrintExportOpen(false)}
            isGuest={isGuest}
            onGuestSignIn={handleGuestSignIn}
            planTier={accountPlan}
            onUpgradeClick={() => setScreen('profile')}
          />
        </Suspense>
      )}

      {!disableExportActions && svgMakerOpen && (
        <Suspense fallback={<div style={{ padding: 16 }}>Loading Create a Logo...</div>}>
          <SvgMakerPage
            onClose={() => setSvgMakerOpen(false)}
            saveRef={svgSaveRef}
            undoRef={svgUndoRef}
            redoRef={svgRedoRef}
            exportRef={svgExportRef}
            onSave={({ name, imageUrl, svgMarkup }) => {
              const store = useEditorStore.getState()
              store.addCustomDecalPreset(name, imageUrl, svgMarkup)
              store.addDecalLayer(imageUrl)
              store.setTool('decal')
              setSvgMakerOpen(false)
            }}
          />
        </Suspense>
      )}

      {socialPreviewUrl && (
        <Suspense fallback={null}>
          <SocialExportModal
            dataUrl={socialPreviewUrl}
            onClose={() => setSocialPreviewUrl(null)}
          />
        </Suspense>
      )}

      {videoRecordOpen && (
        <Suspense fallback={null}>
          <VideoRecordModal
            getStream={videoStreamGetter}
            initialQuality={exportQuality}
            onQualityChange={setExportQuality}
            onClose={() => { setVideoRecordOpen(false); setIsRecording(false) }}
            onRecordingChange={setIsRecording}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <GuestAuthModal
          isOpen={guestAuthOpen}
          onClose={() => setGuestAuthOpen(false)}
          onSuccess={handleGuestAuthSuccess}
        />
      </Suspense>

      <main className="workspace" style={{ display: (printExportOpen || svgMakerOpen) ? 'none' : undefined }}>
        <div className="workspace-main">
          <section
            className="scene-panel"
            aria-label="3D car viewport"
            onPointerEnter={() => setSceneHovered(true)}
            onPointerLeave={() => setSceneHovered(false)}
          >
            <Suspense fallback={<div style={{ padding: 16 }}>Loading 3D scene...</div>}>
              <EditorCanvas
                modelUrl={selectedCar.modelUrl}
                groundOffsetY={selectedCar.groundOffsetY}
                classifyWindowClickThrough={classifyWindowClickThrough}
                classifyBodyClickThrough={classifyBodyClickThrough}
                classifyShowMeshNames={classifyShowMeshNames}
                orbitEnabled={orbitEnabled}
                lightPreset={lightPreset}
                isRecording={isRecording}
                recordingQuality={exportQuality}
                onRendererReady={(fn) => {
                  screenshotRef.current = fn
                  setIsCarSwitching(false)
                  endPerfSpan('editor_canvas_ready', { carModel: selectedCar.modelUrl })
                  endPerfSpan('editor_open', { carModel: selectedCar.modelUrl })
                }}
                onGlbExportReady={(fn) => { exportGlbRef.current = fn }}
                onPrintCaptureReady={(fn) => { printCaptureRef.current = fn }}
                onResetCameraReady={(fn) => { resetCameraRef.current = fn }}
                onVideoRecorderReady={(fn) => setVideoStreamGetter(() => fn)}
                onFirstInteraction={() => endPerfSpan('editor_first_interaction', { carModel: selectedCar.modelUrl })}
              />
            </Suspense>

            <ClassifyLegend
              classifyWindowClickThrough={classifyWindowClickThrough}
              classifyBodyClickThrough={classifyBodyClickThrough}
              classifyShowMeshNames={classifyShowMeshNames}
              setClassifyWindowClickThrough={setClassifyWindowClickThrough}
              setClassifyBodyClickThrough={setClassifyBodyClickThrough}
              setClassifyShowMeshNames={setClassifyShowMeshNames}
            />

            <div className="scene-tab-rail" aria-label="Tools and inspector tabs">
              <button
                type="button"
                className={floatingPanel === 'car' ? 'bottom-dock-tab active' : 'bottom-dock-tab'}
                onClick={() => toggleDockPanel('car')}
                title="Wrap Color"
              >
                <Palette size={22} />
                <span>Wrap Color</span>
              </button>
              <button
                type="button"
                className={floatingPanel === 'text' ? 'bottom-dock-tab active' : 'bottom-dock-tab'}
                onClick={() => toggleDockPanel('text')}
                title="Text"
              >
                <Type size={22} />
                <span>Text</span>
              </button>
              <button
                type="button"
                className={floatingPanel === 'elements' ? 'bottom-dock-tab active' : 'bottom-dock-tab'}
                onClick={() => toggleDockPanel('elements')}
                title="Elements / Decals"
              >
                <Layers size={22} />
                <span>Elements</span>
              </button>
              <button
                type="button"
                className={floatingPanel === 'stripes' ? 'bottom-dock-tab active' : 'bottom-dock-tab'}
                onClick={() => toggleDockPanel('stripes')}
                title="Racing Stripes"
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                  <rect x="4" y="3" width="4" height="18" rx="1.4" />
                  <rect x="10" y="3" width="4" height="18" rx="1.4" />
                  <rect x="16" y="3" width="4" height="18" rx="1.4" opacity="0.45" />
                </svg>
                <span>Stripes</span>
              </button>
              <button
                type="button"
                className={floatingPanel === 'split' ? 'bottom-dock-tab active' : 'bottom-dock-tab'}
                onClick={() => toggleDockPanel('split')}
                title="Split paint"
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3.5" y="4" width="17" height="16" rx="2.6" />
                  <path d="M12 4v16" />
                  <path d="M6.5 8.5h5.5" opacity="0.8" />
                  <path d="M12 15.5h5.5" opacity="0.8" />
                </svg>
                <span>Split</span>
              </button>
              <button
                type="button"
                className={floatingPanel === 'prints' ? 'bottom-dock-tab active' : 'bottom-dock-tab'}
                onClick={() => toggleDockPanel('prints')}
                title="Prints"
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M7 8V4h10v4" />
                  <rect x="5" y="9" width="14" height="8" rx="2.3" />
                  <rect x="7" y="14" width="10" height="6" rx="1.2" />
                  <circle cx="16.8" cy="12.5" r="0.9" fill="currentColor" stroke="none" />
                </svg>
                <span>Print</span>
              </button>
              <button
                type="button"
                className={floatingPanel === 'tint' ? 'bottom-dock-tab active' : 'bottom-dock-tab'}
                onClick={() => toggleDockPanel('tint')}
                title="Window tint"
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 17 5 8c.3-1.4 1.4-2 3-2h8c1.6 0 2.7.6 3 2l2 9c.3 1.2-.5 2-1.9 2H4.9C3.5 19 2.7 18.2 3 17Z" />
                  <path d="M3.7 14h16.6" opacity="0.9" />
                  <path d="M12 6v8" opacity="0.45" />
                  <rect x="4" y="14" width="16" height="5" rx="1.6" fill="currentColor" opacity="0.22" stroke="none" />
                </svg>
                <span>Tint</span>
              </button>
            </div>
          </section>

          <section
            className={`layer-panel-wrap${layerPanelCollapsed ? ' layer-panel-collapsed' : ''}`}
            style={{ width: layerPanelCollapsed ? 36 : layerPanelWidth }}
            aria-label="Layers"
          >
            {!layerPanelCollapsed && (
              <div className="layer-panel-resize-handle" onMouseDown={handleResizeDrag} />
            )}
            <div className="layer-panel-header-bar">
              <button
                type="button"
                className="layer-panel-collapse-btn"
                onClick={() => setLayerPanelCollapsed((v) => !v)}
                title={layerPanelCollapsed ? 'Expand layers' : 'Collapse layers'}
              >
                {layerPanelCollapsed ? '\u2039' : '\u203a'}
              </button>
              {!layerPanelCollapsed && <span className="layer-panel-title">Layers</span>}
            </div>
            {!layerPanelCollapsed && <LayerPanel />}
          </section>
        </div>

        <section className="bottom-dock" aria-label="Tools and inspector">
          {floatingPanel === 'prints' && (
            <div className="bottom-dock-panel-area">
              <Suspense fallback={<div style={{ padding: 12, color: '#8ea0b4' }}>Loading...</div>}>
                <PrintLibraryPanel onClose={() => {
                  setFloatingPanel(null)
                  fitCarInView()
                }} isGuest={isGuest} onGuestSignIn={() => setGuestAuthOpen(true)} />
              </Suspense>
            </div>
          )}

          {floatingPanel && floatingPanel !== 'prints' && (
            <div className="bottom-dock-inspector bottom-dock-inspector--mobile is-tab-open">
              <MobileEditorLayout
                embedded
                embeddedTab={floatingPanel}
                editorCanvas={null}
                isGuest={isGuest}
                onGuestSignIn={handleGuestSignIn}
              />
            </div>
          )}

        </section>
      </main>

      {isCarSwitching && isMobileViewport && (
        <div className="car-loading-shield" aria-label="Loading car...">
          <div className="car-loading-spinner">
            <div className="spinner" />
            <p>Loading car...</p>
          </div>
        </div>
      )}

      {tabSyncNotification && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          background: 'rgba(74, 222, 128, 0.1)',
          border: '1px solid rgba(74, 222, 128, 0.3)',
          borderRadius: 8,
          padding: '12px 16px',
          color: '#4ade80',
          fontSize: '0.9rem',
          fontWeight: 500,
          zIndex: 1000,
          backdropFilter: 'blur(10px)',
          animation: 'slideInRight 0.3s ease-out',
        }}>
          ✓ {tabSyncNotification}
        </div>
      )}

      {leavePromptModal}
    </div>
  )
}

export default App


