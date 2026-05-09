import { useEffect, useRef, useState } from 'react'
import { X, Video, Square } from 'lucide-react'
import type { ExportQuality } from '../../types/exportQuality'
import { EXPORT_QUALITY_LABELS, EXPORT_QUALITY_ORDER } from '../../types/exportQuality'

type Props = {
  getStream: (quality?: ExportQuality) => MediaStream
  onClose: () => void
  /** called with true when recording starts so the scene can enable auto-rotate */
  onRecordingChange?: (recording: boolean) => void
  initialQuality?: ExportQuality
  onQualityChange?: (quality: ExportQuality) => void
}

const DURATIONS = [5, 10, 15, 30]
const FORMATS = [
  { id: 'landscape', label: '▬ 16:9', title: 'Landscape (fullscreen)' },
  { id: 'portrait',  label: '▮ 9:16', title: 'Portrait (vertical / Reels)' },
] as const
type Format = typeof FORMATS[number]['id']

export function VideoRecordModal({ getStream, onClose, onRecordingChange, initialQuality = 'high', onQualityChange }: Props) {
  const [duration, setDuration] = useState(10)
  const [format, setFormat] = useState<Format>('landscape')
  const [quality, setQuality] = useState<ExportQuality>(initialQuality)
  const [recording, setRecording] = useState(false)
  const [progress, setProgress] = useState(0) // 0–100
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)

  const VIDEO_BITRATE_BY_QUALITY: Record<ExportQuality, number> = {
    standard: 6_000_000,
    high: 10_000_000,
    ultra: 16_000_000,
  }

  const VIDEO_FPS_BY_QUALITY: Record<ExportQuality, number> = {
    standard: 30,
    high: 30,
    ultra: 45,
  }

  const PORTRAIT_SIZE_BY_QUALITY: Record<ExportQuality, { width: number; height: number }> = {
    standard: { width: 720, height: 1280 },
    high: { width: 900, height: 1600 },
    ultra: { width: 1080, height: 1920 },
  }

  useEffect(() => {
    setQuality(initialQuality)
  }, [initialQuality])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (hiddenVideoRef.current) { hiddenVideoRef.current.srcObject = null; hiddenVideoRef.current = null }
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [blobUrl])

  function pickMp4MimeType(): string | null {
    const candidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4',
    ]
    return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? null
  }

  function startRecording() {
    setError(null)
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
      setBlobUrl(null)
    }
    setRecordedBlob(null)
    chunksRef.current = []
    setProgress(0)
    setRecording(true)
    onRecordingChange?.(true)

    // Wait two animation frames so the 4K dpr resize takes effect before capturing
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const fps = VIDEO_FPS_BY_QUALITY[quality] ?? VIDEO_FPS_BY_QUALITY.high
      const bitrate = VIDEO_BITRATE_BY_QUALITY[quality] ?? VIDEO_BITRATE_BY_QUALITY.high
      const rawStream = getStream(quality)

      // For portrait 9:16 — draw center-cropped frames from source onto an offscreen canvas
      let captureStream = rawStream
      if (format === 'portrait') {
        const portraitSize = PORTRAIT_SIZE_BY_QUALITY[quality] ?? PORTRAIT_SIZE_BY_QUALITY.high
        const oc = document.createElement('canvas')
        oc.width = portraitSize.width
        oc.height = portraitSize.height
        offscreenRef.current = oc
        const ctx = oc.getContext('2d')!
        const vid = document.createElement('video')
        vid.srcObject = rawStream
        vid.muted = true
        hiddenVideoRef.current = vid
        void vid.play()
        const PORTRAIT_FPS = fps
        const PORTRAIT_INTERVAL = 1000 / PORTRAIT_FPS
        let lastDrawTime = 0
        const draw = (now: number) => {
          if (now - lastDrawTime >= PORTRAIT_INTERVAL) {
            lastDrawTime = now
            if (vid.readyState >= 2) {
              const vw = vid.videoWidth || oc.width
              const vh = vid.videoHeight || oc.height
              // Center-crop source to 9:16
              const targetAspect = 9 / 16
              let sw = vw
              let sh = Math.round(vw / targetAspect)
              if (sh > vh) { sh = vh; sw = Math.round(vh * targetAspect) }
              const sx = (vw - sw) / 2
              const sy = (vh - sh) / 2
              ctx.drawImage(vid, sx, sy, sw, sh, 0, 0, oc.width, oc.height)
            }
          }
          rafRef.current = requestAnimationFrame(draw)
        }
        rafRef.current = requestAnimationFrame(draw)
        captureStream = oc.captureStream(fps)
      }

      const mimeType = pickMp4MimeType()
      if (!mimeType) {
        setError('This browser cannot record MP4 directly. Please use a browser/device with MP4 MediaRecorder support.')
        setRecording(false)
        onRecordingChange?.(false)
        return
      }

      const recorderOptions: MediaRecorderOptions = {
        videoBitsPerSecond: bitrate,
        mimeType,
      }
      let recorder: MediaRecorder
      const effectiveMimeType = mimeType
      try {
        recorder = new MediaRecorder(captureStream, recorderOptions)
      } catch {
        setError('MP4 recorder failed to start. Try a different browser/device that supports MP4 recording.')
        setRecording(false)
        onRecordingChange?.(false)
        return
      }
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        // Cleanup portrait resources
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
        if (hiddenVideoRef.current) { hiddenVideoRef.current.srcObject = null; hiddenVideoRef.current = null }
        offscreenRef.current = null

        if (chunksRef.current.length === 0) {
          setError('Video export failed (no frames encoded). Try Standard quality.')
          setRecording(false)
          setProgress(0)
          onRecordingChange?.(false)
          return
        }

        const blob = new Blob(chunksRef.current, { type: effectiveMimeType })
        setRecordedBlob(blob)
        setBlobUrl(URL.createObjectURL(blob))
        setRecording(false)
        setProgress(100)
        onRecordingChange?.(false)
      }

      recorder.onerror = () => {
        setError('Video encoder failed. Try Standard quality for maximum compatibility.')
      }

      recorder.start(250)
      startTimeRef.current = performance.now()

      timerRef.current = setInterval(() => {
        const elapsed = (performance.now() - startTimeRef.current) / 1000
        const pct = Math.min((elapsed / duration) * 100, 100)
        setProgress(pct)
        if (elapsed >= duration) {
          stopRecording()
        }
      }, 100)
    }))
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    recorderRef.current?.stop()
  }

  async function handleDownload() {
    if (!blobUrl || !recordedBlob) return

    // On mobile Safari/Chrome this opens the share sheet so users can Save Video to Photos.
    if (typeof navigator !== 'undefined' && 'share' in navigator && typeof File !== 'undefined') {
      try {
        const file = new File([recordedBlob], `mygarage-${duration}s-${Date.now()}.mp4`, { type: recordedBlob.type || 'video/mp4' })
        const canShare = 'canShare' in navigator
          ? (navigator as Navigator & { canShare?: (data?: ShareData) => boolean }).canShare?.({ files: [file] })
          : true
        if (canShare) {
          await navigator.share({
            files: [file],
            title: 'mygarage video',
            text: 'Save this video to Photos',
          })
          return
        }
      } catch {
        // Fall back to download when share is unavailable/cancelled.
      }
    }

    const a = document.createElement('a')
    a.href = blobUrl
    a.download = `mygarage-${duration}s-${Date.now()}.mp4`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <>
      <div className="social-modal-backdrop" onClick={recording ? undefined : onClose} />
      <div className="social-modal video-record-modal">
        <div className="social-modal-header">
          <span className="social-modal-title">🎥 Record Video</span>
          {!recording && (
            <button type="button" className="social-modal-close" onClick={onClose} title="Close">
              <X size={16} />
            </button>
          )}
        </div>

        <p className="video-record-hint">
          Picks up the live 3D scene. Enable <strong>⟳ Spin</strong> before recording for a smooth turntable.
        </p>

        <div className="video-duration-row">
          <span className="video-duration-label">Quality</span>
          {EXPORT_QUALITY_ORDER.map((q) => (
            <button
              key={q}
              type="button"
              disabled={recording}
              className={`social-format-chip${q === quality ? ' active' : ''}`}
              style={{ flex: '1', padding: '8px 0', textAlign: 'center' }}
              onClick={() => {
                setQuality(q)
                onQualityChange?.(q)
              }}
            >
              <span className="social-format-label">{EXPORT_QUALITY_LABELS[q]}</span>
            </button>
          ))}
        </div>

        <div className="video-duration-row">
          <span className="video-duration-label">Format</span>
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              disabled={recording}
              className={`social-format-chip${f.id === format ? ' active' : ''}`}
              style={{ flex: '1', padding: '8px 0', textAlign: 'center' }}
              title={f.title}
              onClick={() => setFormat(f.id)}
            >
              <span className="social-format-label">{f.label}</span>
            </button>
          ))}
        </div>

        <div className="video-duration-row">
          <span className="video-duration-label">Duration</span>
          {DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              disabled={recording}
              className={`social-format-chip${d === duration ? ' active' : ''}`}
              style={{ flex: '1', padding: '8px 0', textAlign: 'center' }}
              onClick={() => setDuration(d)}
            >
              <span className="social-format-label">{d}s</span>
            </button>
          ))}
        </div>

        {recording && (
          <div className="video-progress-wrap">
            <div className="video-progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}

        {error && (
          <div className="selector-hint selector-hint-warn" role="alert" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}

        {blobUrl && (
          <video
            className="video-preview"
            src={blobUrl}
            controls
            loop
            autoPlay
            muted
          />
        )}

        <div className="social-modal-actions">
          {!recording && !blobUrl && (
            <button type="button" className="social-download-btn" onClick={startRecording}>
              <Video size={16} />
              Start Recording
            </button>
          )}
          {recording && (
            <button type="button" className="social-download-btn" style={{ background: '#6a1a1a', borderColor: '#9a3a3a' }} onClick={stopRecording}>
              <Square size={16} />
              Stop Early
            </button>
          )}
          {blobUrl && (
            <>
              <button type="button" className="social-download-btn" onClick={handleDownload}>
                Save Video 🎬
              </button>
              <button type="button" className="social-cancel-btn" onClick={() => { setBlobUrl(null); setProgress(0) }}>
                Re-record
              </button>
            </>
          )}
          {!recording && (
            <button type="button" className="social-cancel-btn" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </>
  )
}
