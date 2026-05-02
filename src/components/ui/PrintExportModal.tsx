import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import jsPDF from 'jspdf'
import type { PrintCaptureFn, PrintCaptureResult, PrintViewSpec } from '../scene/EditorCanvas'
import { useEditorStore } from '../../store/editorStore'

const PRINT_W = 2560
const PRINT_H = 1440
const MODEL_MAX_DIM_UNITS = 3.8

const PRINT_VIEWS: PrintViewSpec[] = [
  { id: 'side-left', label: 'Driver Side (Left)', position: [-12, 0.65, 0], target: [0, 0.65, 0], orthoHeight: 1.6 },
  { id: 'side-right', label: 'Passenger Side (Right)', position: [12, 0.65, 0], target: [0, 0.65, 0], orthoHeight: 1.6 },
  { id: 'front', label: 'Front Bumper', position: [0, 0.65, 12], target: [0, 0.65, 0], orthoHeight: 1.6 },
  { id: 'rear', label: 'Rear Bumper', position: [0, 0.65, -12], target: [0, 0.65, 0], orthoHeight: 1.6 },
  { id: 'hood', label: 'Hood (Top-Down)', position: [0, 12, 1.0], target: [0, 0, 1.0], orthoHeight: 1.3, upVector: [0, 0, 1] },
  { id: 'full-top', label: 'Full Top (Roof / Wrap)', position: [0, 12, 0], target: [0, 0, 0], orthoHeight: 2.2, upVector: [0, 0, 1] },
]

type Props = {
  captureRef: React.MutableRefObject<PrintCaptureFn | null>
  onClose: () => void
}

type PanelAdjustments = {
  offsetX: number
  offsetY: number
  scale: number
  rotationDeg: number
  bleedPct: number
  safePct: number
  showBleed: boolean
  showSafe: boolean
}

const DEFAULT_PANEL_ADJUSTMENTS: PanelAdjustments = {
  offsetX: 0,
  offsetY: 0,
  scale: 100,
  rotationDeg: 0,
  bleedPct: 3,
  safePct: 7,
  showBleed: true,
  showSafe: true,
}

function fmtTimestamp(value: number | null) {
  if (!value) return 'Never'
  return new Date(value).toLocaleTimeString()
}

function parsePositiveNumber(value: string, fallback: number, min = 0): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, n)
}

function parseNullableNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return null
  return Math.max(0, n)
}

function toPanelId(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || `panel-${Date.now().toString(36)}`
}

export function PrintExportModal({ captureRef, onClose }: Props) {
  const project = useEditorStore((state) => state.project)
  const selectedCar = useEditorStore((state) => state.selectedCar)
  const setVehicleCalibration = useEditorStore((state) => state.setVehicleCalibration)
  const setPrintProduction = useEditorStore((state) => state.setPrintProduction)
  const setWrapJob = useEditorStore((state) => state.setWrapJob)
  const upsertWrapPanel = useEditorStore((state) => state.upsertWrapPanel)
  const removeWrapPanel = useEditorStore((state) => state.removeWrapPanel)
  const production = project.printProduction
  const vehicleCalibration = project.vehicleCalibration
  const wrapJob = project.wrapJob
  const wrapPanels = project.wrapPanels

  const [panels, setPanels] = useState<PrintCaptureResult[] | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [livePreview, setLivePreview] = useState(true)
  const [includeGuidesInExport, setIncludeGuidesInExport] = useState(false)
  const [lastCaptureAt, setLastCaptureAt] = useState<number | null>(null)
  const [activePanelId, setActivePanelId] = useState(PRINT_VIEWS[0].id)
  const [combinedSheetDataUrl, setCombinedSheetDataUrl] = useState<string | null>(null)
  const [isComputingCombined, setIsComputingCombined] = useState(false)
  const [panelAdjustments, setPanelAdjustments] = useState<Record<string, PanelAdjustments>>(() => {
    const entries = PRINT_VIEWS.map((view) => [view.id, { ...DEFAULT_PANEL_ADJUSTMENTS }] as const)
    return Object.fromEntries(entries)
  })
  const captureInFlight = useRef(false)

  const panelTemplateByViewId = useMemo(() => {
    const byId = new Map(wrapPanels.map((panel) => [panel.id.toLowerCase(), panel] as const))
    const aliases: Record<string, string[]> = {
      'side-left': ['side-left', 'left-side', 'driver-side', 'driver', 'left'],
      'side-right': ['side-right', 'right-side', 'passenger-side', 'passenger', 'right'],
      front: ['front', 'front-bumper', 'bumper-front'],
      rear: ['rear', 'rear-bumper', 'bumper-rear'],
      hood: ['hood', 'bonnet'],
      'full-top': ['full-top', 'roof', 'top'],
    }

    return new Map(
      PRINT_VIEWS.map((view) => {
        const direct = byId.get(view.id.toLowerCase())
        if (direct) {
          return [view.id, direct] as const
        }

        const matched = (aliases[view.id] ?? []).find((key) => byId.has(key))
        return [view.id, matched ? byId.get(matched) ?? null : null] as const
      })
    )
  }, [wrapPanels])

  const getPlannedPanels = useCallback((items: PrintCaptureResult[]) => {
    return items
      .map((panel, index) => {
        const template = panelTemplateByViewId.get(panel.id) ?? null
        const fallbackWidthMm = Math.max(900, Math.round(production.mediaWidthMm * 0.9))
        const fallbackHeightMm = Math.max(700, Math.round(fallbackWidthMm * (PRINT_H / PRINT_W)))
        return {
          panel,
          exportLabel: template?.label || panel.label,
          installOrder: template?.installOrder ?? 1000 + index,
          enabled: template?.enabled ?? true,
          widthMm: template?.widthMm ?? fallbackWidthMm,
          heightMm: template?.heightMm ?? fallbackHeightMm,
          bleedMm: template?.bleedMm ?? production.defaultBleedMm,
          overlapMm: template?.overlapMm ?? production.tileOverlapMm,
        }
      })
      .filter((entry) => entry.enabled)
      .sort((a, b) => a.installOrder - b.installOrder)
  }, [panelTemplateByViewId, production.defaultBleedMm, production.mediaWidthMm, production.tileOverlapMm])

  const plannedPanels = useMemo(
    () => (panels ? getPlannedPanels(panels) : []),
    [panels, getPlannedPanels]
  )
  const plannedPanelById = useMemo(
    () => new Map(plannedPanels.map((entry) => [entry.panel.id, entry] as const)),
    [plannedPanels]
  )

  const carLengthM = selectedCar?.realWorldLengthM ?? 4.5

  const projectRevision = useMemo(
    () => JSON.stringify({
      paint: project.paint,
      meshClassifications: project.meshClassifications,
      layers: project.layers.map((layer) => ({
        id: layer.id,
        type: layer.type,
        name: layer.name,
        visible: layer.visible,
        locked: layer.locked,
        updatedAt: layer.updatedAt,
        transform: 'transform' in layer ? layer.transform : null,
      })),
    }),
    [project.paint, project.meshClassifications, project.layers]
  )

  const capturePanels = useCallback(async (preservePrevious = true) => {
    if (!captureRef.current) {
      setError('3D renderer is not ready yet. Please wait a second and try again.')
      return
    }
    if (captureInFlight.current) {
      return
    }

    captureInFlight.current = true
    setIsCapturing(true)
    setProgress(0)
    setError(null)
    if (!preservePrevious) {
      setPanels(null)
    }

    try {
      const fn = captureRef.current
      const results: PrintCaptureResult[] = []

      for (let i = 0; i < PRINT_VIEWS.length; i++) {
        setProgressLabel(PRINT_VIEWS[i].label)
        setProgress(Math.round((i / PRINT_VIEWS.length) * 100))
        const batch = await fn([PRINT_VIEWS[i]], PRINT_W, PRINT_H)
        results.push(...batch)
      }

      setProgress(100)
      setPanels(results)
      setLastCaptureAt(Date.now())
    } catch (err) {
      setError('Capture failed: ' + String(err))
    } finally {
      captureInFlight.current = false
      setIsCapturing(false)
      setProgressLabel('')
    }
  }, [captureRef])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void capturePanels(false)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [capturePanels])

  useEffect(() => {
    if (!livePreview) return
    const timer = window.setTimeout(() => {
      capturePanels(true)
    }, 650)
    return () => window.clearTimeout(timer)
  }, [projectRevision, livePreview, capturePanels])

  useEffect(() => {
    if (plannedPanels.length === 0) return
    if (activePanelId === 'one-page') return
    if (!plannedPanels.some(({ panel }) => panel.id === activePanelId)) {
      const timer = window.setTimeout(() => setActivePanelId(plannedPanels[0].panel.id), 0)
      return () => window.clearTimeout(timer)
    }
  }, [plannedPanels, activePanelId])

  const getPanelSettings = useCallback(
    (panelId: string) => panelAdjustments[panelId] ?? DEFAULT_PANEL_ADJUSTMENTS,
    [panelAdjustments]
  )

  const updatePanelSetting = useCallback(
    <K extends keyof PanelAdjustments>(panelId: string, key: K, value: PanelAdjustments[K]) => {
      setPanelAdjustments((state) => ({
        ...state,
        [panelId]: {
          ...(state[panelId] ?? DEFAULT_PANEL_ADJUSTMENTS),
          [key]: value,
        },
      }))
    },
    []
  )

  const resetActivePanel = useCallback(() => {
    setPanelAdjustments((state) => ({
      ...state,
      [activePanelId]: { ...DEFAULT_PANEL_ADJUSTMENTS },
    }))
  }, [activePanelId])

  const loadImage = useCallback((src: string) => {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Image load failed'))
      img.src = src
    })
  }, [])

  const getAdjustedPanelDataUrl = useCallback(async (
    panel: PrintCaptureResult,
    settings: PanelAdjustments,
    drawGuides: boolean
  ) => {
    const img = await loadImage(panel.dataUrl)
    const canvas = document.createElement('canvas')
    canvas.width = PRINT_W
    canvas.height = PRINT_H
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Could not get 2D context')
    }

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, PRINT_W, PRINT_H)

    ctx.save()
    ctx.translate(
      PRINT_W / 2 + (settings.offsetX / 100) * PRINT_W,
      PRINT_H / 2 + (settings.offsetY / 100) * PRINT_H
    )
    ctx.rotate((settings.rotationDeg * Math.PI) / 180)
    const scale = Math.max(0.3, settings.scale / 100)
    ctx.scale(scale, scale)
    ctx.drawImage(img, -PRINT_W / 2, -PRINT_H / 2, PRINT_W, PRINT_H)
    ctx.restore()

    if (drawGuides) {
      const plan = plannedPanelById.get(panel.id)
      const panelWidthMm = Math.max(1, plan?.widthMm ?? Math.max(900, Math.round(production.mediaWidthMm * 0.9)))
      const panelHeightMm = Math.max(1, plan?.heightMm ?? Math.max(700, Math.round(panelWidthMm * (PRINT_H / PRINT_W))))
      const bleedMm = Math.max(0, plan?.bleedMm ?? production.defaultBleedMm)
      const safeMm = Math.max(0, production.defaultSafeMm)
      const overlapMm = Math.max(0, plan?.overlapMm ?? production.tileOverlapMm)
      const bleedInsetX = (bleedMm / panelWidthMm) * PRINT_W
      const bleedInsetY = (bleedMm / panelHeightMm) * PRINT_H
      const safeInsetX = ((bleedMm + safeMm) / panelWidthMm) * PRINT_W
      const safeInsetY = ((bleedMm + safeMm) / panelHeightMm) * PRINT_H

      if (settings.showBleed) {
        ctx.setLineDash([14, 10])
        ctx.strokeStyle = 'rgba(220, 38, 38, 0.95)'
        ctx.lineWidth = 3
        ctx.strokeRect(bleedInsetX, bleedInsetY, PRINT_W - bleedInsetX * 2, PRINT_H - bleedInsetY * 2)

        if (overlapMm > 0) {
          const overlapInsetX = (overlapMm / panelWidthMm) * PRINT_W
          ctx.setLineDash([12, 9])
          ctx.strokeStyle = 'rgba(14, 165, 233, 0.9)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(overlapInsetX, 0)
          ctx.lineTo(overlapInsetX, PRINT_H)
          ctx.moveTo(PRINT_W - overlapInsetX, 0)
          ctx.lineTo(PRINT_W - overlapInsetX, PRINT_H)
          ctx.stroke()
        }
      }

      if (settings.showSafe) {
        ctx.setLineDash([10, 8])
        ctx.strokeStyle = 'rgba(22, 163, 74, 0.95)'
        ctx.lineWidth = 3
        ctx.strokeRect(safeInsetX, safeInsetY, PRINT_W - safeInsetX * 2, PRINT_H - safeInsetY * 2)
      }

      ctx.setLineDash([])
    }

    return canvas.toDataURL('image/png')
  }, [loadImage, plannedPanelById, production.defaultBleedMm, production.defaultSafeMm, production.mediaWidthMm, production.tileOverlapMm])

  const handleDownloadPanel = async (panel: PrintCaptureResult) => {
    const slug = project.meta.name.replace(/\s+/g, '-')
    const settings = getPanelSettings(panel.id)
    const dataUrl = await getAdjustedPanelDataUrl(panel, settings, includeGuidesInExport)
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${slug}_${panel.id}.png`
    a.click()
  }

  const handleDownloadAll = () => {
    if (!panels) return
    const enabledPanels = getPlannedPanels(panels)
    enabledPanels.forEach(({ panel }, i) => {
      setTimeout(() => handleDownloadPanel(panel), i * 200)
    })
  }

  const buildCombinedSheetDataUrl = useCallback(async () => {
    if (!panels) {
      throw new Error('No panel data available for combined export')
    }

    const enabledPanels = getPlannedPanels(panels)
    if (enabledPanels.length === 0) {
      throw new Error('No enabled wrap panels found')
    }

    const adjustedEntries = await Promise.all(
      enabledPanels.map(async ({ panel }) => {
        const adjusted = await getAdjustedPanelDataUrl(
          panel,
          getPanelSettings(panel.id),
          includeGuidesInExport
        )
        return [panel.id, adjusted] as const
      })
    )

    const adjustedById = new Map(adjustedEntries)
    const sheetW = 4200
    const sheetH = 2400
    const canvas = document.createElement('canvas')
    canvas.width = sheetW
    canvas.height = sheetH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not create combined sheet canvas')

    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, sheetW, sheetH)

    ctx.fillStyle = '#111827'
    ctx.font = '700 52px Arial'
    ctx.fillText(`${project.meta.name} - 2D Wrap Panel Sheet`, 120, 90)
    ctx.font = '400 26px Arial'
    ctx.fillStyle = '#4b5563'
    ctx.fillText(`Generated: ${new Date().toLocaleString()}`, 120, 132)

    const contentX = 120
    const contentY = 190
    const contentW = sheetW - contentX * 2
    const contentH = sheetH - contentY - 100
    const colGap = 26
    const rowGap = 32

    const totalAreaMm = enabledPanels.reduce((sum, entry) => sum + entry.widthMm * entry.heightMm, 0)
    const pxPerMm = Math.sqrt((contentW * contentH * 0.72) / Math.max(totalAreaMm, 1))

    const draftSlots: Array<{
      id: string
      label: string
      widthMm: number
      heightMm: number
      x: number
      y: number
      w: number
      h: number
    }> = []

    let cursorX = 0
    let cursorY = 0
    let rowMaxH = 0
    let usedW = 0

    for (const entry of enabledPanels) {
      const rawW = entry.widthMm * pxPerMm
      const rawH = entry.heightMm * pxPerMm
      const slotW = Math.min(contentW, Math.max(220, rawW))
      const slotH = Math.min(contentH, Math.max(160, rawH))

      if (cursorX > 0 && cursorX + slotW > contentW) {
        cursorX = 0
        cursorY += rowMaxH + rowGap
        rowMaxH = 0
      }

      draftSlots.push({
        id: entry.panel.id,
        label: entry.exportLabel,
        widthMm: entry.widthMm,
        heightMm: entry.heightMm,
        x: cursorX,
        y: cursorY,
        w: slotW,
        h: slotH,
      })

      cursorX += slotW + colGap
      rowMaxH = Math.max(rowMaxH, slotH)
      usedW = Math.max(usedW, cursorX - colGap)
    }

    const usedH = cursorY + rowMaxH
    const layoutScale = Math.min(1, contentW / Math.max(usedW, 1), contentH / Math.max(usedH, 1))
    const offsetX = contentX + (contentW - usedW * layoutScale) / 2
    const offsetY = contentY + (contentH - usedH * layoutScale) / 2

    const drawFittedPanel = async (
      slot: { id: string; label: string; widthMm: number; heightMm: number; x: number; y: number; w: number; h: number }
    ) => {
      const dataUrl = adjustedById.get(slot.id)
      if (!dataUrl) return

      const img = await loadImage(dataUrl)
      const boxX = offsetX + slot.x * layoutScale
      const boxY = offsetY + slot.y * layoutScale
      const boxW = slot.w * layoutScale
      const boxH = slot.h * layoutScale

      const scale = Math.min(boxW / img.width, boxH / img.height)
      const drawW = img.width * scale
      const drawH = img.height * scale
      const drawX = boxX + (boxW - drawW) / 2
      const drawY = boxY + (boxH - drawH) / 2

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(boxX, boxY, boxW, boxH)
      ctx.strokeStyle = '#cbd5e1'
      ctx.lineWidth = 2
      ctx.strokeRect(boxX, boxY, boxW, boxH)

      ctx.drawImage(img, drawX, drawY, drawW, drawH)

      ctx.fillStyle = '#0f172a'
      ctx.font = '700 24px Arial'
      ctx.fillText(slot.label, boxX + 14, boxY + 30)
      ctx.font = '500 17px Arial'
      ctx.fillStyle = '#475569'
      ctx.fillText(`${Math.round(slot.widthMm)} x ${Math.round(slot.heightMm)} mm`, boxX + 14, boxY + 54)
    }

    await Promise.all(draftSlots.map((slot) => drawFittedPanel(slot)))

    return canvas.toDataURL('image/png')
  }, [panels, getAdjustedPanelDataUrl, getPanelSettings, includeGuidesInExport, loadImage, project.meta.name, getPlannedPanels])

  const handleDownloadCombinedSheet = async () => {
    if (!panels) return
    const slug = project.meta.name.replace(/\s+/g, '-')
    const dataUrl = await buildCombinedSheetDataUrl()
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${slug}_combined-sheet.png`
    a.click()
  }

  const handleExportCombinedPDF = async () => {
    if (!panels) return
    const dataUrl = await buildCombinedSheetDataUrl()
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
    const pageW = 420
    const pageH = 297
    const margin = 10
    const imgW = pageW - margin * 2
    const imgH = pageH - margin * 2
    doc.addImage(dataUrl, 'PNG', margin, margin, imgW, imgH)
    doc.save(`${project.meta.name.replace(/\s+/g, '-')}-combined-sheet.pdf`)
  }

  const handleExportPDF = async () => {
    if (!panels) return
    const enabledPanels = getPlannedPanels(panels)
    if (enabledPanels.length === 0) {
      setError('Enable at least one wrap panel in Production Setup before exporting.')
      return
    }

    const carName = project.meta.name
    const fileRevision = wrapJob.revision
    const metersPerUnit = carLengthM / MODEL_MAX_DIM_UNITS

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
    const pageW = 420
    const pageH = 297
    const margin = 16
    const titleH = 20
    const footerH = 22
    const imgAreaW = pageW - margin * 2
    const imgAreaH = pageH - margin * 2 - titleH - footerH
    const imgH = Math.min(imgAreaH, (imgAreaW / PRINT_W) * PRINT_H)
    const imgW = imgH * (PRINT_W / PRINT_H)
    const imgX = margin + (imgAreaW - imgW) / 2
    const imgY = margin + titleH

    const adjustedData = await Promise.all(
      enabledPanels.map(({ panel }) => getAdjustedPanelDataUrl(
        panel,
        getPanelSettings(panel.id),
        includeGuidesInExport
      ))
    )

    enabledPanels.forEach(({ panel, exportLabel, widthMm, heightMm, bleedMm, overlapMm }, idx) => {
      if (idx > 0) {
        doc.addPage([pageW, pageH], 'landscape')
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(30, 30, 30)
      doc.text(`${carName} - ${exportLabel}`, margin, margin + 8)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(120, 120, 120)
      doc.text(
        `Panel: ${panel.id} | ${PRINT_W}x${PRINT_H}px | ${production.outputDpi} DPI | ${production.mediaWidthMm}mm media | ${production.colorProfileName}`,
        margin,
        margin + 14,
      )

      doc.addImage(adjustedData[idx], 'PNG', imgX, imgY, imgW, imgH)

      const gap = 2
      const mark = 5
      const x1 = imgX
      const y1 = imgY
      const x2 = imgX + imgW
      const y2 = imgY + imgH
      doc.setDrawColor(160, 160, 160)
      doc.setLineWidth(0.2)
      doc.line(x1 - gap - mark, y1, x1 - gap, y1)
      doc.line(x1, y1 - gap - mark, x1, y1 - gap)
      doc.line(x2 + gap, y1, x2 + gap + mark, y1)
      doc.line(x2, y1 - gap - mark, x2, y1 - gap)
      doc.line(x1 - gap - mark, y2, x1 - gap, y2)
      doc.line(x1, y2 + gap, x1, y2 + gap + mark)
      doc.line(x2 + gap, y2, x2 + gap + mark, y2)
      doc.line(x2, y2 + gap, x2, y2 + gap + mark)

      const view = PRINT_VIEWS.find((candidate) => candidate.id === panel.id) ?? PRINT_VIEWS[idx]
      const viewHeightUnits = view.orthoHeight * 2
      const viewHeightM = viewHeightUnits * metersPerUnit
      const mmPerMetre = imgH / viewHeightM

      const barY = imgY + imgH + 8
      const barMm = mmPerMetre
      doc.setDrawColor(30, 30, 30)
      doc.setFillColor(30, 30, 30)
      doc.setLineWidth(0)
      doc.rect(margin, barY, barMm, 2.5, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(30, 30, 30)
      doc.text('1 m', margin + barMm + 2, barY + 2)

      const viewWidthM = viewHeightUnits * (PRINT_W / PRINT_H) * metersPerUnit
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6)
      doc.setTextColor(100, 100, 100)
      const dimNote = [
        `View span: ${viewWidthM.toFixed(2)} m wide x ${viewHeightM.toFixed(2)} m tall`,
        `Template: ${Math.round(widthMm)}x${Math.round(heightMm)} mm`,
        `Bleed ${bleedMm.toFixed(1)}mm • Safe ${production.defaultSafeMm.toFixed(1)}mm • Overlap ${overlapMm.toFixed(1)}mm`,
        `Vehicle length: ${carLengthM} m`,
        selectedCar?.realWorldWidthM ? `Width: ${selectedCar.realWorldWidthM} m` : null,
        selectedCar?.realWorldHeightM ? `Height: ${selectedCar.realWorldHeightM} m` : null,
        `Job: ${wrapJob.jobName || 'Untitled'} (Rev ${fileRevision})`,
      ]
        .filter(Boolean)
        .join(' | ')
      doc.text(dimNote, margin, barY + 10)
    })

    doc.save(`${carName.replace(/\s+/g, '-')}-wrap-template-r${fileRevision}.pdf`)
  }

  useEffect(() => {
    if (activePanelId !== 'one-page' || !panels) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setIsComputingCombined(true)
      buildCombinedSheetDataUrl()
        .then((url) => { if (!cancelled) setCombinedSheetDataUrl(url) })
        .catch(() => {})
        .finally(() => { if (!cancelled) setIsComputingCombined(false) })
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [activePanelId, panels, buildCombinedSheetDataUrl])

  const activePanel = panels?.find((panel) => panel.id === activePanelId) ?? null
  const activePanelPlan = plannedPanelById.get(activePanelId) ?? null
  const activePanelLabel = plannedPanels.find(({ panel }) => panel.id === activePanelId)?.exportLabel ?? activePanel?.label ?? ''
  const activeSettings = getPanelSettings(activePanelId)
  const activeGuideStyle = useMemo(() => {
    const widthMm = Math.max(1, activePanelPlan?.widthMm ?? Math.max(900, Math.round(production.mediaWidthMm * 0.9)))
    const heightMm = Math.max(1, activePanelPlan?.heightMm ?? Math.max(700, Math.round(widthMm * (PRINT_H / PRINT_W))))
    const bleedMm = Math.max(0, activePanelPlan?.bleedMm ?? production.defaultBleedMm)
    const safeMm = Math.max(0, production.defaultSafeMm)
    const overlapMm = Math.max(0, activePanelPlan?.overlapMm ?? production.tileOverlapMm)
    const bleedPct = Math.min(45, (bleedMm / Math.min(widthMm, heightMm)) * 100)
    const safePct = Math.min(45, ((bleedMm + safeMm) / Math.min(widthMm, heightMm)) * 100)
    const overlapPct = Math.min(49, (overlapMm / widthMm) * 100)
    return { bleedPct, safePct, overlapPct, bleedMm, safeMm, overlapMm }
  }, [activePanelPlan, production.defaultBleedMm, production.defaultSafeMm, production.mediaWidthMm, production.tileOverlapMm])

  return (
    <div className="print-workspace-root">
      <div className="print-modal-header">
          <div className="print-modal-title">
            <span className="print-modal-icon">2D</span>
            <span>2D Template Editor</span>
          </div>
          <div className="print-header-actions">
            <button
              type="button"
              className={livePreview ? 'print-live-toggle active' : 'print-live-toggle'}
              onClick={() => setLivePreview((value) => !value)}
              title="Auto-refresh previews while you edit"
            >
              {livePreview ? 'Live: On' : 'Live: Off'}
            </button>
            <button
              type="button"
              className="print-back-btn"
              onClick={onClose}
              title="Return to 3D editor"
            >
              3D Editor
            </button>
          </div>
        </div>

        <div className="print-modal-info">
          Live preview of your decals, text, and stripes on flat orthographic print panels.
          Last update: <strong>{fmtTimestamp(lastCaptureAt)}</strong>
          <span className="print-modal-dims">
            {' '}Output: {production.outputDpi} DPI • {production.mediaWidthMm}mm media • {production.colorProfileName} • Rev {wrapJob.revision}
          </span>
          {selectedCar?.realWorldLengthM && (
            <span className="print-modal-dims">
              {' '}Vehicle: {selectedCar.realWorldLengthM}m x {selectedCar.realWorldWidthM}m x {selectedCar.realWorldHeightM}m
            </span>
          )}
        </div>

        {isCapturing && (
          <div className="print-progress-wrap">
            <div className="print-progress-track">
              <div className="print-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="print-progress-label">
              Updating {progressLabel}... {progress}%
            </span>
          </div>
        )}

        {panels ? (
          <div className="print-editor-grid">
            <aside className="print-panel-tabs" aria-label="2D panel tabs">
              {plannedPanels.map(({ panel, exportLabel }) => (
                <button
                  key={panel.id}
                  type="button"
                  className={panel.id === activePanelId ? 'print-panel-tab active' : 'print-panel-tab'}
                  onClick={() => setActivePanelId(panel.id)}
                >
                  {exportLabel}
                </button>
              ))}
              <div className="print-panel-tab-divider" />
              <button
                type="button"
                className={'one-page' === activePanelId ? 'print-panel-tab print-panel-tab-onepage active' : 'print-panel-tab print-panel-tab-onepage'}
                onClick={() => setActivePanelId('one-page')}
              >
                One Page
              </button>
            </aside>

            <section className="print-editor-stage">
              {activePanelId === 'one-page' ? (
                <>
                  <div className="print-editor-stage-label">One Page — Combined Sheet Preview</div>
                  <div className="print-editor-canvas-wrap print-editor-canvas-onepage">
                    {isComputingCombined ? (
                      <div className="print-onepage-computing">Building preview…</div>
                    ) : combinedSheetDataUrl ? (
                      <img
                        src={combinedSheetDataUrl}
                        alt="Combined sheet preview"
                        className="print-editor-image"
                      />
                    ) : (
                      <div className="print-onepage-computing">No panels yet</div>
                    )}
                  </div>
                </>
              ) : activePanel ? (
                <>
                  <div className="print-editor-stage-label">{activePanelLabel}</div>
                  <div className="print-editor-canvas-wrap">
                    <img
                      src={activePanel.dataUrl}
                      alt={activePanel.label}
                      className="print-editor-image"
                      style={{
                        transform: `translate(${activeSettings.offsetX}%, ${activeSettings.offsetY}%) scale(${activeSettings.scale / 100}) rotate(${activeSettings.rotationDeg}deg)`,
                      }}
                    />
                    <div className="print-panel-guides" aria-hidden="true">
                      {activeSettings.showSafe && (
                        <span className="print-guide-safe" style={{ inset: `${activeGuideStyle.safePct}%` }} />
                      )}
                      {activeSettings.showBleed && (
                        <>
                          <span className="print-guide-bleed" style={{ inset: `${activeGuideStyle.bleedPct}%` }} />
                          {activeGuideStyle.overlapPct > 0 && (
                            <>
                              <span className="print-guide-overlap" style={{ left: `${activeGuideStyle.overlapPct}%` }} />
                              <span className="print-guide-overlap" style={{ right: `${activeGuideStyle.overlapPct}%` }} />
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </section>

            <aside className="print-panel-tools" aria-label="Panel adjustment tools">
              <div className="print-tool-title">Production Setup</div>

              <label className="print-tool-row">
                <span>Job Name</span>
                <input
                  type="text"
                  className="print-tool-input"
                  value={wrapJob.jobName}
                  onChange={(e) => setWrapJob({ jobName: e.target.value })}
                />
              </label>

              <label className="print-tool-row">
                <span>Customer</span>
                <input
                  type="text"
                  className="print-tool-input"
                  value={wrapJob.customerName}
                  onChange={(e) => setWrapJob({ customerName: e.target.value })}
                />
              </label>

              <label className="print-tool-row">
                <span>Revision</span>
                <input
                  type="number"
                  className="print-tool-input"
                  min={1}
                  step={1}
                  value={wrapJob.revision}
                  onChange={(e) => setWrapJob({ revision: Math.max(1, Math.round(parsePositiveNumber(e.target.value, wrapJob.revision, 1))) })}
                />
              </label>

              <label className="print-tool-row">
                <span>Output DPI</span>
                <select
                  className="print-tool-input"
                  value={production.outputDpi}
                  onChange={(e) => setPrintProduction({ outputDpi: Number(e.target.value) === 300 ? 300 : 150 })}
                >
                  <option value={150}>150 DPI</option>
                  <option value={300}>300 DPI</option>
                </select>
              </label>

              <label className="print-tool-row">
                <span>Media Width (mm)</span>
                <input
                  type="number"
                  className="print-tool-input"
                  min={300}
                  step={1}
                  value={production.mediaWidthMm}
                  onChange={(e) => setPrintProduction({ mediaWidthMm: parsePositiveNumber(e.target.value, production.mediaWidthMm, 300) })}
                />
              </label>

              <label className="print-tool-row">
                <span>Tile Overlap (mm)</span>
                <input
                  type="number"
                  className="print-tool-input"
                  min={0}
                  step={0.5}
                  value={production.tileOverlapMm}
                  onChange={(e) => setPrintProduction({ tileOverlapMm: parsePositiveNumber(e.target.value, production.tileOverlapMm) })}
                />
              </label>

              <label className="print-tool-row">
                <span>Default Bleed (mm)</span>
                <input
                  type="number"
                  className="print-tool-input"
                  min={0}
                  step={0.5}
                  value={production.defaultBleedMm}
                  onChange={(e) => setPrintProduction({ defaultBleedMm: parsePositiveNumber(e.target.value, production.defaultBleedMm) })}
                />
              </label>

              <label className="print-tool-row">
                <span>Default Safe (mm)</span>
                <input
                  type="number"
                  className="print-tool-input"
                  min={0}
                  step={0.5}
                  value={production.defaultSafeMm}
                  onChange={(e) => setPrintProduction({ defaultSafeMm: parsePositiveNumber(e.target.value, production.defaultSafeMm) })}
                />
              </label>

              <label className="print-tool-row">
                <span>Color Profile</span>
                <input
                  type="text"
                  className="print-tool-input"
                  value={production.colorProfileName}
                  onChange={(e) => setPrintProduction({ colorProfileName: e.target.value })}
                />
              </label>

              <label className="print-tool-row print-tool-row-inline">
                <span>Registration Marks</span>
                <input
                  type="checkbox"
                  checked={production.includeRegistrationMarks}
                  onChange={(e) => setPrintProduction({ includeRegistrationMarks: e.target.checked })}
                />
              </label>

              <label className="print-tool-row print-tool-row-inline">
                <span>Cut Contour</span>
                <input
                  type="checkbox"
                  checked={production.includeCutContour}
                  onChange={(e) => setPrintProduction({ includeCutContour: e.target.checked })}
                />
              </label>

              <label className="print-tool-row">
                <span>Vehicle Length (mm)</span>
                <input
                  type="number"
                  className="print-tool-input"
                  min={0}
                  step={1}
                  value={vehicleCalibration.lengthMm ?? ''}
                  onChange={(e) => setVehicleCalibration({ lengthMm: parseNullableNumber(e.target.value) })}
                />
              </label>

              <label className="print-tool-row">
                <span>Vehicle Width (mm)</span>
                <input
                  type="number"
                  className="print-tool-input"
                  min={0}
                  step={1}
                  value={vehicleCalibration.widthMm ?? ''}
                  onChange={(e) => setVehicleCalibration({ widthMm: parseNullableNumber(e.target.value) })}
                />
              </label>

              <label className="print-tool-row">
                <span>Vehicle Height (mm)</span>
                <input
                  type="number"
                  className="print-tool-input"
                  min={0}
                  step={1}
                  value={vehicleCalibration.heightMm ?? ''}
                  onChange={(e) => setVehicleCalibration({ heightMm: parseNullableNumber(e.target.value) })}
                />
              </label>

              <div className="print-tool-title print-tool-title-sub">Wrap Panels</div>
              <div className="print-wrap-panels-list">
                {wrapPanels
                  .slice()
                  .sort((a, b) => a.installOrder - b.installOrder)
                  .map((panel) => (
                    <div key={panel.id} className="print-wrap-panel-card">
                      <label className="print-tool-row">
                        <span>Panel Label</span>
                        <input
                          type="text"
                          className="print-tool-input"
                          value={panel.label}
                          onChange={(e) => upsertWrapPanel({ ...panel, label: e.target.value })}
                        />
                      </label>

                      <div className="print-wrap-panel-grid2">
                        <label className="print-tool-row">
                          <span>Width (mm)</span>
                          <input
                            type="number"
                            className="print-tool-input"
                            min={1}
                            step={1}
                            value={panel.widthMm}
                            onChange={(e) => upsertWrapPanel({
                              ...panel,
                              widthMm: parsePositiveNumber(e.target.value, panel.widthMm, 1),
                            })}
                          />
                        </label>

                        <label className="print-tool-row">
                          <span>Height (mm)</span>
                          <input
                            type="number"
                            className="print-tool-input"
                            min={1}
                            step={1}
                            value={panel.heightMm}
                            onChange={(e) => upsertWrapPanel({
                              ...panel,
                              heightMm: parsePositiveNumber(e.target.value, panel.heightMm, 1),
                            })}
                          />
                        </label>
                      </div>

                      <div className="print-wrap-panel-grid2">
                        <label className="print-tool-row">
                          <span>Bleed (mm)</span>
                          <input
                            type="number"
                            className="print-tool-input"
                            min={0}
                            step={0.5}
                            value={panel.bleedMm}
                            onChange={(e) => upsertWrapPanel({
                              ...panel,
                              bleedMm: parsePositiveNumber(e.target.value, panel.bleedMm),
                            })}
                          />
                        </label>

                        <label className="print-tool-row">
                          <span>Overlap (mm)</span>
                          <input
                            type="number"
                            className="print-tool-input"
                            min={0}
                            step={0.5}
                            value={panel.overlapMm}
                            onChange={(e) => upsertWrapPanel({
                              ...panel,
                              overlapMm: parsePositiveNumber(e.target.value, panel.overlapMm),
                            })}
                          />
                        </label>
                      </div>

                      <div className="print-wrap-panel-grid2">
                        <label className="print-tool-row">
                          <span>Install Order</span>
                          <input
                            type="number"
                            className="print-tool-input"
                            min={1}
                            step={1}
                            value={panel.installOrder}
                            onChange={(e) => upsertWrapPanel({
                              ...panel,
                              installOrder: Math.max(1, Math.round(parsePositiveNumber(e.target.value, panel.installOrder, 1))),
                            })}
                          />
                        </label>

                        <label className="print-tool-row">
                          <span>Orientation</span>
                          <select
                            className="print-tool-input"
                            value={panel.orientation}
                            onChange={(e) => upsertWrapPanel({
                              ...panel,
                              orientation: e.target.value === 'mirrored' ? 'mirrored' : 'normal',
                            })}
                          >
                            <option value="normal">Normal</option>
                            <option value="mirrored">Mirrored</option>
                          </select>
                        </label>
                      </div>

                      <div className="print-wrap-panel-actions">
                        <label className="print-tool-row print-tool-row-inline print-wrap-panel-enabled">
                          <span>Enabled</span>
                          <input
                            type="checkbox"
                            checked={panel.enabled}
                            onChange={(e) => upsertWrapPanel({ ...panel, enabled: e.target.checked })}
                          />
                        </label>

                        <button
                          type="button"
                          className="print-wrap-panel-remove"
                          onClick={() => removeWrapPanel(panel.id)}
                          disabled={wrapPanels.length <= 1}
                          title={wrapPanels.length <= 1 ? 'Keep at least one panel' : 'Remove this panel'}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
              </div>

              <button
                type="button"
                className="print-reset-btn"
                onClick={() => {
                  const nextOrder = Math.max(1, ...wrapPanels.map((p) => p.installOrder)) + 1
                  const label = `Panel ${nextOrder}`
                  upsertWrapPanel({
                    id: `${toPanelId(label)}-${Date.now().toString(36)}`,
                    label,
                    widthMm: 1800,
                    heightMm: 1400,
                    bleedMm: production.defaultBleedMm,
                    overlapMm: production.tileOverlapMm,
                    orientation: 'normal',
                    installOrder: nextOrder,
                    enabled: true,
                  })
                }}
              >
                Add Wrap Panel
              </button>

              <div className="print-panel-tab-divider" />

              {activePanelId === 'one-page' ? (
                <>
                  <div className="print-tool-title">Sheet Options</div>
                  <label className="print-tool-row">
                    <span>Include guides in preview</span>
                    <input
                      type="checkbox"
                      checked={includeGuidesInExport}
                      onChange={(e) => setIncludeGuidesInExport(e.target.checked)}
                    />
                  </label>
                  <p className="print-onepage-hint">The one-page sheet combines all 6 panels into a single layout. Export it using the buttons below.</p>
                </>
              ) : (
              <>
              <div className="print-tool-title">Panel Tools</div>

              <label className="print-tool-row">
                <span>Bleed Guide</span>
                <input
                  type="checkbox"
                  checked={activeSettings.showBleed}
                  onChange={(e) => updatePanelSetting(activePanelId, 'showBleed', e.target.checked)}
                />
              </label>

              <label className="print-tool-row">
                <span>Bleed Size</span>
                <span>{activeGuideStyle.bleedMm.toFixed(1)} mm (from template)</span>
              </label>

              <label className="print-tool-row">
                <span>Safe Zone</span>
                <input
                  type="checkbox"
                  checked={activeSettings.showSafe}
                  onChange={(e) => updatePanelSetting(activePanelId, 'showSafe', e.target.checked)}
                />
              </label>

              <label className="print-tool-row">
                <span>Safe Size</span>
                <span>{activeGuideStyle.safeMm.toFixed(1)} mm (global)</span>
              </label>

              <label className="print-tool-row">
                <span>Overlap</span>
                <span>{activeGuideStyle.overlapMm.toFixed(1)} mm (from template)</span>
              </label>

              <label className="print-tool-row">
                <span>Offset X ({activeSettings.offsetX.toFixed(1)}%)</span>
                <input
                  type="range"
                  min={-20}
                  max={20}
                  step={0.5}
                  value={activeSettings.offsetX}
                  onChange={(e) => updatePanelSetting(activePanelId, 'offsetX', Number(e.target.value))}
                />
              </label>

              <label className="print-tool-row">
                <span>Offset Y ({activeSettings.offsetY.toFixed(1)}%)</span>
                <input
                  type="range"
                  min={-20}
                  max={20}
                  step={0.5}
                  value={activeSettings.offsetY}
                  onChange={(e) => updatePanelSetting(activePanelId, 'offsetY', Number(e.target.value))}
                />
              </label>

              <label className="print-tool-row">
                <span>Scale ({activeSettings.scale.toFixed(0)}%)</span>
                <input
                  type="range"
                  min={70}
                  max={130}
                  step={1}
                  value={activeSettings.scale}
                  onChange={(e) => updatePanelSetting(activePanelId, 'scale', Number(e.target.value))}
                />
              </label>

              <label className="print-tool-row">
                <span>Rotation ({activeSettings.rotationDeg.toFixed(1)}°)</span>
                <input
                  type="range"
                  min={-15}
                  max={15}
                  step={0.5}
                  value={activeSettings.rotationDeg}
                  onChange={(e) => updatePanelSetting(activePanelId, 'rotationDeg', Number(e.target.value))}
                />
              </label>

              <button type="button" className="print-reset-btn" onClick={resetActivePanel}>
                Reset This Panel
              </button>
              </>
              )}
            </aside>
          </div>
        ) : (
          <div className="print-generate-wrap">
            <button type="button" className="print-generate-btn" onClick={() => capturePanels(false)}>
              Generate 2D Templates
            </button>
          </div>
        )}

        <div className="print-actions">
          <label className="print-export-guides-toggle">
            <input
              type="checkbox"
              checked={includeGuidesInExport}
              onChange={(e) => setIncludeGuidesInExport(e.target.checked)}
            />
            Include guides in exported files
          </label>
          <button
            type="button"
            className="print-action-pdf"
            onClick={handleExportCombinedPDF}
            disabled={!panels}
          >
            Export One-Page PDF
          </button>
          <button
            type="button"
            className="print-action-all"
            onClick={handleDownloadCombinedSheet}
            disabled={!panels}
          >
            Download One-Page PNG
          </button>
          <button
            type="button"
            className="print-action-pdf"
            onClick={handleExportPDF}
            disabled={!panels}
          >
            Export Individual PDF Pages
          </button>
          <button
            type="button"
            className="print-action-all"
            onClick={handleDownloadAll}
            disabled={!panels}
          >
            Download Individual PNGs
          </button>
          <button
            type="button"
            className="print-action-regen"
            onClick={() => capturePanels(true)}
          >
            Refresh Templates
          </button>
        </div>

        {error && <div className="print-error">{error}</div>}
    </div>
  )
}
