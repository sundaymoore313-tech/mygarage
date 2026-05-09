import { Suspense, useState } from 'react'
import { Layers, Type, Car } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { DecalLibraryPanel } from './DecalLibraryPanel'
import { TextLibraryPanel } from './TextLibraryPanel'
import { SplitLibraryPanel } from './SplitLibraryPanel'
import { StripeLibraryPanel } from './StripeLibraryPanel'
import { WindowTintPanel } from './WindowTintPanel'
import { LayerPanel } from './LayerPanel'
import type { PaintTargetId } from '../../lib/paintTargets'

type TabId = 'car' | 'text' | 'elements' | 'stripes' | 'split' | 'tint' | 'layers'

interface MobileEditorLayoutProps {
  editorCanvas: React.ReactNode
  isGuest: boolean
  onGuestSignIn: () => void
  simplified?: boolean
}

const CAR_COLORS = [
  { name: 'Red',     hex: '#CC1010' },
  { name: 'Blue',    hex: '#1050CC' },
  { name: 'Green',   hex: '#10A030' },
  { name: 'Yellow',  hex: '#D4B800' },
  { name: 'Black',   hex: '#111111' },
  { name: 'White',   hex: '#F5F5F5' },
  { name: 'Silver',  hex: '#A0A8B0' },
  { name: 'Orange',  hex: '#E05010' },
  { name: 'Purple',  hex: '#6020A0' },
  { name: 'Pink',    hex: '#D02080' },
  { name: 'Navy',    hex: '#101870' },
  { name: 'Burgundy', hex: '#5C1010' },
]

const PAINT_TARGETS: Array<{ id: PaintTargetId; label: string }> = [
  { id: 'fullCar', label: 'Full car' },
  { id: 'hood',    label: 'Hood' },
  { id: 'trunk',   label: 'trunk' },
  { id: 'rims',    label: 'rims' },
]

const FINISHES = [
  { id: 'gloss'  as const, label: 'gloss'  },
  { id: 'matte'  as const, label: 'matte'  },
  { id: 'chrome' as const, label: 'chrome' },
  { id: 'satin'  as const, label: 'satin'  },
]

export function MobileEditorLayout({
  editorCanvas,
  isGuest,
  onGuestSignIn,
}: MobileEditorLayoutProps) {
  const [activeTab, setActiveTab]   = useState<TabId | null>(null)
  const [paintMode, setPaintMode]   = useState<'paint' | 'gradient'>('paint')

  const setPaint               = useEditorStore(s => s.setPaint)
  const setSelectedPaintTarget = useEditorStore(s => s.setSelectedPaintTarget)
  const selectedPaintTarget    = useEditorStore(s => s.selectedPaintTarget)
  const currentFinish          = useEditorStore(s => s.project.paint.finish)

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: 'car',      label: 'Car',      icon: <Car size={22} /> },
    { id: 'text',     label: 'Text',     icon: <Type size={22} /> },
    { id: 'elements', label: 'Elements', icon: <Layers size={22} /> },
    {
      id: 'stripes', label: 'Stripes',
      icon: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
          <rect x="2" y="3" width="3" height="18" rx="1" />
          <rect x="7" y="3" width="2" height="18" rx="1" />
          <rect x="11" y="3" width="4" height="18" rx="1" />
        </svg>
      ),
    },
    {
      id: 'split', label: 'Split',
      icon: <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>S</span>,
    },
    {
      id: 'tint', label: 'Tint',
      icon: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 17 L5 8 Q5.5 6 8 6 L16 6 Q18.5 6 19 8 L21 17 Q21.5 18.5 20 19 L4 19 Q2.5 18.5 3 17 Z" />
          <line x1="3" y1="14" x2="21" y2="14" />
          <line x1="12" y1="6" x2="12" y2="14" />
        </svg>
      ),
    },
    { id: 'layers', label: 'Layers', icon: <Layers size={22} /> },
  ]

  const renderControls = () => {
    if (!activeTab) return null

    if (activeTab === 'car') {
      return (
        <div className="mobile-car-controls">
          {/* Scrollable chips: paint mode | target | finish */}
          <div className="mobile-chips-row">
            <button
              type="button"
              className={`mobile-chip${paintMode === 'paint' ? ' active' : ''}`}
              onClick={() => setPaintMode('paint')}
            >Paint</button>
            <button
              type="button"
              className={`mobile-chip${paintMode === 'gradient' ? ' active' : ''}`}
              onClick={() => setPaintMode('gradient')}
            >gradient</button>

            <span className="mobile-chips-sep" />

            {PAINT_TARGETS.map(t => (
              <button
                key={t.id}
                type="button"
                className={`mobile-chip${selectedPaintTarget === t.id ? ' active' : ''}`}
                onClick={() => setSelectedPaintTarget(selectedPaintTarget === t.id ? null : t.id)}
              >{t.label}</button>
            ))}

            <span className="mobile-chips-sep" />

            {FINISHES.map(f => (
              <button
                key={f.id}
                type="button"
                className={`mobile-chip${currentFinish === f.id ? ' active' : ''}`}
                onClick={() => setPaint({ finish: f.id })}
              >{f.label}</button>
            ))}
          </div>

          {/* Large color swatches row */}
          <div className="mobile-swatches-row">
            {CAR_COLORS.map(c => (
              <button
                key={c.name}
                type="button"
                className="mobile-color-swatch"
                style={{ backgroundColor: c.hex }}
                onClick={() => setPaint({ colorHex: c.hex })}
                aria-label={c.name}
                title={c.name}
              />
            ))}
            <button type="button" className="mobile-more-arrow" aria-label="More colors">→</button>
          </div>
        </div>
      )
    }

    // Other tabs – compact scrollable panel
    return (
      <div className="mobile-panel-compact">
        <Suspense fallback={<div style={{ padding: 12, textAlign: 'center', color: '#a6dfff' }}>Loading…</div>}>
          {activeTab === 'elements' && (
            <DecalLibraryPanel onDecalPicked={() => {}} isGuest={isGuest} onGuestSignIn={onGuestSignIn} />
          )}
          {activeTab === 'text' && (
            <TextLibraryPanel onFontPicked={() => {}} isGuest={isGuest} onGuestSignIn={onGuestSignIn} />
          )}
          {activeTab === 'split'   && <SplitLibraryPanel onClose={() => {}} />}
          {activeTab === 'stripes' && <StripeLibraryPanel onClose={() => {}} />}
          {activeTab === 'tint'    && <WindowTintPanel />}
          {activeTab === 'layers'  && <LayerPanel />}
        </Suspense>
      </div>
    )
  }

  return (
    <div className="mobile-editor-layout">
      {/* 3D viewer – flex: 1, shrinks when controls strip appears */}
      <div className="mobile-viewport-container">{editorCanvas}</div>

      {/* Persistent controls strip (no overlay, no z-index fights) */}
      {activeTab && (
        <div className="mobile-controls-strip">
          {renderControls()}
        </div>
      )}

      {/* Tab bar always at bottom */}
      <div className="mobile-tab-bar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`mobile-tab-button${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(prev => prev === tab.id ? null : tab.id)}
            aria-label={tab.label}
            title={tab.label}
          >
            {tab.icon}
            <span className="mobile-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
