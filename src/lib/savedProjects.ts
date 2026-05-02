import type { EditorProject, PaintConfig, PaintTargetId, PrintConfig } from '../types/editor'

export type SavedProjectCard = {
  id: string
  name: string
  carName: string
  modelUrl: string
  groundOffsetY?: number
  previewImageUrl?: string
  updatedAt: number
  createdAt: number
  layerCount: number
  customDecalCount: number
  paintColorHex: string
}

export type FullSavedProject = SavedProjectCard & {
  project: EditorProject
  targetPaints: Partial<Record<PaintTargetId, PaintConfig>>
  targetPrints: Partial<Record<PaintTargetId, PrintConfig | null>>
}

const SAVED_PROJECTS_KEY = 'mygarage-profile-saved-projects'
const FULL_PROJECT_PREFIX = 'mygarage-project-full-'
const LIMIT = 24

export function readSavedProjects(): SavedProjectCard[] {
  try {
    const raw = localStorage.getItem(SAVED_PROJECTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedProjectCard[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeSavedProjects(items: SavedProjectCard[]) {
  localStorage.setItem(SAVED_PROJECTS_KEY, JSON.stringify(items))
}

export function saveFullProjectToProfile(
  project: EditorProject,
  car: { name: string; modelUrl: string; groundOffsetY?: number },
  targetPaints: Partial<Record<PaintTargetId, PaintConfig>>,
  targetPrints: Partial<Record<PaintTargetId, PrintConfig | null>>,
  previewImageUrl?: string | null,
) {
  const existing = readSavedProjects()
  const prior = existing.find((p) => p.id === project.meta.id)
  const card: SavedProjectCard = {
    id: project.meta.id,
    name: project.meta.name,
    carName: car.name,
    modelUrl: car.modelUrl,
    groundOffsetY: car.groundOffsetY,
    previewImageUrl: previewImageUrl ?? prior?.previewImageUrl,
    updatedAt: Date.now(),
    createdAt: prior?.createdAt ?? project.meta.createdAt,
    layerCount: project.layers.length,
    customDecalCount: project.customDecals.length,
    paintColorHex: project.paint.colorHex,
  }

  // Save full data keyed by project id
  const full: FullSavedProject = { ...card, project, targetPaints, targetPrints }
  try {
    localStorage.setItem(FULL_PROJECT_PREFIX + card.id, JSON.stringify(full))
  } catch {
    // localStorage might be full — fail silently on full data, card still saved
  }

  const others = existing.filter((p) => p.id !== card.id)
  writeSavedProjects([card, ...others].slice(0, LIMIT))
}

export function loadFullProjectById(id: string): FullSavedProject | null {
  try {
    const raw = localStorage.getItem(FULL_PROJECT_PREFIX + id)
    if (!raw) return null
    return JSON.parse(raw) as FullSavedProject
  } catch {
    return null
  }
}

/** @deprecated — use saveFullProjectToProfile for new code */
export function saveProjectToProfile(project: EditorProject) {
  const next: SavedProjectCard = {
    id: project.meta.id,
    name: project.meta.name,
    carName: '',
    modelUrl: '',
    updatedAt: Date.now(),
    createdAt: project.meta.createdAt,
    layerCount: project.layers.length,
    customDecalCount: project.customDecals.length,
    paintColorHex: project.paint.colorHex,
  }
  const existing = readSavedProjects().filter((p) => p.id !== next.id)
  writeSavedProjects([next, ...existing].slice(0, LIMIT))
}

export function removeSavedProject(id: string) {
  const existing = readSavedProjects().filter((p) => p.id !== id)
  writeSavedProjects(existing)
  try {
    localStorage.removeItem(FULL_PROJECT_PREFIX + id)
  } catch {
    // ignore
  }
}
