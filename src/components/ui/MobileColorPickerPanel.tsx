import React, { useState } from 'react'
import '../styles/MobileColorPickerPanel.css'

export type PaintPart = 'fullcar' | 'hood' | 'trunk' | 'rims'

interface MobileColorPickerPanelProps {
  onColorChange: (hue: number, saturation: number, lightness: number, part: PaintPart) => void
  isOpen: boolean
  onClose: () => void
}

export const MobileColorPickerPanel: React.FC<MobileColorPickerPanelProps> = ({
  onColorChange,
  isOpen,
  onClose
}) => {
  const [selectedPart, setSelectedPart] = useState<PaintPart>('fullcar')
  const [hue, setHue] = useState(0)
  const [saturation, setSaturation] = useState(100)
  const [lightness, setLightness] = useState(50)

  const handleHueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHue = parseInt(e.target.value)
    setHue(newHue)
    onColorChange(newHue, saturation, lightness, selectedPart)
  }

  const handleSaturationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSat = parseInt(e.target.value)
    setSaturation(newSat)
    onColorChange(hue, newSat, lightness, selectedPart)
  }

  const handleLightnessChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newLight = parseInt(e.target.value)
    setLightness(newLight)
    onColorChange(hue, saturation, newLight, selectedPart)
  }

  const presetColors = [
    { name: 'Red', h: 0, s: 100, l: 50 },
    { name: 'Orange', h: 30, s: 100, l: 50 },
    { name: 'Yellow', h: 60, s: 100, l: 50 },
    { name: 'Green', h: 120, s: 100, l: 50 },
    { name: 'Blue', h: 240, s: 100, l: 50 },
    { name: 'Purple', h: 280, s: 100, l: 50 },
    { name: 'Black', h: 0, s: 0, l: 20 },
    { name: 'White', h: 0, s: 0, l: 100 }
  ]

  const currentColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`

  return (
    <>
      {/* Overlay */}
      {isOpen && <div className="mobile-color-picker-overlay" onClick={onClose} />}

      {/* Color Picker Panel */}
      <div className={`mobile-color-picker-panel ${isOpen ? 'open' : ''}`}>
        {/* Header */}
        <div className="color-picker-header">
          <div className="color-picker-drag-handle" />
          <h3>Paint & Finish</h3>
          <button className="color-picker-close" onClick={onClose}>✕</button>
        </div>

        {/* Part Selection */}
        <div className="part-selection">
          <button
            className={`part-btn ${selectedPart === 'fullcar' ? 'active' : ''}`}
            onClick={() => setSelectedPart('fullcar')}
          >
            Full Car
          </button>
          <button
            className={`part-btn ${selectedPart === 'hood' ? 'active' : ''}`}
            onClick={() => setSelectedPart('hood')}
          >
            Hood
          </button>
          <button
            className={`part-btn ${selectedPart === 'trunk' ? 'active' : ''}`}
            onClick={() => setSelectedPart('trunk')}
          >
            Trunk
          </button>
          <button
            className={`part-btn ${selectedPart === 'rims' ? 'active' : ''}`}
            onClick={() => setSelectedPart('rims')}
          >
            Rims
          </button>
        </div>

        {/* Color Preview */}
        <div className="color-preview" style={{ backgroundColor: currentColor }} />

        {/* Preset Colors */}
        <div className="preset-colors">
          {presetColors.map((color) => (
            <button
              key={color.name}
              className="preset-color"
              style={{ backgroundColor: `hsl(${color.h}, ${color.s}%, ${color.l}%)` }}
              onClick={() => {
                setHue(color.h)
                setSaturation(color.s)
                setLightness(color.l)
                onColorChange(color.h, color.s, color.l, selectedPart)
              }}
              title={color.name}
            />
          ))}
        </div>

        {/* Sliders */}
        <div className="slider-group">
          <label className="slider-label">
            <span>Hue</span>
            <span className="slider-value">{hue}°</span>
          </label>
          <input
            type="range"
            min="0"
            max="360"
            value={hue}
            onChange={handleHueChange}
            className="slider hue-slider"
            style={{
              background: `linear-gradient(to right, 
                hsl(0, 100%, 50%), 
                hsl(60, 100%, 50%), 
                hsl(120, 100%, 50%), 
                hsl(180, 100%, 50%), 
                hsl(240, 100%, 50%), 
                hsl(300, 100%, 50%), 
                hsl(360, 100%, 50%))`
            }}
          />
        </div>

        <div className="slider-group">
          <label className="slider-label">
            <span>Saturation</span>
            <span className="slider-value">{saturation}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={saturation}
            onChange={handleSaturationChange}
            className="slider saturation-slider"
            style={{
              background: `linear-gradient(to right,
                hsl(${hue}, 0%, ${lightness}%),
                hsl(${hue}, 100%, ${lightness}%))`
            }}
          />
        </div>

        <div className="slider-group">
          <label className="slider-label">
            <span>Lightness</span>
            <span className="slider-value">{lightness}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={lightness}
            onChange={handleLightnessChange}
            className="slider lightness-slider"
            style={{
              background: `linear-gradient(to right,
                hsl(${hue}, ${saturation}%, 0%),
                hsl(${hue}, ${saturation}%, 50%),
                hsl(${hue}, ${saturation}%, 100%))`
            }}
          />
        </div>

        {/* Apply Button */}
        <button className="apply-btn" onClick={onClose}>
          Done
        </button>
      </div>
    </>
  )
}
