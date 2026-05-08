import { Suspense, useRef, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { preloadModelScene, useModelScene } from './useModelScene'

const DEFAULT_MODEL_URL = '/models/home/hero.glb'
const ROTATE_SPEED = 0.18   // radians / sec
const TARGET_SIZE = 5.2     // world units
const CAR_OFFSET_X = 3.6

// Pre-warm the default loader so the model is cached when the editor opens later
preloadModelScene(DEFAULT_MODEL_URL)

function RotatingCar({ modelUrl }: { modelUrl: string }) {
  const { scene } = useModelScene(modelUrl)
  const groupRef = useRef<THREE.Group>(null)

  // Clone + scale + ground-snap once on mount
  useEffect(() => {
    const group = groupRef.current
    if (!group || group.children.length > 0) return

    const clone = scene.clone(true)

    // Uniform scale to TARGET_SIZE
    const bbox = new THREE.Box3().setFromObject(clone)
    const size = bbox.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim > 0) clone.scale.setScalar(TARGET_SIZE / maxDim)

    // Ground-snap: move so bottom of car sits at y=0
    const bbox2 = new THREE.Box3().setFromObject(clone)
    clone.position.y -= bbox2.min.y

    group.add(clone)
  }, [scene])

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * ROTATE_SPEED
    }
  })

  return <group ref={groupRef} position={[CAR_OFFSET_X, 0, 0]} />
}

// Point camera at the car's offset position
function CameraAim() {
  const { camera } = useThree()
  useEffect(() => {
    camera.lookAt(CAR_OFFSET_X, 0.6, 0)
  }, [camera])
  return null
}

export function HeroCarScene({ modelUrl = DEFAULT_MODEL_URL }: { modelUrl?: string }) {
  useEffect(() => {
    preloadModelScene(modelUrl)
  }, [modelUrl])

  return (
    <Canvas
      shadows="percentage"
      camera={{ position: [3.6, 1.6, 4.0], fov: 52 }}
      gl={{ antialias: true, alpha: true }}
      className="hero-car-canvas"
    >
      <CameraAim />
      <fog attach="fog" args={['#0f1827', 10, 30]} />

      {/* Showroom lighting */}
      <ambientLight intensity={0.72} />
      <directionalLight intensity={1.75} position={[CAR_OFFSET_X, 8, 0]} castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024}
      />
      <pointLight position={[CAR_OFFSET_X - 4, 5, 4]}  intensity={1.05} color="#ffffff" />
      <pointLight position={[CAR_OFFSET_X + 4, 5, -4]} intensity={1.05} color="#ffffff" />

      <Suspense fallback={null}>
        <RotatingCar modelUrl={modelUrl} />
      </Suspense>

      {/* Reflective floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CAR_OFFSET_X, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial
          color="#162433"
          roughness={0.75}
          metalness={0.0}
        />
      </mesh>
    </Canvas>
  )
}
