import { promises as fs } from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const decalsDir = path.join(projectRoot, 'public', 'decals')
const manifestPath = path.join(decalsDir, 'manifest.json')

const SUPPORTED_EXT = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp'])

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

async function ensureDecalsFolder() {
  await fs.mkdir(decalsDir, { recursive: true })
}

async function buildManifest() {
  await ensureDecalsFolder()
  const entries = await fs.readdir(decalsDir, { withFileTypes: true })

  const items = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => isSupportedImage(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name: toDisplayName(name),
      fileName: name,
      url: `/decals/${encodeURIComponent(name)}`,
    }))

  const payload = {
    generatedAt: new Date().toISOString(),
    items,
  }

  await fs.writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`[decals] manifest generated with ${items.length} item(s)`)
}

buildManifest().catch((error) => {
  console.error('[decals] failed to generate manifest')
  console.error(error)
  process.exit(1)
})
