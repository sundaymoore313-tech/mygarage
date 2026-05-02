import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadFullProjectById,
  readSavedProjects,
  removeSavedProject,
  saveFullProjectToProfile,
} from './savedProjects'
import type { EditorProject } from '../types/editor'

function makeProject(id: string, name: string): EditorProject {
  return {
    meta: {
      id,
      name,
      version: 1,
      createdAt: 1,
      updatedAt: 1,
    },
    paint: {
      colorHex: '#111111',
      colorRef: null,
      finish: 'gloss',
      metallic: 0.2,
      roughness: 0.3,
      clearcoat: 0.9,
    },
    carGradient: {
      enabled: false,
      fromHex: '#111111',
      toHex: '#222222',
      axis: 'y',
      balance: 0,
    },
    windowTint: {
      enabled: false,
      amount: 35,
      colorHex: '#101820',
    },
    carSplit: {
      enabled: false,
      sideAHex: '#000000',
      sideBHex: '#ffffff',
      finish: 'gloss',
      offsetX: 0,
      softEdge: 0.02,
      angle: 0,
    },
    carStripe: {
      enabled: false,
      colorHex: '#ffffff',
      finish: 'gloss',
      width: 0.14,
      gap: 0.24,
      offsetX: 0,
      softEdge: 0.02,
      angle: 0,
    },
    vehicleCalibration: {
      lengthMm: null,
      widthMm: null,
      heightMm: null,
      wheelbaseMm: null,
      source: 'unknown',
      notes: '',
    },
    wrapPanels: [],
    printProduction: {
      unitSystem: 'mm',
      outputDpi: 150,
      mediaWidthMm: 1372,
      tileOverlapMm: 12,
      defaultBleedMm: 10,
      defaultSafeMm: 8,
      colorProfileName: 'sRGB IEC61966-2.1',
      includeCutContour: false,
      includeRegistrationMarks: true,
    },
    wrapJob: {
      jobName: 'Job',
      customerName: '',
      vehicleVin: '',
      printerName: '',
      mediaName: '',
      approvedBy: '',
      approvedAt: null,
      revision: 1,
    },
    layers: [],
    customDecals: [],
    meshClassifications: {},
  }
}

describe('savedProjects', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('overwrites an existing project card by id', () => {
    const project = makeProject('p1', 'Project One')
    saveFullProjectToProfile(
      project,
      { name: 'Car A', modelUrl: '/models/a.glb' },
      { fullCar: { ...project.paint } },
      {},
      'data:image/png;base64,one',
    )

    saveFullProjectToProfile(
      { ...project, paint: { ...project.paint, colorHex: '#333333' } },
      { name: 'Car A', modelUrl: '/models/a.glb' },
      { fullCar: { ...project.paint, colorHex: '#333333' } },
      {},
      'data:image/png;base64,two',
    )

    const cards = readSavedProjects()
    expect(cards).toHaveLength(1)
    expect(cards[0].id).toBe('p1')
    expect(cards[0].previewImageUrl).toBe('data:image/png;base64,two')
    expect(cards[0].paintColorHex).toBe('#333333')
  })

  it('stores and loads full project payload', () => {
    const project = makeProject('p2', 'Project Two')
    saveFullProjectToProfile(
      project,
      { name: 'Car B', modelUrl: '/models/b.glb' },
      { fullCar: { ...project.paint } },
      {
        fullCar: {
          imageUrl: '/prints/pattern.png',
          tileScale: 2,
          opacity: 0.8,
          finish: 'matte',
          tintHex: '#ffffff',
        },
      },
    )

    const full = loadFullProjectById('p2')
    expect(full).not.toBeNull()
    expect(full?.carName).toBe('Car B')
    expect(full?.project.meta.id).toBe('p2')
    expect(full?.targetPrints.fullCar?.imageUrl).toBe('/prints/pattern.png')
  })

  it('removes both card and full project payload', () => {
    const project = makeProject('p3', 'Project Three')
    saveFullProjectToProfile(
      project,
      { name: 'Car C', modelUrl: '/models/c.glb' },
      { fullCar: { ...project.paint } },
      {},
    )

    removeSavedProject('p3')

    expect(readSavedProjects()).toHaveLength(0)
    expect(loadFullProjectById('p3')).toBeNull()
  })
})
