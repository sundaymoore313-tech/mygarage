import { PAINT_TARGETS } from '../../lib/paintTargets'
import { useEditorStore } from '../../store/editorStore'
import type { PaintTargetId } from '../../types/editor'

// Shared side-view car outline paths
// ViewBox 0 0 60 38 — car faces right (front=right, rear=left)
const CAR_BODY   = 'M4 22 Q4 16 7 16 L13 16 L20 8 Q22 6 25 6 L42 6 Q45 6 47 9 L53 16 L57 16 Q60 16 60 20 L60 26 Q60 28 57 28 L50 28'
const FRONT_ARCH = 'M7 28 Q7 34 13 34 Q19 34 19 28'
const REAR_ARCH  = 'M37 28 Q37 34 43 34 Q49 34 49 28'
const BOTTOM     = 'M19 28 L37 28'
const FRONT_STUB = 'M4 28 L7 28'

function PaintIcon({ target }: { target: PaintTargetId }) {
  const sw = 2.6
  const sc = { strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

  // ── Full Car: filled silhouette ──────────────────────────────────────────────
  if (target === 'fullCar') return (
    <svg className="paint-icon-svg" viewBox="0 0 60 38" aria-hidden>
      <path
        fill="currentColor"
        d="M4 22 Q4 16 7 16 L13 16 L20 8 Q22 6 25 6 L42 6 Q45 6 47 9 L53 16 L57 16
           Q60 16 60 20 L60 26 Q60 28 57 28 L50 28 Q49 35 43 35 Q37 35 37 28
           L19 28 Q18 35 13 35 Q7 35 7 28 L4 28 Q2 28 2 26 L2 22 Q2 20 4 20 Z"
      />
      {/* Windows as dark cutout */}
      <path fill="#0b1420" d="M21 9 L15 16 L47 16 L46 9 Q44.5 7 42 7 L25 7 Q22.5 7 21 9 Z" />
      <rect x="33" y="7" width="2" height="9" fill="#0b1420" rx="1" />
      {/* Hub holes */}
      <circle cx="13" cy="31" r="4" fill="#0b1420" />
      <circle cx="43" cy="31" r="4" fill="#0b1420" />
    </svg>
  )

  // ── Hood Open: outline + prop arm rising from rear (left side) ──────────────
  if (target === 'hood') return (
    <svg className="paint-icon-svg" viewBox="0 0 64 38" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth={sw} {...sc}>
        <g transform="translate(4 0)">
          <path d="M3 16 L-4 3" />
          <path d={CAR_BODY} />
          <path d={FRONT_ARCH} />
          <path d={REAR_ARCH} />
          <path d={BOTTOM} />
          <path d={FRONT_STUB} />
          <circle cx="13" cy="31" r="5.5" />
          <circle cx="13" cy="31" r="2.4" />
          <circle cx="43" cy="31" r="5.5" />
          <circle cx="43" cy="31" r="2.4" />
        </g>
      </g>
    </svg>
  )

  // ── Trunk Open: outline + prop arm rising from front (right side) ─────────────
  if (target === 'trunk') return (
    <svg className="paint-icon-svg" viewBox="0 0 64 38" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth={sw} {...sc}>
        <path d="M57 16 L64 3" />
        <path d={CAR_BODY} />
        <path d={FRONT_ARCH} />
        <path d={REAR_ARCH} />
        <path d={BOTTOM} />
        <path d={FRONT_STUB} />
        <circle cx="13" cy="31" r="5.5" />
        <circle cx="13" cy="31" r="2.4" />
        <circle cx="43" cy="31" r="5.5" />
        <circle cx="43" cy="31" r="2.4" />
      </g>
    </svg>
  )

  // ── Rims: detailed 5-spoke alloy wheel ────────────────────────────────────────
  if (target === 'rims') return (
    <svg className="paint-icon-svg paint-icon-svg--square" viewBox="0 0 40 40" aria-hidden>
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <circle cx="20" cy="20" r="17.5" strokeWidth="2.2" />
        <circle cx="20" cy="20" r="13.5" strokeWidth="1.6" />
        <circle cx="20" cy="20" r="3.2"  strokeWidth="1.8" />
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i * 72 - 90) * (Math.PI / 180)
          return (
            <line key={i}
              x1={20 + 3.8 * Math.cos(a)} y1={20 + 3.8 * Math.sin(a)}
              x2={20 + 13  * Math.cos(a)} y2={20 + 13  * Math.sin(a)}
              strokeWidth="2.4"
            />
          )
        })}
        {[0, 1, 2, 3, 4].map((i) => {
          const a = ((i * 72 - 90) + 36) * (Math.PI / 180)
          return (
            <circle key={i}
              cx={20 + 8 * Math.cos(a)} cy={20 + 8 * Math.sin(a)}
              r="1.4" strokeWidth="1.3"
            />
          )
        })}
      </g>
    </svg>
  )

  return <span>{String(target)[0].toUpperCase()}</span>
}

export function PaintTargetToolbar() {
  const selectedPaintTarget = useEditorStore((state) => state.selectedPaintTarget)
  const setSelectedPaintTarget = useEditorStore((state) => state.setSelectedPaintTarget)

  return (
    <div className="paint-target-toolbar" aria-label="Paint target selector">
      {PAINT_TARGETS.map((target) => {
        const active = selectedPaintTarget === target.id
        return (
          <button
            key={target.id}
            type="button"
            className={active ? 'paint-target-button active' : 'paint-target-button'}
            onClick={() => setSelectedPaintTarget(target.id)}
            title={target.label}
            aria-label={target.label}
          >
            <PaintIcon target={target.id} />
            <span className="paint-target-label">{target.label}</span>
          </button>
        )
      })}
    </div>
  )
}
