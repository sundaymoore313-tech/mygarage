export type WrapSwatch = {
  id: string
  brand: '3M' | 'Avery Dennison' | 'Oracal' | 'KPMF'
  code: string
  name: string
  finish: 'gloss' | 'matte' | 'satin' | 'metallic' | 'chrome'
  colorHex: string
}

// Practical, print-shop-friendly swatch set for wrap planning.
// Hex values are screen approximations; always confirm against physical swatches.
export const WRAP_COLOR_SWATCHES: WrapSwatch[] = [

  // ── 3M 2080 Series ──────────────────────────────────────────────────────────
  { id: '3m-2080-g12',   brand: '3M', code: '2080-G12',   name: 'Gloss Black',              finish: 'gloss',    colorHex: '#0f1011' },
  { id: '3m-2080-g10',   brand: '3M', code: '2080-G10',   name: 'Gloss White',              finish: 'gloss',    colorHex: '#f2f3f1' },
  { id: '3m-2080-g120',  brand: '3M', code: '2080-G120',  name: 'Gloss White Aluminum',     finish: 'metallic', colorHex: '#d3d7dc' },
  { id: '3m-2080-g201',  brand: '3M', code: '2080-G201',  name: 'Gloss Anthracite',         finish: 'gloss',    colorHex: '#474b54' },
  { id: '3m-2080-g130',  brand: '3M', code: '2080-G130',  name: 'Gloss Gunmetal',           finish: 'metallic', colorHex: '#606874' },
  { id: '3m-2080-g230',  brand: '3M', code: '2080-G230',  name: 'Gloss Charcoal Metallic',  finish: 'metallic', colorHex: '#4a4f58' },
  { id: '3m-2080-g13',   brand: '3M', code: '2080-G13',   name: 'Hot Rod Red',              finish: 'gloss',    colorHex: '#b0171f' },
  { id: '3m-2080-g173',  brand: '3M', code: '2080-G173',  name: 'Deep Burgundy',            finish: 'gloss',    colorHex: '#5c1825' },
  { id: '3m-2080-g54',   brand: '3M', code: '2080-G54',   name: 'Bright Orange',            finish: 'gloss',    colorHex: '#de4d1f' },
  { id: '3m-2080-g15',   brand: '3M', code: '2080-G15',   name: 'Bright Yellow',            finish: 'gloss',    colorHex: '#f2c311' },
  { id: '3m-2080-g156',  brand: '3M', code: '2080-G156',  name: 'Gloss Gold Dust',          finish: 'metallic', colorHex: '#c8a84b' },
  { id: '3m-2080-g46',   brand: '3M', code: '2080-G46',   name: 'Envy Green',               finish: 'gloss',    colorHex: '#2a8a3d' },
  { id: '3m-2080-g336',  brand: '3M', code: '2080-G336',  name: 'Satin Military Green',     finish: 'satin',    colorHex: '#4a5440' },
  { id: '3m-2080-g77',   brand: '3M', code: '2080-G77',   name: 'Sky Blue',                 finish: 'gloss',    colorHex: '#3f89c7' },
  { id: '3m-2080-g47',   brand: '3M', code: '2080-G47',   name: 'Blue Fire',                finish: 'gloss',    colorHex: '#1a3e93' },
  { id: '3m-2080-g197',  brand: '3M', code: '2080-G197',  name: 'Gloss Cosmic Blue',        finish: 'metallic', colorHex: '#1c3c6e' },
  { id: '3m-2080-g137',  brand: '3M', code: '2080-G137',  name: 'Fierce Fuchsia',           finish: 'gloss',    colorHex: '#a0387c' },
  { id: '3m-2080-g247',  brand: '3M', code: '2080-G247',  name: 'Gloss Purple',             finish: 'gloss',    colorHex: '#542c87' },
  { id: '3m-2080-m12',   brand: '3M', code: '2080-M12',   name: 'Matte Black',              finish: 'matte',    colorHex: '#1a1c1e' },
  { id: '3m-2080-m10',   brand: '3M', code: '2080-M10',   name: 'Matte White',              finish: 'matte',    colorHex: '#e4e5e2' },
  { id: '3m-2080-m13',   brand: '3M', code: '2080-M13',   name: 'Matte Red',                finish: 'matte',    colorHex: '#9e1a22' },
  { id: '3m-2080-m196',  brand: '3M', code: '2080-M196',  name: 'Matte Indigo',             finish: 'matte',    colorHex: '#273472' },
  { id: '3m-2080-m22',   brand: '3M', code: '2080-M22',   name: 'Matte Dark Gray',          finish: 'matte',    colorHex: '#3e4248' },
  { id: '3m-2080-s12',   brand: '3M', code: '2080-S12',   name: 'Satin Black',              finish: 'satin',    colorHex: '#17191b' },
  { id: '3m-2080-s10',   brand: '3M', code: '2080-S10',   name: 'Satin White',              finish: 'satin',    colorHex: '#eaece9' },
  { id: '3m-2080-s47',   brand: '3M', code: '2080-S47',   name: 'Satin Dark Blue',          finish: 'satin',    colorHex: '#1d3870' },
  { id: '3m-2080-s261',  brand: '3M', code: '2080-S261',  name: 'Satin Gold Dust',          finish: 'satin',    colorHex: '#c0973a' },

  // ── Avery Dennison SW900 ─────────────────────────────────────────────────────
  { id: 'avery-sw900-190-o', brand: 'Avery Dennison', code: 'SW900-190-O', name: 'Gloss Black',             finish: 'gloss',    colorHex: '#111214' },
  { id: 'avery-sw900-101-o', brand: 'Avery Dennison', code: 'SW900-101-O', name: 'Gloss White',             finish: 'gloss',    colorHex: '#f0f1ee' },
  { id: 'avery-sw900-421-o', brand: 'Avery Dennison', code: 'SW900-421-O', name: 'Gloss Carmine Red',       finish: 'gloss',    colorHex: '#9a1c26' },
  { id: 'avery-sw900-472-o', brand: 'Avery Dennison', code: 'SW900-472-O', name: 'Gloss Burgundy',          finish: 'gloss',    colorHex: '#5c1a23' },
  { id: 'avery-sw900-235-o', brand: 'Avery Dennison', code: 'SW900-235-O', name: 'Gloss Orange',            finish: 'gloss',    colorHex: '#d2611d' },
  { id: 'avery-sw900-215-o', brand: 'Avery Dennison', code: 'SW900-215-O', name: 'Gloss Bright Yellow',     finish: 'gloss',    colorHex: '#e8bc10' },
  { id: 'avery-sw900-242-o', brand: 'Avery Dennison', code: 'SW900-242-O', name: 'Gloss Satin Gold',        finish: 'satin',    colorHex: '#b99235' },
  { id: 'avery-sw900-732-o', brand: 'Avery Dennison', code: 'SW900-732-O', name: 'Gloss Green Apple',       finish: 'gloss',    colorHex: '#5ca122' },
  { id: 'avery-sw900-752-o', brand: 'Avery Dennison', code: 'SW900-752-O', name: 'Gloss Dark Green',        finish: 'gloss',    colorHex: '#1e4b28' },
  { id: 'avery-sw900-667-o', brand: 'Avery Dennison', code: 'SW900-667-O', name: 'Gloss Blue',              finish: 'gloss',    colorHex: '#2157a5' },
  { id: 'avery-sw900-662-o', brand: 'Avery Dennison', code: 'SW900-662-O', name: 'Gloss Dark Blue',         finish: 'gloss',    colorHex: '#21356c' },
  { id: 'avery-sw900-590-o', brand: 'Avery Dennison', code: 'SW900-590-O', name: 'Gloss Cosmic Purple',     finish: 'gloss',    colorHex: '#3b2070' },
  { id: 'avery-sw900-820-o', brand: 'Avery Dennison', code: 'SW900-820-O', name: 'Gloss Charcoal Metallic', finish: 'metallic', colorHex: '#4f5358' },
  { id: 'avery-sw900-830-o', brand: 'Avery Dennison', code: 'SW900-830-O', name: 'Gloss Silver Metallic',   finish: 'metallic', colorHex: '#9ea6ad' },
  { id: 'avery-sw900-843-o', brand: 'Avery Dennison', code: 'SW900-843-O', name: 'Gloss Brushed Steel',     finish: 'metallic', colorHex: '#7e888f' },
  { id: 'avery-sw900-851-o', brand: 'Avery Dennison', code: 'SW900-851-O', name: 'Gloss Bronze Metallic',   finish: 'metallic', colorHex: '#7a5432' },
  { id: 'avery-m2-190',      brand: 'Avery Dennison', code: 'SW900-190-M', name: 'Matte Black',             finish: 'matte',    colorHex: '#1b1d1f' },
  { id: 'avery-m2-101',      brand: 'Avery Dennison', code: 'SW900-101-M', name: 'Matte White',             finish: 'matte',    colorHex: '#e3e4e1' },
  { id: 'avery-m2-421',      brand: 'Avery Dennison', code: 'SW900-421-M', name: 'Matte Red',               finish: 'matte',    colorHex: '#8e1920' },
  { id: 'avery-m2-667',      brand: 'Avery Dennison', code: 'SW900-667-M', name: 'Matte Blue',              finish: 'matte',    colorHex: '#1e4d94' },

  // ── Oracal 970 Premium Wrapping Cast ────────────────────────────────────────
  { id: 'oracal-970-070', brand: 'Oracal', code: '970-070', name: 'Gloss Black',         finish: 'gloss',    colorHex: '#111317' },
  { id: 'oracal-970-010', brand: 'Oracal', code: '970-010', name: 'Gloss White',         finish: 'gloss',    colorHex: '#f1f3f0' },
  { id: 'oracal-970-311', brand: 'Oracal', code: '970-311', name: 'Gloss Red',           finish: 'gloss',    colorHex: '#a71e28' },
  { id: 'oracal-970-366', brand: 'Oracal', code: '970-366', name: 'Gloss Dark Red',      finish: 'gloss',    colorHex: '#6e1219' },
  { id: 'oracal-970-035', brand: 'Oracal', code: '970-035', name: 'Gloss Orange',        finish: 'gloss',    colorHex: '#d45720' },
  { id: 'oracal-970-020', brand: 'Oracal', code: '970-020', name: 'Gloss Yellow',        finish: 'gloss',    colorHex: '#e3b70e' },
  { id: 'oracal-970-063', brand: 'Oracal', code: '970-063', name: 'Gloss Lime Green',    finish: 'gloss',    colorHex: '#78b81e' },
  { id: 'oracal-970-060', brand: 'Oracal', code: '970-060', name: 'Gloss Dark Green',    finish: 'gloss',    colorHex: '#1d4d22' },
  { id: 'oracal-970-050', brand: 'Oracal', code: '970-050', name: 'Gloss Cyan Blue',     finish: 'gloss',    colorHex: '#0e89b5' },
  { id: 'oracal-970-040', brand: 'Oracal', code: '970-040', name: 'Gloss Blue',          finish: 'gloss',    colorHex: '#1f4fa0' },
  { id: 'oracal-970-013', brand: 'Oracal', code: '970-013', name: 'Gloss Metallic Black',finish: 'metallic', colorHex: '#252729' },
  { id: 'oracal-970-090', brand: 'Oracal', code: '970-090', name: 'Gloss Silver',        finish: 'metallic', colorHex: '#a2a8af' },
  { id: 'oracal-970-098', brand: 'Oracal', code: '970-098', name: 'Gloss Gold',          finish: 'metallic', colorHex: '#c4973c' },
  { id: 'oracal-970-676', brand: 'Oracal', code: '970-676', name: 'Matte Black',         finish: 'matte',    colorHex: '#1c1e20' },
  { id: 'oracal-970-616', brand: 'Oracal', code: '970-616', name: 'Matte White',         finish: 'matte',    colorHex: '#e2e3e0' },
  { id: 'oracal-970-347', brand: 'Oracal', code: '970-347', name: 'Matte Metallic Red',  finish: 'matte',    colorHex: '#7a1820' },
  { id: 'oracal-970-043', brand: 'Oracal', code: '970-043', name: 'Matte Dark Blue',     finish: 'matte',    colorHex: '#1b3468' },
  { id: 'oracal-970-682', brand: 'Oracal', code: '970-682', name: 'Satin Black',         finish: 'satin',    colorHex: '#1e2022' },
  { id: 'oracal-970-612', brand: 'Oracal', code: '970-612', name: 'Satin White',         finish: 'satin',    colorHex: '#e8e9e7' },

  // ── KPMF K75000 & K87000 ────────────────────────────────────────────────────
  { id: 'kpmf-k75440',  brand: 'KPMF', code: 'K75440',  name: 'Matte Iced Blue Titanium',    finish: 'matte',    colorHex: '#6f7f90' },
  { id: 'kpmf-k75501',  brand: 'KPMF', code: 'K75501',  name: 'Matte Black',                 finish: 'matte',    colorHex: '#1a1c1e' },
  { id: 'kpmf-k75502',  brand: 'KPMF', code: 'K75502',  name: 'Matte White',                 finish: 'matte',    colorHex: '#e0e1df' },
  { id: 'kpmf-k75510',  brand: 'KPMF', code: 'K75510',  name: 'Matte Volcano Red',           finish: 'matte',    colorHex: '#881520' },
  { id: 'kpmf-k75520',  brand: 'KPMF', code: 'K75520',  name: 'Matte Burnt Orange',          finish: 'matte',    colorHex: '#a84018' },
  { id: 'kpmf-k75541',  brand: 'KPMF', code: 'K75541',  name: 'Matte Intense Blue',          finish: 'matte',    colorHex: '#1c336b' },
  { id: 'kpmf-k75570',  brand: 'KPMF', code: 'K75570',  name: 'Matte Forest Green',          finish: 'matte',    colorHex: '#2e4628' },
  { id: 'kpmf-k75577',  brand: 'KPMF', code: 'K75577',  name: 'Matte Military Green',        finish: 'matte',    colorHex: '#4b5240' },
  { id: 'kpmf-k75600',  brand: 'KPMF', code: 'K75600',  name: 'Gloss Cosmic Black',          finish: 'gloss',    colorHex: '#121416' },
  { id: 'kpmf-k87001',  brand: 'KPMF', code: 'K87001',  name: 'Gloss Iridescent Amber',      finish: 'gloss',    colorHex: '#c68b28' },
  { id: 'kpmf-k87014',  brand: 'KPMF', code: 'K87014',  name: 'Gloss Iridescent Ocean Blue', finish: 'gloss',    colorHex: '#1a6a9a' },
  { id: 'kpmf-k87024',  brand: 'KPMF', code: 'K87024',  name: 'Gloss Iridescent Purple',     finish: 'gloss',    colorHex: '#5c2882' },
  { id: 'kpmf-k75580',  brand: 'KPMF', code: 'K75580',  name: 'Satin Dark Gray',             finish: 'satin',    colorHex: '#3d4148' },
  { id: 'kpmf-k75590',  brand: 'KPMF', code: 'K75590',  name: 'Satin Gunmetal',              finish: 'satin',    colorHex: '#565e68' },
]

export const WRAP_SWATCH_BY_ID = new Map(WRAP_COLOR_SWATCHES.map((swatch) => [swatch.id, swatch]))
