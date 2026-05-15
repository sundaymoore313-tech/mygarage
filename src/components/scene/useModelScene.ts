import { useGLTF } from '@react-three/drei'
import { useEffect } from 'react'
import type { GLTF } from 'three-stdlib'

export type ModelSceneResult = {
  scene: GLTF['scene']
}

const cachedModelUrls = new Set<string>()

export function preloadModelScene(modelUrl: string): void {
  cachedModelUrls.add(modelUrl)
  useGLTF.preload(modelUrl)
}

export function clearModelSceneCache(): void {
  for (const modelUrl of cachedModelUrls) {
    useGLTF.clear(modelUrl)
  }
  cachedModelUrls.clear()
}

export function useModelScene(modelUrl: string): ModelSceneResult {
  const gltf = useGLTF(modelUrl) as GLTF

  useEffect(() => {
    cachedModelUrls.add(modelUrl)
  }, [modelUrl])

  return { scene: gltf.scene }
}
