export function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }

  const random = Math.random().toString(36).slice(2, 10)
  const stamp = Date.now().toString(36)
  return `${prefix}_${stamp}_${random}`
}
