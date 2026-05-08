import { useCallback, useRef } from 'react'

// HeroCarScene replaced with looping video for performance and visual quality.
// The Three.js canvas is no longer used on the homepage.

export function HeroCarScene({ modelUrl: _modelUrl }: { modelUrl?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return

    // Restart slightly before the absolute end to avoid visible end-frame hitches.
    const loopGuardSeconds = 0.04
    if (video.currentTime >= video.duration - loopGuardSeconds) {
      video.currentTime = 0
      void video.play()
    }
  }, [])

  return (
    <video
      ref={videoRef}
      className="hero-car-canvas"
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      onTimeUpdate={handleTimeUpdate}
      aria-hidden="true"
    >
      <source src="/hero.webm" type="video/webm" />
      <source src="/hero.mp4" type="video/mp4" />
    </video>
  )
}
