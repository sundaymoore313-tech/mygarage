import { useEffect, useMemo, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { cleanFontDisplayName } from '../../lib/fontNames'

type TextLibraryPanelProps = {
  onFontPicked?: () => void
  isGuest?: boolean
  onGuestSignIn?: () => void
}

type FontPreset = {
  label: string
  family: string
  url?: string
  source?: 'custom' | 'preset'
}

type FontManifestItem = {
  name: string
  family: string
  fileName: string
  url: string
}

type FontManifest = {
  generatedAt: string
  items: FontManifestItem[]
}

const MANIFEST_URL = '/fonts/manifest.json'

const FONT_PRESETS: FontPreset[] = [
  { label: 'Arial', family: 'Arial' },
  { label: 'Verdana', family: 'Verdana' },
  { label: 'Trebuchet', family: 'Trebuchet MS' },
  { label: 'Tahoma', family: 'Tahoma' },
  { label: 'Georgia', family: 'Georgia' },
  { label: 'Times', family: 'Times New Roman' },
  { label: 'Courier', family: 'Courier New' },
  { label: 'Impact', family: 'Impact' },
]

export function TextLibraryPanel({ onFontPicked, isGuest = false, onGuestSignIn }: TextLibraryPanelProps) {
  const addTextLayer = useEditorStore((state) => state.addTextLayer)
  const setTool = useEditorStore((state) => state.setTool)

  const [customFonts, setCustomFonts] = useState<FontPreset[]>([])
  const [guestPrompt, setGuestPrompt] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const guestPromptTimerRef = useRef<number | null>(null)

  const showGuestPrompt = (feature: string) => {
    setGuestPrompt(`Create an account to use ${feature}.`)
    if (guestPromptTimerRef.current !== null) {
      window.clearTimeout(guestPromptTimerRef.current)
    }
    guestPromptTimerRef.current = window.setTimeout(() => {
      setGuestPrompt(null)
      guestPromptTimerRef.current = null
    }, 2800)
  }

  const handleImportFont = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isGuest) {
      showGuestPrompt('Font Import')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      const fontFamily = file.name.replace(/\.[^/.]+$/, '') // Remove extension
      const cleanedLabel = cleanFontDisplayName(fontFamily)
      
      // Add font-face to styles
      let style = document.getElementById('mygarage-custom-fonts') as HTMLStyleElement | null
      if (!style) {
        style = document.createElement('style')
        style.id = 'mygarage-custom-fonts'
        document.head.appendChild(style)
      }
      style.textContent += `\n@font-face { font-family: "${fontFamily} (imported)"; src: url("${dataUrl}"); font-display: swap; }`
      
      // Add new font to custom fonts
      const newFont: FontPreset = {
        label: cleanedLabel,
        family: `${fontFamily} (imported)`,
        url: dataUrl,
        source: 'custom',
      }
      setCustomFonts((prev) => [newFont, ...prev])
    }
    reader.readAsDataURL(file)

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  useEffect(() => {
    let mounted = true

    async function loadFonts() {
      try {
        const response = await fetch(MANIFEST_URL, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error('Font manifest not found')
        }

        const json = (await response.json()) as FontManifest
        const manifestItems = Array.isArray(json.items) ? json.items : []

        const css = manifestItems
          .map((item) => {
            const family = item.family.replace(/"/g, "'")
            return `@font-face { font-family: "${family}"; src: url("${item.url}"); font-display: swap; }`
          })
          .join('\n')

        let style = document.getElementById('mygarage-custom-fonts') as HTMLStyleElement | null
        if (!style) {
          style = document.createElement('style')
          style.id = 'mygarage-custom-fonts'
          document.head.appendChild(style)
        }
        style.textContent = css

        if (!mounted) {
          return
        }

        setCustomFonts(
          manifestItems.map((item) => ({
            label: cleanFontDisplayName(item.name || item.fileName),
            family: item.family,
            url: item.url,
            source: 'custom',
          })),
        )
      } catch {
        if (mounted) {
          setCustomFonts([])
        }
      }
    }

    loadFonts()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    return () => {
      if (guestPromptTimerRef.current !== null) {
        window.clearTimeout(guestPromptTimerRef.current)
      }
    }
  }, [])

  const allFonts = useMemo(
    () => [
      ...customFonts,
      ...FONT_PRESETS.map((font) => ({ ...font, source: 'preset' as const })),
    ],
    [customFonts],
  )

  async function ensureFontLoaded(family: string) {
    if (!('fonts' in document)) {
      return
    }

    try {
      await document.fonts.load(`700 64px "${family}"`)
    } catch {
      // Ignore load failures; fallback stack will still render text.
    }
  }

  return (
    <section className="panel text-library-panel">
      <div className="panel-header">
        <h2>Text Library</h2>
        <button
          type="button"
          className="import-btn"
          onClick={() => {
            if (isGuest) {
              showGuestPrompt('Font Import')
              return
            }
            fileInputRef.current?.click()
          }}
          title={isGuest ? 'Sign in to import fonts' : 'Import a custom font (TTF, OTF, WOFF)'}
          aria-label="Import font"
        >
          <Upload size={18} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
          onChange={handleImportFont}
          style={{ display: 'none' }}
        />
      </div>

      {isGuest && guestPrompt && (
        <div className="top-guest-prompt" role="status" aria-live="polite">
          <span>{guestPrompt}</span>
          <button type="button" className="top-guest-prompt-link" onClick={onGuestSignIn}>
            Sign In
          </button>
        </div>
      )}


      <div className="text-font-grid" role="list" aria-label="Font presets">
        {allFonts.map((font) => (
          <button
            key={`${font.source ?? 'preset'}-${font.label}`}
            type="button"
            className="text-font-card"
            style={{ fontFamily: `"${font.family}", sans-serif` }}
            onClick={async () => {
              await ensureFontLoaded(font.family)
              addTextLayer({ fontFamily: font.family, fontUrl: font.url ?? null })
              setTool('text')
              onFontPicked?.()
            }}
          >
            <strong>{font.source === 'custom' ? `${font.label} (font file)` : font.label}</strong>
            <span style={{ fontFamily: `"${font.family}", sans-serif` }}>{font.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
