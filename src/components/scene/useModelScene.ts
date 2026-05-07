import { useGLTF } from '@react-three/drei'
import type { GLTF } from 'three-stdlib'

export type ModelSceneResult = {
  scene: GLTF['scene']
}

export function preloadModelScene(modelUrl: string): void {
  useGLTF.preload(modelUrl)
}

export function useModelScene(modelUrl: string): ModelSceneResult {
  const gltf = useGLTF(modelUrl) as GLTF
  return { scene: gltf.scene }
}
