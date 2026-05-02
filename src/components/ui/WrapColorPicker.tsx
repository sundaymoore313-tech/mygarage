import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { WRAP_COLOR_SWATCHES } from '../../lib/wrapColorPalette'

type WrapColorPickerProps = {
  value: string
  onChange: (hex: string) => void
  disabled?: boolean
  label?: string
  className?: string
}

export function WrapColorPicker({ value, onChange, disabled, label, className }: WrapColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ bottom: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  function openPopover() {
    if (disabled) return
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) {
      setPos({
        bottom: window.innerHeight - rect.top + 6,
        left: rect.left + rect.width / 2,
      })
    }
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <span className={`wrap-color-picker-wrap${className ? ` ${className}` : ''}`}>
      <button
        ref={btnRef}
        type="button"
        className="split-color-bubble wrap-color-bubble-btn"
        style={{ backgroundColor: value, opacity: disabled ? 0.4 : 1 }}
        aria-label={label ?? 'Open color palette'}
        onClick={openPopover}
        disabled={disabled}
      />

      {open && createPortal(
        <div
          className="swatch-popover wrap-color-picker-popover"
          ref={popoverRef}
          style={{
            position: 'fixed',
            bottom: pos.bottom,
            left: pos.left,
            transform: 'translateX(-50%)',
            zIndex: 9999,
          }}
        >
          <div className="swatch-popover-header">
            <span>Wrap Colors</span>
            <button
              type="button"
              className="swatch-popover-close"
              onClick={() => setOpen(false)}
              aria-label="Close palette"
            >✕</button>
          </div>

          <div className="swatch-popover-grid" role="listbox" aria-label="Wrap color swatches">
            {WRAP_COLOR_SWATCHES.map((swatch) => {
              const active = swatch.colorHex.toLowerCase() === value.toLowerCase()
              return (
                <button
                  key={swatch.id}
                  type="button"
                  className={active ? 'swatch-dot active' : 'swatch-dot'}
                  style={{ backgroundColor: swatch.colorHex }}
                  title={`${swatch.brand} ${swatch.code} — ${swatch.name} (${swatch.finish})`}
                  aria-label={`${swatch.brand} ${swatch.code} ${swatch.name}`}
                  onClick={() => { onChange(swatch.colorHex); setOpen(false) }}
                />
              )
            })}
          </div>

          <div className="swatch-popover-custom">
            <label>Custom</label>
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              aria-label="Custom color"
            />
          </div>
        </div>,
        document.body
      )}
    </span>
  )
}
