import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startPerfSpan } from './lib/perfDebug'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
