export type ExportQuality = 'standard' | 'high' | 'ultra'

export const EXPORT_QUALITY_LABELS: Record<ExportQuality, string> = {
  standard: 'Standard',
  high: 'High',
  ultra: 'Ultra',
}

export const EXPORT_QUALITY_ORDER: ExportQuality[] = ['standard', 'high', 'ultra']
