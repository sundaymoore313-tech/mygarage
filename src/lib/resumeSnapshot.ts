import type { EditorProject } from '../types/editor'

type ResumeSnapshot = {
  fileName: string
  savedAt: number
  project: EditorProject
}

const RESUME_SNAPSHOT_KEY = 'mygarage-resume-snapshot-v1'

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
  const payload: ResumeSnapshot = {
    fileName,
    savedAt: Date.now(),
    project,
  }

  try {
    localStorage.setItem(RESUME_SNAPSHOT_KEY, JSON.stringify(payload))
  } catch {
    // Ignore storage quota issues; session state remains in memory.
  }
}
