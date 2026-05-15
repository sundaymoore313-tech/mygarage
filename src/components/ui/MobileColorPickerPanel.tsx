import React, { useState } from 'react'
import { WRAP_COLOR_SWATCHES } from '../../lib/wrapColorPalette'
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

  const hexToHsl = (hex: string) => {
    const normalized = hex.replace('#', '').trim()
    const expanded = normalized.length === 3
      ? normalized.split('').map((char) => char + char).join('')
      : normalized

    const intValue = Number.parseInt(expanded, 16)
    if (!Number.isFinite(intValue)) return { h: 0, s: 0, l: 50 }

    const red = ((intValue >> 16) & 255) / 255
    const green = ((intValue >> 8) & 255) / 255
    const blue = (intValue & 255) / 255

    const maxChannel = Math.max(red, green, blue)
    const minChannel = Math.min(red, green, blue)
    const lightness = (maxChannel + minChannel) / 2

    if (maxChannel === minChannel) {
      return { h: 0, s: 0, l: Math.round(lightness * 100) }
    }

    const delta = maxChannel - minChannel
    const sat = lightness > 0.5
      ? delta / (2 - maxChannel - minChannel)
      : delta / (maxChannel + minChannel)

    let hue: number
    switch (maxChannel) {
      case red:
        hue = (green - blue) / delta + (green < blue ? 6 : 0)
        break
      case green:
        hue = (blue - red) / delta + 2
        break
      default:
        hue = (red - green) / delta + 4
        break
    }

    return {
      h: Math.round((hue * 60) % 360),
      s: Math.round(sat * 100),
      l: Math.round(lightness * 100),
    }
  }

  const presetColors = WRAP_COLOR_SWATCHES.map((swatch) => ({
    id: swatch.id,
    name: `${swatch.brand} ${swatch.code} ${swatch.name}`,
    ...hexToHsl(swatch.colorHex),
  }))

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
              key={color.id}
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
