# MyGarage 3D Editor Implementation

This project now uses a strict React Three Fiber architecture and typed data model to support a Forza-style editor workflow.

## 1. Exact React Three Fiber Architecture

### 1.1 App Shell
- App.tsx
  - TopBar
  - workspace layout
    - left panel: LayerPanel
    - center: EditorCanvas
    - right panel: InspectorPanel

### 1.2 Scene Graph (EditorCanvas)
- Canvas (R3F root)
  - lighting
    - ambientLight
    - directionalLight (shadow casting)
  - Environment
  - Grid + ground shadow receiver
  - CarBody (placeholder mesh now, swappable with GLTF)
  - LayerPreview renderer
    - Text layers via drei Text
    - Decal placeholder planes with transform data
  - OrbitControls (editor camera)

### 1.3 State Ownership
- Zustand store is the single source of truth:
  - paint material state
  - project/layer graph
  - selected layer id
  - active tool
  - undo/redo stacks

### 1.4 Future Runtime Split
- Scene runtime will stay in this order:
  1. Input system (raycast + gizmo)
  2. Command dispatcher (actions)
  3. Store state update
  4. Scene re-render
  5. UI panel sync

## 2. Data Schema for Layers/Projects

The source of truth schema is implemented in src/types/editor.ts.

## 2.1 Project
- EditorProject
  - meta
    - id, name, version, createdAt, updatedAt
  - paint
    - colorHex
    - metallic
    - roughness
    - clearcoat
  - layers[]

## 2.2 Layer (Discriminated Union)
- LayerBase
  - id, name, type, visible, locked
  - createdAt, updatedAt
  - transform
    - position { x, y, z }
    - rotation { x, y, z }
    - scale { x, y, z }
    - skew { x, y }
    - opacity

- DecalLayer extends LayerBase
  - type: decal
  - imageUrl
  - colorHex

- TextLayer extends LayerBase
  - type: text
  - text
  - fontFamily
  - colorHex

## 2.3 Store Contract
- EditorStore = EditorState + EditorActions
- Includes:
  - setTool
  - setSelectedLayer
  - setPaint
  - addDecalLayer
  - addTextLayer
  - updateLayer
  - reorderLayer
  - toggleLayerVisibility
  - toggleLayerLock
  - removeLayer
  - undo
  - redo

## 3. Step-by-Step Order (MVP -> Advanced)

## Phase 1: MVP Foundation (Implemented in this pass)
1. Replace starter app with editor shell layout
2. Create typed project/layer schema
3. Build centralized Zustand store with history
4. Add R3F scene with camera, light, placeholder car
5. Add layer panel and inspector controls
6. Bind paint + basic layer transform to live 3D preview

## Phase 2: Real Decal Placement
1. Load real car GLTF model (panel-separated if possible)
2. Add cursor raycasting against car mesh
3. Place decals at hit point and orient to surface normal
4. Add transform gizmo for move/rotate/scale
5. Add mirror placement mode
6. Add layer thumbnails for quick selection

## Phase 3: Text and Asset Pipeline
1. Add font loader and text style presets
2. Add image upload pipeline with validation and compression
3. Add texture atlas/decal texture cache
4. Add text as projected decal mode (not only floating text)
5. Add per-layer blend mode and opacity controls

## Phase 4: Save/Load/Export
1. Persist EditorProject JSON locally
2. Add import/export JSON project files
3. Add preview render capture (PNG)
4. Add baked texture export path
5. Add version migration for project schema

## Phase 5: Pro Features
1. UV seam diagnostics overlay
2. Distortion heatmap for decal readability
3. Symmetry tools and panel-aware snapping
4. Multi-select and group transforms
5. Keyboard shortcuts and command palette
6. Performance modes (desktop/mobile)

## Phase 6: Backend + Sharing
1. Auth and user profiles
2. Cloud project persistence + thumbnails
3. Public/private sharing with search tags
4. Moderation and abuse tooling
5. Analytics for workflow bottlenecks

## 4. Current Status
- Phase 1 baseline is now active and running in code.
- Next execution target: Phase 2 step 1 (GLTF car loader + model swap).
