import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './index.css'
import App from './App.tsx'
import { startPerfSpan } from './lib/perfDebug'
import { ErrorBoundary } from './components/ui/ErrorBoundary'

// Dev-only preview capture tool — excluded from production builds
const CarPreviewCapturePage = import.meta.env.DEV
  ? lazy(() => import('./components/ui/CarPreviewCapturePage').then((m) => ({ default: m.CarPreviewCapturePage })))
  : null

startPerfSpan('app_boot')

const adsenseClient = (import.meta.env.VITE_GOOGLE_ADSENSE_CLIENT as string | undefined)?.trim()
if (adsenseClient && /^ca-pub-\d+$/.test(adsenseClient)) {
  const existing = document.getElementById('adsense-auto-script') as HTMLScriptElement | null
  if (!existing) {
    const script = document.createElement('script')
    script.async = true
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adsenseClient)}`
    script.crossOrigin = 'anonymous'
    script.id = 'adsense-auto-script'
    document.head.appendChild(script)
  }
}

const isCaptureTool =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get('screen') === 'capture-previews'

const BUILD_ID_KEY = 'mygarage-build-id'

async function shouldReloadForNewBuild(): Promise<boolean> {
  if (!import.meta.env.PROD) return false

  try {
    const currentBuildId = __APP_BUILD_ID__
    const previousBuildId = localStorage.getItem(BUILD_ID_KEY)

    if (!previousBuildId || previousBuildId === currentBuildId) {
      localStorage.setItem(BUILD_ID_KEY, currentBuildId)
      return false
    }

    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }

    localStorage.setItem(BUILD_ID_KEY, currentBuildId)
    return true
  } catch {
    return false
  }
}

async function bootstrap() {
  const needsReload = await shouldReloadForNewBuild()
  if (needsReload) {
    window.location.reload()
    return
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {isCaptureTool && CarPreviewCapturePage ? (
        <Suspense fallback={<div style={{ padding: 32, color: '#e6edf3', background: '#0d1117', minHeight: '100vh' }}>Loading capture tool...</div>}>
          <CarPreviewCapturePage onGoHome={() => { window.location.search = '' }} />
        </Suspense>
      ) : (
        <>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
          <SpeedInsights />
        </>
      )}
    </StrictMode>,
  )
}

void bootstrap()
