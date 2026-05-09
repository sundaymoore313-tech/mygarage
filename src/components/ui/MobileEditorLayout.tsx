import { Suspense, useState } from 'react'
import { Layers, Type, Car } from 'lucide-react'
import { DecalLibraryPanel } from './DecalLibraryPanel'
import { TextLibraryPanel } from './TextLibraryPanel'
import { SplitLibraryPanel } from './SplitLibraryPanel'
import { StripeLibraryPanel } from './StripeLibraryPanel'
import { WindowTintPanel } from './WindowTintPanel'
import { LayerPanel } from './LayerPanel'
import { InspectorPanel } from './InspectorPanel'
import { MobileCarColorsPanel } from './MobileCarColorsPanel'

type PanelType = 'car' | 'text' | 'elements' | 'stripes' | 'split' | 'tint' | 'layers' | null

interface MobileEditorLayoutProps {
  editorCanvas: React.ReactNode
  isGuest: boolean
  onGuestSignIn: () => void
  simplified?: boolean
}

export function MobileEditorLayout({
  editorCanvas,
  isGuest,
  onGuestSignIn,
  simplified = true,
}: MobileEditorLayoutProps) {
  const [activePanel, setActivePanel] = useState<PanelType>(null)
  const [activeCarHeaderColor, setActiveCarHeaderColor] = useState('#ffffff')

  const carHeaderColors = [
    '#ff3b30',
    '#ff9500',
    '#ffcc00',
    '#34c759',
    '#00c7be',
    '#007aff',
    '#5856d6',
    '#af52de',
    '#8e8e93',
    '#ffffff',
  ]

  const tabs: Array<{
    id: PanelType
    label: string
    icon: React.ReactNode
  }> = [
    { id: 'car', label: 'Car', icon: <Car size={24} /> },
    { id: 'text', label: 'Text', icon: <Type size={24} /> },
    { id: 'elements', label: 'Elements', icon: <Layers size={24} /> },
    {
      id: 'stripes',
      label: 'Stripes',
      icon: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
          <rect x="2" y="3" width="3" height="18" rx="1" />
          <rect x="7" y="3" width="2" height="18" rx="1" />
          <rect x="11" y="3" width="4" height="18" rx="1" />
        </svg>
      ),
    },
    {
      id: 'split',
      label: 'Split',
      icon: <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>S</span>,
    },
    {
      id: 'tint',
      label: 'Tint',
      icon: (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 17 L5 8 Q5.5 6 8 6 L16 6 Q18.5 6 19 8 L21 17 Q21.5 18.5 20 19 L4 19 Q2.5 18.5 3 17 Z" />
          <line x1="3" y1="14" x2="21" y2="14" />
          <line x1="12" y1="6" x2="12" y2="14" />
        </svg>
      ),
    },
    { id: 'layers', label: 'Layers', icon: <Layers size={24} /> },
  ]

  const renderPanelContent = () => {
    switch (activePanel) {
      case 'car':
        return <MobileCarColorsPanel onClose={() => setActivePanel(null)} />
      case 'elements':
        return <DecalLibraryPanel onDecalPicked={() => setActivePanel(null)} isGuest={isGuest} onGuestSignIn={onGuestSignIn} />
      case 'text':
        return <TextLibraryPanel onFontPicked={() => setActivePanel(null)} isGuest={isGuest} onGuestSignIn={onGuestSignIn} />
      case 'split':
        return <SplitLibraryPanel onClose={() => setActivePanel(null)} />
      case 'stripes':
        return <StripeLibraryPanel onClose={() => setActivePanel(null)} />
      case 'tint':
        return <WindowTintPanel />
      case 'layers':
        return <LayerPanel />
      default:
        return null
    }
  }

  return (
    <div className="mobile-editor-layout">
      {/* Full-width 3D viewport */}
      <div className="mobile-viewport-container">{editorCanvas}</div>

      {/* Overlay when panel is open */}
      {activePanel && (
        <div
          className="mobile-overlay"
          onClick={() => setActivePanel(null)}
        />
      )}

      {/* Content panel overlay */}
      {activePanel && (
        <div className="mobile-content-panel">
          <div className="mobile-panel-header">
            <h3 className="mobile-panel-title">
              {tabs.find((t) => t.id === activePanel)?.label}
            </h3>
            {activePanel === 'car' && (
              <div className="mobile-panel-inline-colors" aria-label="Quick colors">
                {carHeaderColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`mobile-inline-color-swatch${activeCarHeaderColor === color ? ' active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setActiveCarHeaderColor(color)}
                    aria-label={`Select color ${color}`}
                    title={color}
                  />
                ))}
              </div>
            )}
            <button
              type="button"
              className="mobile-panel-close"
              onClick={() => setActivePanel(null)}
              aria-label="Close panel"
            >
              ✕
            </button>
          </div>
          <div className="mobile-panel-content">
            <Suspense fallback={<div style={{ padding: 12, textAlign: 'center', color: '#a6dfff' }}>Loading...</div>}>
              {renderPanelContent()}
            </Suspense>
          </div>
        </div>
      )}

      {/* Bottom sheet: ONLY the tab bar now */}
      <div className="mobile-bottom-sheet">
        {!simplified && (
          <div className="mobile-inspector-strip">
            <InspectorPanel />
          </div>
        )}

        {/* Horizontal scrollable tab bar */}
        <div className="mobile-tab-bar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`mobile-tab-button${activePanel === tab.id ? ' active' : ''}`}
              onClick={() => setActivePanel(activePanel === tab.id ? null : tab.id)}
              aria-label={tab.label}
              title={tab.label}
            >
              {tab.icon}
              <span className="mobile-tab-label">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
