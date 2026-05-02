import { useEffect, useRef, useState } from 'react'
import { Layers, Type, Car } from 'lucide-react'
import { useEditorStore } from './store/editorStore'
import { CarSelectorPage } from './components/ui/CarSelectorPage'
import { HomePage } from './components/ui/HomePage'
import { ProfilePage } from './components/ui/ProfilePage'
import { EditorCanvas } from './components/scene/EditorCanvas'
import type { LightPresetId } from './components/scene/EditorCanvas'
import { DecalLibraryPanel } from './components/ui/DecalLibraryPanel'
import { TextLibraryPanel } from './components/ui/TextLibraryPanel'
import { CarLibraryPanel } from './components/ui/CarLibraryPanel'
import { SplitLibraryPanel } from './components/ui/SplitLibraryPanel'
import { StripeLibraryPanel } from './components/ui/StripeLibraryPanel'
import { WindowTintPanel } from './components/ui/WindowTintPanel'
import { PrintLibraryPanel } from './components/ui/PrintLibraryPanel'
import { InspectorPanel } from './components/ui/InspectorPanel'
import { LayerPanel } from './components/ui/LayerPanel'
import { TopBar } from './components/ui/TopBar'
import { SvgMakerPage } from './components/ui/SvgMakerModal'
import { PrintExportModal } from './components/ui/PrintExportModal'
import { SocialExportModal } from './components/ui/SocialExportModal'
import { VideoRecordModal } from './components/ui/VideoRecordModal'
import { GuestAuthModal } from './components/ui/GuestAuthModal'
import { readResumeSnapshot } from './lib/resumeSnapshot'
import { loadFullProjectById } from './lib/savedProjects'
import './App.css'

function ClassifyLegend({
  classifyWindowClickThrough,
  setClassifyWindowClickThrough,
}: {
  classifyWindowClickThrough: boolean
  setClassifyWindowClickThrough: (value: boolean) => void
}) {
  const activeTool = useEditorStore((state) => state.activeTool)
  const setTool = useEditorStore((state) => state.setTool)
  const clearMeshClassifications = useEditorStore((state) => state.clearMeshClassifications)
  const classifyLocked = useEditorStore((state) => state.classifyLocked)
  const selectedCar = useEditorStore((state) => state.selectedCar)
  const meshClassifications = useEditorStore((state) => state.project.meshClassifications)
  const lockClassify = useEditorStore((state) => state.lockClassify)
  if (activeTool !== 'mesh-classify') return null
  const fileName = selectedCar?.modelUrl.split('/').pop() ?? ''

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
      <button
        type="button"
        className="classify-clear-btn"
        onClick={() => setClassifyWindowClickThrough(!classifyWindowClickThrough)}
      >
        {classifyWindowClickThrough ? 'Pass Through Window: On' : 'Pass Through Window: Off'}
      </button>
      {classifyLocked && (
        <div className="classify-legend-row" style={{ color: '#f59e0b', fontSize: '0.72rem', marginTop: 4 }}>
          🔒 Some meshes are system-locked and cannot be changed
        </div>
      )}
      <button type="button" className="classify-clear-btn" onClick={() => { clearMeshClassifications(); setTool('orbit') }}>
        Reset My Classify
      </button>
      {fileName && (
        <button
          type="button"
          className="classify-clear-btn"
          style={{ marginTop: 6, background: '#166534' }}
          onClick={() => { lockClassify(fileName, meshClassifications); setTool('orbit') }}
        >
          Save Classify for All 🔒
        </button>
      )}
    </div>
  )
}

function App() {
  const selectCar = useEditorStore((state) => state.selectCar)
  const selectedCar = useEditorStore((state) => state.selectedCar)
  const [screen, setScreen] = useState<'home' | 'profile' | 'selector' | 'editor'>('home')
  const [isGuest, setIsGuest] = useState(false)
  const [classifyWindowClickThrough, setClassifyWindowClickThrough] = useState(false)
  const orbitLockToScenePanel = useEditorStore((state) => state.orbitLockToScenePanel)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const [floatingPanel, setFloatingPanel] = useState<'elements' | 'text' | 'car' | 'split' | 'stripes' | 'tint' | 'prints' | null>(null)
  const carSplit = useEditorStore((state) => state.project.carSplit)
  const carStripe = useEditorStore((state) => state.project.carStripe)
  const [sceneHovered, setSceneHovered] = useState(false)
  const [layerPanelCollapsed, setLayerPanelCollapsed] = useState(false)
  const [layerPanelWidth, setLayerPanelWidth] = useState(320)
  const [lightPreset, setLightPreset] = useState<LightPresetId>('studio')
  const screenshotRef = useRef<(() => string) | null>(null)
  const printCaptureRef = useRef<import('./components/scene/EditorCanvas').PrintCaptureFn | null>(null)
  const resetCameraRef = useRef<import('./components/scene/EditorCanvas').ResetCameraFn | null>(null)
  const [videoStreamGetter, setVideoStreamGetter] = useState<(() => MediaStream) | null>(null)
  const [printExportOpen, setPrintExportOpen] = useState(false)
  const [svgMakerOpen, setSvgMakerOpen] = useState(false)
  const [socialPreviewUrl, setSocialPreviewUrl] = useState<string | null>(null)
  const [videoRecordOpen, setVideoRecordOpen] = useState(false)
  const [guestAuthOpen, setGuestAuthOpen] = useState(false)
  const is2DOpen = printExportOpen

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo() }
      if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  const handleScreenshot = () => {
    const dataUrl = screenshotRef.current?.()
    if (!dataUrl) return
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `mygarage-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleContinueAsGuest = () => {
    setIsGuest(true)
    selectCar({
      name: 'Dodge Charger SRT Hellcat',
      modelUrl: '/models/dodge_charger_srt_hellcat__high_quality.glb',
    })
    setScreen('editor')
  }

  const handleContinueEditing = async () => {
    try {
      const resume = readResumeSnapshot()
      const raw = localStorage.getItem('mygarage-last-car')
      const { fileName: lastCarFileName } = raw ? (JSON.parse(raw) as { fileName?: string }) : {}
      const fileName = resume?.fileName ?? lastCarFileName
      if (!fileName) { setScreen('selector'); return }

      // Check imported cars first (data URL models stored in localStorage)
      const importedRaw = localStorage.getItem('mygarage-imported-cars-v1')
      if (importedRaw) {
        const imported = JSON.parse(importedRaw) as Array<{ name: string; fileName: string; modelUrl: string }>
        const match = imported.find((c) => c.fileName === fileName)
        if (match) {
          selectCar({ name: match.name, modelUrl: match.modelUrl })
          if (resume && resume.fileName === fileName) {
            useEditorStore.getState().loadProject(resume.project)
          }
          setScreen('editor')
          return
        }
      }

      // Fall back to manifest
      const res = await fetch('/models/manifest.json')
      const manifest = await res.json() as { items: Array<{ name: string; fileName: string; modelUrl: string; groundOffsetY?: number; realWorldLengthM?: number; realWorldWidthM?: number; realWorldHeightM?: number }> }
      const car = manifest.items.find((c) => c.fileName === fileName)
      if (car) {
        selectCar({
          name: car.name,
          modelUrl: car.modelUrl,
          groundOffsetY: car.groundOffsetY,
          realWorldLengthM: car.realWorldLengthM,
          realWorldWidthM: car.realWorldWidthM,
          realWorldHeightM: car.realWorldHeightM,
        })
        if (resume && resume.fileName === fileName) {
          useEditorStore.getState().loadProject(resume.project)
        }
        setScreen('editor')
      } else {
        setScreen('selector')
      }
    } catch {
      setScreen('selector')
    }
  }

  const handleStartNewProject = () => {
    setScreen('selector')
  }

  const handleOpenProject = (id: string) => {
    const full = loadFullProjectById(id)
    if (!full || !full.modelUrl) return
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

  const handleGuestAuthSuccess = () => {
    setIsGuest(false)
    setGuestAuthOpen(false)
  }

  if (screen === 'home') {
    return <HomePage
      onEnter={() => setScreen('editor')}
      onOpenProfile={() => setScreen('profile')}
      onContinueAsGuest={handleContinueAsGuest}
      onContinueEditing={handleContinueEditing}
      onStartNewProject={handleStartNewProject}
    />
  }

  if (screen === 'profile' && !isGuest) {
    return <ProfilePage onGoHome={() => setScreen('home')} onGoEditor={() => setScreen('editor')} onOpenProject={handleOpenProject} />
  }

  if (screen === 'selector' || !selectedCar) {
    return <CarSelectorPage onGoHome={() => setScreen('home')} onOpenProfile={() => setScreen('profile')} onEnterEditor={() => setScreen('editor')} />
  }

  return (
    <div className="app-root">
      <TopBar
        onScreenshot={handleScreenshot}
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
        lightPreset={lightPreset}
        onLightPreset={setLightPreset}
        onResetCamera={() => resetCameraRef.current?.()}
        onGoHome={() => setScreen('home')}
        onOpenProfile={() => setScreen('profile')}
        onGuestSignIn={handleGuestSignIn}
        isGuest={isGuest}
        onCaptureProfilePreview={() => screenshotRef.current?.() ?? null}
      />

      {printExportOpen && (
        <PrintExportModal
          captureRef={printCaptureRef}
          onClose={() => setPrintExportOpen(false)}
        />
      )}

      {svgMakerOpen && (
        <SvgMakerPage
          onClose={() => setSvgMakerOpen(false)}
          onSave={({ name, imageUrl, svgMarkup }) => {
            const store = useEditorStore.getState()
            store.addCustomDecalPreset(name, imageUrl, svgMarkup)
            store.addDecalLayer(imageUrl)
            store.setTool('decal')
            setSvgMakerOpen(false)
          }}
        />
      )}

      {socialPreviewUrl && (
        <SocialExportModal
          dataUrl={socialPreviewUrl}
          onClose={() => setSocialPreviewUrl(null)}
        />
      )}

      {videoRecordOpen && videoStreamGetter && (
        <VideoRecordModal
          getStream={videoStreamGetter}
          onClose={() => setVideoRecordOpen(false)}
        />
      )}

      <GuestAuthModal
        isOpen={guestAuthOpen}
        onClose={() => setGuestAuthOpen(false)}
        onSuccess={handleGuestAuthSuccess}
      />

      <main className="workspace" style={{ display: (printExportOpen || svgMakerOpen) ? 'none' : undefined }}>
        <div className="workspace-main">
          <section
            className="scene-panel"
            aria-label="3D car viewport"
            onPointerEnter={() => setSceneHovered(true)}
            onPointerLeave={() => setSceneHovered(false)}
          >
            <EditorCanvas
              modelUrl={selectedCar.modelUrl}
              groundOffsetY={selectedCar.groundOffsetY}
              classifyWindowClickThrough={classifyWindowClickThrough}
              orbitEnabled={orbitEnabled}
              lightPreset={lightPreset}
              onRendererReady={(fn) => { screenshotRef.current = fn }}
              onPrintCaptureReady={(fn) => { printCaptureRef.current = fn }}
              onResetCameraReady={(fn) => { resetCameraRef.current = fn }}
              onVideoRecorderReady={setVideoStreamGetter}
            />
            <div className="fab-group">
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
              <span className="fab-label">Prints</span>
            </div>

            {floatingPanel ? (
              <>
                <div
                  className="floating-panel-backdrop"
                  onClick={() => setFloatingPanel(null)}
                  aria-label="Close panel"
                />
                <div className="floating-decal-panel">
                  {floatingPanel === 'elements' ? (
                    <DecalLibraryPanel onDecalPicked={() => setFloatingPanel(null)} />
                  ) : floatingPanel === 'text' ? (
                    <TextLibraryPanel onFontPicked={() => setFloatingPanel(null)} />
                  ) : floatingPanel === 'car' ? (
                    <CarLibraryPanel onClose={() => setFloatingPanel(null)} />
                  ) : floatingPanel === 'split' ? (
                    <SplitLibraryPanel onClose={() => setFloatingPanel(null)} />
                  ) : floatingPanel === 'stripes' ? (
                    <StripeLibraryPanel onClose={() => setFloatingPanel(null)} />
                  ) : floatingPanel === 'prints' ? (
                    <PrintLibraryPanel onClose={() => setFloatingPanel(null)} />
                  ) : (
                    <WindowTintPanel />
                  )}
                </div>
              </>
            ) : null}

            <ClassifyLegend
              classifyWindowClickThrough={classifyWindowClickThrough}
              setClassifyWindowClickThrough={setClassifyWindowClickThrough}
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
    </div>
  )
}

export default App
