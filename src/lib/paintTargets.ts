import type { MeshClass, PaintConfig, PaintFinish } from '../types/editor'
import { GENERATED_CLASSIFY_PRESETS } from '../generated/classifyPresets.generated'

export const PAINT_FINISH_PRESETS: Record<PaintFinish, Pick<PaintConfig, 'metallic' | 'roughness' | 'clearcoat'>> = {
  gloss: { metallic: 0.2, roughness: 0.22, clearcoat: 0.95 },
  matte: { metallic: 0.05, roughness: 0.85, clearcoat: 0.06 },
  chrome: { metallic: 1.0, roughness: 0.05, clearcoat: 1.0 },
  satin: { metallic: 0.15, roughness: 0.48, clearcoat: 0.45 },
}

export function resolvePaintFinishPreset(finish: PaintFinish) {
  return PAINT_FINISH_PRESETS[finish]
}

export const DEFAULT_TARGET_PAINT: PaintConfig = {
  colorHex: '#cc2a2a',
  colorRef: null,
  finish: 'gloss',
  metallic: PAINT_FINISH_PRESETS.gloss.metallic,
  roughness: PAINT_FINISH_PRESETS.gloss.roughness,
  clearcoat: PAINT_FINISH_PRESETS.gloss.clearcoat,
}

export const PAINT_TARGETS = [
  { id: 'fullCar', label: 'Full Car' },
  { id: 'hood', label: 'Hood' },
  { id: 'trunk', label: 'Trunk' },
  { id: 'rims', label: 'Rims' },
] as const

export type PaintTargetId = (typeof PAINT_TARGETS)[number]['id']

function normalized(value: string): string {
  return value.trim().toLowerCase()
}

const INTERIOR_TOKENS = [
  'interior',
  'inside',
  'cabin',
  'seat',
  'dashboard',
  'dash',
  'console',
  'steering',
  'pedal',
  'headliner',
  'headrest',
  'doorpanel',
  'door_panel',
  'doortrim',
  'door_trim',
  'liner',
  'cockpit',
  'int_',
  '_int',
  'carpet',
  'armrest',
  'pillar_int',
]

const HEADLIGHT_TOKENS = [
  'headlight',
  'head_light',
  'head light',
  'front_light',
  'front light',
]

const NON_BODY_TOKENS = [
  'sub_frame',
  'sub frame',
  'subframe',
  'frame_sub',
  'sub0_frame',
  'sub1_frame',
  'lugnut',
  'lug_nut',
  'lug nut',
  'wheel_nut',
  'wheel nut',
  'nut',
  'brake',
  'caliper',
  'callipe',
  'rotor',
  'disc',
  'disk',
  'hub',
  // Spoiler / boot lid spoiler — keep original model colour (typically black)
  'spoiler',
  'boot_spoiler',
  'boot spoiler',
  'rear_spoiler',
  'rear spoiler',
  'wing',
  'head_lights_glass',
  'head lights glass',
  'front_head_light',
  'front head light',
  'f_light',
  'f light',
  'front_light_glass',
  'front light glass',
  'wheel_front_chrome',
  'wheel front chrome',
  'front_chrome',
  'front chrome',
  'chrome',
  'bumper_r_glass',
  'bumper r glass',
  'rear_glass',
  'rear glass',
  'light_rear_glass',
  'tail_light_glass',
  'tail light glass',
  'taillight_glass',
  'taillight glass',
  'glass_galss',
  // Keep frame shell mesh black/original
  'sub3 frame 0',
  'sub3_frame_0',
  // Keep bumper grille mesh black/original
  'griillepl1',
  'grillepl1',
]

function isInteriorMeshLabel(label: string): boolean {
  const v = normalized(label)
  return INTERIOR_TOKENS.some((token) => v.includes(token))
}

function isHeadlightMeshLabel(label: string): boolean {
  const v = normalized(label)
  return HEADLIGHT_TOKENS.some((token) => v.includes(token))
}

function isNonBodyMeshLabel(label: string): boolean {
  const v = normalized(label)
  return NON_BODY_TOKENS.some((token) => v.includes(token))
}

const exactGroups: Record<Exclude<PaintTargetId, 'fullCar'>, string[]> = {
  hood: ['bonnet002_skin_00_0'],
  trunk: ['boot003_skin_00_0'],
  rims: [
    'wheel_lf_sub3_wheel_front_rims_0',
    'wheel_lr_sub3_wheel_rear_rims_0',
    'wheel_rr_sub3_wheel_rear_rims_0',
    'wheel_rf_sub3_wheel_front_rims_0',
  ],
}

const fullCarPrefixes = [
  'bodyshell',
  'door_',
  'boot',
  'bonnet',
  'fenders',
  'bumper_f',
  'bumper_r',
  'sideskirt',
  'side_skirt',
  'side_skirts',
  'sideskirts',
  'skirt',
  'skirts',
]

const hoodPrefixes = [
  'hood',
  'bonnet',
]

const trunkPrefixes = [
  'trunk',
  'boot',
  'decklid',
  'deck_lid',
  'hatch',
  'rear_hatch',
]

export function getPaintTargetsForLabel(label: string): PaintTargetId[] {
  const value = normalized(label)
  const targets: PaintTargetId[] = []

  if (exactGroups.hood.includes(value) || hoodPrefixes.some((prefix) => value.startsWith(prefix))) {
    targets.push('hood')
  }
  if (exactGroups.trunk.includes(value) || trunkPrefixes.some((prefix) => value.startsWith(prefix))) {
    targets.push('trunk')
  }
  if (exactGroups.rims.includes(value)) {
    targets.push('rims')
  }

  if (fullCarPrefixes.some((prefix) => value.startsWith(prefix))) {
    targets.push('fullCar')
  }

  return targets
}

/**
 * Resolves which PaintConfig to apply to a mesh.
 *
 * @param label          - The mesh's name/label string.
 * @param targetPaints   - The per-target paint overrides from the editor store.
 * @param fallbackPaint  - The mesh's original/base material color.
 * @param explicitClass  - Optional: the mesh's explicit MeshClass from the
 *                         classify preset.  When provided it always takes
 *                         precedence over name-based auto-detection:
 *                           'paintable' → receives body/target paint (skips
 *                                         ALL name-based exclusion heuristics)
 *                           'rims'      → receives rims paint only
 *                           'excluded'  → always returns fallback (base color)
 *                           'window'    → always returns fallback (base color)
 *                           undefined   → auto-detect via label heuristics
 */
export function getResolvedPaintForLabel(
  label: string,
  targetPaints: Partial<Record<PaintTargetId, PaintConfig>>,
  fallbackPaint: PaintConfig,
  explicitClass?: MeshClass | null,
): PaintConfig {
  // ── Explicit classify wins — always, with no name-heuristic fallthrough ─────

  if (explicitClass === 'excluded' || explicitClass === 'window') {
    return fallbackPaint
  }

  if (explicitClass === 'rims') {
    return targetPaints.rims ?? fallbackPaint
  }

  if (explicitClass === 'paintable') {
    // Respect specific-panel overrides (hood / trunk) but bypass the
    // interior / headlight / non-body exclusion heuristics entirely.
    const targets = getPaintTargetsForLabel(label)
    for (const target of ['hood', 'trunk'] as const) {
      if (targets.includes(target) && targetPaints[target]) return targetPaints[target]!
    }
    return targetPaints.fullCar ?? fallbackPaint
  }

  // ── Auto-detect (no explicit classification) ──────────────────────────────

  const targets = getPaintTargetsForLabel(label)

  // Specific targets always win over fullCar
  for (const target of ['hood', 'trunk', 'rims'] as const) {
    if (targets.includes(target) && targetPaints[target]) {
      return targetPaints[target]!
    }
  }

  // Rims are never affected by fullCar — they must be painted independently.
  if (targets.includes('rims')) {
    return fallbackPaint
  }

  // Interior meshes always keep their original model color regardless of fullCar.
  if (isInteriorMeshLabel(label)) {
    return fallbackPaint
  }

  // Headlight meshes are never paintable by body paint.
  if (isHeadlightMeshLabel(label)) {
    return fallbackPaint
  }

  // Keep wheel hardware and brake parts on their original material colors.
  if (isNonBodyMeshLabel(label)) {
    return fallbackPaint
  }

  // fullCar acts as a catch-all for any paintable mesh that doesn't have a
  // more-specific override — regardless of whether the label matches a prefix.
  // This covers body panels whose names don't appear in fullCarPrefixes.
  if (targetPaints.fullCar) {
    return targetPaints.fullCar
  }

  return fallbackPaint
}

// ── Per-car classification locking (persisted in localStorage) ────────────────
const CLASSIFY_LOCK_PREFIX = 'mygarage-classify-lock-'
const CLASSIFY_LOCK_BACKUP_PREFIX = 'mygarage-classify-lock-backup-'
const PERSONAL_CLASSIFY_PREFIX = 'mygarage-personal-classify-'

// Cars listed here bypass all baked/generated classify presets so editing starts
// from raw GLB defaults (name heuristics + live user classify only).
const GLB_DEFAULT_CLASSIFY_FILES = new Set<string>([])

// Cars listed here use built-in presets as editable factory defaults.
// Users can override these meshes, and "reset classify" returns to this map.
// (Currently empty — all cars are either system-locked or freely editable.)
const EDITABLE_FACTORY_PRESET_FILES = new Set<string>([])

// Cars listed here are true admin/system locked presets.
// Their mesh classes cannot be overridden by user personal classify.
const SYSTEM_LOCKED_PRESET_FILES = new Set<string>([
  '2017_nissain_aimgain_gtr_r35_type_2.glb',
])

// ── Built-in factory presets (survive hard reset / localStorage clear) ────────
// These are the source-of-truth for pre-configured cars.  They are used as a
// fallback when both the primary and backup localStorage keys are missing.
// When a preset is restored from here it is immediately re-saved to localStorage
// so subsequent reads are fast.  To update a preset: re-classify the car in the
// UI, lock it, then update the object below to match.
const BUILT_IN_CLASSIFY_PRESETS: Record<string, Record<string, MeshClass>> = {
  // 2012 Dodge Charger RT Sedan 4D (1)
  '2012_dodge_charger_rt_sedan_4d%20(1).glb': {
    'untitledLOD_A_FRONTBUMPER_mm_lights_Mesh_052_VehicleExterior_mm_lights_color_CH_0': 'excluded',
    'untitledLOD_A_FRONTBUMPER_mm_misc_Mesh_053_VehicleExterior_mm_misc_untitledVehicle_Exterior_mm_misc1_0': 'excluded',
    'untitledLOD_A_FRONTBUMPER_mm_misc_Mesh_053_VehicleExterior_mm_misc_chrome_0': 'excluded',
    'untitledLOD_A_BODY_mm_lights_Mesh_002_VehicleExterior_mm_lights_chrome_0': 'excluded',
    'untitledLOD_A_BODY_mm_lights_Mesh_002_VehicleExterior_mm_lights_untitledVehicle_Exterior_mm_lights1_0': 'excluded',
    'untitledLOD_A_BODY_mm_misc_Mesh_003_VehicleExterior_mm_misc_untitledVehicle_Exterior_mm_misc1_0': 'excluded',
    'untitledLOD_A_DOOR_RIGHT_REAR_mm_misc_Mesh_040_VehicleExterior_mm_misc_untitledVehicle_Exterior_mm_misc1_0': 'excluded',
    'untitledLOD_A_DOOR_RIGHT_mm_misc_Mesh_043_VehicleExterior_mm_misc_untitledVehicle_Exterior_mm_misc1_0': 'excluded',
    'untitledLOD_A_BOOT_mm_misc_Mesh_013_VehicleExterior_mm_misc_untitledVehicle_Exterior_mm_misc1_0': 'excluded',
    'untitledLOD_A_TAILLIGHT_LENS_BOOT_mm_lights_Mesh_090_VehicleExterior_mm_lights_untitledVehicle_Exterior_mm_lights1_0': 'excluded',
    'untitledLOD_A_BOOT_mm_badges_Mesh_010_VehicleExterior_mm_badges_untitledVehicle_Exterior_mm_badges1_0': 'excluded',
    'untitledLOD_A_REARBUMPER_mm_badges_Mesh_084_VehicleExterior_mm_badges_untitledVehicle_Exterior_mm_badges1_0': 'excluded',
    'untitledLOD_A_REARBUMPER_mm_misc_Mesh_087_VehicleExterior_mm_misc_untitledVehicle_Exterior_mm_misc1_0': 'excluded',
    'untitledLOD_A_DOOR_LEFT_mm_misc_Mesh_031_VehicleExterior_mm_misc_untitledVehicle_Exterior_mm_misc1_0': 'excluded',
    'untitledLOD_A_DOOR_LEFT_REAR_mm_misc_Mesh_028_VehicleExterior_mm_misc_untitledVehicle_Exterior_mm_misc1_0': 'excluded',
    'untitledLOD_A_GLASS_FRONT_mm_windows_Mesh_056_VehicleExterior_mm_windows_glass_surr_0': 'window',
    'untitledLOD_A_DOOR_RIGHT_REAR_mm_cab_Mesh_038_VehicleExterior_mm_cab_untitledVehicle_Exterior_mm_cab1_0': 'excluded',
    'untitledLOD_A_DOOR_LEFT_REAR_mm_cab_Mesh_026_VehicleExterior_mm_cab_untitledVehicle_Exterior_mm_cab1_0': 'excluded',
    'untitledLOD_A_GLASS_REAR_mm_windows_Mesh_059_VehicleExterior_mm_windows_glass_surr_0': 'window',
    'untitledLOD_A_GLASS_REAR_mm_windows_Mesh_059_VehicleExterior_mm_windows_untitledVehicle_Exterior_mm_windows1_0': 'window',
    'untitledLOD_A_GLASS_mm_windows_Mesh_062_VehicleExterior_mm_windows_d_glass_0': 'window',
    'untitledLOD_A_GLASS_LEFT_REAR_mm_windows_Mesh_057_VehicleExterior_mm_windows_untitledVehicle_Exterior_mm_windows1_0': 'window',
    'untitledLOD_A_GLASS_LEFT_mm_windows_Mesh_058_VehicleExterior_mm_windows_untitledVehicle_Exterior_mm_windows1_0': 'window',
    'untitledLOD_A_GLASS_FRONT_mm_windows_Mesh_056_VehicleExterior_mm_windows_untitledVehicle_Exterior_mm_windows1_0': 'window',
    'untitledLOD_A_GLASS_RIGHT_REAR_mm_windows_Mesh_060_VehicleExterior_mm_windows_untitledVehicle_Exterior_mm_windows1_0': 'window',
    'untitledLOD_A_GLASS_RIGHT_mm_windows_Mesh_061_VehicleExterior_mm_windows_untitledVehicle_Exterior_mm_windows1_0': 'window',
  },
  // Chrysler 300 SRT Hellcat
  'chrysler_300_srt_hellcat.glb': {
    'Object_26': 'paintable',
    'Object_29': 'excluded',
    'Object_17': 'excluded',
    'Object_3': 'paintable',
    'Object_9': 'excluded',
    'Object_4': 'excluded',
    'Object_12': 'excluded',
    'Object_2': 'excluded',
    'Object_21': 'excluded',
    'Object_20': 'excluded',
    'Object_18': 'excluded',
    'Object_33': 'excluded',
    'Object_31': 'excluded',
    'Object_19': 'excluded',
    'Object_14': 'paintable',
    'Object_8': 'excluded',
    'Object_32': 'window',
    'Object_15': 'window',
    'Object_28': 'excluded',
    'Object_34': 'excluded',
    'Object_7': 'excluded',
  },
  // 2020 Dodge Challenger SRT Super Stock
  '2020_dodge_challenger_srt_super_stock.glb': {
    'dKit3_Base_Geo_lodA_Kit3_Base_Geo_lodA_Dodge_ChallengerSRTSuperStockRewardRecycled_2021Base_Material_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Base_Material1_0': 'excluded',
    'dKit3_Paint_Geo_lodA_Kit3_Paint_Geo_lodA_Dodge_ChallengerSRTSuperStockRewardRecycled_2021Paint_Material_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Paint_Material1_0': 'paintable',
    'dKit3_Window_Geo_lodA_Kit3_Window_Geo_lodA_Dodge_ChallengerSRTSuperStockRewardRecycled_2021Window_Material_black_glass_0': 'window',
    'dKit3_Window_Geo_lodA_Kit3_Window_Geo_lodA_Dodge_ChallengerSRTSuperStockRewardRecycled_2021Window_Material_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Window_Material1_0': 'window',
    'dKit3_InteriorTilling_Geo_lodA_Kit3_InteriorTilling_Geo_lodA_Dodge_ChallengerSRTSuperStockRewardRecycled_2021Interio_882715b_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Interio_882715b1_0': 'excluded',
    'dGrille5_Geo_lodA_Grille5_Geo_lodA_Dodge_ChallengerSRTSuperStockRewardRecycled_2021Grille5_d33ba27_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Grille5_d33ba28_0': 'excluded',
    'dKit3_Grille8_Geo_lodA_Kit3_Grille8_Geo_lodA_Dodge_ChallengerSRTSuperStockRewardRecycled_2021Grille8_de3cf2e_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Grille8_de3cf2e1_0': 'excluded',
    'dKit3_Engine_Geo_lodA_Kit3_Engine_Geo_lodA_Dodge_ChallengerSRTSuperStockRewardRecycled_2021EngineA_9e984c5_dDodge_ChallengerSRTSuperStockRewardRecycled_2021EngineA_9e984c6_0': 'excluded',
    'dKit3_Grille1_Geo_lodA_Kit3_Grille1_Geo_lodA_Dodge_ChallengerSRTSuperStockRewardRecycled_2021Grille1_8af3306_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Grille1_8af3307_0': 'excluded',
    'dKit3_Badge_Geo_lodA_Kit3_Badge_Geo_lodA_Dodge_ChallengerSRTSuperStockRewardRecycled_2021BadgeC_Material_dDodge_ChallengerSRTSuperStockRewardRecycled_2021BadgeC_Material1_0': 'excluded',
    'polySurface514_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Callipe_5313eec1_0': 'excluded',
    'polySurface573_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Callipe_5313eec1_0': 'excluded',
    'polySurface538_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Callipe_5313eec1_0': 'paintable',
    'polySurface477_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Callipe_4051ebc1_0': 'excluded',
    'polySurface489_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Callipe_5313eec1_0': 'excluded',
    'polySurface479_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Callipe_5313eec1_0': 'excluded',
    'polySurface541_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Callipe_5313eec1_0': 'excluded',
    'polySurface475_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Callipe_4051ebc1_0': 'excluded',
    'polySurface480_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Callipe_5313eec1_0': 'excluded',
    'polySurface478_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Callipe_4051ebc1_0': 'excluded',
    'polySurface559_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Callipe_5313eec1_0': 'excluded',
    'polySurface550_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Callipe_5313eec1_0': 'excluded',
    'polySurface571_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Callipe_5313eec1_0': 'excluded',
    'polySurface560_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Callipe_5313eec1_0': 'excluded',
    'polySurface561_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Callipe_5313eec1_0': 'excluded',
    'polySurface553_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Callipe_5313eec1_0': 'excluded',
    'polySurface555_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Callipe_5313eec1_0': 'excluded',
    'polySurface395_dDodge_ChallengerSRTSuperStockRewardRecycled_2021_Wheel1_79a26e5_0': 'excluded',
    'dKit3_Light_Geo_lodA_Kit3_Light_Geo_lodA_Dodge_ChallengerSRTSuperStockRewardRecycled_2021LightB_Material_dDodge_ChallengerSRTSuperStockRewardRecycled_2021LightB_Material1_0': 'excluded',
    'dKit3_Coloured_Geo_lodA_Kit3_Coloured_Geo_lodA_Dodge_ChallengerSRTSuperStockRewardRecycled_2021Coloure_70556fb_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Coloure_70556fb1_0': 'excluded',
    'dManufacturerPlate_Geo_lodA_ManufacturerPlate_Geo_lodA_Dodge_ChallengerSRTSuperStockRewardRecycled_2021Manufac_cf53216_dDodge_ChallengerSRTSuperStockRewardRecycled_2021Manufac_cf53217_0': 'excluded',
  },
  // 2017 Nissan Aimgain GTR R35 Type 2 — Object_48 locked excluded (black trim)
  '2017_nissain_aimgain_gtr_r35_type_2.glb': {
    'Object_411': 'excluded',
    'Object_383': 'excluded',
    'Object_387': 'excluded',
    'Object_391': 'excluded',
    'Object_399': 'excluded',
    'Object_403': 'excluded',
    'Object_415': 'excluded',
    'Object_351': 'excluded',
    'Object_355': 'excluded',
    'Object_359': 'window',
    'Object_363': 'excluded',
    'Object_367': 'excluded',
    'Object_371': 'excluded',
    'Object_375': 'excluded',
    'Object_379': 'excluded',
    'Object_459': 'excluded',
    'Object_395': 'excluded',
    'Object_40': 'window',
    'Object_562': 'excluded',
    'Object_566': 'rims',
    'Object_473': 'excluded',
    'Object_509': 'excluded',
    'Object_493': 'excluded',
    'Object_463': 'excluded',
    'Object_451': 'excluded',
    'Object_12': 'excluded',
    'Object_469': 'excluded',
    'Object_407': 'excluded',
    'Object_52': 'excluded',
    'Object_569': 'excluded',
    'Object_60': 'excluded',
    'Object_80': 'excluded',
    'Object_36': 'rims',
    'Object_88': 'window',
    'Object_91': 'excluded',
    'Object_114': 'excluded',
    'Object_68': 'excluded',
    'Object_48': 'excluded',
    'Object_76': 'excluded',
    'Object_56': 'excluded',
    'Object_893': 'excluded',
    'Object_650': 'excluded',
    'Object_654': 'excluded',
    'Object_646': 'excluded',
    'Object_642': 'excluded',
    'Object_658': 'excluded',
    'Object_662': 'excluded',
    'Object_638': 'excluded',
    'Object_634': 'excluded',
    'Object_630': 'excluded',
    'Object_626': 'excluded',
    'Object_682': 'excluded',
    'Object_797': 'rims',
    'Object_578': 'excluded',
    'Object_666': 'excluded',
    'Object_670': 'excluded',
    'Object_674': 'excluded',
    'Object_686': 'excluded',
    'Object_622': 'excluded',
    'Object_574': 'excluded',
    'Object_736': 'excluded',
    'Object_614': 'excluded',
    'Object_728': 'excluded',
    'Object_678': 'excluded',
    'Object_793': 'excluded',
    'Object_784': 'excluded',
    'Object_692': 'excluded',
    'Object_732': 'excluded',
    'Object_800': 'excluded',
    'Object_618': 'excluded',
    'Object_582': 'excluded',
    'Object_1028': 'rims',
    'Object_967': 'excluded',
    'Object_1015': 'excluded',
    'Object_1007': 'excluded',
    'Object_1024': 'excluded',
    'Object_999': 'excluded',
    'Object_809': 'excluded',
    'Object_849': 'excluded',
    'Object_913': 'excluded',
    'Object_885': 'excluded',
    'Object_889': 'excluded',
    'Object_877': 'excluded',
    'Object_881': 'excluded',
    'Object_873': 'excluded',
    'Object_869': 'excluded',
    'Object_865': 'excluded',
    'Object_861': 'excluded',
    'Object_857': 'excluded',
    'Object_853': 'excluded',
    'Object_917': 'excluded',
    'Object_905': 'excluded',
    'Object_901': 'excluded',
    'Object_897': 'excluded',
    'Object_805': 'excluded',
    'Object_1031': 'excluded',
    'Object_188': 'excluded',
    'Object_180': 'excluded',
    'Object_176': 'excluded',
    'Object_172': 'excluded',
    'Object_168': 'excluded',
    'Object_164': 'excluded',
    'Object_160': 'excluded',
    'Object_156': 'excluded',
    'Object_144': 'excluded',
    'Object_148': 'excluded',
    'Object_152': 'excluded',
    'Object_343': 'rims',
    'Object_140': 'excluded',
    'Object_136': 'excluded',
    'Object_132': 'excluded',
    'Object_128': 'excluded',
    'Object_192': 'excluded',
    'Object_236': 'excluded',
    'Object_240': 'excluded',
    'Object_334': 'excluded',
    'Object_339': 'excluded',
    'Object_298': 'excluded',
    'Object_302': 'excluded',
    'Object_330': 'excluded',
    'Object_294': 'excluded',
    'Object_346': 'paintable',
    'Object_184': 'excluded',
    'Object_94': 'window',
    'Object_64': 'window',
    'Object_32': 'window',
  },
  // Jeep Grand Cherokee Trackhawk
  // Full classify map baked from locked setup.
  'jeep_grand_cherokee_trackhawk.glb': {
    'Object_42': 'excluded',
    'Object_27': 'excluded',
    'Object_26': 'excluded',
    'Object_13': 'excluded',
    'Object_6': 'excluded',
    'Object_5': 'excluded',
    'Object_35': 'excluded',
    'Object_33': 'excluded',
    'Object_43': 'excluded',
    'Object_24': 'excluded',
    'Object_18': 'excluded',
    'Object_45': 'window',
    'Object_22': 'excluded',
    'Object_19': 'excluded',
    'Object_3': 'excluded',
    'Object_25': 'excluded',
    'Object_21': 'excluded',
    'Object_17': 'excluded',
    'Object_30': 'excluded',
    'Object_20': 'excluded',
    'Object_15': 'excluded',
    'Object_40': 'excluded',
    'Object_2': 'paintable',
    'Object_4': 'excluded',
    'Object_46': 'window',
    'Object_8': 'excluded',
    'Object_37': 'excluded',
    'Object_23': 'excluded',
    'Object_31': 'excluded',
    'Object_36': 'excluded',
    'Object_14': 'excluded',
    'Object_29': 'excluded',
  },
  // Dodge Charger Hellcat SRT
  // Full classify map baked from locked setup.
  'dodge_charger_srt_hellcat__high_quality.glb': {
    'bumper_f_frame_0': 'excluded',
    'bodyshell_SUB3_frame_0': 'excluded',
    'suspension_rf_LOD1_vehicle_generic_detail2_0': 'excluded',
    'sideskirt_SUB0_frame_0': 'excluded',
    'lights_ind_r_f_Headlight_Reflector_0': 'excluded',
    'bumper_f004_EXT_Chrome_0': 'excluded',
    'lights_ind_l_f_Headlight_Reflector_0': 'excluded',
    'bonnet_SUB3_EXT_grillepl1_0': 'excluded',
    'reversinglight_t_0': 'excluded',
    'bumper_r003_EXT_grillepl1_0': 'excluded',
    'boot_spoiler_SKIN_00_0': 'excluded',
    'exhaust_SUB1_EXT_Chrome_exh_0': 'excluded',
    'bumper_r001_frame_0': 'excluded',
    'suspension_lf_LOD1_vehicle_generic_detail2_0': 'excluded',
    'misc_d_Glass_0': 'excluded',
    'light_rear_glass_Glass_0': 'excluded',
    'Plate_Rear_EXT_PLATE_0': 'excluded',
    'lights_dtr_t_0': 'excluded',
    'bumper_f006_EXT_Red_0': 'excluded',
    'misc_c007_red_80_percent_alpha_0': 'excluded',
    'light_rear_glass_red_red_80_percent_alpha_0': 'excluded',
    'misc_a001_tailred003_0': 'excluded',
    'wheel_lr_SUB3_Wheel_Rear_Rims_0': 'rims',
    'wheel_lf_SUB3_Wheel_Front_Rims_0': 'rims',
    'wheel_rf_SUB1_Brake_Disc_0': 'excluded',
    'wheel_rf_SUB3_Wheel_Front_Rims_0': 'rims',
    'wheel_rr_SUB3_Wheel_Rear_Rims_0': 'rims',
    'chassis_SUB23_INT_moket2_third_paint_0': 'excluded',
    'door_rr_SUB7_EXT_Rubber_0': 'excluded',
    'window_lf_ext_EXT_Glass_0': 'window',
    'window_lr_ext_EXT_Glass_0': 'window',
    'window_rf_ext_EXT_Glass_0': 'window',
    'window_rr_ext_EXT_Glass_0': 'window',
    'windscreen_ext_EXT_Glass_0': 'window',
    'windscreen_r_ext_EXT_Glass_0': 'window',
    'sunroof_glass_ext_EXT_Glass_0': 'window',
    'boot.009_EXT_Glass_0': 'window',
    'bumper_r_glass_Glass_0': 'excluded',
    'misc_e006_frame_0': 'excluded',
    'bodyshell_SUB5_SKIN_01_0': 'excluded',
    'door_lf_SUB9_EXT_Rubber_0': 'excluded',
    'door_lr_SUB6_EXT_Rubber_0': 'excluded',
    'bodyshell_SUB7_EXT_Black_Glass_0': 'window',
    'door_rf_mirror_Mirror_0': 'excluded',
    'door_lf_mirror_Mirror_0': 'excluded',
  },
}

function isMeshClassValue(value: unknown): value is MeshClass {
  return value === 'paintable' || value === 'excluded' || value === 'window' || value === 'rims'
}

function sanitizeClassifications(raw: unknown): Record<string, MeshClass> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }

  const input = raw as Record<string, unknown>
  const output: Record<string, MeshClass> = {}
  for (const [key, value] of Object.entries(input)) {
    if (typeof key !== 'string' || !isMeshClassValue(value)) {
      continue
    }
    output[key] = value
  }

  return Object.keys(output).length > 0 ? output : {}
}

function readLockRecord(key: string): Record<string, MeshClass> | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return sanitizeClassifications(JSON.parse(raw))
  } catch {
    return null
  }
}

function getFileNameVariants(fileName: string): string[] {
  const variants = new Set<string>()
  variants.add(fileName)

  try {
    variants.add(decodeURIComponent(fileName))
  } catch {
    // Ignore malformed URI sequences and keep the original filename.
  }

  try {
    variants.add(encodeURIComponent(fileName))
  } catch {
    // Ignore encoding failures and keep the original filename.
  }

  return [...variants]
}

function getBuiltInPresetForFile(fileName: string): Record<string, MeshClass> | undefined {
  for (const variant of getFileNameVariants(fileName)) {
    if (GLB_DEFAULT_CLASSIFY_FILES.has(variant)) {
      return undefined
    }
  }

  for (const variant of getFileNameVariants(fileName)) {
    const generated = GENERATED_CLASSIFY_PRESETS[variant]
    if (generated !== undefined) {
      return generated
    }
    const preset = BUILT_IN_CLASSIFY_PRESETS[variant]
    if (preset !== undefined) {
      return preset
    }
  }
  return undefined
}

function isEditableFactoryPresetFile(fileName: string): boolean {
  for (const variant of getFileNameVariants(fileName)) {
    if (EDITABLE_FACTORY_PRESET_FILES.has(variant)) {
      return true
    }
  }
  return false
}

function isSystemLockedPresetFile(fileName: string): boolean {
  for (const variant of getFileNameVariants(fileName)) {
    if (SYSTEM_LOCKED_PRESET_FILES.has(variant)) {
      return true
    }
  }
  return false
}

function readStoredClassifications(prefix: string, fileName: string): Record<string, MeshClass> | null {
  for (const variant of getFileNameVariants(fileName)) {
    const record = readLockRecord(prefix + variant)
    if (record !== null) {
      return record
    }
  }
  return null
}

/** Returns the locked classifications for a car, or null if not locked. */
export function getLockedClassifications(fileName: string): Record<string, MeshClass> | null {
  const primaryKey = CLASSIFY_LOCK_PREFIX + fileName
  const backupKey = CLASSIFY_LOCK_BACKUP_PREFIX + fileName

  // Editable-factory cars never use hard locks. If legacy lock keys exist from
  // an older workflow, clear them so classify remains user-editable.
  if (isEditableFactoryPresetFile(fileName)) {
    clearLockedClassifications(fileName)
    return null
  }

  // Cars that are not system-locked should remain editable by default even if
  // they have built-in classify presets as baselines.
  const isSystemLocked = isSystemLockedPresetFile(fileName)

  // Non-system cars are always user-editable. Ignore/clear any legacy lock keys
  // so reset behavior uses factory baseline + personal overrides only.
  if (!isSystemLocked) {
    clearLockedClassifications(fileName)
    return null
  }

  const primary = readStoredClassifications(CLASSIFY_LOCK_PREFIX, fileName)
  if (primary !== null) {
    return primary
  }

  const backup = readStoredClassifications(CLASSIFY_LOCK_BACKUP_PREFIX, fileName)
  if (backup !== null) {
    try {
      // Self-heal the primary key from backup after abrupt shutdown/corruption.
      localStorage.setItem(primaryKey, JSON.stringify(backup))
    } catch {
      // Ignore storage write failures and still return the recovered backup.
    }
    return backup
  }

  // Both localStorage keys are gone (hard reset / clear site data).
  // Fall back to the built-in factory preset baked into the source code.
  const builtIn = isSystemLocked ? getBuiltInPresetForFile(fileName) : undefined
  if (builtIn !== undefined) {
    const serialized = JSON.stringify(builtIn)
    try {
      // Re-populate localStorage so the next read is fast.
      localStorage.setItem(primaryKey, serialized)
      localStorage.setItem(backupKey, serialized)
    } catch {
      // Storage may be unavailable; still return the preset.
    }
    return { ...builtIn }
  }

  return null
}

/** Returns true if the car has locked classifications saved in localStorage. */
export function isClassifyLocked(fileName: string): boolean {
  return getLockedClassifications(fileName) !== null
}

/** Saves the current classifications for a car as locked. */
export function saveLockedClassifications(fileName: string, classifications: Record<string, MeshClass>): void {
  const safe = sanitizeClassifications(classifications) ?? {}
  const serialized = JSON.stringify(safe)
  localStorage.setItem(CLASSIFY_LOCK_PREFIX + fileName, serialized)
  localStorage.setItem(CLASSIFY_LOCK_BACKUP_PREFIX + fileName, serialized)
}

/** Removes the lock for a car, allowing classifications to be changed again. */
export function clearLockedClassifications(fileName: string): void {
  localStorage.removeItem(CLASSIFY_LOCK_PREFIX + fileName)
  localStorage.removeItem(CLASSIFY_LOCK_BACKUP_PREFIX + fileName)
}

/**
 * Dev-only helper: persist locked classify map to a source-backed generated preset file.
 * This makes "Save Classify for All" survive localStorage/browser clears.
 */
export async function saveGeneratedClassifyPreset(
  fileName: string,
  classifications: Record<string, MeshClass>,
): Promise<boolean> {
  try {
    const response = await fetch('/__api__/classify-presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, classifications }),
    })
    return response.ok
  } catch {
    return false
  }
}

// ─── User personal classify (per-user, per-car, auto-saved) ──────────────────
// This is separate from the admin/system lock. Users can freely classify any
// mesh that is NOT locked by the system preset. Their changes only affect their
// own browser and never touch the system-level presets baked into source code.

/** Returns the system-level class for a mesh, if it is admin-locked. */
export function getSystemMeshClass(fileName: string, meshName: string): MeshClass | undefined {
  if (!isSystemLockedPresetFile(fileName)) {
    return undefined
  }
  if (isEditableFactoryPresetFile(fileName)) {
    return undefined
  }
  return getBuiltInPresetForFile(fileName)?.[meshName]
}

/** Returns true if a mesh is locked at the system/admin level. */
export function isSystemLockedMesh(fileName: string, meshName: string): boolean {
  return getSystemMeshClass(fileName, meshName) !== undefined
}

/** Loads this user's personal classify overrides for a car from localStorage. */
export function loadPersonalClassifications(fileName: string): Record<string, MeshClass> {
  for (const variant of getFileNameVariants(fileName)) {
    try {
      const raw = localStorage.getItem(PERSONAL_CLASSIFY_PREFIX + variant)
      if (!raw) continue
      return sanitizeClassifications(JSON.parse(raw)) ?? {}
    } catch {
      // Try the next filename variant.
    }
  }
  return {}
}

/** Saves this user's personal classify overrides for a car to localStorage. */
export function savePersonalClassifications(
  fileName: string,
  classifications: Record<string, MeshClass>,
): void {
  try {
    localStorage.setItem(PERSONAL_CLASSIFY_PREFIX + fileName, JSON.stringify(classifications))
  } catch {
    // Storage may be unavailable; changes remain in memory for this session.
  }
}

/** Clears this user's personal classify overrides for a car. */
export function clearPersonalClassifications(fileName: string): void {
  localStorage.removeItem(PERSONAL_CLASSIFY_PREFIX + fileName)
}

/**
 * Returns the merged classify map for a car:
 * system-layer presets overlaid on top of user's personal overrides.
 * System presets always win — user cannot override admin-excluded meshes.
 */
export function getMergedClassifications(
  fileName: string,
  personalClassifications: Record<string, MeshClass>,
): Record<string, MeshClass> {
  const system = getBuiltInPresetForFile(fileName) ?? {}
  // Editable-factory and non-locked cars: built-in preset is only a baseline;
  // personal overrides always win during normal editing.
  if (isEditableFactoryPresetFile(fileName) || !isSystemLockedPresetFile(fileName)) {
    return { ...system, ...personalClassifications }
  }
  // System-locked cars: system classes always win.
  return { ...personalClassifications, ...system }
}
