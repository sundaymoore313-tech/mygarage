import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { promises as fs } from 'node:fs'
import path from 'node:path'

function classifyPresetPersistencePlugin() {
  const generatedPath = path.resolve(process.cwd(), 'src/generated/classifyPresets.generated.ts')

  const toModuleSource = (data: Record<string, Record<string, string>>) => {
    const json = JSON.stringify(data, null, 2)
    return [
      "import type { MeshClass } from '../types/editor'",
      '',
      '// Auto-managed by the dev server endpoint used by "Save Classify for All".',
      '// Do not edit manually unless needed.',
      `export const GENERATED_CLASSIFY_PRESETS: Record<string, Record<string, MeshClass>> = ${json}`,
      '',
    ].join('\n')
  }

  const readCurrentData = async (): Promise<Record<string, Record<string, string>>> => {
    try {
      const raw = await fs.readFile(generatedPath, 'utf8')
      const match = raw.match(/=\s*(\{[\s\S]*\})\s*$/m)
      if (!match) return {}
      const parsed = JSON.parse(match[1])
      return typeof parsed === 'object' && parsed ? parsed as Record<string, Record<string, string>> : {}
    } catch {
      return {}
    }
  }

  return {
    name: 'classify-preset-persistence',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use('/__api__/classify-presets', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        let body = ''
        req.on('data', (chunk) => {
          body += chunk.toString()
        })

        req.on('end', async () => {
          try {
            const payload = JSON.parse(body) as {
              fileName?: string
              classifications?: Record<string, string>
            }

            const fileName = (payload.fileName ?? '').trim()
            const classifications = payload.classifications ?? {}

            if (!fileName || typeof classifications !== 'object') {
              res.statusCode = 400
              res.end('Invalid payload')
              return
            }

            const current = await readCurrentData()
            current[fileName] = classifications

            await fs.mkdir(path.dirname(generatedPath), { recursive: true })
            await fs.writeFile(generatedPath, toModuleSource(current), 'utf8')

            // Trigger HMR update so the new generated presets are picked up.
            const mod = server.moduleGraph.getModuleById(generatedPath)
            if (mod) {
              server.moduleGraph.invalidateModule(mod)
            }
            server.ws.send({ type: 'full-reload' })

            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 200
            res.end(JSON.stringify({ ok: true }))
          } catch {
            res.statusCode = 500
            res.end('Failed to persist classify preset')
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), classifyPresetPersistencePlugin()],
})
