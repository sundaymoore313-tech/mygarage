import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadFullProjectById,
  readSavedProjects,
  removeSavedProject,
  saveFullProjectToProfile,
} from './savedProjects'
import type { EditorProject } from '../types/editor'
import type { DecalLayer, TextLayer } from '../types/editor'

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
    stripeLayerSeed: null,
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

  it('overwrites an existing project card by id', async () => {
    const project = makeProject('p1', 'Project One')
    await saveFullProjectToProfile(
      project,
      { name: 'Car A', modelUrl: '/models/a.glb' },
      { fullCar: { ...project.paint } },
      {},
      'data:image/png;base64,one',
    )

    await saveFullProjectToProfile(
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

  it('stores and loads full project payload', async () => {
    const project = makeProject('p2', 'Project Two')
    await saveFullProjectToProfile(
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

  it('removes both card and full project payload', async () => {
    const project = makeProject('p3', 'Project Three')
    await saveFullProjectToProfile(
      project,
      { name: 'Car C', modelUrl: '/models/c.glb' },
      { fullCar: { ...project.paint } },
      {},
    )

    removeSavedProject('p3')

    expect(readSavedProjects()).toHaveLength(0)
    expect(loadFullProjectById('p3')).toBeNull()
  })
    // Round-trip serialization tests for Phase 2 stability
    describe('round-trip serialization', () => {
      it('preserves all DecalLayer properties', async () => {
        const now = Date.now()
        const project = makeProject('p-decal', 'Decal Test')
          const decalLayer: DecalLayer = {
            id: 'decal-1',
            name: 'My Decal',
              type: 'decal',
            imageUrl: 'https://example.com/decal.png',
            colorHex: '#ff0000',
            colorRef: null,
            finish: 'gloss' as const,
            targetPartId: null,
            blendMode: 'multiply' as const,
            mirrorX: true,
            mirrorToOtherSide: false,
            mirrorColorHex: null,
            visible: true,
            locked: false,
            groupId: null,
            createdAt: now,
            updatedAt: now,
            transform: {
              position: { x: 1, y: 2, z: 3 },
              rotation: { x: 0.1, y: 0.2, z: 0.3 },
              scale: { x: 1.5, y: 1.5, z: 1.5 },
              skew: { x: 0, y: 0 },
              opacity: 0.8,
            },
          }
          project.layers = [decalLayer]

        await saveFullProjectToProfile(
          project,
          { name: 'Car D', modelUrl: '/models/d.glb' },
          { fullCar: { ...project.paint } },
          {},
        )

        const loaded = loadFullProjectById('p-decal')
        expect(loaded).not.toBeNull()
      
          const savedDecal = loaded?.project.layers[0] as DecalLayer | undefined
        expect(savedDecal?.type).toBe('decal')
        expect(savedDecal?.name).toBe('My Decal')
        expect(savedDecal?.imageUrl).toBe('https://example.com/decal.png')
        expect(savedDecal?.colorHex).toBe('#ff0000')
        expect(savedDecal?.finish).toBe('gloss')
        expect(savedDecal?.blendMode).toBe('multiply')
        expect(savedDecal?.mirrorX).toBe(true)
        expect(savedDecal?.transform.opacity).toBe(0.8)
        expect(savedDecal?.transform.scale.x).toBe(1.5)
      })

      it('preserves all TextLayer properties', async () => {
        const now = Date.now()
        const project = makeProject('p-text', 'Text Test')
          const textLayer: TextLayer = {
            id: 'text-1',
            name: 'My Text',
              type: 'text',
            text: 'HELLO WORLD',
            fontFamily: 'Arial',
            fontUrl: null,
            colorHex: '#00ff00',
            colorRef: null,
            finish: 'matte' as const,
            targetPartId: null,
            textCurve: 0.5,
            mirroredTextReadable: true,
            mirrorX: false,
            mirrorToOtherSide: true,
            mirrorColorHex: '#ff00ff',
            visible: false,
            locked: true,
            groupId: null,
            createdAt: now,
            updatedAt: now,
            transform: {
              position: { x: -1, y: 0.5, z: 2.5 },
              rotation: { x: 0, y: 0, z: 1.57 },
              scale: { x: 0.5, y: 0.5, z: 0.5 },
              skew: { x: 0.1, y: 0.2 },
              opacity: 0.5,
            },
          }
          project.layers = [textLayer]

        await saveFullProjectToProfile(
          project,
          { name: 'Car E', modelUrl: '/models/e.glb' },
          { fullCar: { ...project.paint } },
          {},
        )

        const loaded = loadFullProjectById('p-text')
        expect(loaded).not.toBeNull()
      
          const savedText = loaded?.project.layers[0] as TextLayer | undefined
        expect(savedText?.type).toBe('text')
        expect(savedText?.name).toBe('My Text')
        expect(savedText?.text).toBe('HELLO WORLD')
        expect(savedText?.fontFamily).toBe('Arial')
        expect(savedText?.colorHex).toBe('#00ff00')
        expect(savedText?.finish).toBe('matte')
        expect(savedText?.textCurve).toBe(0.5)
        expect(savedText?.mirrorToOtherSide).toBe(true)
        expect(savedText?.mirrorColorHex).toBe('#ff00ff')
        expect(savedText?.visible).toBe(false)
        expect(savedText?.locked).toBe(true)
        expect(savedText?.transform.skew.x).toBe(0.1)
        expect(savedText?.transform.skew.y).toBe(0.2)
        expect(savedText?.transform.opacity).toBe(0.5)
      })

      it('handles multiple layers without data loss', async () => {
        const now = Date.now()
        const project = makeProject('p-multi', 'Multi Layer Test')
          const decal: DecalLayer = {
            id: 'decal-1',
            name: 'Decal 1',
            type: 'decal' as const,
            imageUrl: 'https://example.com/1.png',
            colorHex: '#ff0000',
            colorRef: null,
            finish: 'gloss' as const,
            targetPartId: null,
            blendMode: 'normal' as const,
            mirrorX: false,
            mirrorToOtherSide: false,
            mirrorColorHex: null,
            visible: true,
            locked: false,
            groupId: null,
            createdAt: now,
            updatedAt: now,
            transform: {
              position: { x: 0, y: 0, z: 0 },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
              skew: { x: 0, y: 0 },
              opacity: 1,
            },
          }
          const text: TextLayer = {
            id: 'text-1',
            name: 'Text 1',
            type: 'text' as const,
            text: 'Test',
            fontFamily: 'Verdana',
            fontUrl: null,
            colorHex: '#0000ff',
            colorRef: null,
            finish: 'gloss' as const,
            targetPartId: null,
            textCurve: 0,
            mirroredTextReadable: true,
            mirrorX: false,
            mirrorToOtherSide: false,
            mirrorColorHex: null,
            visible: true,
            locked: false,
            groupId: null,
            createdAt: now + 1,
            updatedAt: now + 1,
            transform: {
              position: { x: 0, y: 1, z: 0 },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
              skew: { x: 0, y: 0 },
              opacity: 1,
            },
          }
          project.layers = [decal, text]

        await saveFullProjectToProfile(
          project,
          { name: 'Car F', modelUrl: '/models/f.glb' },
          { fullCar: { ...project.paint } },
          {},
        )

        const loaded = loadFullProjectById('p-multi')
        expect(loaded).not.toBeNull()
        expect(loaded?.project.layers).toHaveLength(2)
      
        expect(loaded?.project.layers[0].id).toBe('decal-1')
        expect(loaded?.project.layers[0].name).toBe('Decal 1')
        expect(loaded?.project.layers[1].id).toBe('text-1')
        expect(loaded?.project.layers[1].name).toBe('Text 1')
      })
    })
  })
