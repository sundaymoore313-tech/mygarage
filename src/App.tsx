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
import { loadFullProjectByIdWithCloud, migrateLocalProjectsToCloud, syncCloudProjectsToLocal } from './lib/savedProjects'
import { getCurrentUser, getCurrentUserPlanTier, isSupabaseConfigured, supabase } from './lib/supabase'
import type { ExportQuality } from './types/exportQuality'
import './App.css'

const GUEST_MODEL_URL = '/models/dodge_charger_srt_hellcat__high_quality.glb'
const SCREEN_QUERY_KEY = 'screen'
const MOBILE_EDITOR_MEDIA_QUERY = '(max-width: 860px)'

type AppScreen = 'home' | 'profile' | 'selector' | 'editor'

function isAppScreen(value: unknown): value is AppScreen {
  return value === 'home' || value === 'profile' || value === 'selector' || value === 'editor'
}

function readScreenFromUrl(): AppScreen | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const value = params.get(SCREEN_QUERY_KEY)
  return isAppScreen(value) ? value : null
}

function buildUrlForScreen(screen: AppScreen): string {
  if (typeof window === 'undefined') return ''
  const url = new URL(window.location.href)
  if (screen === 'home') {
    url.searchParams.delete(SCREEN_QUERY_KEY)
  } else {
    url.searchParams.set(SCREEN_QUERY_KEY, screen)
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

const GuestAuthModal = lazy(async () => {
  const mod = await import('./components/ui/GuestAuthModal')
  return { default: mod.GuestAuthModal }
})

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
      <div className="classify-legend-title">Mesh Classifier — click to cycle</div>
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
  const [screen, setScreen] = useState<AppScreen>(() => readScreenFromUrl() ?? 'home')
  const [isGuest, setIsGuest] = useState(false)
  const [userPlan, setUserPlan] = useState<NonGuestPlanTier>(() => readCachedPlanTier())
  const [classifyWindowClickThrough, setClassifyWindowClickThrough] = useState(false)
  const [classifyBodyClickThrough, setClassifyBodyClickThrough] = useState(false)
  const [classifyShowMeshNames, setClassifyShowMeshNames] = useState(false)
  const orbitLockToScenePanel = useEditorStore((state) => state.orbitLockToScenePanel)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const [floatingPanel, setFloatingPanel] = useState<'elements' | 'text' | 'car' | 'split' | 'stripes' | 'tint' | 'prints' | null>(null)
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(MOBILE_EDITOR_MEDIA_QUERY).matches
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
  const is2DOpen = printExportOpen
  const editorWarmRef = useRef(false)
  const skipHistoryPushRef = useRef(false)
  const historyHydratedRef = useRef(false)
  const accountPlan = isGuest ? 'guest' : userPlan

  useEffect(() => {
    if (typeof window === 'undefined') return

    const initialScreen = readScreenFromUrl() ?? 'home'
    window.history.replaceState({ mygarage: true, screen: initialScreen }, '', buildUrlForScreen(initialScreen))

    if (initialScreen !== screen) {
      skipHistoryPushRef.current = true
      setScreen(initialScreen)
    }

    const onPopState = (event: PopStateEvent) => {
      const stateScreen = (event.state as { screen?: unknown } | null)?.screen
      const nextScreen = isAppScreen(stateScreen) ? stateScreen : (readScreenFromUrl() ?? 'home')
      skipHistoryPushRef.current = true
      setScreen(nextScreen)
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

    window.history.pushState({ mygarage: true, screen }, '', buildUrlForScreen(screen))
  }, [screen])

  useEffect(() => {
    if (screen === 'editor' && !selectedCar) {
      setScreen('selector')
    }
  }, [screen, selectedCar])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mediaQuery = window.matchMedia(MOBILE_EDITOR_MEDIA_QUERY)
    const handleMediaQueryChange = (event: MediaQueryListEvent) => {
      setIsMobileViewport(event.matches)
    }
    setIsMobileViewport(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleMediaQueryChange)
    return () => mediaQuery.removeEventListener('change', handleMediaQueryChange)
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
    // Owner always gets paid — read from the authenticated session so it can't be spoofed.
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
    setScreen('editor')
  }

  const handleOpenProject = async (id: string) => {
    const full = await loadFullProjectByIdWithCloud(id)
    if (!full || !full.modelUrl) return
    beginEditorOpen('profile_project')
    selectCar({
      name: full.carName,
      modelUrl: full.modelUrl,
      groundOffsetY: full.groundOffsetY,
    })
    useEditorStore.getState().loadProject(full.project)
    useEditorStore.setState({ targetPaints: full.targetPaints, targetPrints: full.targetPrints })
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

  const handleChangeCar = useCallback(() => {
    // Ensure no heavy editor overlays survive into the selector route on mobile.
    if (isMobileViewport) {
      setIsCarSwitching(true)
    }
    setFloatingPanel(null)
    setPrintExportOpen(false)
    setSvgMakerOpen(false)
    setSocialPreviewUrl(null)
    setVideoRecordOpen(false)
    setIsRecording(false)
    setMobilePanelExpanded(false)
    clearModelSceneCache()
    clearSelectedCar()
    setScreen('selector')
  }, [isMobileViewport, clearSelectedCar])

  if (screen === 'home') {
    return <HomePage
      onEnter={() => { beginEditorOpen('home_enter'); setScreen('editor') }}
      onOpenProfile={() => setScreen('profile')}
      onContinueAsGuest={handleContinueAsGuest}
      onLikelyEditorPathVisible={() => warmLikelyEditorPath('home_cta_visible')}
      onLikelyEditorPathIntent={() => warmLikelyEditorPath('home_pointer_intent')}
    />
  }

  if (screen === 'profile' && !isGuest) {
    return <ProfilePage planTier={userPlan} onPlanChange={handlePlanChange} onRefreshPlan={refreshPlanFromCloud} onGoHome={() => setScreen('home')} onGoEditor={() => { beginEditorOpen('profile_editor'); setScreen('editor') }} onOpenProject={handleOpenProject} />
  }

  if (screen === 'selector' || !selectedCar) {
    return <CarSelectorPage onGoHome={() => setScreen('home')} onOpenProfile={() => setScreen('profile')} onEnterEditor={() => { beginEditorOpen('selector_enter'); setScreen('editor') }} isGuest={isGuest} onGuestSignIn={handleGuestSignIn} />
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
          onVideoRecord={() => setVideoRecordOpen(true)}
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
          onGoHome={() => setScreen('home')}
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
        />

        <MobileEditorLayout
          editorCanvas={editorCanvasElement}
          isGuest={isGuest}
          onGuestSignIn={handleGuestSignIn}
          simplified
        />

        {/* Modals and overlays - same for desktop and mobile */}
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

        {videoRecordOpen && videoStreamGetter && (
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
        onVideoRecord={() => setVideoRecordOpen(true)}
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
        onGoHome={() => setScreen('home')}
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

      {videoRecordOpen && videoStreamGetter && (
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
    </div>
  )
}

export default App
