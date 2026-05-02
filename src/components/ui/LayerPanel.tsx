import { useRef, useState } from 'react'
import { useEditorStore } from '../../store/editorStore'
import { PAINT_TARGETS } from '../../lib/paintTargets'
import type { GroupLayer, Layer, PaintTargetId, PrintConfig } from '../../types/editor'

function LayerPreview({ layer }: { layer: Layer }) {
  if (layer.type === 'group') {
    return <div className="layer-preview layer-preview-group"><span>📁</span></div>
  }
  if (layer.type === 'stripe') {
    return (
      <div className="layer-preview layer-preview-stripe" title="Racing Stripe">
        <span className="stripe-thumb-bar" style={{ background: layer.colorHex }} />
      </div>
    )
  }
  if (layer.type === 'split') {
    return (
      <div className="layer-preview layer-preview-split" title="Side Split">
        <span className="split-thumb-side split-thumb-side-a" style={{ background: layer.colorHex }} />
        <span className="split-thumb-side split-thumb-side-b" style={{ background: layer.sideBColorHex }} />
      </div>
    )
  }
  if (layer.type === 'text') {
    return (
      <div className="layer-preview layer-preview-text" title={layer.text}>
        <span style={{ color: layer.colorHex, fontFamily: layer.fontFamily }}>
          {layer.text.slice(0, 12) || 'T'}
        </span>
      </div>
    )
  }
  if (layer.imageUrl) {
    return (
      <div className="layer-preview layer-preview-image">
        <img src={layer.imageUrl} alt="" draggable={false} />
      </div>
    )
  }
  return (
    <div className="layer-preview layer-preview-solid" style={{ background: layer.colorHex }} title={layer.colorHex} />
  )
}

export function LayerPanel() {
  const layers = useEditorStore((state) => state.project.layers)
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const setSelectedLayer = useEditorStore((state) => state.setSelectedLayer)
  const toggleLayerVisibility = useEditorStore((state) => state.toggleLayerVisibility)
  const toggleLayerLock = useEditorStore((state) => state.toggleLayerLock)
  const removeLayer = useEditorStore((state) => state.removeLayer)
  const reorderLayer = useEditorStore((state) => state.reorderLayer)
  const duplicateLayer = useEditorStore((state) => state.duplicateLayer)
  const groupLayers = useEditorStore((state) => state.groupLayers)
  const toggleGroupCollapsed = useEditorStore((state) => state.toggleGroupCollapsed)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const carSplit = useEditorStore((state) => state.project.carSplit)
  const carStripe = useEditorStore((state) => state.project.carStripe)
  const setCarSplit = useEditorStore((state) => state.setCarSplit)
  const setCarStripe = useEditorStore((state) => state.setCarStripe)
  const selectedPaintTarget = useEditorStore((state) => state.selectedPaintTarget)
  const setSelectedPaintTarget = useEditorStore((state) => state.setSelectedPaintTarget)
  const targetPrints = useEditorStore((state) => state.targetPrints)
  const clearTargetPrint = useEditorStore((state) => state.clearTargetPrint)
  const activeCarTool = useEditorStore((state) => state.activeCarTool)
  const setActiveCarTool = useEditorStore((state) => state.setActiveCarTool)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; layerId: string } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  function startRename(layer: Layer, e: React.MouseEvent) {
    e.stopPropagation()
    setRenamingId(layer.id)
    setRenameValue(layer.name)
    setTimeout(() => renameInputRef.current?.select(), 0)
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) {
      updateLayer(renamingId, { name: renameValue.trim() })
    }
    setRenamingId(null)
  }

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const dragFromDisplayIndex = useRef<number | null>(null)
  const [dragOverDisplayIndex, setDragOverDisplayIndex] = useState<number | null>(null)

  function toggleCheck(id: string, event: React.MouseEvent) {
    event.stopPropagation()
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const displayLayers = [...layers].reverse()

  function handleDragStart(displayIndex: number) {
    dragFromDisplayIndex.current = displayIndex
  }

  function handleDragOver(event: React.DragEvent, displayIndex: number) {
    event.preventDefault()
    setDragOverDisplayIndex(displayIndex)
  }

  function handleDrop(displayIndex: number) {
    const from = dragFromDisplayIndex.current
    if (from === null || from === displayIndex) {
      dragFromDisplayIndex.current = null
      setDragOverDisplayIndex(null)
      return
    }
    const fromArrIndex = layers.length - 1 - from
    const toArrIndex = layers.length - 1 - displayIndex
    reorderLayer(fromArrIndex, toArrIndex)
    dragFromDisplayIndex.current = null
    setDragOverDisplayIndex(null)
  }

  function handleDragEnd() {
    dragFromDisplayIndex.current = null
    setDragOverDisplayIndex(null)
  }

  const actionTargetIds: string[] =
    checkedIds.size > 0 ? [...checkedIds] : selectedLayerId ? [selectedLayerId] : []

  function handleDuplicate() {
    const targetId = actionTargetIds.find((id) => layers.find((x) => x.id === id)?.type !== 'group')
    if (targetId) duplicateLayer(targetId)
  }

  function handleGroup() {
    const ids = actionTargetIds.filter((id) => layers.find((x) => x.id === id)?.type !== 'group')
    if (ids.length === 0) return
    groupLayers(ids, 'Group')
    setCheckedIds(new Set())
  }

  function handleDelete() {
    for (const id of actionTargetIds) removeLayer(id)
    setCheckedIds(new Set())
  }

  function handleContextMenu(e: React.MouseEvent, layer: Layer) {
    e.preventDefault()
    e.stopPropagation()
    // Ensure the right-clicked layer is in the selection
    if (!checkedIds.has(layer.id) && selectedLayerId !== layer.id) {
      setSelectedLayer(layer.id)
      setCheckedIds(new Set([layer.id]))
    } else if (!checkedIds.has(layer.id)) {
      setCheckedIds(new Set([layer.id]))
    }
    setContextMenu({ x: e.clientX, y: e.clientY, layerId: layer.id })
  }

  function handleContextMenuAction(action: 'delete' | 'duplicate' | 'group') {
    if (action === 'delete') handleDelete()
    if (action === 'duplicate') handleDuplicate()
    if (action === 'group') handleGroup()
    setContextMenu(null)
  }

  const groupIds = new Set(layers.filter((l) => l.type === 'group').map((l) => l.id))
  const childIds = new Set(layers.filter((l) => l.groupId && groupIds.has(l.groupId)).map((l) => l.id))
  const activePrintEntries = (Object.entries(targetPrints) as [PaintTargetId, PrintConfig | null | undefined][])
    .filter(([, config]) => Boolean(config)) as [PaintTargetId, PrintConfig][]

  function renderRow(layer: Layer, displayIndex: number, isChild: boolean) {
    const isSelected = selectedLayerId === layer.id
    const isDragOver = dragOverDisplayIndex === displayIndex
    const isChecked = checkedIds.has(layer.id)
    const isGroup = layer.type === 'group'

    return (
      <div
        className={['layer-row', isSelected && 'selected', isDragOver && 'drag-over', isChild && 'layer-row-child', isGroup && 'layer-row-group'].filter(Boolean).join(' ')}
        draggable
        onDragStart={() => handleDragStart(displayIndex)}
        onDragOver={(e) => handleDragOver(e, displayIndex)}
        onDrop={() => handleDrop(displayIndex)}
        onDragEnd={handleDragEnd}
        onClick={() => setSelectedLayer(layer.id)}
        onContextMenu={(e) => handleContextMenu(e, layer)}
      >
        <input
          type="checkbox"
          className="layer-check"
          checked={isChecked}
          onChange={() => {}}
          onClick={(e) => toggleCheck(layer.id, e)}
        />
        <span className="layer-drag-handle" title="Drag to reorder">⠿</span>

        {isGroup ? (
          <button
            type="button"
            className="layer-collapse-btn"
            title={(layer as GroupLayer).collapsed ? 'Expand' : 'Collapse'}
            onClick={(e) => { e.stopPropagation(); toggleGroupCollapsed(layer.id) }}
          >
            {(layer as GroupLayer).collapsed ? '▶' : '▼'}
          </button>
        ) : (
          <LayerPreview layer={layer} />
        )}

        <div className="layer-info">
          {renamingId === layer.id ? (
            <input
              ref={renameInputRef}
              className="layer-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setRenamingId(null)
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="layer-name"
              onDoubleClick={(e) => startRename(layer, e)}
              title="Double-click to rename"
            >{layer.name}</span>
          )}
          <span className="layer-meta">{layer.type}</span>
        </div>

        <button type="button" className="icon-btn" title={layer.visible ? 'Hide' : 'Show'} onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id) }}>
          {layer.visible ? '👁' : '🚫'}
        </button>
        <button type="button" className="icon-btn" title={layer.locked ? 'Unlock' : 'Lock'} onClick={(e) => { e.stopPropagation(); toggleLayerLock(layer.id) }}>
          {layer.locked ? '🔒' : '🔓'}
        </button>
        <button type="button" className="icon-btn danger" title="Delete" onClick={(e) => { e.stopPropagation(); removeLayer(layer.id) }}>
          ✕
        </button>
      </div>
    )
  }

  return (
    <section className="panel layer-panel">
      <div className="layer-actions-bar">
        {checkedIds.size > 0 && <span className="layer-selection-count">{checkedIds.size} selected</span>}
        <button type="button" className="chip" disabled={actionTargetIds.length === 0} title="Duplicate selected" onClick={handleDuplicate}>
          Duplicate
        </button>
        <button type="button" className="chip" disabled={actionTargetIds.filter((id) => layers.find((l) => l.id === id)?.type !== 'group').length === 0} title="Group into folder" onClick={handleGroup}>
          Group
        </button>
        <button type="button" className="chip danger" disabled={actionTargetIds.length === 0} title="Delete selected" onClick={handleDelete}>
          Delete
        </button>
      </div>

      <ul
        className="layer-list"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setSelectedLayer(null)
          }
        }}
      >
        {displayLayers.filter((l) => !childIds.has(l.id)).map((layer, displayIndex) => {
          const isGroup = layer.type === 'group'
          const children = isGroup ? layers.filter((l) => l.groupId === layer.id) : []
          const collapsed = isGroup ? (layer as GroupLayer).collapsed : false

          return (
            <li key={layer.id} className="layer-tree-item">
              {renderRow(layer, displayIndex, false)}
              {isGroup && !collapsed && children.length > 0 && (
                <ul className="layer-list layer-children-list">
                  {[...children].reverse().map((child, ci) => (
                    <li key={child.id} className="layer-tree-item">
                      {renderRow(child, displayIndex + ci + 1, true)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}

        {/* ── Virtual car-tool layers (shown only when active) ── */}
        {carStripe.enabled && <li className="layer-tree-item">
          <div
            className={['layer-row', activeCarTool === 'stripes' && 'selected'].filter(Boolean).join(' ')}
            onClick={() => {
              setSelectedLayer(null)
              setActiveCarTool(activeCarTool === 'stripes' ? null : 'stripes')
            }}
            title="Racing Stripes — click to edit in bottom bar"
          >
            <input type="checkbox" className="layer-check" checked={false} onChange={() => {}} disabled />
            <span className="layer-drag-handle" title="Fixed order" style={{ opacity: 0.35 }}>⠿</span>
            <div className="layer-preview layer-preview-stripe" title="Racing Stripes">
              <span className="stripe-thumb-bar" style={{ background: carStripe.colorHex }} />
            </div>
            <div className="layer-info">
              <span className="layer-name">Racing Stripes</span>
              <span className="layer-meta">stripe</span>
            </div>
            <button
              type="button"
              className="icon-btn"
              title="Hide stripes"
              onClick={(e) => {
                e.stopPropagation()
                setCarStripe({ enabled: false })
                if (activeCarTool === 'stripes') setActiveCarTool(null)
              }}
            >
              👁
            </button>
            <button type="button" className="icon-btn" title="Always unlocked" disabled>
              🔓
            </button>
            <button
              type="button"
              className="icon-btn danger"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation()
                setCarStripe({ enabled: false, colorHex: '#f5f5f5', width: 0.14, gap: 0, offsetX: 0, softEdge: 0.02, angle: 0 })
                if (activeCarTool === 'stripes') setActiveCarTool(null)
              }}
            >
              ✕
            </button>
          </div>
        </li>}

        {carSplit.enabled && <li className="layer-tree-item">
          <div
            className={['layer-row', activeCarTool === 'split' && 'selected'].filter(Boolean).join(' ')}
            onClick={() => {
              setSelectedLayer(null)
              setActiveCarTool(activeCarTool === 'split' ? null : 'split')
            }}
            title="Split Paint — click to edit in bottom bar"
          >
            <input type="checkbox" className="layer-check" checked={false} onChange={() => {}} disabled />
            <span className="layer-drag-handle" title="Fixed order" style={{ opacity: 0.35 }}>⠿</span>
            <div className="layer-preview layer-preview-split" title="Split Paint">
              <span className="split-thumb-side split-thumb-side-a" style={{ background: carSplit.sideAHex }} />
              <span className="split-thumb-side split-thumb-side-b" style={{ background: carSplit.sideBHex }} />
            </div>
            <div className="layer-info">
              <span className="layer-name">Split Paint</span>
              <span className="layer-meta">split</span>
            </div>
            <button
              type="button"
              className="icon-btn"
              title="Hide split"
              onClick={(e) => {
                e.stopPropagation()
                setCarSplit({ enabled: false })
                if (activeCarTool === 'split') setActiveCarTool(null)
              }}
            >
              👁
            </button>
            <button type="button" className="icon-btn" title="Always unlocked" disabled>
              🔓
            </button>
            <button
              type="button"
              className="icon-btn danger"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation()
                setCarSplit({ enabled: false, sideAHex: '#000000', sideBHex: '#ffffff', finish: 'gloss', offsetX: 0, softEdge: 0.02, angle: 0 })
                if (activeCarTool === 'split') setActiveCarTool(null)
              }}
            >
              ✕
            </button>
          </div>
        </li>}

        {activePrintEntries.map(([targetId, config]) => {
          const label = PAINT_TARGETS.find((target) => target.id === targetId)?.label ?? targetId
          const isSelectedPrint = selectedPaintTarget === targetId

          return (
            <li key={`print-${targetId}`} className="layer-tree-item">
              <div
                className={['layer-row', isSelectedPrint && 'selected'].filter(Boolean).join(' ')}
                onClick={() => {
                  setSelectedLayer(null)
                  setSelectedPaintTarget(targetId)
                }}
                title={`Print Layer (${label})`}
              >
                <input type="checkbox" className="layer-check" checked={false} onChange={() => {}} disabled />
                <span className="layer-drag-handle" title="Fixed order" style={{ opacity: 0.35 }}>⠿</span>
                <div className="layer-preview layer-preview-image">
                  <img src={config.imageUrl} alt="" draggable={false} />
                </div>
                <div className="layer-info">
                  <span className="layer-name">Print • {label}</span>
                  <span className="layer-meta">print</span>
                </div>
                <button type="button" className="icon-btn" title="Always visible while assigned" disabled>
                  👁
                </button>
                <button type="button" className="icon-btn" title="Always unlocked" disabled>
                  🔓
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  title={`Delete print from ${label}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    clearTargetPrint(targetId)
                  }}
                >
                  ✕
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {layers.length === 0 && !carStripe.enabled && !carSplit.enabled && activePrintEntries.length === 0 && (
        <p className="layer-empty-hint" onClick={() => setSelectedLayer(null)}>
          No layers yet. Use the E or T tabs to add elements.
        </p>
      )}

      {contextMenu && (
        <>
          <div
            className="context-menu-backdrop"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null) }}
          />
          <div
            ref={contextMenuRef}
            className="context-menu"
            style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          >
            <button
              type="button"
              className="context-menu-item"
              onClick={() => handleContextMenuAction('duplicate')}
              title="Duplicate selected layer"
            >
              Duplicate
            </button>
            {checkedIds.size > 1 && (
              <button
                type="button"
                className="context-menu-item"
                onClick={() => handleContextMenuAction('group')}
                title="Group selected layers into folder"
              >
                Group
              </button>
            )}
            <button
              type="button"
              className="context-menu-item danger"
              onClick={() => handleContextMenuAction('delete')}
              title="Delete selected layer"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </section>
  )
}


