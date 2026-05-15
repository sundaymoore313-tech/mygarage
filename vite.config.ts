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
const appBuildId = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12)
  ?? process.env.VERCEL_GIT_COMMIT_REF
  ?? process.env.npm_package_version
  ?? 'dev'

export default defineConfig({
  define: {
    __APP_BUILD_ID__: JSON.stringify(appBuildId),
  },
  resolve: {
    alias: [
      {
        find: /^three$/,
        replacement: path.resolve(process.cwd(), 'src/lib/threeCompat.js'),
      },
    ],
  },
  server: {
    // OneDrive/Windows paths can miss native FS events; polling keeps HMR reliable.
    watch: {
      usePolling: true,
      interval: 180,
    },
  },
  plugins: [react(), classifyPresetPersistencePlugin()],
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          if (id.includes('/@react-three/fiber/') || id.includes('/@react-three/drei/')) {
            return 'vendor-r3f'
          }

          if (id.includes('/konva/') || id.includes('/react-konva/')) {
            return 'vendor-konva'
          }

          if (id.includes('/three/src/renderers/')) {
            return 'vendor-three-renderers'
          }

          if (id.includes('/three/src/math/')) {
            return 'vendor-three-math'
          }

          if (id.includes('/three/src/core/')) {
            return 'vendor-three-core-base'
          }

          if (id.includes('/three/src/geometries/') || id.includes('/three/src/materials/')) {
            return 'vendor-three-geom-mats'
          }

          if (id.includes('/three/src/objects/') || id.includes('/three/src/lights/')) {
            return 'vendor-three-objects-lights'
          }

          if (id.includes('/three/examples/jsm/loaders/')) {
            return 'vendor-three-loaders'
          }

          if (id.includes('/three/examples/jsm/geometries/')) {
            return 'vendor-three-geometries'
          }

          if (id.includes('/three/examples/')) {
            return 'vendor-three-extras'
          }

          if (id.includes('/three/src/') || id.includes('/three/build/')) {
            return 'vendor-three-misc'
          }

          if (id.includes('/leva/')) {
            return 'vendor-leva'
          }

          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/lucide-react/')) {
            return 'vendor-react'
          }

          if (id.includes('/zustand/')) {
            return 'vendor-state'
          }

          if (id.includes('/@supabase/')) {
            return 'vendor-supabase'
          }

          if (
            id.includes('/paper/') ||
            id.includes('/paperjs-offset/')
          ) {
            return 'vendor-svg-paper'
          }

          if (id.includes('/opentype.js/')) {
            return 'vendor-svg-fonts'
          }

          if (id.includes('/clipper-lib/')) {
            return 'vendor-svg-clipper'
          }

          if (id.includes('/jspdf/')) {
            return 'vendor-export-pdf'
          }

          if (id.includes('/html2canvas/')) {
            return 'vendor-export-canvas'
          }

          return undefined
        },
      },
    },
  },
})
