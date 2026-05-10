import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Layers, Type, Car } from 'lucide-react'
import { useEditorStore } from './store/editorStore'
import { CarSelectorPage } from './components/ui/CarSelectorPage'
import { HomePage } from './components/ui/HomePage'
import { ProfilePage } from './components/ui/ProfilePage'
import { MobileEditorLayout } from './components/ui/MobileEditorLayout'
import type { GlbExportOptions, GlbExportResult, LightPresetId } from './components/scene/EditorCanvas'
import { clearModelSceneCache, preloadModelScene } from './components/scene/useModelScene'
import { InspectorPanel } from './components/ui/InspectorPanel'
import { LayerPanel } from './components/ui/LayerPanel'
import { TopBar } from './components/ui/TopBar'
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
const MOBILE_EDITOR_MEDIA_QUERY = '(max-width: 860px)'
const CHUNK_RELOAD_SESSION_KEY = 'mygarage-chunk-reload-attempted'

function isChunkLoadFailure(error: unknown): boolean {
  if (!error) return false
  const message = error instanceof Error ? error.message : String(error)
  return /ChunkLoadError|Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed|dynamically imported module/i.test(message)
}

function detectMobileEditorViewport(): boolean {
  if (typeof window === 'undefined') return false

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

import { GuestAuthModal } from './components/ui/GuestAuthModal'

const DecalLibraryPanel = lazy(async () => {
  const mod = await import('./components/ui/DecalLibraryPanel')
  return { default: mod.DecalLibraryPanel }
})

const TextLibraryPanel = lazy(async () => {
  const mod = await import('./components/ui/TextLibraryPanel')
  return { default: mod.TextLibraryPanel }
})

const CarLibraryPanel = lazy(async () => {
  const mod = await import('./components/ui/CarLibraryPanel')
  return { default: mod.CarLibraryPanel }
})

const SplitLibraryPanel = lazy(async () => {
  const mod = await import('./components/ui/SplitLibraryPanel')
  return { default: mod.SplitLibraryPanel }
})

const StripeLibraryPanel = lazy(async () => {
  const mod = await import('./components/ui/StripeLibraryPanel')
  return { default: mod.StripeLibraryPanel }
})

const WindowTintPanel = lazy(async () => {
  const mod = await import('./components/ui/WindowTintPanel')
  return { default: mod.WindowTintPanel }
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
  const [floatingPanel, setFloatingPanel] = useState<'elements' | 'text' | 'car' | 'split' | 'stripes' | 'tint' | 'prints' | null>(null)
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    return detectMobileEditorViewport()
  })
  const [mobilePanelExpanded, setMobilePanelExpanded] = useState(false)
  const carSplit = useEditorStore((state) => state.project.carSplit)
  const carStripe = useEditorStore((state) => state.project.carStripe)
  const [sceneHovered, setSceneHovered] = useState(false)
  const [layerPanelCollapsed, setLayerPanelCollapsed] = useState(false)
  const [layerPanelWidth, setLayerPanelWidth] = useState(320)
  const [lightPreset, setLightPreset] = useState<LightPresetId>('studio')
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
  const is2DOpen = printExportOpen
  const editorWarmRef = useRef(false)
  const skipHistoryPushRef = useRef(false)
  const historyHydratedRef = useRef(false)
  const autoSaveIntervalRef = useRef<number | null>(null)
  const lastAutoSaveStateRef = useRef<string>('')
  const lastRealtimeUpdateMsRef = useRef<number>(0)
  const lastSaveMsRef = useRef<number>(lastSaveMs)
  const accountPlan = isGuest ? 'guest' : userPlan

  useEffect(() => {
    lastSaveMsRef.current = lastSaveMs
  }, [lastSaveMs])

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

    const mediaQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia(MOBILE_EDITOR_MEDIA_QUERY)
      : null

    const updateMobileViewport = () => {
      setIsMobileViewport(detectMobileEditorViewport())
    }

    updateMobileViewport()
    if (mediaQuery) {
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', updateMobileViewport)
      } else if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(updateMobileViewport)
      }
    }
    window.addEventListener('resize', updateMobileViewport)
    window.addEventListener('orientationchange', updateMobileViewport)

    return () => {
      if (mediaQuery) {
        if (typeof mediaQuery.removeEventListener === 'function') {
          mediaQuery.removeEventListener('change', updateMobileViewport)
        } else if (typeof mediaQuery.removeListener === 'function') {
          mediaQuery.removeListener(updateMobileViewport)
        }
      }
      window.removeEventListener('resize', updateMobileViewport)
      window.removeEventListener('orientationchange', updateMobileViewport)
    }
  }, [])

  useEffect(() => {
    if (!floatingPanel || !isMobileViewport) {
      setMobilePanelExpanded(false)
      return
    }
    // Mobile opens compact by default; tap the panel or toggle button to expand.
    setMobilePanelExpanded(false)
  }, [floatingPanel, isMobileViewport])

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
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (document.querySelector('.svg-maker-page')) return
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo() }
      if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

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
    setMobilePanelExpanded(false)
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
          onExportGlb={(options) => exportGlbRef.current?.(options)}
          onSocialExport={() => {
            const url = screenshotRef.current?.()
            if (url) setSocialPreviewUrl(url)
          }}
          onVideoRecord={() => {
            setExportQuality((prev) => (prev === 'standard' ? 'high' : prev))
            setVideoRecordOpen(true)
          }}
          onPrintExport={() => setPrintExportOpen(true)}
          onOpen2DEditor={() => setPrintExportOpen(true)}
          onOpen3DEditor={() => setPrintExportOpen(false)}
          is2DOpen={is2DOpen}
          isSvgMakerOpen={svgMakerOpen}
          onOpenSvgMaker={() => { setSvgMakerOpen((v) => !v); setPrintExportOpen(false) }}
          onSvgCancel={() => setSvgMakerOpen(false)}
          onSvgSave={() => svgSaveRef.current?.()}
          onSvgUndo={() => svgUndoRef.current?.()}
          onSvgRedo={() => svgRedoRef.current?.()}
          onSvgExport={() => svgExportRef.current?.()}
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
        {printExportOpen && (
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

        {svgMakerOpen && (
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
  return (
    <div className="app-root">
      <TopBar
        onScreenshot={handleScreenshot}
        onExportGlb={(options) => exportGlbRef.current?.(options)}
        onSocialExport={() => {
          const url = screenshotRef.current?.()
          if (url) setSocialPreviewUrl(url)
        }}
        onVideoRecord={() => {
          setExportQuality((prev) => (prev === 'standard' ? 'high' : prev))
          setVideoRecordOpen(true)
        }}
        onPrintExport={() => setPrintExportOpen(true)}
        onOpen2DEditor={() => setPrintExportOpen(true)}
        onOpen3DEditor={() => setPrintExportOpen(false)}
        is2DOpen={is2DOpen}
        isSvgMakerOpen={svgMakerOpen}
        onOpenSvgMaker={() => { setSvgMakerOpen((v) => !v); setPrintExportOpen(false) }}
        onSvgCancel={() => setSvgMakerOpen(false)}
        onSvgSave={() => svgSaveRef.current?.()}
        onSvgUndo={() => svgUndoRef.current?.()}
        onSvgRedo={() => svgRedoRef.current?.()}
        onSvgExport={() => svgExportRef.current?.()}
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
        isSaving={isSaving}
        lastSaveMs={lastSaveMs}
      />

      {printExportOpen && (
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

      {svgMakerOpen && (
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
            <div className="fab-group">
              <button
                type="button"
                className={floatingPanel === 'car' ? 'car-fab active' : 'car-fab'}
                onClick={() => setFloatingPanel((value) => (value === 'car' ? null : 'car'))}
                aria-label={floatingPanel === 'car' ? 'Close car paint tools' : 'Open car paint tools'}
                title={floatingPanel === 'car' ? 'Close car paint tools' : 'Open car paint tools'}
              >
                <Car size={24} />
              </button>
              <span className="fab-label">Car</span>

              <button
                type="button"
                className={floatingPanel === 'text' ? 'text-fab active' : 'text-fab'}
                onClick={() => setFloatingPanel((value) => (value === 'text' ? null : 'text'))}
                aria-label={floatingPanel === 'text' ? 'Close text library' : 'Open text library'}
                title={floatingPanel === 'text' ? 'Close text library' : 'Open text library'}
              >
                <Type size={24} />
              </button>
              <span className="fab-label">Text</span>

              <button
                type="button"
                className={floatingPanel === 'elements' ? 'decal-fab active' : 'decal-fab'}
                onClick={() => setFloatingPanel((value) => (value === 'elements' ? null : 'elements'))}
                aria-label={floatingPanel === 'elements' ? 'Close elements library' : 'Open elements library'}
                title={floatingPanel === 'elements' ? 'Close elements library' : 'Open elements library'}
              >
                <Layers size={24} />
              </button>
              <span className="fab-label">Elements</span>

              <button
                type="button"
                className={floatingPanel === 'stripes' || carStripe.enabled ? 'stripes-fab active' : 'stripes-fab'}
                onClick={() => setFloatingPanel((value) => (value === 'stripes' ? null : 'stripes'))}
                aria-label={floatingPanel === 'stripes' ? 'Close racing stripes tools' : 'Open racing stripes tools'}
                title={floatingPanel === 'stripes' ? 'Close racing stripes tools' : 'Open racing stripes tools'}
              >
                <span>RS</span>
              </button>
              <span className="fab-label">Stripes</span>

              <button
                type="button"
                className={floatingPanel === 'split' || carSplit.enabled ? 'split-fab active' : 'split-fab'}
                onClick={() => setFloatingPanel((value) => (value === 'split' ? null : 'split'))}
                aria-label={floatingPanel === 'split' ? 'Close split paint tools' : 'Open split paint tools'}
                title={floatingPanel === 'split' ? 'Close split paint tools' : 'Open split paint tools'}
              >
                <span>S</span>
              </button>
              <span className="fab-label">Split</span>

              <button
                type="button"
                className={floatingPanel === 'prints' ? 'prints-fab active' : 'prints-fab'}
                onClick={() => setFloatingPanel((value) => (value === 'prints' ? null : 'prints'))}
                aria-label={floatingPanel === 'prints' ? 'Close prints library' : 'Open prints library'}
                title={floatingPanel === 'prints' ? 'Close prints library' : 'Open prints library'}
              >
                {/* Camouflage / pattern icon */}
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
                  <rect x="2" y="2" width="5" height="5" rx="1" opacity="0.9" />
                  <rect x="9" y="2" width="7" height="3" rx="1" opacity="0.7" />
                  <rect x="18" y="4" width="4" height="4" rx="1" opacity="0.85" />
                  <rect x="2" y="9" width="3" height="7" rx="1" opacity="0.75" />
                  <rect x="7" y="7" width="5" height="5" rx="1" opacity="0.95" />
                  <rect x="14" y="9" width="8" height="3" rx="1" opacity="0.7" />
                  <rect x="2" y="18" width="6" height="4" rx="1" opacity="0.8" />
                  <rect x="10" y="14" width="5" height="8" rx="1" opacity="0.9" />
                  <rect x="17" y="14" width="5" height="5" rx="1" opacity="0.65" />
                  <rect x="6" y="20" width="3" height="2" rx="1" opacity="0.5" />
                </svg>
              </button>
              <span className="fab-label">Print</span>

              <button
                type="button"
                className={floatingPanel === 'tint' ? 'tint-fab active' : 'tint-fab'}
                onClick={() => setFloatingPanel((value) => (value === 'tint' ? null : 'tint'))}
                aria-label={floatingPanel === 'tint' ? 'Close window tint tools' : 'Open window tint tools'}
                title={floatingPanel === 'tint' ? 'Close window tint tools' : 'Open window tint tools'}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 17 L5 8 Q5.5 6 8 6 L16 6 Q18.5 6 19 8 L21 17 Q21.5 18.5 20 19 L4 19 Q2.5 18.5 3 17 Z" />
                  <line x1="3" y1="14" x2="21" y2="14" />
                  <line x1="12" y1="6" x2="12" y2="14" />
                </svg>
              </button>
              <span className="fab-label">Tint</span>
            </div>

            {floatingPanel ? (
              <>
                <div
                  className="floating-panel-backdrop"
                  onClick={() => setFloatingPanel(null)}
                  aria-label="Close panel"
                />
                <div
                  className={`floating-decal-panel${isMobileViewport ? (mobilePanelExpanded ? ' mobile-expanded' : ' mobile-collapsed') : ''}`}
                  onClickCapture={(event) => {
                    if (!isMobileViewport || mobilePanelExpanded) return
                    const target = event.target as HTMLElement
                    if (target.closest('.floating-panel-size-toggle')) return
                    setMobilePanelExpanded(true)
                  }}
                >
                  {isMobileViewport && (
                    <button
                      type="button"
                      className="floating-panel-size-toggle"
                      onClick={() => setMobilePanelExpanded((value) => !value)}
                      aria-label={mobilePanelExpanded ? 'Collapse panel' : 'Expand panel'}
                      title={mobilePanelExpanded ? 'Collapse panel' : 'Expand panel'}
                    >
                      {mobilePanelExpanded ? 'Collapse' : 'Expand'}
                    </button>
                  )}
                  <Suspense fallback={<div style={{ padding: 12 }}>Loading panel...</div>}>
                    {floatingPanel === 'elements' ? (
                      <DecalLibraryPanel onDecalPicked={() => setFloatingPanel(null)} isGuest={isGuest} onGuestSignIn={() => setGuestAuthOpen(true)} />
                    ) : floatingPanel === 'text' ? (
                      <TextLibraryPanel onFontPicked={() => setFloatingPanel(null)} isGuest={isGuest} onGuestSignIn={() => setGuestAuthOpen(true)} />
                    ) : floatingPanel === 'car' ? (
                      <CarLibraryPanel onClose={() => setFloatingPanel(null)} />
                    ) : floatingPanel === 'split' ? (
                      <SplitLibraryPanel onClose={() => setFloatingPanel(null)} />
                    ) : floatingPanel === 'stripes' ? (
                      <StripeLibraryPanel onClose={() => setFloatingPanel(null)} />
                    ) : floatingPanel === 'prints' ? (
                      <PrintLibraryPanel onClose={() => setFloatingPanel(null)} isGuest={isGuest} onGuestSignIn={() => setGuestAuthOpen(true)} />
                    ) : (
                      <WindowTintPanel />
                    )}
                  </Suspense>
                </div>
              </>
            ) : null}

            <ClassifyLegend
              classifyWindowClickThrough={classifyWindowClickThrough}
              classifyBodyClickThrough={classifyBodyClickThrough}
              classifyShowMeshNames={classifyShowMeshNames}
              setClassifyWindowClickThrough={setClassifyWindowClickThrough}
              setClassifyBodyClickThrough={setClassifyBodyClickThrough}
              setClassifyShowMeshNames={setClassifyShowMeshNames}
            />
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

        <section className="inspector-toolbar" aria-label="Inspector toolbar">
          <InspectorPanel />
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


