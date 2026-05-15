import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Car, Type, Layers, ChevronUp } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { InspectorPanel } from './InspectorPanel'
import type { Layer } from '../../types/editor'

type SidebarTab = 'layers' | 'properties'

interface GameEditorLayoutProps {
  editorCanvas: ReactNode
  topBar: ReactNode
}

export function GameEditorLayout({ editorCanvas, topBar }: GameEditorLayoutProps) {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('layers')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const layers = useEditorStore((s) => s.project.layers)
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId)
  const setTool = useEditorStore((s) => s.setTool)
  const activeTool = useEditorStore((s) => s.activeTool)
  const addDecalLayer = useEditorStore((s) => s.addDecalLayer)
  const addTextLayer = useEditorStore((s) => s.addTextLayer)
  const removeLayer = useEditorStore((s) => s.removeLayer)
  const setSelectedLayer = useEditorStore((s) => s.setSelectedLayer)

  const selectedLayer = layers.find((l) => l.id === selectedLayerId)

  const handleAddDecal = () => {
    addDecalLayer()
    setTool('decal')
  }

  const handleAddText = () => {
    addTextLayer()
    setTool('text')
  }

  const toolButtons = [
    {
      id: 'paint',
      label: 'Paint',
      icon: Car,
      color: '#3b82f6',
      onClick: () => setTool('paint'),
    },
    {
      id: 'text',
      label: 'Text',
      icon: Type,
      color: '#8b5cf6',
      onClick: handleAddText,
    },
    {
      id: 'decal',
      label: 'Decals',
      icon: Layers,
      color: '#ec4899',
      onClick: handleAddDecal,
    },
  ]

  const sidebarWidth = sidebarCollapsed ? 50 : 300

  const mainLayoutStyle = useMemo(() => ({ display: 'flex', flex: 1, overflow: 'hidden' } as const), [])
  const sidebarStyle = useMemo(() => ({
    width: `${sidebarWidth}px`,
    backgroundColor: '#0f172a',
    borderRight: '1px solid #1e293b',
    display: 'flex',
    flexDirection: 'column' as const,
    transition: 'width 0.2s ease-out',
    overflow: 'hidden',
  }), [sidebarWidth])
  const sidebarHeaderStyle = useMemo(() => ({
    padding: '12px 8px',
    borderBottom: '1px solid #1e293b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: sidebarCollapsed ? 'center' : 'space-between',
    flexShrink: 0,
  }), [sidebarCollapsed])
  const toolSectionStyle = useMemo(() => ({
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    padding: sidebarCollapsed ? '8px 4px' : '12px',
    borderBottom: '1px solid #1e293b',
    flexShrink: 0,
  }), [sidebarCollapsed])

  return (
    <div className="app-root game-editor-root">
      {/* Top Bar */}
      {topBar}

      {/* Main Layout */}
      <div style={mainLayoutStyle}>
        {/* Left Sidebar */}
        <aside
          className="game-editor-sidebar"
          style={sidebarStyle}
        >
          {/* Sidebar Header */}
          <div style={sidebarHeaderStyle}>
            {!sidebarCollapsed && (
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Tools & Layers
              </span>
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <ChevronUp size={16} />
            </button>
          </div>

          {/* Tool Buttons */}
          <div style={toolSectionStyle}>
            {toolButtons.map((tool) => (
              <button
                key={tool.id}
                type="button"
                onClick={tool.onClick}
                className={activeTool === tool.id ? 'game-tool-btn active' : 'game-tool-btn'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: sidebarCollapsed ? 0 : '8px',
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                  padding: sidebarCollapsed ? '8px' : '8px 12px',
                  backgroundColor: activeTool === tool.id ? `${tool.color}20` : '#1e293b',
                  border: activeTool === tool.id ? `1px solid ${tool.color}` : '1px solid #334155',
                  borderRadius: '6px',
                  color: activeTool === tool.id ? tool.color : '#cbd5e1',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  transition: 'all 0.15s ease-out',
                  minHeight: '32px',
                }}
                title={sidebarCollapsed ? tool.label : undefined}
              >
                <tool.icon size={18} style={{ flexShrink: 0 }} />
                {!sidebarCollapsed && tool.label}
              </button>
            ))}
          </div>

          {/* Tab Buttons */}
          {!sidebarCollapsed && (
            <div
              style={{
                display: 'flex',
                gap: '2px',
                padding: '8px',
                borderBottom: '1px solid #1e293b',
                flexShrink: 0,
              }}
            >
              {(['layers', 'properties'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSidebarTab(tab)}
                  style={{
                    flex: 1,
                    padding: '6px',
                    backgroundColor: sidebarTab === tab ? '#334155' : '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    color: sidebarTab === tab ? '#e2e8f0' : '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    transition: 'all 0.15s ease-out',
                  }}
                >
                  {tab === 'layers' ? 'Layers' : 'Props'}
                </button>
              ))}
            </div>
          )}

          {/* Content Area */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              minHeight: 0,
              padding: sidebarCollapsed ? 0 : '8px',
            }}
          >
            {!sidebarCollapsed && sidebarTab === 'layers' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {/* Layers list */}
                {layers.length === 0 ? (
                  <div
                    style={{
                      padding: '16px 12px',
                      textAlign: 'center',
                      color: '#64748b',
                      fontSize: '0.75rem',
                    }}
                  >
                    No layers yet
                  </div>
                ) : (
                  layers.map((layer: Layer) => (
                    <div
                      key={layer.id}
                      onClick={() => setSelectedLayer(layer.id)}
                      style={{
                        padding: '8px 10px',
                        backgroundColor: selectedLayerId === layer.id ? '#3b82f620' : '#1e293b',
                        border: selectedLayerId === layer.id ? '1px solid #3b82f6' : '1px solid #334155',
                        borderRadius: '4px',
                        color: selectedLayerId === layer.id ? '#e2e8f0' : '#cbd5e1',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.1s ease-out',
                      }}
                    >
                      <span>
                        {layer.type === 'text' && layer.text ? layer.text.slice(0, 12) : layer.type}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeLayer(layer.id)
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title="Delete layer"
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {!sidebarCollapsed && sidebarTab === 'properties' && selectedLayer && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <InspectorPanel />
              </div>
            )}

            {!sidebarCollapsed && sidebarTab === 'properties' && !selectedLayer && (
              <div
                style={{
                  padding: '16px 12px',
                  textAlign: 'center',
                  color: '#64748b',
                  fontSize: '0.75rem',
                }}
              >
                Select a layer to edit
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {editorCanvas}
        </div>
      </div>
    </div>
  )
}
