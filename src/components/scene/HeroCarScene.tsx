// HeroCarScene replaced with looping video for performance and visual quality.
// The Three.js canvas is no longer used on the homepage.

export function HeroCarScene({ modelUrl: _modelUrl }: { modelUrl?: string }) {
  return (
    <video
      className="hero-car-canvas"
      autoPlay
      loop
      muted
      playsInline
      disablePictureInPicture
      aria-hidden="true"
    >
      <source src="/hero.webm" type="video/webm" />
      <source src="/hero.mp4" type="video/mp4" />
    </video>
  )
}
