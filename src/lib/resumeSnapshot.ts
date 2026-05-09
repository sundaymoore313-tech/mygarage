import type { EditorProject } from '../types/editor'

type ResumeSnapshot = {
  fileName: string
  savedAt: number
  project: EditorProject
}

const RESUME_SNAPSHOT_KEY = 'mygarage-resume-snapshot-v1'
const MAX_RESUME_SNAPSHOT_CHARS = 350_000

export function shouldPersistResumeSnapshot(): boolean {
  if (typeof navigator === 'undefined') {
    return true
  }

  const ua = navigator.userAgent
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory

  // Mobile Safari/low-memory devices are prone to tab crashes from large sync storage writes.
  if (isMobile) return false
  if (typeof memory === 'number' && memory <= 4) return false
  return true
}

export function clearResumeSnapshot(): void {
  try {
    localStorage.removeItem(RESUME_SNAPSHOT_KEY)
  } catch {
    // Ignore storage access errors.
  }
}

export function readResumeSnapshot(fileName?: string): ResumeSnapshot | null {
  try {
    const raw = localStorage.getItem(RESUME_SNAPSHOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ResumeSnapshot>
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.fileName !== 'string' || !parsed.fileName) return null
    if (!parsed.project || typeof parsed.project !== 'object') return null
    if (fileName && parsed.fileName !== fileName) return null
    return {
      fileName: parsed.fileName,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
      project: parsed.project as EditorProject,
    }
  } catch {
    return null
  }
}

export function saveResumeSnapshot(fileName: string, project: EditorProject): void {
  if (!shouldPersistResumeSnapshot()) {
    return
  }

  const payload: ResumeSnapshot = {
    fileName,
    savedAt: Date.now(),
    project,
  }

  try {
    const serialized = JSON.stringify(payload)
    if (serialized.length > MAX_RESUME_SNAPSHOT_CHARS) {
      return
    }
    localStorage.setItem(RESUME_SNAPSHOT_KEY, serialized)
  } catch {
    // Ignore storage quota issues; session state remains in memory.
  }
}
