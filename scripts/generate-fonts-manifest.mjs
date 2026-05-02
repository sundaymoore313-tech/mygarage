import { promises as fs } from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const fontsDir = path.join(projectRoot, 'public', 'fonts')
const manifestPath = path.join(fontsDir, 'manifest.json')

const SUPPORTED_EXT = new Set(['.ttf', '.otf', '.woff', '.woff2'])

function isSupportedFont(fileName) {
  const ext = path.extname(fileName).toLowerCase()
  return SUPPORTED_EXT.has(ext)
}

function toDisplayName(fileName) {
  const base = fileName.replace(path.extname(fileName), '')
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toFamilyName(fileName) {
  const display = toDisplayName(fileName)
  return `MyGarage ${display}`
}

async function ensureFontsFolder() {
  await fs.mkdir(fontsDir, { recursive: true })
}

async function buildManifest() {
  await ensureFontsFolder()
  const entries = await fs.readdir(fontsDir, { withFileTypes: true })

  const items = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => isSupportedFont(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name: toDisplayName(name),
      family: toFamilyName(name),
      fileName: name,
      url: `/fonts/${encodeURIComponent(name)}`,
    }))

  const payload = {
    generatedAt: new Date().toISOString(),
    items,
  }

  await fs.writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`[fonts] manifest generated with ${items.length} item(s)`)
}

buildManifest().catch((error) => {
  console.error('[fonts] failed to generate manifest')
  console.error(error)
  process.exit(1)
})
