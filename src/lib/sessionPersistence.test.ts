import { beforeEach, describe, expect, it } from 'vitest'
import { readDraftProject, saveDraftProject } from './sessionPersistence'
import type { EditorProject } from '../types/editor'

function makeProject(id: string): EditorProject {
  return {
    meta: {
      id,
      name: 'Draft Test',
      version: 1,
      createdAt: 1,
      updatedAt: 1,
    },
    paint: {
      colorHex: '#112233',
      colorRef: null,
      finish: 'gloss',
      metallic: 0.2,
      roughness: 0.3,
      clearcoat: 0.9,
    },
    carGradient: {
      enabled: false,
      fromHex: '#112233',
      toHex: '#445566',
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
    layers: [
      {
        id: 'text-1',
        name: 'Text 1',
        type: 'text',
        text: 'HELLO',
        fontFamily: 'Arial',
        fontUrl: null,
        colorHex: '#ff0000',
        colorRef: null,
        finish: 'gloss',
        targetPartId: null,
        textCurve: 0,
        mirroredTextReadable: true,
        mirrorX: false,
        mirrorToOtherSide: false,
        mirrorColorHex: null,
        visible: true,
        locked: false,
        groupId: null,
        createdAt: 1,
        updatedAt: 1,
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          skew: { x: 0, y: 0 },
          opacity: 1,
        },
      },
    ],
    customDecals: [],
    meshClassifications: {},
  }
}

describe('sessionPersistence draft targets', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persists and restores target paint and print state with full project data', () => {
    const project = makeProject('draft-1')

    const ok = saveDraftProject(
      project.meta.id,
      project,
      { name: 'Test Car', modelUrl: '/models/test.glb' },
      {
        fullCar: {
          colorHex: '#123abc',
          colorRef: null,
          finish: 'matte',
          metallic: 0.1,
          roughness: 0.7,
          clearcoat: 0.2,
        },
      },
      {
        hood: {
          imageUrl: '/prints/carbon.png',
          tileScale: 4,
          opacity: 0.9,
          finish: 'satin',
          tintHex: '#ffffff',
        },
      },
    )

    expect(ok).toBe(true)

    const restored = readDraftProject(project.meta.id)
    expect(restored).not.toBeNull()
    expect(restored?.project.layers).toHaveLength(1)
    expect(restored?.project.layers[0].type).toBe('text')
    expect(restored?.targetPaints?.fullCar?.colorHex).toBe('#123abc')
    expect(restored?.targetPaints?.fullCar?.finish).toBe('matte')
    expect(restored?.targetPrints?.hood?.imageUrl).toBe('/prints/carbon.png')
    expect(restored?.car?.modelUrl).toBe('/models/test.glb')
  })
})
