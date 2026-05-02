import { useEffect, useRef, useState } from 'react'
import { X, Video, Square } from 'lucide-react'

type Props = {
  getStream: () => MediaStream
  onClose: () => void
  /** called with true when recording starts so the scene can enable auto-rotate */
  onRecordingChange?: (recording: boolean) => void
}

const DURATIONS = [5, 10, 15, 30]

export function VideoRecordModal({ getStream, onClose, onRecordingChange }: Props) {
  const [duration, setDuration] = useState(10)
  const [recording, setRecording] = useState(false)
  const [progress, setProgress] = useState(0) // 0–100
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [blobUrl])

  function pickMimeType() {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ]
    return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
  }

  function startRecording() {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
      setBlobUrl(null)
    }
    chunksRef.current = []
    setProgress(0)

    const stream = getStream()
    const mimeType = pickMimeType()
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    recorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' })
      setBlobUrl(URL.createObjectURL(blob))
      setRecording(false)
      setProgress(100)
      onRecordingChange?.(false)
    }

    recorder.start(100)
    setRecording(true)
    onRecordingChange?.(true)
    startTimeRef.current = performance.now()

    timerRef.current = setInterval(() => {
      const elapsed = (performance.now() - startTimeRef.current) / 1000
      const pct = Math.min((elapsed / duration) * 100, 100)
      setProgress(pct)
      if (elapsed >= duration) {
        stopRecording()
      }
    }, 100)
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    recorderRef.current?.stop()
  }

  function handleDownload() {
    if (!blobUrl) return
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = `mygarage-${duration}s-${Date.now()}.webm`
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
                Download WebM
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
