/**
 * DEV-ONLY: Car Preview Capture Tool
 *
 * Renders each manifest car one at a time and auto-downloads a .webp snapshot.
 * Place the downloaded files in  public/models/previews/  and they will
 * automatically appear in the car selector as real images -- zero WebGL cost.
 *
 * Usage: visit  ?screen=capture-previews  while the dev server is running.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { NativeOrbitControls } from '../scene/NativeOrbitControls'
import { useModelScene } from '../scene/useModelScene'

type CarManifestItem = {
  name: string
  fileName: string
  modelUrl: string
  groundOffsetY?: number
}

function resolveMinY(root: THREE.Object3D): number {
  let minY = Infinity
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const box = new THREE.Box3().setFromObject(child)
    if (Number.isFinite(box.min.y)) minY = Math.min(minY, box.min.y)
  })
  return Number.isFinite(minY) ? minY : 0
}

function CaptureScene({
  item,
  onCapture,
}: {
  item: CarManifestItem
  onCapture: (fileName: string, dataUrl: string) => void
}) {
  const { gl } = useThree()
  const { scene: gltfScene } = useModelScene(item.modelUrl)
  const firedRef = useRef(false)
  const scenePosition = useMemo<[number, number, number]>(() => {
    const snapY = resolveMinY(gltfScene)
    const y = -snapY + (item.groundOffsetY ?? 0)
    return [-0.75, y, 0]
  }, [gltfScene, item.groundOffsetY])

  useEffect(() => {
    if (firedRef.current) return
    firedRef.current = true

    const id = setTimeout(() => {
      const dataUrl = gl.domElement.toDataURL('image/webp', 0.92)
      onCapture(item.fileName, dataUrl)
    }, 900)

    return () => clearTimeout(id)
  }, [gltfScene, gl, item, onCapture])

  return (
    <group position={scenePosition}>
      <primitive object={gltfScene} />
    </group>
  )
}

function CarCaptureCanvas({
  item,
  onCapture,
}: {
  item: CarManifestItem
  onCapture: (fileName: string, dataUrl: string) => void
}) {
  return (
    <Canvas
      key={item.modelUrl}
      camera={{ position: [-2.2, 1.6, 3.8], fov: 36 }}
      gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
      style={{ width: 768, height: 768, borderRadius: 8 }}
    >
      <color attach="background" args={['#111111']} />
      <ambientLight intensity={3.0} color="#dde8ff" />
      <spotLight intensity={14} position={[-5, 8, 5]} angle={0.36} penumbra={0.2} distance={40} color="#ffffff" />
      <spotLight intensity={7} position={[6, 5, 3]} angle={0.55} penumbra={0.5} distance={32} color="#fff6e8" />
      <spotLight intensity={9} position={[0, 7, -9]} angle={0.4} penumbra={0.35} distance={36} color="#eef4ff" />
      <pointLight intensity={2.2} position={[0, -0.5, 1.5]} color="#7ab0dd" distance={12} />
      <Suspense fallback={null}>
        <CaptureScene item={item} onCapture={onCapture} />
      </Suspense>
      <NativeOrbitControls enabled={false} enableRotate={false} enableZoom={false} enablePan={false} target={[0.7, 0.55, 0]} />
    </Canvas>
  )
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = fileName
  a.click()
}

export function CarPreviewCapturePage({ onGoHome }: { onGoHome?: () => void }) {
  const [manifest, setManifest] = useState<CarManifestItem[]>([])
  const [currentIndex, setCurrentIndex] = useState<number | null>(null)
  const [captured, setCaptured] = useState<Record<string, string>>({})
  const [status, setStatus] = useState('Load manifest to begin.')

  useEffect(() => {
    fetch('/models/manifest.json')
      .then((r) => r.json())
      .then((data: { items?: CarManifestItem[] }) => {
        setManifest(data.items ?? [])
        setStatus(`${data.items?.length ?? 0} cars ready. Press "Capture All" to begin.`)
      })
      .catch(() => setStatus('Failed to load manifest.'))
  }, [])

  const handleCapture = useCallback((fileName: string, dataUrl: string) => {
    setCaptured((prev) => ({ ...prev, [fileName]: dataUrl }))
    const base = fileName.replace(/\.[^.]+$/, '')
    downloadDataUrl(dataUrl, `${base}.webp`)
    setStatus(`Captured: ${fileName}`)
    setCurrentIndex((prev) => (prev !== null ? prev + 1 : null))
  }, [])

  const currentItem = currentIndex !== null ? (manifest[currentIndex] ?? null) : null
  const doneCount = Object.keys(captured).length
  const isDone = manifest.length > 0 && doneCount >= manifest.length
  const isRunning = currentIndex !== null && !isDone

  const handleCaptureAll = () => {
    if (manifest.length === 0) return
    setCaptured({})
    setCurrentIndex(0)
    setStatus('Capturing...')
  }

  const handleDownloadAll = () => {
    for (const [fileName, dataUrl] of Object.entries(captured)) {
      const base = fileName.replace(/\.[^.]+$/, '')
      downloadDataUrl(dataUrl, `${base}.webp`)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: 'system-ui, sans-serif', padding: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        {onGoHome && (
          <button onClick={onGoHome} style={btn}>Back</button>
        )}
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Car Preview Capture Tool</h1>
        <span style={{ background: '#21262d', border: '1px solid #30363d', borderRadius: 6, padding: '2px 10px', fontSize: 12, color: '#8b949e' }}>
          DEV ONLY
        </span>
      </div>

      <p style={{ color: '#8b949e', margin: '0 0 24px', fontSize: 14, maxWidth: 640 }}>
        Renders each car and downloads a <code style={{ background: '#161b22', padding: '1px 6px', borderRadius: 4 }}>.webp</code> snapshot.
        Place files in <code style={{ background: '#161b22', padding: '1px 6px', borderRadius: 4 }}>public/models/previews/</code> and the
        selector uses them as plain images with no WebGL cost at runtime.
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <button
          onClick={handleCaptureAll}
          disabled={manifest.length === 0 || isRunning}
          style={{ ...btn, background: isRunning ? '#21262d' : '#238636', borderColor: isRunning ? '#30363d' : '#2ea043' }}
        >
          {isRunning ? `Capturing ${doneCount + 1} / ${manifest.length}...` : 'Capture All'}
        </button>
        {doneCount > 0 && (
          <button onClick={handleDownloadAll} style={{ ...btn, background: '#1f6feb', borderColor: '#388bfd' }}>
            Re-download All ({doneCount})
          </button>
        )}
      </div>

      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '8px 16px', marginBottom: 24, fontSize: 13 }}>
        {status}{isDone ? ' Done -- place the .webp files in public/models/previews/' : ''}
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {currentItem && (
          <div>
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 6 }}>
              Capturing: <strong style={{ color: '#e6edf3' }}>{currentItem.name}</strong>
            </div>
            <CarCaptureCanvas item={currentItem} onCapture={handleCapture} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flex: 1 }}>
          {manifest.map((item) => {
            const dataUrl = captured[item.fileName]
            const isActive = currentItem?.fileName === item.fileName
            return (
              <div key={item.fileName} style={{ width: 148 }}>
                <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}
                </div>
                {dataUrl ? (
                  <img
                    src={dataUrl}
                    alt={item.name}
                    style={{ width: 148, height: 148, objectFit: 'cover', borderRadius: 8, border: '2px solid #238636' }}
                  />
                ) : (
                  <div style={{
                    width: 148, height: 148, borderRadius: 8,
                    background: isActive ? '#0d2614' : '#21262d',
                    border: `2px solid ${isActive ? '#2ea043' : '#30363d'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: '#484f58',
                  }}>
                    {isActive ? 'capturing...' : 'pending'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const btn: React.CSSProperties = {
  background: '#21262d',
  border: '1px solid #30363d',
  borderRadius: 6,
  color: '#e6edf3',
  padding: '6px 16px',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
}
