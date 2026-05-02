import { promises as fs } from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const printsDir = path.join(projectRoot, 'public', 'prints')
const manifestPath = path.join(printsDir, 'manifest.json')

const SUPPORTED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg'])

function isSupportedImage(fileName) {
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

async function ensurePrintsFolder() {
  await fs.mkdir(printsDir, { recursive: true })
}

async function buildManifest() {
  await ensurePrintsFolder()
  const entries = await fs.readdir(printsDir, { withFileTypes: true })

  const items = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => isSupportedImage(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name: toDisplayName(name),
      fileName: name,
      url: `/prints/${encodeURIComponent(name)}`,
    }))

  const payload = {
    generatedAt: new Date().toISOString(),
    items,
  }

  await fs.writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`[prints] manifest generated with ${items.length} item(s)`)
}

buildManifest().catch((err) => {
  console.error('[prints] manifest generation failed:', err)
  process.exit(1)
})
