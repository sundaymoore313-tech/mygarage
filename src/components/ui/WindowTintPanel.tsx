import { useEditorStore } from '../../store/editorStore'
import { WrapColorPicker } from './WrapColorPicker'

export function WindowTintPanel() {
  const windowTint = useEditorStore((state) => state.project.windowTint)
  const setWindowTint = useEditorStore((state) => state.setWindowTint)
  const sliderValue = 98 - windowTint.amount

  return (
    <section className="panel window-tint-panel">
      <div className="panel-header">
        <h2>Window Tint</h2>
      </div>

      <div className="field-group compact tint-controls">
        <label className="tint-toggle-row">
          <span>Enable Window Tint</span>
          <input
            type="checkbox"
            checked={windowTint.enabled}
            onChange={(event) => setWindowTint({ enabled: event.target.checked })}
          />
        </label>

        <label>Shade ({windowTint.amount.toFixed(0)}%)</label>
        <input
          type="range"
          min={0}
          max={98}
          step={1}
          value={sliderValue}
          disabled={!windowTint.enabled}
          onChange={(event) => setWindowTint({ amount: 98 - Number(event.target.value) })}
        />

        <label>Tint Color</label>
        <WrapColorPicker
          value={windowTint.colorHex}
          disabled={!windowTint.enabled}
          onChange={(hex) => setWindowTint({ colorHex: hex })}
          label="Window tint color"
        />

        <button
          type="button"
          className="chip"
          onClick={() => setWindowTint({ enabled: false, amount: 35, colorHex: '#101820' })}
        >
          Reset Tint
        </button>
      </div>
    </section>
  )
}
