import React, { useState } from 'react'
import { WRAP_COLOR_SWATCHES } from '../../lib/wrapColorPalette'
import '../styles/MobileCarColorsPanel.css'

interface MobileCarColorsPanelProps {
  onClose: () => void
}

type Finish = 'gloss' | 'chrome' | 'matte' | 'satin'

export const MobileCarColorsPanel: React.FC<MobileCarColorsPanelProps> = ({ onClose: _onClose }) => {
  const [selectedFinish, setSelectedFinish] = useState<Finish>('gloss')

  const colors = WRAP_COLOR_SWATCHES

  const finishes: Array<{ id: Finish; label: string }> = [
    { id: 'gloss', label: 'Gloss' },
    { id: 'chrome', label: 'Chrome' },
    { id: 'matte', label: 'Matte' },
    { id: 'satin', label: 'Satin' },
  ]

  const handleColorSelect = (color: string) => {
    console.log(`Selected color: ${color} with finish: ${selectedFinish}`)
    // TODO: Apply color to car model
  }

  return (
    <div className="mobile-car-colors-panel">
      {/* Gradient/Finish Selector at Top */}
      <div className="finish-selector">
        <div className="finish-label">Finish</div>
        <div className="finish-buttons">
          {finishes.map((finish) => (
            <button
              key={finish.id}
              className={`finish-btn ${selectedFinish === finish.id ? 'active' : ''}`}
              onClick={() => setSelectedFinish(finish.id)}
            >
              {finish.label}
            </button>
          ))}
        </div>
      </div>

      {/* Horizontal Scrollable Colors */}
      <div className="colors-scroll-container">
        <div className="colors-scroll">
          {colors.map((color) => (
            <button
              key={color.id}
              className="color-swatch"
              style={{ backgroundColor: color.colorHex }}
              onClick={() => handleColorSelect(color.colorHex)}
              title={`${color.brand} ${color.code} - ${color.name}`}
              aria-label={`${color.brand} ${color.code} ${color.name}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
