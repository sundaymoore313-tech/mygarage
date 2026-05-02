import { useEditorStore } from '../../store/editorStore'
import type { CarSplitConfig } from '../../types/editor'

type SplitLibraryPanelProps = {
  onClose?: () => void
}

type SplitPreset = {
  id: string
  label: string
  description: string
  previewStyle: React.CSSProperties
  config: Omit<CarSplitConfig, 'enabled'>
}

const SPLIT_PRESETS: SplitPreset[] = [
  {
    id: 'center',
    label: 'Center Split',
    description: 'Equal 50/50 side-by-side split',
    previewStyle: {
      background: 'linear-gradient(to right, #000000 0%, #000000 50%, #ffffff 50%, #ffffff 100%)',
    },
    config: { sideAHex: '#000000', sideBHex: '#ffffff', finish: 'gloss', offsetX: 0, softEdge: 0.02, angle: 0 },
  },
  {
    id: 'soft-center',
    label: 'Soft Split',
    description: 'Center split with blended edge',
    previewStyle: {
      background: 'linear-gradient(to right, #000000 0%, #000000 35%, #ffffff 65%, #ffffff 100%)',
    },
    config: { sideAHex: '#000000', sideBHex: '#ffffff', finish: 'gloss', offsetX: 0, softEdge: 0.09, angle: 0 },
  },
  {
    id: 'angled',
    label: 'Angled',
    description: 'Diagonal split across the body',
    previewStyle: {
      background: 'linear-gradient(125deg, #000000 0%, #000000 48%, #ffffff 52%, #ffffff 100%)',
    },
    config: { sideAHex: '#000000', sideBHex: '#ffffff', finish: 'gloss', offsetX: 0, softEdge: 0.025, angle: 0.45 },
  },
  {
    id: 'sharp-angle',
    label: 'Sharp Angle',
    description: 'Steep diagonal split',
    previewStyle: {
      background: 'linear-gradient(110deg, #000000 0%, #000000 48%, #ffffff 52%, #ffffff 100%)',
    },
    config: { sideAHex: '#000000', sideBHex: '#ffffff', finish: 'gloss', offsetX: 0, softEdge: 0.02, angle: 0.75 },
  },
  {
    id: 'left-heavy',
    label: 'Left Heavy',
    description: 'More color A on the left',
    previewStyle: {
      background: 'linear-gradient(to right, #000000 0%, #000000 68%, #ffffff 68%, #ffffff 100%)',
    },
    config: { sideAHex: '#000000', sideBHex: '#ffffff', finish: 'gloss', offsetX: -0.5, softEdge: 0.02, angle: 0 },
  },
  {
    id: 'right-heavy',
    label: 'Right Heavy',
    description: 'More color B on the right',
    previewStyle: {
      background: 'linear-gradient(to right, #000000 0%, #000000 32%, #ffffff 32%, #ffffff 100%)',
    },
    config: { sideAHex: '#000000', sideBHex: '#ffffff', finish: 'gloss', offsetX: 0.5, softEdge: 0.02, angle: 0 },
  },
]

export function SplitLibraryPanel({ onClose }: SplitLibraryPanelProps) {
  const carSplit = useEditorStore((state) => state.project.carSplit)
  const setCarSplit = useEditorStore((state) => state.setCarSplit)
  const setActiveCarTool = useEditorStore((state) => state.setActiveCarTool)

  const applyPreset = (preset: SplitPreset) => {
    setCarSplit({ ...preset.config, enabled: true })
    setActiveCarTool('split')
    onClose?.()
  }

  const turnOff = () => {
    setCarSplit({ enabled: false })
    setActiveCarTool(null)
    onClose?.()
  }

  return (
    <section className="panel decal-library-panel">
      <div className="panel-header">
        <h2>Split Paint</h2>
      </div>

      <div className="decal-grid car-preset-grid" role="list" aria-label="Split presets">
        {SPLIT_PRESETS.map((preset) => {
          const isActive = carSplit.enabled &&
            Math.abs(carSplit.offsetX - preset.config.offsetX) < 0.01 &&
            Math.abs(carSplit.angle - preset.config.angle) < 0.01
          return (
            <button
              key={preset.id}
              type="button"
              className={isActive ? 'decal-card car-preset-card active' : 'decal-card car-preset-card'}
              onClick={() => applyPreset(preset)}
              title={preset.description}
            >
              <div
                className="car-preset-preview split-preset-preview"
                style={{
                  ...preset.previewStyle,
                  ...(carSplit.enabled && isActive
                    ? { '--split-a': carSplit.sideAHex, '--split-b': carSplit.sideBHex } as React.CSSProperties
                    : {}),
                }}
              />
              <span>{preset.label}</span>
            </button>
          )
        })}

        {carSplit.enabled && (
          <button
            type="button"
            className="decal-card car-preset-card car-preset-off"
            onClick={turnOff}
            title="Remove split"
          >
            <div className="car-preset-preview car-preset-preview-off">
              <span>✕</span>
            </div>
            <span>Remove</span>
          </button>
        )}
      </div>

      <p className="hint" style={{ padding: '8px 12px' }}>
        {carSplit.enabled
          ? 'Split active — edit colors, offset &amp; angle in the bottom bar.'
          : 'Pick a preset to apply a split. Edit settings in the bottom bar.'}
      </p>
    </section>
  )
}
