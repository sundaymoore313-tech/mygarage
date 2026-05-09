import { useGLTF } from '@react-three/drei'
import { useEffect } from 'react'
import type { GLTF } from 'three-stdlib'

export type ModelSceneResult = {
  scene: GLTF['scene']
}

let lastModelUrl: string | null = null

export function preloadModelScene(modelUrl: string): void {
  useGLTF.preload(modelUrl)
}

export function clearModelSceneCache(): void {
  if (!lastModelUrl) return
  useGLTF.clear(lastModelUrl)
  lastModelUrl = null
}

export function useModelScene(modelUrl: string): ModelSceneResult {
  const gltf = useGLTF(modelUrl) as GLTF

  useEffect(() => {
    if (lastModelUrl && lastModelUrl !== modelUrl) {
      // Keep GLTF cache bounded while users hop between models on mobile.
      useGLTF.clear(lastModelUrl)
    }
    lastModelUrl = modelUrl
  }, [modelUrl])

  return { scene: gltf.scene }
}
