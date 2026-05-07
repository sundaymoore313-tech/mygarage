import { beforeEach, describe, it, expect } from 'vitest'
import { useEditorStore } from '../store/editorStore'
import type { DecalLayer, TextLayer } from '../types/editor'

/**
 * Phase 2 Layer Operation Reliability Tests
 * Stress tests core layer operations to ensure state consistency under heavy use
 */

// Helper: create test DecalLayer
function createTestDecal(name: string): DecalLayer {
  return {
    id: `decal-${Math.random().toString(36).slice(2)}`,
    name,
    type: 'decal',
    imageUrl: null,
    colorHex: '#ffffff',
    colorRef: null,
    finish: 'gloss',
    targetPartId: null,
    blendMode: 'normal',
    mirrorX: false,
    mirrorToOtherSide: false,
    mirrorColorHex: null,
    visible: true,
    locked: false,
    groupId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      skew: { x: 0, y: 0 },
      opacity: 1,
    },
  }
}

// Helper: create test TextLayer
function createTestText(name: string): TextLayer {
  return {
    id: `text-${Math.random().toString(36).slice(2)}`,
    name,
    type: 'text',
    text: 'Test',
    fontFamily: 'Arial',
    fontUrl: null,
    colorHex: '#ffffff',
    colorRef: null,
    finish: 'gloss',
    targetPartId: null,
    textCurve: 0,
    mirrorX: false,
    mirrorToOtherSide: false,
    mirrorColorHex: null,
    visible: true,
    locked: false,
    groupId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      skew: { x: 0, y: 0 },
      opacity: 1,
    },
  }
}

describe('layer operation reliability', () => {
  beforeEach(() => {
    // Reset store to initial state
    const store = useEditorStore.getState()
    useEditorStore.setState({
      project: {
        meta: {
          id: 'test-project',
          name: 'Stress Test Project',
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        paint: store.project.paint,
        carGradient: store.project.carGradient,
        windowTint: store.project.windowTint,
        carSplit: store.project.carSplit,
        carStripe: store.project.carStripe,
        vehicleCalibration: store.project.vehicleCalibration,
        wrapPanels: store.project.wrapPanels,
        printProduction: store.project.printProduction,
        wrapJob: store.project.wrapJob,
        layers: [],
        customDecals: [],
        meshClassifications: {},
      },
      selectedLayerId: null,
    })
  })

  describe('reorder operation', () => {
    it('does not duplicate or lose layers during reorder', () => {
      const store = useEditorStore.getState()
      
      // Create 5 test layers
      const layers = [
        createTestDecal('Decal 1'),
        createTestDecal('Decal 2'),
        createTestDecal('Decal 3'),
        createTestDecal('Decal 4'),
        createTestDecal('Decal 5'),
      ]
      useEditorStore.setState((state) => ({
        project: {
          ...state.project,
          layers,
        },
      }))
      
      let state = useEditorStore.getState()
      const initialCount = state.project.layers.length
      const initialIds = state.project.layers.map(l => l.id)
      
      // Perform 50 reorder operations
      for (let i = 0; i < 50; i++) {
        const from = Math.floor(Math.random() * initialCount)
        const to = Math.floor(Math.random() * initialCount)
        state.reorderLayer(from, to)
        state = useEditorStore.getState()
      }
      
      const finalIds = state.project.layers.map(l => l.id)
      
      // Verify same count
      expect(state.project.layers).toHaveLength(initialCount)
      
      // Verify no duplicates: each ID should appear exactly once
      const idCounts = new Map<string, number>()
      finalIds.forEach(id => {
        idCounts.set(id, (idCounts.get(id) ?? 0) + 1)
      })
      idCounts.forEach(count => {
        expect(count).toBe(1)
      })
      
      // Verify all original IDs are present
      const initialSet = new Set(initialIds)
      const finalSet = new Set(finalIds)
      initialSet.forEach(id => {
        expect(finalSet.has(id)).toBe(true)
      })
    })

    it('maintains layer properties after reorder', () => {
      const store = useEditorStore.getState()
      
      // Create 3 test layers
      const layers = [
        createTestDecal('Decal 1'),
        createTestText('Text 1'),
        createTestDecal('Decal 2'),
      ]
      useEditorStore.setState((state) => ({
        project: {
          ...state.project,
          layers,
        },
      }))
      
      let state = useEditorStore.getState()
      const layersCopy = state.project.layers.map(l => ({ ...l }))
      
      // Reorder multiple times
      state.reorderLayer(0, 2)
      state = useEditorStore.getState()
      state.reorderLayer(1, 0)
      state = useEditorStore.getState()
      
      // Verify all properties match (except position in array)
      const afterReorder = state.project.layers
      
      // Check each original layer is intact (ignoring order)
      const beforeIds = new Set(layersCopy.map(l => l.id))
      const afterIds = new Set(afterReorder.map(l => l.id))
      
      layersCopy.forEach((originalLayer) => {
        const foundLayer = afterReorder.find(l => l.id === originalLayer.id)
        expect(foundLayer).toBeDefined()
        expect(foundLayer?.name).toBe(originalLayer.name)
        expect(foundLayer?.type).toBe(originalLayer.type)
        expect(foundLayer?.visible).toBe(originalLayer.visible)
        expect(foundLayer?.locked).toBe(originalLayer.locked)
      })
    })
  })

  describe('toggle visibility and lock', () => {
    it('maintains state consistency during 100 toggle operations', () => {
      const store = useEditorStore.getState()
      
      // Create 5 test layers
      const layers = [
        createTestDecal('Decal 1'),
        createTestDecal('Decal 2'),
        createTestDecal('Decal 3'),
        createTestDecal('Decal 4'),
        createTestDecal('Decal 5'),
      ]
      useEditorStore.setState((state) => ({
        project: {
          ...state.project,
          layers,
        },
      }))
      
      let state = useEditorStore.getState()
      const layerIds = state.project.layers.map(l => l.id)
      
      // Track expected state manually
      const expectedStates = new Map(layerIds.map(id => [id, { visible: true, locked: false }]))
      
      // Perform 100 random toggle operations
      for (let i = 0; i < 100; i++) {
        const randomId = layerIds[Math.floor(Math.random() * layerIds.length)]
        const operation = Math.random() > 0.5 ? 'visibility' : 'lock'
        
        if (operation === 'visibility') {
          const expected = expectedStates.get(randomId)!
          expected.visible = !expected.visible
          state.toggleLayerVisibility(randomId)
        } else {
          const expected = expectedStates.get(randomId)!
          expected.locked = !expected.locked
          state.toggleLayerLock(randomId)
        }
        state = useEditorStore.getState()
      }
      
      // Verify final state matches expectations
      expectedStates.forEach((expected, layerId) => {
        const layer = state.project.layers.find(l => l.id === layerId)
        expect(layer?.visible).toBe(expected.visible)
        expect(layer?.locked).toBe(expected.locked)
      })
    })

    it('idempotent toggles preserve other layer properties', () => {
      const store = useEditorStore.getState()
      
      const layer = createTestDecal('Test Decal')
      useEditorStore.setState((state) => ({
        project: {
          ...state.project,
          layers: [layer],
        },
      }))
      
      let state = useEditorStore.getState()
      const testLayer = state.project.layers[0]
      const originalColor = testLayer.colorHex
      
      // Toggle visibility 10 times (should end at initial state)
      for (let i = 0; i < 10; i++) {
        state.toggleLayerVisibility(testLayer.id)
        state = useEditorStore.getState()
      }
      
      const afterToggles = state.project.layers.find(l => l.id === testLayer.id)
      
      expect(afterToggles?.visible).toBe(testLayer.visible)
      expect(afterToggles?.colorHex).toBe(originalColor)
      expect(afterToggles?.name).toBe(testLayer.name)
    })
  })

  describe('duplicate layer', () => {
    it('preserves all layer properties in duplicated copy', () => {
      const store = useEditorStore.getState()
      
      const original = createTestDecal('Original')
      useEditorStore.setState((state) => ({
        project: {
          ...state.project,
          layers: [original],
        },
      }))
      
      let state = useEditorStore.getState()
      
      // Update some properties
      state.updateLayer(original.id, {
        colorHex: '#ff0000',
        name: 'Custom Decal',
        locked: true,
        visible: false,
      })
      state = useEditorStore.getState()
      
      const beforeDuplicate = state.project.layers.find(l => l.id === original.id)!
      const countBefore = state.project.layers.length
      
      // Duplicate
      state.duplicateLayer(original.id)
      state = useEditorStore.getState()
      
      const copy = state.project.layers[state.project.layers.length - 1]
      
      // Verify layer count increased
      expect(state.project.layers).toHaveLength(countBefore + 1)
      
      // Verify copy has same properties (except id and name)
      expect(copy.type).toBe(beforeDuplicate.type)
      expect(copy.colorHex).toBe(beforeDuplicate.colorHex)
      expect(copy.locked).toBe(beforeDuplicate.locked)
      expect(copy.visible).toBe(beforeDuplicate.visible)
      expect(copy.transform).toEqual(beforeDuplicate.transform)
      
      // Verify copy has different id and renamed
      expect(copy.id).not.toBe(beforeDuplicate.id)
      expect(copy.name).toContain('copy')
    })

    it('duplicate followed by reorder maintains consistency', () => {
      const store = useEditorStore.getState()
      
      // Create 3 test layers
      const layers = [
        createTestDecal('Decal 1'),
        createTestText('Text 1'),
        createTestDecal('Decal 2'),
      ]
      useEditorStore.setState((state) => ({
        project: {
          ...state.project,
          layers,
        },
      }))
      
      let state = useEditorStore.getState()
      const original = state.project.layers[0]
      
      // Duplicate first layer
      state.duplicateLayer(original.id)
      state = useEditorStore.getState()
      expect(state.project.layers).toHaveLength(4)
      
      // Reorder the duplicate
      state.reorderLayer(3, 0)
      state = useEditorStore.getState()
      expect(state.project.layers).toHaveLength(4)
      
      // Verify all IDs are unique
      const ids = state.project.layers.map(l => l.id)
      expect(new Set(ids).size).toBe(4)
    })
  })

  describe('remove layer', () => {
    it('does not affect other layers when removing', () => {
      const store = useEditorStore.getState()
      
      // Create 5 test layers
      const layers = [
        createTestDecal('Decal 1'),
        createTestDecal('Decal 2'),
        createTestDecal('Decal 3'),
        createTestDecal('Decal 4'),
        createTestDecal('Decal 5'),
      ]
      useEditorStore.setState((state) => ({
        project: {
          ...state.project,
          layers,
        },
      }))
      
      let state = useEditorStore.getState()
      const allLayers = state.project.layers.map(l => ({ ...l }))
      const targetId = allLayers[2].id
      
      // Remove middle layer
      state.removeLayer(targetId)
      state = useEditorStore.getState()
      
      expect(state.project.layers).toHaveLength(4)
      
      // Verify remaining layers are intact
      allLayers.forEach(original => {
        if (original.id === targetId) return
        
        const remaining = state.project.layers.find(l => l.id === original.id)
        expect(remaining).toBeDefined()
        expect(remaining?.name).toBe(original.name)
        expect(remaining?.colorHex).toBe(original.colorHex)
      })
    })

    it('clears selection if removing selected layer', () => {
      const store = useEditorStore.getState()
      
      const layer = createTestDecal('Test')
      useEditorStore.setState((state) => ({
        project: {
          ...state.project,
          layers: [layer],
        },
      }))
      
      let state = useEditorStore.getState()
      
      state.setSelectedLayer(layer.id)
      state = useEditorStore.getState()
      expect(state.selectedLayerId).toBe(layer.id)
      
      state.removeLayer(layer.id)
      state = useEditorStore.getState()
      
      expect(state.selectedLayerId).toBeNull()
    })

    it('deselects layer when removed but keeps other selections', () => {
      const store = useEditorStore.getState()
      
      const layers = [createTestDecal('Decal 1'), createTestText('Text 1')]
      useEditorStore.setState((state) => ({
        project: {
          ...state.project,
          layers,
        },
      }))
      
      let state = useEditorStore.getState()
      
      const first = state.project.layers[0]
      const second = state.project.layers[1]
      
      state.setSelectedLayer(first.id)
      state.removeLayer(first.id)
      state = useEditorStore.getState()
      
      expect(state.selectedLayerId).toBeNull()
      
      state.setSelectedLayer(second.id)
      state = useEditorStore.getState()
      state.removeLayer(first.id) // Already deleted, should be no-op
      state = useEditorStore.getState()
      
      expect(state.selectedLayerId).toBe(second.id)
    })
  })

  describe('stress test: random operations', () => {
    it('completes 100 random layer operations without corruption', () => {
      const store = useEditorStore.getState()
      
      // Create initial test layers
      const initialLayers = [
        createTestDecal('Decal 1'),
        createTestDecal('Decal 2'),
        createTestDecal('Decal 3'),
        createTestDecal('Decal 4'),
        createTestDecal('Decal 5'),
      ]
      useEditorStore.setState((state) => ({
        project: {
          ...state.project,
          layers: initialLayers,
        },
      }))
      
      let state = useEditorStore.getState()
      const layerIds = [...state.project.layers.map(l => l.id)]
      
      // Perform 100 random operations
      for (let op = 0; op < 100; op++) {
        state = useEditorStore.getState()
        if (state.project.layers.length === 0) break
        
        const operation = Math.floor(Math.random() * 6)
        const randomIdx = Math.floor(Math.random() * state.project.layers.length)
        const randomLayerId = state.project.layers[randomIdx]?.id
        
        try {
          switch (operation) {
            case 0: // reorder
              if (state.project.layers.length > 1) {
                const to = Math.floor(Math.random() * state.project.layers.length)
                state.reorderLayer(randomIdx, to)
              }
              break
            case 1: // toggle visibility
              if (randomLayerId) state.toggleLayerVisibility(randomLayerId)
              break
            case 2: // toggle lock
              if (randomLayerId) state.toggleLayerLock(randomLayerId)
              break
            case 3: // duplicate
              if (randomLayerId) state.duplicateLayer(randomLayerId)
              break
            case 4: // remove (avoid removing all layers)
              if (state.project.layers.length > 1 && randomLayerId) {
                state.removeLayer(randomLayerId)
              }
              break
            case 5: // update
              if (randomLayerId) {
                state.updateLayer(randomLayerId, {
                  colorHex: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
                })
              }
              break
          }
        } catch (e) {
          // Unexpected error during stress test
          throw new Error(`Failed at operation ${op}: ${e}`)
        }
      }
      
      state = useEditorStore.getState()
      
      // Final consistency checks
      
      // 1. No duplicate IDs
      const ids = state.project.layers.map(l => l.id)
      expect(new Set(ids).size).toBe(ids.length)
      
      // 2. At least one layer remains
      expect(state.project.layers.length).toBeGreaterThan(0)
      
      // 3. All layers have required fields
      state.project.layers.forEach(layer => {
        expect(layer.id).toBeDefined()
        expect(layer.name).toBeDefined()
        expect(layer.type).toBeDefined()
        expect(layer.visible).toBeDefined()
        expect(layer.locked).toBeDefined()
      })
    })
  })
})
