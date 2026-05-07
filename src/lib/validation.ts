/**
 * Validation utilities for editor numeric inputs
 * Ensures all values are valid numbers within expected ranges
 */

export type NumericConstraints = {
  min?: number
  max?: number
  isInteger?: boolean
}

/**
 * Clamp a numeric value to a range
 * Returns NaN-safe value, defaulting to min if invalid
 */
export function clampNumber(value: unknown, constraints: NumericConstraints): number {
  // Convert to number safely
  const num = typeof value === 'number' ? value : Number(value)
  
  // If not a valid number, return min or 0
  if (!Number.isFinite(num)) {
    return constraints.min ?? 0
  }

  // Apply integer constraint
  let result = constraints.isInteger ? Math.floor(num) : num

  // Clamp to range
  if (constraints.max !== undefined) {
    result = Math.min(result, constraints.max)
  }
  if (constraints.min !== undefined) {
    result = Math.max(result, constraints.min)
  }

  return result
}

/**
 * Validate and clamp transform opacity (0-1)
 */
export function clampOpacity(value: unknown): number {
  return clampNumber(value, { min: 0, max: 1 })
}

/**
 * Validate and clamp transform position/scale component
 * Allows negative and positive values, but prevents Infinity/NaN
 */
export function clampTransformComponent(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) {
    return 0
  }
  return num
}

/**
 * Validate and clamp rotation (radians, typically -2π to 2π)
 */
export function clampRotation(value: unknown): number {
  return clampTransformComponent(value)
}

/**
 * Validate and clamp stripe/split offsets
 */
export function clampStripeOffset(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) {
    return 0
  }
  // Typical range is -1.8 to 1.8
  return Math.max(-1.8, Math.min(1.8, num))
}

/**
 * Validate and clamp stripe width
 */
export function clampStripeWidth(value: unknown): number {
  return clampNumber(value, { min: 0.02, max: 1.5 })
}

/**
 * Validate and clamp soft edge (feather amount)
 */
export function clampSoftEdge(value: unknown): number {
  return clampNumber(value, { min: 0, max: 0.12 })
}

/**
 * Validate a hex color string
 * Returns the value if valid hex, otherwise returns fallback
 */
export function validateColorHex(value: unknown, fallback: string = '#ffffff'): string {
  if (typeof value !== 'string') {
    return fallback
  }
  const hex = value.trim()
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return fallback
  }
  return hex
}

/**
 * Validate a layer name
 * Returns trimmed name, at least 1 character
 */
export function validateLayerName(value: unknown, fallback: string = 'Unnamed'): string {
  if (typeof value !== 'string') {
    return fallback
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}
