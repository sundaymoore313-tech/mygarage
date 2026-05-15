/**
 * Adaptive Device Pixel Ratio (DPR) management.
 * Monitors frame rates and automatically scales down DPR if performance degrades.
 */

import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'

type AdaptiveDPRConfig = {
  minDpr: number
  maxDpr: number
  targetFps: number
  degradationThreshold: number // fps below this triggers reduction
  recoveryThreshold: number // fps above this triggers increase
  checkInterval: number // ms between DPR adjustments
}

const DEFAULT_CONFIG: AdaptiveDPRConfig = {
  minDpr: 1,
  maxDpr: 2,
  targetFps: 60,
  degradationThreshold: 45,
  recoveryThreshold: 55,
  checkInterval: 2000, // check every 2 seconds
}

/**
 * Component to monitor frame rate and adaptively adjust DPR.
 * Place this inside a <Canvas> element.
 */
export function AdaptivePerformanceMonitor(config: Partial<AdaptiveDPRConfig> = {}) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  const { gl } = useThree()

  const frameCountRef = useRef(0)
  const lastCheckTimeRef = useRef(Date.now())
  const currentDprRef = useRef(gl.getPixelRatio())
  const isAdjustingRef = useRef(false)

  useFrame(() => {
    frameCountRef.current++

    const now = Date.now()
    const elapsed = now - lastCheckTimeRef.current

    if (elapsed >= mergedConfig.checkInterval) {
      const fps = Math.round((frameCountRef.current * 1000) / elapsed)
      frameCountRef.current = 0
      lastCheckTimeRef.current = now
      const currentDpr = currentDprRef.current

      if (!isAdjustingRef.current) {
        isAdjustingRef.current = true

        if (fps < mergedConfig.degradationThreshold && currentDpr > mergedConfig.minDpr) {
          // Performance degraded, reduce DPR
          const newDpr = Math.max(mergedConfig.minDpr, currentDpr - 0.5)
          currentDprRef.current = newDpr
          gl.setPixelRatio(newDpr)

          if (typeof window !== 'undefined' && (window as any).__DEBUG_PERF__) {
            console.log(`[Adaptive DPR] FPS ${fps} below threshold, reducing DPR to ${newDpr}`)
          }
        } else if (fps > mergedConfig.recoveryThreshold && currentDpr < mergedConfig.maxDpr) {
          // Performance recovered, increase DPR
          const newDpr = Math.min(mergedConfig.maxDpr, currentDpr + 0.25)
          currentDprRef.current = newDpr
          gl.setPixelRatio(newDpr)

          if (typeof window !== 'undefined' && (window as any).__DEBUG_PERF__) {
            console.log(`[Adaptive DPR] FPS ${fps} above threshold, increasing DPR to ${newDpr}`)
          }
        }

        isAdjustingRef.current = false
      }
    }
  })

  return null
}
