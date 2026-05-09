import type { EditorProject, PaintConfig, PaintTargetId, PrintConfig } from '../types/editor'
import { getCurrentUser, isSupabaseConfigured, supabase } from './supabase'

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
const CLOUD_MIGRATED_PREFIX = 'mygarage-cloud-migrated-'
const TEMPLATE_BUCKET = 'garage-templates'
const THUMBNAIL_BUCKET = 'project-thumbnails'
const LIMIT = 24
let cloudReadUnavailable = false
export const SAVED_PROJECTS_UPDATED_EVENT = 'mygarage:saved-projects-updated'

function isMissingCloudEndpointError(error: unknown): boolean {
  const maybe = error as { code?: string; message?: string; details?: string; hint?: string } | null
  if (!maybe) return false
  if (maybe.code === 'PGRST202' || maybe.code === '42883') return true
  const text = `${maybe.message ?? ''} ${maybe.details ?? ''} ${maybe.hint ?? ''}`.toLowerCase()
  return text.includes('404') || text.includes('not found') || text.includes('does not exist')
}

export type SaveProfileResult = {
  ok: boolean
  fullSaved: boolean
  cloudSaved: boolean
  error?: string
}

type CloudProjectRow = {
  project_id: string
  name: string
  car_name: string
  model_url: string
  ground_offset_y: number | null
  preview_image_url: string | null
  updated_at_ms: number
  created_at_ms: number
  layer_count: number
  custom_decal_count: number
  paint_color_hex: string
  project_json: EditorProject
  target_paints_json: Partial<Record<PaintTargetId, PaintConfig>>
  target_prints_json: Partial<Record<PaintTargetId, PrintConfig | null>>
}

type CloudProjectCardRow = {
  project_id: string
  name: string
  car_name: string
  model_url: string
  ground_offset_y: number | null
  preview_image_url: string | null
  updated_at_ms: number
  created_at_ms: number
  layer_count: number
  custom_decal_count: number
  paint_color_hex: string
}

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
  try {
    localStorage.setItem(SAVED_PROJECTS_KEY, JSON.stringify(items))
  } catch {
    const stripped = items.map((item) => ({
      ...item,
      previewImageUrl: item.previewImageUrl?.startsWith('data:image/') ? undefined : item.previewImageUrl,
    }))
    localStorage.setItem(SAVED_PROJECTS_KEY, JSON.stringify(stripped))
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SAVED_PROJECTS_UPDATED_EVENT))
  }
}

function normalizePreviewForLocal(url?: string | null): string | undefined {
  if (!url) return undefined
  return url
}

function normalizeCardsForLocal(cards: SavedProjectCard[]): SavedProjectCard[] {
  return cards.map((card) => ({
    ...card,
    previewImageUrl: normalizePreviewForLocal(card.previewImageUrl),
  }))
}

function pruneStoredFullProjects(keepProjectIds: Set<string>): number {
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith(FULL_PROJECT_PREFIX)) continue
    const id = key.slice(FULL_PROJECT_PREFIX.length)
    if (!keepProjectIds.has(id)) {
      keysToRemove.push(key)
    }
  }

  for (const key of keysToRemove) {
    localStorage.removeItem(key)
  }

  return keysToRemove.length
}

function writeMigrationFlag(userId: string) {
  try {
    localStorage.setItem(CLOUD_MIGRATED_PREFIX + userId, '1')
  } catch {
    // ignore
  }
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

async function uploadPanelTemplateIfNeeded(
  userId: string,
  projectId: string,
  panelId: string,
  templateImageUrl?: string | null,
): Promise<string | null | undefined> {
  if (!templateImageUrl) return templateImageUrl
  if (!templateImageUrl.startsWith('data:image/')) return templateImageUrl
  if (!supabase) return templateImageUrl

  const blob = await dataUrlToBlob(templateImageUrl)
  const filePath = `${userId}/${projectId}/${panelId}-${Date.now().toString(36)}.webp`
  const { error } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .upload(filePath, blob, { upsert: true, contentType: blob.type || 'image/webp' })

  if (error) return templateImageUrl
  const { data } = supabase.storage.from(TEMPLATE_BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}

async function uploadThumbnailIfNeeded(
  userId: string,
  projectId: string,
  previewImageUrl?: string | null,
): Promise<string | null | undefined> {
  if (!previewImageUrl) return previewImageUrl
  if (!previewImageUrl.startsWith('data:image/')) return previewImageUrl
  if (!supabase) return null
  try {
    const blob = await dataUrlToBlob(previewImageUrl)
    const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : 'png'
    const filePath = `${userId}/${projectId}/thumb.${ext}`
    const { error } = await supabase.storage
      .from(THUMBNAIL_BUCKET)
      .upload(filePath, blob, { upsert: true, contentType: blob.type })
    if (error) return null
    const { data } = supabase.storage.from(THUMBNAIL_BUCKET).getPublicUrl(filePath)
    return data.publicUrl
  } catch {
    return null
  }
}

async function prepareProjectForCloud(userId: string, full: FullSavedProject): Promise<FullSavedProject> {
  const [wrapPanels, previewImageUrl] = await Promise.all([
    Promise.all(
      (full.project.wrapPanels ?? []).map(async (panel) => ({
        ...panel,
        templateImageUrl: await uploadPanelTemplateIfNeeded(userId, full.id, panel.id, panel.templateImageUrl),
      }))
    ),
    uploadThumbnailIfNeeded(userId, full.id, full.previewImageUrl),
  ])
  return {
    ...full,
    previewImageUrl: previewImageUrl ?? undefined,
    project: {
      ...full.project,
      wrapPanels,
    },
  }
}

async function saveCloudProject(full: FullSavedProject): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return true
  const user = await getCurrentUser()
  if (!user) return false

  const prepared = await prepareProjectForCloud(user.id, full)

  const payload = {
    p_project_id: prepared.id,
    p_name: prepared.name,
    p_car_name: prepared.carName,
    p_model_url: prepared.modelUrl,
    p_ground_offset_y: prepared.groundOffsetY ?? null,
    p_preview_image_url: prepared.previewImageUrl ?? null,
    p_paint_color_hex: prepared.paintColorHex,
    p_layer_count: prepared.layerCount,
    p_custom_decal_count: prepared.customDecalCount,
    p_created_at_ms: prepared.createdAt,
    p_updated_at_ms: prepared.updatedAt,
    p_project_json: prepared.project,
    p_target_paints_json: prepared.targetPaints,
    p_target_prints_json: prepared.targetPrints,
  }

  const { error: rpcError } = await supabase.rpc('save_garage_project', payload)
  if (!rpcError) return true

  const { error: upsertError } = await supabase.from('garage_projects').upsert({
    user_id: user.id,
    project_id: prepared.id,
    name: prepared.name,
    car_name: prepared.carName,
    model_url: prepared.modelUrl,
    ground_offset_y: prepared.groundOffsetY ?? null,
    preview_image_url: prepared.previewImageUrl ?? null,
    paint_color_hex: prepared.paintColorHex,
    layer_count: prepared.layerCount,
    custom_decal_count: prepared.customDecalCount,
    created_at_ms: prepared.createdAt,
    updated_at_ms: prepared.updatedAt,
    project_json: prepared.project,
    target_paints_json: prepared.targetPaints,
    target_prints_json: prepared.targetPrints,
  }, { onConflict: 'user_id,project_id' })

  return !upsertError
}

async function removeCloudProject(projectId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  const user = await getCurrentUser()
  if (!user) return

  const { error: rpcError } = await supabase.rpc('delete_garage_project', { p_project_id: projectId })
  if (!rpcError) return
  await supabase
    .from('garage_projects')
    .delete()
    .eq('user_id', user.id)
    .eq('project_id', projectId)
}

function cloudRowToFull(row: CloudProjectRow): FullSavedProject {
  return {
    id: row.project_id,
    name: row.name,
    carName: row.car_name,
    modelUrl: row.model_url,
    groundOffsetY: row.ground_offset_y ?? undefined,
    previewImageUrl: row.preview_image_url ?? undefined,
    updatedAt: row.updated_at_ms,
    createdAt: row.created_at_ms,
    layerCount: row.layer_count,
    customDecalCount: row.custom_decal_count,
    paintColorHex: row.paint_color_hex,
    project: row.project_json,
    targetPaints: row.target_paints_json ?? {},
    targetPrints: row.target_prints_json ?? {},
  }
}

function cloudCardToSavedCard(row: CloudProjectCardRow): SavedProjectCard {
  return {
    id: row.project_id,
    name: row.name,
    carName: row.car_name,
    modelUrl: row.model_url,
    groundOffsetY: row.ground_offset_y ?? undefined,
    previewImageUrl: row.preview_image_url ?? undefined,
    updatedAt: row.updated_at_ms,
    createdAt: row.created_at_ms,
    layerCount: row.layer_count,
    customDecalCount: row.custom_decal_count,
    paintColorHex: row.paint_color_hex,
  }
}

async function listCloudProjectCards(): Promise<CloudProjectCardRow[]> {
  if (!isSupabaseConfigured || !supabase || cloudReadUnavailable) return []
  const client = supabase
  const user = await getCurrentUser()
  if (!user) return []

  const { data: rpcCards, error: rpcCardsError } = await client.rpc('list_garage_project_cards')
  if (rpcCardsError && isMissingCloudEndpointError(rpcCardsError)) {
    cloudReadUnavailable = true
    return []
  }

  if (Array.isArray(rpcCards) && rpcCards.length > 0) {
    return rpcCards as CloudProjectCardRow[]
  }

  const { data, error } = await client
    .from('garage_projects')
    .select('project_id,name,car_name,model_url,ground_offset_y,preview_image_url,updated_at_ms,created_at_ms,layer_count,custom_decal_count,paint_color_hex')
    .eq('user_id', user.id)
    .order('updated_at_ms', { ascending: false })
    .limit(LIMIT)

  if (error) {
    if (isMissingCloudEndpointError(error)) {
      cloudReadUnavailable = true
    }
    return []
  }

  return (data ?? []) as CloudProjectCardRow[]
}

async function getCloudProjectRowById(projectId: string): Promise<CloudProjectRow | null> {
  if (!isSupabaseConfigured || !supabase || cloudReadUnavailable) return null
  const client = supabase
  const user = await getCurrentUser()
  if (!user) return null

  const { data: rpcData, error: rpcError } = await client.rpc('get_garage_project', { p_project_id: projectId })
  if (!rpcError) {
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData
    if (row) return row as CloudProjectRow
  }

  const { data, error } = await client
    .from('garage_projects')
    .select('project_id,name,car_name,model_url,ground_offset_y,preview_image_url,updated_at_ms,created_at_ms,layer_count,custom_decal_count,paint_color_hex,project_json,target_paints_json,target_prints_json')
    .eq('user_id', user.id)
    .eq('project_id', projectId)
    .maybeSingle<CloudProjectRow>()

  if (error) {
    if (isMissingCloudEndpointError(error)) {
      cloudReadUnavailable = true
    }
    return null
  }

  return data ?? null
}

async function listCloudProjectRows(): Promise<CloudProjectRow[]> {
  if (!isSupabaseConfigured || !supabase || cloudReadUnavailable) return []
  const cards = await listCloudProjectCards()
  if (cards.length === 0) return []

  const rows = await Promise.all(cards.map((card) => getCloudProjectRowById(card.project_id)))
  const valid = rows.filter((row): row is CloudProjectRow => Boolean(row))
  return valid
}

export async function syncCloudProjectsToLocal(): Promise<{ ok: boolean; count: number }> {
  // Reset so a page reload always retries (avoids lock-in from earlier 404s)
  cloudReadUnavailable = false
  try {
    const cardsFromCloud = await listCloudProjectCards()
    const cards = cardsFromCloud.map(cloudCardToSavedCard)
    if (cards.length > 0) {
      writeSavedProjects(cards)
    }

    const rows = await listCloudProjectRows()
    if (rows.length === 0) {
      return { ok: true, count: cards.length }
    }

    const full = rows.map(cloudRowToFull)
    writeSavedProjects(cards)
    for (const item of full) {
      localStorage.setItem(FULL_PROJECT_PREFIX + item.id, JSON.stringify(item))
    }
    return { ok: true, count: full.length }
  } catch {
    return { ok: false, count: 0 }
  }
}

export async function migrateLocalProjectsToCloud(): Promise<{ ok: boolean; migrated: number }> {
  if (!isSupabaseConfigured || !supabase) return { ok: true, migrated: 0 }

  try {
    const user = await getCurrentUser()
    if (!user) return { ok: true, migrated: 0 }

    const cards = readSavedProjects()
    let migrated = 0
    let anyFailed = false
    for (const card of cards) {
      const full = loadFullProjectById(card.id)
      if (!full) continue
      try {
        await saveCloudProject(full)
        migrated += 1
      } catch {
        anyFailed = true
      }
    }

    // Only lock the migration flag when all local projects were pushed successfully
    if (!anyFailed) {
      writeMigrationFlag(user.id)
    }
    return { ok: true, migrated }
  } catch {
    return { ok: false, migrated: 0 }
  }
}

export async function saveFullProjectToProfile(
  project: EditorProject,
  car: { name: string; modelUrl: string; groundOffsetY?: number },
  targetPaints: Partial<Record<PaintTargetId, PaintConfig>>,
  targetPrints: Partial<Record<PaintTargetId, PrintConfig | null>>,
  previewImageUrl?: string | null,
): Promise<SaveProfileResult> {
  const existing = normalizeCardsForLocal(readSavedProjects())
  const prior = existing.find((p) => p.id === project.meta.id)
  const card: SavedProjectCard = {
    id: project.meta.id,
    name: project.meta.name,
    carName: car.name,
    modelUrl: car.modelUrl,
    groundOffsetY: car.groundOffsetY,
    previewImageUrl: normalizePreviewForLocal(previewImageUrl) ?? prior?.previewImageUrl,
    updatedAt: Date.now(),
    createdAt: prior?.createdAt ?? project.meta.createdAt,
    layerCount: project.layers.length,
    customDecalCount: project.customDecals.length,
    paintColorHex: project.paint.colorHex,
  }

  // Save full data keyed by project id
  const full: FullSavedProject = { ...card, project, targetPaints, targetPrints }

  let fullSaved = true
  try {
    localStorage.setItem(FULL_PROJECT_PREFIX + card.id, JSON.stringify(full))
  } catch {
    // localStorage might be full; try pruning old full snapshots and retry once.
    fullSaved = false
    pruneStoredFullProjects(new Set([card.id]))
    try {
      localStorage.setItem(FULL_PROJECT_PREFIX + card.id, JSON.stringify(full))
      fullSaved = true
    } catch {
      // Keep going: card metadata and cloud save can still succeed.
    }
  }

  const nextCards = [card, ...existing.filter((p) => p.id !== card.id)].slice(0, LIMIT)
  let localWriteWarning: string | undefined
  try {
    writeSavedProjects(nextCards)
    localWriteWarning = fullSaved ? undefined : 'Saved card metadata, but full project data could not be stored. Clear local storage or reduce template image size.'
  } catch {
    // Last attempt: clear heavy cached full projects and retry card write.
    const keepIds = new Set(nextCards.map((p) => p.id))
    pruneStoredFullProjects(keepIds)
    try {
      writeSavedProjects(nextCards)
      fullSaved = false
      localWriteWarning = 'Saved card metadata after clearing old cache. Full project cache is limited on this device.'
    } catch {
      const cloudSaved = await saveCloudProject(full)
      return {
        ok: true,
        fullSaved: false,
        cloudSaved,
        error: cloudSaved
          ? 'Saved to cloud, but local cache could not be updated due to browser storage limits.'
          : 'Project could not be fully saved. Local cache is full and cloud sync is unavailable right now.',
      }
    }
  }

  let cloudSaved = false
  try {
    cloudSaved = await saveCloudProject(full)
  } catch {
    cloudSaved = false
  }

  const warningParts = [localWriteWarning]
  if (!cloudSaved) {
    warningParts.push('Saved on this device, but cloud sync did not finish. Open Profile again in a moment or check your connection.')
  }

  return {
    ok: true,
    fullSaved,
    cloudSaved,
    error: warningParts.filter(Boolean).join(' ' ) || undefined,
  }
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

export async function loadFullProjectByIdWithCloud(id: string): Promise<FullSavedProject | null> {
  const local = loadFullProjectById(id)
  if (local) return local

  const row = await getCloudProjectRowById(id)
  if (!row) return null
  const full = cloudRowToFull(row)

  try {
    localStorage.setItem(FULL_PROJECT_PREFIX + id, JSON.stringify(full))
    const existing = readSavedProjects().filter((p) => p.id !== full.id)
    const next: SavedProjectCard = {
      id: full.id,
      name: full.name,
      carName: full.carName,
      modelUrl: full.modelUrl,
      groundOffsetY: full.groundOffsetY,
      previewImageUrl: full.previewImageUrl,
      updatedAt: full.updatedAt,
      createdAt: full.createdAt,
      layerCount: full.layerCount,
      customDecalCount: full.customDecalCount,
      paintColorHex: full.paintColorHex,
    }
    writeSavedProjects([next, ...existing].slice(0, LIMIT))
  } catch {
    // ignore cache write errors
  }

  return full
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
  void removeCloudProject(id)
}
