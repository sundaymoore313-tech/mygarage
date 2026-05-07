import { describe, expect, it } from 'vitest'
import { getResolvedPaintForLabel, DEFAULT_TARGET_PAINT } from './paintTargets'
import type { MeshClass, PaintConfig } from '../types/editor'

// ─── helpers ────────────────────────────────────────────────────────────────

const RED: PaintConfig = { ...DEFAULT_TARGET_PAINT, colorHex: '#ff0000' }
const BLUE: PaintConfig = { ...DEFAULT_TARGET_PAINT, colorHex: '#0000ff' }
const SILVER: PaintConfig = { ...DEFAULT_TARGET_PAINT, colorHex: '#c0c0c0' }
const GOLD: PaintConfig = { ...DEFAULT_TARGET_PAINT, colorHex: '#ffd700' }

const BASE = SILVER   // mesh's original model colour (basePaint / fallback)

function resolve(
  label: string,
  targetPaints: Parameters<typeof getResolvedPaintForLabel>[1],
  explicitClass?: MeshClass | null,
) {
  return getResolvedPaintForLabel(label, targetPaints, BASE, explicitClass)
}

// ─── Explicit classify — must always win over name heuristics ────────────────

describe('explicit classify: paintable', () => {
  it('receives fullCar paint even when the label contains "callipe" (caliper)', () => {
    const result = resolve(
      'polySurface538_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Callipe_5313eec1_0',
      { fullCar: RED },
      'paintable',
    )
    expect(result.colorHex).toBe('#ff0000')
  })

  it('receives fullCar paint even when label contains "chrome"', () => {
    const result = resolve('bumper_f004_EXT_Chrome_0', { fullCar: RED }, 'paintable')
    expect(result.colorHex).toBe('#ff0000')
  })

  it('receives fullCar paint even when label contains "interior"', () => {
    const result = resolve('door_interior_panel_01', { fullCar: RED }, 'paintable')
    expect(result.colorHex).toBe('#ff0000')
  })

  it('receives fullCar paint even when label contains "headlight"', () => {
    const result = resolve('front_headlight_housing', { fullCar: RED }, 'paintable')
    expect(result.colorHex).toBe('#ff0000')
  })

  it('receives fullCar paint even when label contains "brake"', () => {
    const result = resolve('brake_disc_left_front', { fullCar: RED }, 'paintable')
    expect(result.colorHex).toBe('#ff0000')
  })

  it('receives fullCar paint even when label contains "disc"', () => {
    const result = resolve('Rear_Left_Wheel_Brake_Disc_0', { fullCar: RED }, 'paintable')
    expect(result.colorHex).toBe('#ff0000')
  })

  it('receives fullCar paint even when label contains "spoiler"', () => {
    const result = resolve('boot_spoiler_SKIN_00_0', { fullCar: RED }, 'paintable')
    expect(result.colorHex).toBe('#ff0000')
  })

  it('receives fullCar paint even when label contains generic "Object N" name', () => {
    const result = resolve('Object_127', { fullCar: RED }, 'paintable')
    expect(result.colorHex).toBe('#ff0000')
  })

  it('respects hood-specific override when label starts with bonnet/hood', () => {
    const result = resolve('bonnet002_skin_00_0', { fullCar: RED, hood: BLUE }, 'paintable')
    expect(result.colorHex).toBe('#0000ff')
  })

  it('respects trunk-specific override when label starts with boot/trunk', () => {
    const result = resolve('boot003_skin_00_0', { fullCar: RED, trunk: GOLD }, 'paintable')
    expect(result.colorHex).toBe('#ffd700')
  })

  it('falls back to BASE when no targetPaints set at all', () => {
    const result = resolve('body_panel_main', {}, 'paintable')
    expect(result.colorHex).toBe(BASE.colorHex)
  })
})

describe('explicit classify: excluded', () => {
  it('always returns base paint regardless of fullCar setting', () => {
    const result = resolve('bodyshell_SUB3_frame_0', { fullCar: RED }, 'excluded')
    expect(result.colorHex).toBe(BASE.colorHex)
  })

  it('returns base paint for a mesh that would normally be paintable by name', () => {
    const result = resolve('bodyshell_skin_00_0', { fullCar: RED }, 'excluded')
    expect(result.colorHex).toBe(BASE.colorHex)
  })
})

describe('explicit classify: window', () => {
  it('always returns base paint (windows keep original glass colour)', () => {
    const result = resolve('windscreen_ext_EXT_Glass_0', { fullCar: RED }, 'window')
    expect(result.colorHex).toBe(BASE.colorHex)
  })
})

describe('explicit classify: rims', () => {
  it('returns rims paint when rims target is set', () => {
    const result = resolve('wheel_lf_SUB3_Wheel_Front_Rims_0', { fullCar: RED, rims: BLUE }, 'rims')
    expect(result.colorHex).toBe('#0000ff')
  })

  it('returns base paint when rims target is not set', () => {
    const result = resolve('wheel_lf_SUB3_Wheel_Front_Rims_0', { fullCar: RED }, 'rims')
    expect(result.colorHex).toBe(BASE.colorHex)
  })
})

// ─── No explicit classify — auto-heuristics ──────────────────────────────────

describe('auto-detect (no explicitClass)', () => {
  it('applies fullCar paint to a plain body panel', () => {
    const result = resolve('bodyshell_skin_00_0', { fullCar: RED })
    expect(result.colorHex).toBe('#ff0000')
  })

  it('applies hood paint to a bonnet panel', () => {
    const result = resolve('bonnet002_skin_00_0', { fullCar: RED, hood: BLUE })
    expect(result.colorHex).toBe('#0000ff')
  })

  it('applies trunk paint to a boot panel', () => {
    const result = resolve('boot003_skin_00_0', { fullCar: RED, trunk: GOLD })
    expect(result.colorHex).toBe('#ffd700')
  })

  it('keeps base paint for a caliper mesh (name-based exclusion)', () => {
    const result = resolve('brake_caliper_front_left', { fullCar: RED })
    expect(result.colorHex).toBe(BASE.colorHex)
  })

  it('keeps base paint for an interior mesh', () => {
    const result = resolve('dashboard_center_console', { fullCar: RED })
    expect(result.colorHex).toBe(BASE.colorHex)
  })

  it('keeps base paint for a headlight mesh', () => {
    const result = resolve('headlight_housing_front_left', { fullCar: RED })
    expect(result.colorHex).toBe(BASE.colorHex)
  })

  it('keeps base paint for a chrome mesh', () => {
    const result = resolve('bumper_chrome_trim', { fullCar: RED })
    expect(result.colorHex).toBe(BASE.colorHex)
  })

  it('returns base paint when no targetPaints configured', () => {
    const result = resolve('bodyshell_skin_00_0', {})
    expect(result.colorHex).toBe(BASE.colorHex)
  })

  it('null explicitClass behaves same as undefined (auto-detect)', () => {
    const resultNull = resolve('bodyshell_skin_00_0', { fullCar: RED }, null)
    const resultUndef = resolve('bodyshell_skin_00_0', { fullCar: RED }, undefined)
    expect(resultNull.colorHex).toBe(resultUndef.colorHex)
  })
})

// ─── Real preset mesh names from the classify presets ───────────────────────

describe('real preset mesh names', () => {
  it('Dodge Challenger caliper mesh marked paintable → gets fullCar paint', () => {
    const label = 'polySurface538_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Callipe_5313eec1_0'
    expect(resolve(label, { fullCar: RED }, 'paintable').colorHex).toBe('#ff0000')
    // Without classify it must fall back to base (caliper heuristic)
    expect(resolve(label, { fullCar: RED }, undefined).colorHex).toBe(BASE.colorHex)
  })

  it('Dodge Charger chrome bumper marked paintable → gets fullCar paint', () => {
    const label = 'bumper_f004_EXT_Chrome_0'
    expect(resolve(label, { fullCar: RED }, 'paintable').colorHex).toBe('#ff0000')
    expect(resolve(label, { fullCar: RED }, undefined).colorHex).toBe(BASE.colorHex)
  })

  it('Corvette main body classified paintable → gets fullCar paint', () => {
    const label = 'Main_Chassis_Body_Color_0'
    expect(resolve(label, { fullCar: RED }, 'paintable').colorHex).toBe('#ff0000')
  })

  it('Corvette badge classified excluded → keeps base paint', () => {
    const label = 'Corvette_Badge_Badges_0'
    expect(resolve(label, { fullCar: RED }, 'excluded').colorHex).toBe(BASE.colorHex)
  })

  it('Charger windscreen classified window → keeps base paint', () => {
    const label = 'windscreen_ext_EXT_Glass_0'
    expect(resolve(label, { fullCar: RED }, 'window').colorHex).toBe(BASE.colorHex)
  })

  it('Charger rim classified rims → gets rims paint', () => {
    const label = 'wheel_lf_SUB3_Wheel_Front_Rims_0'
    expect(resolve(label, { fullCar: RED, rims: BLUE }, 'rims').colorHex).toBe('#0000ff')
  })
})
