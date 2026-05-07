import { describe, it, expect } from 'vitest'
import {
  clampNumber,
  clampOpacity,
  clampTransformComponent,
  clampRotation,
  clampStripeOffset,
  clampStripeWidth,
  clampSoftEdge,
  validateColorHex,
  validateLayerName,
} from './validation'

describe('validation utilities', () => {
  describe('clampNumber', () => {
    it('clamps to max', () => {
      expect(clampNumber(150, { max: 100 })).toBe(100)
    })

    it('clamps to min', () => {
      expect(clampNumber(-50, { min: 0 })).toBe(0)
    })

    it('returns value within range', () => {
      expect(clampNumber(50, { min: 0, max: 100 })).toBe(50)
    })

    it('handles NaN as invalid', () => {
      expect(clampNumber(NaN, { min: 0, max: 1 })).toBe(0)
    })

    it('handles Infinity as invalid', () => {
      expect(clampNumber(Infinity, { min: 0, max: 1 })).toBe(0)
    })

    it('converts string numbers', () => {
      expect(clampNumber('50', { min: 0, max: 100 })).toBe(50)
    })

    it('handles invalid strings', () => {
      expect(clampNumber('abc', { min: 0, max: 1 })).toBe(0)
    })

    it('floors when isInteger is true', () => {
      expect(clampNumber(50.7, { isInteger: true })).toBe(50)
    })
  })

  describe('clampOpacity', () => {
    it('clamps opacity to 0-1 range', () => {
      expect(clampOpacity(1.5)).toBe(1)
      expect(clampOpacity(-0.5)).toBe(0)
      expect(clampOpacity(0.5)).toBe(0.5)
    })

    it('handles invalid opacity values', () => {
      expect(clampOpacity(NaN)).toBe(0)
      expect(clampOpacity('invalid')).toBe(0)
    })
  })

  describe('clampTransformComponent', () => {
    it('allows any finite value', () => {
      expect(clampTransformComponent(-100)).toBe(-100)
      expect(clampTransformComponent(100)).toBe(100)
      expect(clampTransformComponent(0)).toBe(0)
    })

    it('returns 0 for invalid values', () => {
      expect(clampTransformComponent(NaN)).toBe(0)
      expect(clampTransformComponent(Infinity)).toBe(0)
      expect(clampTransformComponent('invalid')).toBe(0)
    })

    it('converts string numbers', () => {
      expect(clampTransformComponent('42.5')).toBe(42.5)
    })
  })

  describe('clampRotation', () => {
    it('allows negative and positive rotations', () => {
      expect(clampRotation(-Math.PI)).toBe(-Math.PI)
      expect(clampRotation(Math.PI)).toBe(Math.PI)
    })

    it('handles invalid rotations', () => {
      expect(clampRotation(NaN)).toBe(0)
      expect(clampRotation('invalid')).toBe(0)
    })
  })

  describe('clampStripeOffset', () => {
    it('clamps to -1.8 to 1.8 range', () => {
      expect(clampStripeOffset(2)).toBe(1.8)
      expect(clampStripeOffset(-2)).toBe(-1.8)
      expect(clampStripeOffset(0.5)).toBe(0.5)
    })

    it('handles invalid values', () => {
      expect(clampStripeOffset(NaN)).toBe(0)
      expect(clampStripeOffset('invalid')).toBe(0)
    })
  })

  describe('clampStripeWidth', () => {
    it('clamps to 0.02-1.5 range', () => {
      expect(clampStripeWidth(0.01)).toBe(0.02)
      expect(clampStripeWidth(2)).toBe(1.5)
      expect(clampStripeWidth(0.5)).toBe(0.5)
    })

    it('handles invalid values', () => {
      expect(clampStripeWidth(NaN)).toBe(0.02)
      expect(clampStripeWidth('invalid')).toBe(0.02)
    })
  })

  describe('clampSoftEdge', () => {
    it('clamps to 0-0.12 range', () => {
      expect(clampSoftEdge(-0.1)).toBe(0)
      expect(clampSoftEdge(0.2)).toBe(0.12)
      expect(clampSoftEdge(0.05)).toBe(0.05)
    })

    it('handles invalid values', () => {
      expect(clampSoftEdge(NaN)).toBe(0)
      expect(clampSoftEdge('invalid')).toBe(0)
    })
  })

  describe('validateColorHex', () => {
    it('accepts valid hex colors', () => {
      expect(validateColorHex('#ffffff')).toBe('#ffffff')
      expect(validateColorHex('#000000')).toBe('#000000')
      expect(validateColorHex('#aAbBcC')).toBe('#aAbBcC')
    })

    it('rejects invalid hex colors', () => {
      expect(validateColorHex('ffffff')).toBe('#ffffff') // default fallback
      expect(validateColorHex('#fffff')).toBe('#ffffff')
      expect(validateColorHex('#gggggg')).toBe('#ffffff')
      expect(validateColorHex('invalid')).toBe('#ffffff')
    })

    it('allows custom fallback', () => {
      expect(validateColorHex('invalid', '#ff0000')).toBe('#ff0000')
    })

    it('handles non-string inputs', () => {
      expect(validateColorHex(123)).toBe('#ffffff')
      expect(validateColorHex(null)).toBe('#ffffff')
      expect(validateColorHex(undefined)).toBe('#ffffff')
    })
  })

  describe('validateLayerName', () => {
    it('accepts valid names', () => {
      expect(validateLayerName('Layer 1')).toBe('Layer 1')
      expect(validateLayerName('Decal')).toBe('Decal')
    })

    it('trims whitespace', () => {
      expect(validateLayerName('  Layer  ')).toBe('Layer')
      expect(validateLayerName('\t\nLayer\t\n')).toBe('Layer')
    })

    it('uses fallback for empty strings', () => {
      expect(validateLayerName('')).toBe('Unnamed')
      expect(validateLayerName('   ')).toBe('Unnamed')
      expect(validateLayerName('\t\n')).toBe('Unnamed')
    })

    it('allows custom fallback', () => {
      expect(validateLayerName('', 'My Default')).toBe('My Default')
    })

    it('handles non-string inputs', () => {
      expect(validateLayerName(123)).toBe('Unnamed')
      expect(validateLayerName(null)).toBe('Unnamed')
      expect(validateLayerName(undefined)).toBe('Unnamed')
    })
  })
})
