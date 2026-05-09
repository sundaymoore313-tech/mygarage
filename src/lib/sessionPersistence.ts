/**
 * Session Persistence: Auto-save, reload recovery, and project tracking
 * - Saves editor state to sessionStorage (fast, per-tab)
 * - Saves full project to localStorage (slower, persistent)
 * - Tracks unsaved changes and last save time
 */

import type { EditorProject } from '../types/editor'

const SESSION_KEY = 'mygarage-session'
const PROJECT_DRAFT_PREFIX = 'mygarage-draft-'

export type SessionState = {
  projectId: string
  screen: 'home' | 'profile' | 'selector' | 'editor'
  lastSaveMs: number
  lastAutoSaveMs: number
}

export type SaveState = {
  isDirty: boolean
  isSaving: boolean
  lastSaveMs: number
}

/** Read session metadata from sessionStorage */
export function readSession(): SessionState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as SessionState) : null
  } catch {
    return null
  }
}

/** Write session metadata to sessionStorage */
export function writeSession(state: SessionState): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state))
  } catch {
    // Silently fail if storage full
  }
}

/** Clear session metadata (on logout) */
export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Ignore
  }
}

/** Save full project to localStorage (for reload recovery + persistence) */
export function saveDraftProject(projectId: string, project: EditorProject): boolean {
  try {
    const key = `${PROJECT_DRAFT_PREFIX}${projectId}`
    localStorage.setItem(key, JSON.stringify({ project, savedAtMs: Date.now() }))
    return true
  } catch {
    console.warn(`Failed to save draft for project ${projectId}`)
    return false
  }
}

/** Load draft project from localStorage */
export function readDraftProject(projectId: string): { project: EditorProject; savedAtMs: number } | null {
  try {
    const key = `${PROJECT_DRAFT_PREFIX}${projectId}`
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as { project: EditorProject; savedAtMs: number }) : null
  } catch {
    return null
  }
}

/** Clear draft project from localStorage */
export function clearDraftProject(projectId: string): void {
  try {
    const key = `${PROJECT_DRAFT_PREFIX}${projectId}`
    localStorage.removeItem(key)
  } catch {
    // Ignore
  }
}

/** Check if there's an unfinished session we can restore */
export function hasRecoverableSession(): boolean {
  const session = readSession()
  if (!session || session.screen !== 'editor' || !session.projectId) return false
  const draft = readDraftProject(session.projectId)
  return !!draft
}

/** Get the recoverable session info */
export function getRecoverableSession(): { projectId: string; draftAge: number } | null {
  const session = readSession()
  if (!session || session.screen !== 'editor' || !session.projectId) return null
  const draft = readDraftProject(session.projectId)
  if (!draft) return null
  return {
    projectId: session.projectId,
    draftAge: Date.now() - draft.savedAtMs,
  }
}

/** Mark session as confirmed (don't show recovery prompt again this session) */
export function confirmSession(): void {
  const session = readSession()
  if (session) {
    writeSession({ ...session, lastSaveMs: Date.now() })
  }
}

/** List all draft projects (for debugging/cleanup) */
export function listDraftProjects(): Array<{ projectId: string; savedAtMs: number }> {
  const drafts: Array<{ projectId: string; savedAtMs: number }> = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(PROJECT_DRAFT_PREFIX)) {
        const projectId = key.substring(PROJECT_DRAFT_PREFIX.length)
        const raw = localStorage.getItem(key)
        if (raw) {
          try {
            const { savedAtMs } = JSON.parse(raw) as { savedAtMs: number }
            drafts.push({ projectId, savedAtMs })
          } catch {
            // Ignore malformed draft
          }
        }
      }
    }
  } catch {
    // Ignore
  }
  return drafts
}
