import { promises as fs } from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const modelsDir = path.join(projectRoot, 'public', 'models')
const manifestPath = path.join(modelsDir, 'manifest.json')

const SUPPORTED_EXT = new Set(['.glb', '.gltf'])
const MODEL_OVERRIDES = {
  'bmw_m3_g80_2025.glb': {
    name: 'BMW M3 G80 2025',
  },
  '2019_chevrolet_corvette_c8_stingray.glb': {
    name: '2019 Chevrolet Corvette C8 Stingray',
  },
  '2020_dodge_challenger_srt_super_stock.glb': {
    name: '2020 Dodge Challenger SRT Super Stock',
  },
  'chrysler_300_srt_hellcat.glb': {
    name: 'Chrysler 300 SRT Hellcat',
  },
  'dodge_charger_srt_hellcat__high_quality.glb': {
    name: 'Dodge Charger SRT Hellcat',
  },
  'jeep_grand_cherokee_trackhawk.glb': {
    name: 'Jeep Grand Cherokee Trackhawk',
  },
}

function isSupportedModel(fileName) {
  const ext = path.extname(fileName).toLowerCase()
  return SUPPORTED_EXT.has(ext)
}

function toDisplayName(fileName) {
  const overrideName = MODEL_OVERRIDES[fileName]?.name
  if (overrideName) {
    return overrideName
  }

  const base = fileName.replace(path.extname(fileName), '')
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function ensureModelsFolder() {
  await fs.mkdir(modelsDir, { recursive: true })
}

async function buildManifest() {
  await ensureModelsFolder()
  const entries = await fs.readdir(modelsDir, { withFileTypes: true })

  const items = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => isSupportedModel(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const override = MODEL_OVERRIDES[name]
      return {
        name: toDisplayName(name),
        fileName: name,
        modelUrl: `/models/${encodeURIComponent(name)}`,
        ...(typeof override?.groundOffsetY === 'number'
          ? { groundOffsetY: override.groundOffsetY }
          : {}),
      }
    })

  const payload = {
    generatedAt: new Date().toISOString(),
    items,
  }

  await fs.writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`[cars] manifest generated with ${items.length} item(s)`)
}

buildManifest().catch((error) => {
  console.error('[cars] failed to generate manifest')
  console.error(error)
  process.exit(1)
})
