import React, { useState } from 'react'
import '../styles/MobileCarColorsPanel.css'

interface MobileCarColorsPanelProps {
  onClose: () => void
}

type Finish = 'gloss' | 'chrome' | 'matte' | 'satin'

export const MobileCarColorsPanel: React.FC<MobileCarColorsPanelProps> = ({ onClose: _onClose }) => {
  const [selectedFinish, setSelectedFinish] = useState<Finish>('gloss')

  // Example color palette - can be expanded
  const colors = [
    { name: 'Red', hex: '#FF0000' },
    { name: 'Orange', hex: '#FF8800' },
    { name: 'Yellow', hex: '#FFFF00' },
    { name: 'Green', hex: '#00FF00' },
    { name: 'Blue', hex: '#0000FF' },
    { name: 'Purple', hex: '#8800FF' },
    { name: 'Pink', hex: '#FF0088' },
    { name: 'Cyan', hex: '#00FFFF' },
    { name: 'Brown', hex: '#8B4513' },
    { name: 'Gray', hex: '#808080' },
    { name: 'Black', hex: '#000000' },
    { name: 'White', hex: '#FFFFFF' },
    { name: 'Gold', hex: '#FFD700' },
    { name: 'Silver', hex: '#C0C0C0' },
    { name: 'Maroon', hex: '#800000' },
    { name: 'Navy', hex: '#000080' },
  ]

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
              key={color.name}
              className="color-swatch"
              style={{ backgroundColor: color.hex }}
              onClick={() => handleColorSelect(color.hex)}
              title={color.name}
              aria-label={`${color.name} color`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
