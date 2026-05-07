type PerfMeta = Record<string, unknown>

type SpanEntry = {
  startTs: number
  startMeta?: PerfMeta
}

const spans = new Map<string, SpanEntry>()
const marks = new Set<string>()

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function perfEnabled(): boolean {
  if (typeof window === 'undefined') return false
  const value = new URLSearchParams(window.location.search).get('perf')
  return value === '1' || value === 'true' || value === 'on'
}

function formatMeta(meta?: PerfMeta): string {
  if (!meta || Object.keys(meta).length === 0) return ''
  try {
    return ` ${JSON.stringify(meta)}`
  } catch {
    return ' [meta]'
  }
}

function log(line: string): void {
  if (!perfEnabled()) return
  console.info(`[perf] ${line}`)
}

export function startPerfSpan(name: string, meta?: PerfMeta): void {
  spans.set(name, { startTs: nowMs(), startMeta: meta })
  log(`start ${name}${formatMeta(meta)}`)
}

export function endPerfSpan(name: string, meta?: PerfMeta): number | null {
  const span = spans.get(name)
  if (!span) {
    log(`end ${name} (missing start)${formatMeta(meta)}`)
    return null
  }

  const durationMs = nowMs() - span.startTs
  spans.delete(name)

  const mergedMeta = { ...(span.startMeta ?? {}), ...(meta ?? {}) }
  log(`end ${name} ${durationMs.toFixed(1)}ms${formatMeta(mergedMeta)}`)

  return durationMs
}

export function resetPerfSpan(name: string): void {
  spans.delete(name)
}

export function markPerfOnce(name: string, meta?: PerfMeta): void {
  if (marks.has(name)) return
  marks.add(name)
  log(`mark ${name}${formatMeta(meta)}`)
}
