import { useEditorStore } from '../../store/editorStore'
import type { CarStripeConfig } from '../../types/editor'

type StripeLibraryPanelProps = {
  onClose?: () => void
}

type StripePreset = {
  id: string
  label: string
  description: string
  previewStyle: React.CSSProperties
  config: Omit<CarStripeConfig, 'enabled'>
}

const STRIPE_PRESETS: StripePreset[] = [
  {
    id: 'single-center',
    label: 'Single Center',
    description: 'Classic single center stripe',
    previewStyle: {
      background:
        'linear-gradient(to right, #7f8b99 0%, #7f8b99 43%, #0a0a0a 43%, #0a0a0a 57%, #7f8b99 57%, #7f8b99 100%)',
    },
    config: { colorHex: '#f5f5f5', finish: 'gloss', width: 0.14, gap: 0, offsetX: 0, softEdge: 0.02, angle: 0 },
  },
  {
    id: 'wide-center',
    label: 'Wide Center',
    description: 'Wide single center band',
    previewStyle: {
      background:
        'linear-gradient(to right, #7f8b99 0%, #7f8b99 32%, #0a0a0a 32%, #0a0a0a 68%, #7f8b99 68%, #7f8b99 100%)',
    },
    config: { colorHex: '#f5f5f5', finish: 'gloss', width: 0.26, gap: 0, offsetX: 0, softEdge: 0.02, angle: 0 },
  },
  {
    id: 'double',
    label: 'Double Stripe',
    description: 'Two stripes flanking center',
    previewStyle: {
      background:
        'linear-gradient(to right, #7f8b99 0%, #7f8b99 18%, #0a0a0a 18%, #0a0a0a 30%, #7f8b99 30%, #7f8b99 70%, #0a0a0a 70%, #0a0a0a 82%, #7f8b99 82%, #7f8b99 100%)',
    },
    config: { colorHex: '#f5f5f5', finish: 'gloss', width: 0.09, gap: 0.28, offsetX: 0, softEdge: 0.02, angle: 0 },
  },
  {
    id: 'angled',
    label: 'Angled',
    description: 'Center stripe with slight lean',
    previewStyle: {
      background:
        'linear-gradient(80deg, #7f8b99 0%, #7f8b99 43%, #0a0a0a 43%, #0a0a0a 57%, #7f8b99 57%, #7f8b99 100%)',
    },
    config: { colorHex: '#f5f5f5', finish: 'gloss', width: 0.14, gap: 0, offsetX: 0, softEdge: 0.02, angle: 0.22 },
  },
]

export function StripeLibraryPanel({ onClose }: StripeLibraryPanelProps) {
  const carStripe = useEditorStore((state) => state.project.carStripe)
  const setCarStripe = useEditorStore((state) => state.setCarStripe)
  const setActiveCarTool = useEditorStore((state) => state.setActiveCarTool)

  const applyPreset = (preset: StripePreset) => {
    setCarStripe({ ...preset.config, enabled: true })
    setActiveCarTool('stripes')
    onClose?.()
  }

  return (
    <section className="panel decal-library-panel stripe-library-panel">
      <div className="panel-header">
        <h2>Racing Stripes</h2>
      </div>

      <div className="decal-grid car-preset-grid" role="list" aria-label="Stripe presets">
        {STRIPE_PRESETS.map((preset) => {
          const isActive = carStripe.enabled && JSON.stringify({
            width: carStripe.width, gap: carStripe.gap, offsetX: carStripe.offsetX, angle: carStripe.angle,
          }) === JSON.stringify({
            width: preset.config.width, gap: preset.config.gap, offsetX: preset.config.offsetX, angle: preset.config.angle,
          })
          return (
            <button
              key={preset.id}
              type="button"
              className={isActive ? 'decal-card car-preset-card active' : 'decal-card car-preset-card'}
              onClick={() => applyPreset(preset)}
              title={preset.label}
            >
              <div className="car-preset-preview stripe-preset-preview" style={preset.previewStyle}>
                <span className="stripe-preview-sheen" />
              </div>
              <div className="stripe-preset-copy">
                <span className="stripe-preset-title">{preset.label}</span>
              </div>
            </button>
          )
        })}

      </div>

      <p className="hint" style={{ padding: '8px 12px' }}>
        {carStripe.enabled
          ? 'Stripes active — edit color, width &amp; angle in the bottom bar.'
          : 'Pick a preset to apply stripes. Edit settings in the bottom bar.'}
      </p>
    </section>
  )
}
