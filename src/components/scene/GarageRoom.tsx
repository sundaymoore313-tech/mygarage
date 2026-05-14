import { useMemo } from 'react'
import { MeshReflectorMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { useEditorStore } from '../../store/editorStore'

// ── Procedural epoxy flake floor texture ────────────────────────────────────
function makeEpoxyFloorTexture(): THREE.CanvasTexture {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Base coat — dark charcoal epoxy
  ctx.fillStyle = '#3a3a3a'
  ctx.fillRect(0, 0, size, size)

  // Subtle base gradient for depth
  const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size*0.7)
  grad.addColorStop(0, 'rgba(80,80,80,0.18)')
  grad.addColorStop(1, 'rgba(0,0,0,0.22)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)

  // Colored vinyl flakes scattered over the surface
  const flakeColors = [
    '#d4d4d4', // white/light gray
    '#a8a8a8', // medium gray
    '#6e6e6e', // dark gray
    '#1a1a1a', // charcoal/black
    '#c8c8c8', // silver
    '#b0b4ba', // blue-gray
    '#8a8a90', // cool gray
    '#e0e0e0', // bright white chip
  ]
  const rng = (n: number) => Math.random() * n

  // Large flakes (vinyl chips)
  for (let i = 0; i < 6000; i++) {
    const cx = rng(size)
    const cy = rng(size)
    const w = rng(6) + 2
    const h = rng(4) + 1.5
    const angle = rng(Math.PI)
    const color = flakeColors[Math.floor(rng(flakeColors.length))]
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    ctx.fillStyle = color
    ctx.globalAlpha = 0.75 + rng(0.25)
    ctx.fillRect(-w/2, -h/2, w, h)
    ctx.restore()
  }

  // Micro-speckle noise for texture
  ctx.globalAlpha = 1
  for (let i = 0; i < 8000; i++) {
    const v = 40 + Math.floor(rng(60))
    ctx.fillStyle = `rgba(${v},${v},${v},0.4)`
    ctx.fillRect(Math.floor(rng(size)), Math.floor(rng(size)), 1, 1)
  }

  // High-gloss sheen overlay (subtle bright reflection band)
  const sheen = ctx.createLinearGradient(0, 0, size, size)
  sheen.addColorStop(0, 'rgba(255,255,255,0.0)')
  sheen.addColorStop(0.35, 'rgba(255,255,255,0.05)')
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.08)')
  sheen.addColorStop(0.65, 'rgba(255,255,255,0.05)')
  sheen.addColorStop(1, 'rgba(255,255,255,0.0)')
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, size, size)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(6, 6)
  return tex
}

// ── Procedural cinderblock (CMU) texture ────────────────────────────────────
function makeCinderblockTexture(): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Mortar — slightly lighter than blocks
  ctx.fillStyle = '#8e8e8e'
  ctx.fillRect(0, 0, size, size)

  // CMU blocks are ~16"×8" — 2:1 ratio, taller than brick
  const bW = 96, bH = 48, m = 3
  const rng = (n: number) => Math.random() * n

  for (let row = 0; row < Math.ceil(size / bH) + 1; row++) {
    const offset = (row % 2) * (bW / 2)
    for (let col = -1; col < Math.ceil(size / bW) + 1; col++) {
      const x = col * bW + offset + m
      const y = row * bH + m
      const bw = bW - m
      const bh = bH - m

      // Block base — gray concrete tones
      const base = 115 + Math.floor(rng(22))
      ctx.fillStyle = `rgb(${base},${base},${base - 2})`
      ctx.fillRect(x, y, bw, bh)

      // Aggregate speckle noise inside each block
      for (let p = 0; p < 60; p++) {
        const px = x + rng(bw)
        const py = y + rng(bh)
        const pv = base - 12 + Math.floor(rng(24))
        ctx.fillStyle = `rgba(${pv},${pv},${pv},0.55)`
        ctx.fillRect(px, py, rng(3) + 1, rng(3) + 1)
      }

      // Characteristic CMU web divider line (center vertical crease)
      ctx.strokeStyle = `rgba(70,70,70,0.25)`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x + bw / 2, y + 2)
      ctx.lineTo(x + bw / 2, y + bh - 2)
      ctx.stroke()

      // Top face shadow
      ctx.fillStyle = 'rgba(0,0,0,0.08)'
      ctx.fillRect(x, y, bw, bh * 0.12)

      // Bottom highlight
      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      ctx.fillRect(x, y + bh * 0.88, bw, bh * 0.12)

      // Left edge shadow
      ctx.fillStyle = 'rgba(0,0,0,0.06)'
      ctx.fillRect(x, y, 3, bh)
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(4, 2)
  return tex
}

// ── Ceiling panel (dark industrial metal) ───────────────────────────────────
function makeCeilingTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(0, 0, size, size)
  // Panel lines
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 2
  for (let x = 0; x < size; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke()
  }
  for (let y = 0; y < size; y += 64) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(6, 6)
  return tex
}

// ── EXIT sign texture ───────────────────────────────────────────────────────
function makeExitSignTexture(): THREE.CanvasTexture {
  const w = 512
  const h = 192
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#08331f'
  ctx.fillRect(0, 0, w, h)

  ctx.lineWidth = 14
  ctx.strokeStyle = '#8af7be'
  ctx.strokeRect(7, 7, w - 14, h - 14)

  ctx.font = '900 122px Impact, Haettenschweiler, Arial Black, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#e9fff3'
  ctx.fillText('EXIT', w / 2, h / 2 + 6)

  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  return tex
}

// ── Graffiti logo decal texture ─────────────────────────────────────────────
function makeGraffitiLogoTexture(): THREE.CanvasTexture {
  const w = 1024
  const h = 512
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // Transparent background so only paint appears on the wall.
  ctx.clearRect(0, 0, w, h)

  const rng = (n: number) => Math.random() * n

  // Paint splatter backdrop.
  for (let i = 0; i < 180; i++) {
    const x = rng(w)
    const y = rng(h)
    const r = 4 + rng(16)
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = i % 3 === 0 ? 'rgba(26,232,118,0.26)' : i % 3 === 1 ? 'rgba(0,178,255,0.24)' : 'rgba(255,74,210,0.22)'
    ctx.fill()
  }

  // Shadow layer for chunky graffiti depth.
  const grad = ctx.createLinearGradient(180, 130, 840, 360)
  grad.addColorStop(0, '#00d07d')
  grad.addColorStop(0.45, '#2afff4')
  grad.addColorStop(1, '#3ea8ff')
  ctx.font = '900 220px Impact, Haettenschweiler, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(0,0,0,0.62)'
  ctx.fillText('MGWS', w / 2 + 10, h / 2 + 12)

  // Main fill with neon gradient.
  ctx.fillStyle = grad
  ctx.fillText('MGWS', w / 2, h / 2)

  // Bold black outline.
  ctx.lineWidth = 18
  ctx.strokeStyle = 'rgba(8,8,8,0.9)'
  ctx.strokeText('MGWS', w / 2, h / 2)

  // White highlight stroke to make it pop from distance.
  ctx.lineWidth = 6
  ctx.strokeStyle = 'rgba(255,255,255,0.65)'
  ctx.strokeText('MGWS', w / 2, h / 2)

  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

// ── Strip light fixture component ───────────────────────────────────────────
function CeilingLight({ x, z, roomH }: { x: number; z: number; roomH: number }) {
  return (
    <group position={[x, roomH - 0.06, z]}>
      {/* Housing */}
      <mesh castShadow={false}>
        <boxGeometry args={[0.35, 0.1, 3.6]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.6} metalness={0.5} />
      </mesh>
      {/* Glowing diffuser panel */}
      <mesh position={[0, -0.04, 0]}>
        <boxGeometry args={[0.28, 0.02, 3.4]} />
        <meshStandardMaterial
          color="#f0f4ff"
          emissive="#d8e8ff"
          emissiveIntensity={2.5}
          roughness={0.1}
          metalness={0}
        />
      </mesh>
      {/* Actual point light */}
      <pointLight
        position={[0, -0.3, 0]}
        intensity={0.9}
        distance={7}
        decay={2}
        color="#e8f0ff"
        castShadow={false}
      />
    </group>
  )
}

// ── Steel I-beam ceiling truss ───────────────────────────────────────────────
function CeilingBeam({ z, roomH, roomW }: { z: number; roomH: number; roomW: number }) {
  return (
    <group position={[0, roomH - 0.18, z]}>
      {/* Top flange */}
      <mesh>
        <boxGeometry args={[roomW, 0.06, 0.22]} />
        <meshStandardMaterial color="#333333" roughness={0.7} metalness={0.6} />
      </mesh>
      {/* Web */}
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[roomW, 0.34, 0.07]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.8} metalness={0.5} />
      </mesh>
      {/* Bottom flange */}
      <mesh position={[0, -0.38, 0]}>
        <boxGeometry args={[roomW, 0.06, 0.22]} />
        <meshStandardMaterial color="#333333" roughness={0.7} metalness={0.6} />
      </mesh>
    </group>
  )
}

// ── Rollup door on back wall ─────────────────────────────────────────────────
function RollupDoor({ wallZ }: { wallZ: number }) {
  const panelCount = 8
  const doorW = 3.2
  const doorH = 3.0
  const panelH = doorH / panelCount
  return (
    <group position={[1.2, 0, wallZ + 0.05]}>
      {/* Door frame */}
      <mesh position={[0, doorH / 2 + 0.08, 0]}>
        <boxGeometry args={[doorW + 0.18, 0.16, 0.12]} />
        <meshStandardMaterial color="#222" roughness={0.6} metalness={0.6} />
      </mesh>
      <mesh position={[-(doorW / 2 + 0.09), doorH / 2, 0]}>
        <boxGeometry args={[0.14, doorH, 0.12]} />
        <meshStandardMaterial color="#222" roughness={0.6} metalness={0.6} />
      </mesh>
      <mesh position={[doorW / 2 + 0.09, doorH / 2, 0]}>
        <boxGeometry args={[0.14, doorH, 0.12]} />
        <meshStandardMaterial color="#222" roughness={0.6} metalness={0.6} />
      </mesh>
      {/* Horizontal panels */}
      {Array.from({ length: panelCount }).map((_, i) => (
        <mesh key={i} position={[0, panelH * i + panelH / 2, 0]}>
          <boxGeometry args={[doorW, panelH - 0.025, 0.06]} />
          <meshStandardMaterial
            color={i % 2 === 0 ? '#b0b0b0' : '#a8a8a8'}
            roughness={0.45}
            metalness={0.55}
          />
        </mesh>
      ))}
    </group>
  )
}

// ── Shelving unit ────────────────────────────────────────────────────────────
function ShelfUnit({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {/* Frame uprights */}
      {[-0.85, 0.85].map((ox) => (
        <mesh key={ox} position={[ox, 1.5, 0]}>
          <boxGeometry args={[0.06, 3.0, 0.45]} />
          <meshStandardMaterial color="#555" roughness={0.8} metalness={0.5} />
        </mesh>
      ))}
      {/* Shelves */}
      {[0.45, 1.2, 1.95, 2.7].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[1.78, 0.04, 0.42]} />
          <meshStandardMaterial color="#666" roughness={0.75} metalness={0.4} />
        </mesh>
      ))}
      {/* Boxes on shelves */}
      {[0.55, 1.3, 2.05].map((y) => (
        <group key={y}>
          {[-0.45, 0, 0.45].map((bx) => (
            <mesh key={bx} position={[bx, y + 0.18, 0]} castShadow>
              <boxGeometry args={[0.38, 0.32, 0.36]} />
              <meshStandardMaterial
                color={['#c4a26a', '#b8915a', '#d4b07a'][Math.abs(Math.round(bx * 2)) % 3]}
                roughness={0.9}
                metalness={0}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

// ── Wall workbench + pegboard prop ─────────────────────────────────────────
function WallWorkbench({ x, z, rotY, width = 2.4 }: { x: number; z: number; rotY: number; width?: number }) {
  const legOffset = width / 2 - 0.12
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      {/* Bench top */}
      <mesh position={[0, 0.94, 0]} receiveShadow>
        <boxGeometry args={[width, 0.08, 0.72]} />
        <meshStandardMaterial color="#725b43" roughness={0.85} metalness={0.05} />
      </mesh>

      {/* Steel frame legs */}
      {[
        [-legOffset, 0.46, -0.28],
        [legOffset, 0.46, -0.28],
        [-legOffset, 0.46, 0.28],
        [legOffset, 0.46, 0.28],
      ].map(([lx, ly, lz], i) => (
        <mesh key={i} position={[lx, ly, lz]} castShadow>
          <boxGeometry args={[0.08, 0.9, 0.08]} />
          <meshStandardMaterial color="#3a3a3a" roughness={0.7} metalness={0.45} />
        </mesh>
      ))}

      {/* Lower shelf */}
      <mesh position={[0, 0.34, 0]}>
        <boxGeometry args={[width - 0.1, 0.04, 0.58]} />
        <meshStandardMaterial color="#4c4c4c" roughness={0.78} metalness={0.3} />
      </mesh>

      {/* Pegboard + light strip behind bench */}
      <mesh position={[0, 1.74, -0.42]}>
        <boxGeometry args={[width, 1.35, 0.05]} />
        <meshStandardMaterial color="#2e3438" roughness={0.88} metalness={0.15} />
      </mesh>
      <mesh position={[0, 2.34, -0.39]}>
        <boxGeometry args={[width - 0.15, 0.04, 0.04]} />
        <meshStandardMaterial color="#eff5ff" emissive="#dce9ff" emissiveIntensity={1.2} roughness={0.2} metalness={0} />
      </mesh>

      {/* Tool chest */}
      <mesh position={[0, 0.62, 0.12]} castShadow>
        <boxGeometry args={[0.82, 0.56, 0.36]} />
        <meshStandardMaterial color="#a32222" roughness={0.35} metalness={0.55} />
      </mesh>
    </group>
  )
}

// ── Wrap vinyl roll rack prop ──────────────────────────────────────────────
function WrapRollRack({ x, z, rotY }: { x: number; z: number; rotY: number }) {
  const rollColors = ['#f4f5f6', '#d9dde3', '#1f2024', '#d72b2b', '#1d4ca3', '#f1c51f']
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      {/* Rack frame */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[1.5, 2.0, 0.08]} />
        <meshStandardMaterial color="#2d3138" roughness={0.7} metalness={0.45} />
      </mesh>
      <mesh position={[0, 2.05, 0.02]} castShadow>
        <boxGeometry args={[1.58, 0.08, 0.14]} />
        <meshStandardMaterial color="#252a31" roughness={0.68} metalness={0.5} />
      </mesh>
      {/* Rolls hung on horizontal spindles */}
      {[-0.58, -0.2, 0.18, 0.56].map((rx, i) => (
        <group key={i} position={[rx, 1.1, 0.06]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.16, 0.16, 0.24, 24]} />
            <meshStandardMaterial color={rollColors[i % rollColors.length]} roughness={0.5} metalness={0.05} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.25, 16]} />
            <meshStandardMaterial color="#d8dbe0" roughness={0.35} metalness={0.22} />
          </mesh>
          <mesh position={[0, -0.33, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 0.24, 20]} />
            <meshStandardMaterial color={rollColors[(i + 2) % rollColors.length]} roughness={0.48} metalness={0.05} />
          </mesh>
          <mesh position={[0, -0.33, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.25, 16]} />
            <meshStandardMaterial color="#d8dbe0" roughness={0.35} metalness={0.22} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ── Main garage room ─────────────────────────────────────────────────────────
export function GarageRoom() {
  const epoxyTexture = useMemo(() => makeEpoxyFloorTexture(), [])
  const cinderblockTexture = useMemo(() => makeCinderblockTexture(), [])
  const ceilingTexture = useMemo(() => makeCeilingTexture(), [])
  const exitSignTexture = useMemo(() => makeExitSignTexture(), [])
  const graffitiLogoTexture = useMemo(() => makeGraffitiLogoTexture(), [])
  const customDecals = useEditorStore((state) => state.project.customDecals)
  const latestCustomLogoUrl = customDecals[0]?.imageUrl ?? null
  const wallLogoTexture = useMemo(() => {
    if (!latestCustomLogoUrl) {
      return null
    }
    const tex = new THREE.TextureLoader().load(latestCustomLogoUrl)
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.needsUpdate = true
    return tex
  }, [latestCustomLogoUrl])

  const W = 22   // room width
  const D = 22   // room depth
  const H = 5.8  // room height
  const wallLogoWidth = 14.8
  const wallLogoHeight = 6.1

  return (
    <group>
      {/* ── Floor — reflective epoxy with color-flake texture ── */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        receiveShadow
        userData={{ isFloor: true }}
      >
        <planeGeometry args={[W, D]} />
        <MeshReflectorMaterial
          map={epoxyTexture}
          mirror={0.65}
          roughness={0.18}
          depthScale={1.2}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          color="#3a3a3a"
          metalness={0.0}
          resolution={1024}
          mixBlur={4}
          mixStrength={0.9}
          blur={[300, 100]}
        />
      </mesh>

      {/* ── Back wall (behind car) — cinderblock ── */}
      <mesh position={[0, H / 2, -D / 2]} receiveShadow>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial
          map={cinderblockTexture}
          color="#a8a8a8"
          roughness={0.95}
          metalness={0}
        />
      </mesh>

      {/* ── Left wall — cinderblock ── */}
      <mesh position={[-W / 2, H / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[D, H]} />
        <meshStandardMaterial
          map={cinderblockTexture}
          color="#a0a0a0"
          roughness={0.95}
          metalness={0}
        />
      </mesh>
      {/* Graffiti logo decal on camera-facing back wall */}
      <mesh position={[-5.2, 2.25, -D / 2 + 0.03]}>
        <planeGeometry args={[wallLogoWidth, wallLogoHeight]} />
        <meshBasicMaterial
          map={wallLogoTexture ?? graffitiLogoTexture}
          color="#ffffff"
          transparent
          alphaTest={0}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {/* ── Right wall — cinderblock ── */}
      <mesh position={[W / 2, H / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[D, H]} />
        <meshStandardMaterial
          map={cinderblockTexture}
          color="#a0a0a0"
          roughness={0.95}
          metalness={0}
        />
      </mesh>
      {/* Same logo decal on right wall */}
      <mesh position={[W / 2 - 0.03, 2.25, -2.2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[wallLogoWidth, wallLogoHeight]} />
        <meshBasicMaterial
          map={wallLogoTexture ?? graffitiLogoTexture}
          color="#ffffff"
          transparent
          alphaTest={0}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {/* ── Front wall — cinderblock (no windows) ── */}
      {/* Left panel — full height, covers x=-11 to x=0 */}
      <mesh position={[-5.5, H / 2, D / 2]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[11, H]} />
        <meshStandardMaterial map={cinderblockTexture} color="#9a9a9a" roughness={0.95} metalness={0} />
      </mesh>
      {/* Right panel — full height, covers x=0 to x=11 */}
      <mesh position={[5.5, H / 2, D / 2]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[11, H]} />
        <meshStandardMaterial map={cinderblockTexture} color="#9a9a9a" roughness={0.95} metalness={0} />
      </mesh>

      {/* ── Mezzanine office platform (right side) ── */}
      <mesh position={[7.5, 2.8, D / 2 - 2.5]} receiveShadow>
        <boxGeometry args={[7, 0.18, 5]} />
        <meshStandardMaterial color="#3a3028" roughness={0.85} metalness={0.1} />
      </mesh>
      <mesh position={[7.5, 2.7, D / 2 - 2.5]}>
        <boxGeometry args={[7, 0.06, 5]} />
        <meshStandardMaterial color="#222" roughness={0.9} metalness={0} />
      </mesh>

      {/* Office enclosure walls on top of mezzanine (flush with platform edges) */}
      {/* Rear wall */}
      <mesh position={[7.5, 4.0, D / 2 - 4.94]}>
        <boxGeometry args={[6.9, 2.2, 0.12]} />
        <meshStandardMaterial map={cinderblockTexture} color="#9a9a9a" roughness={0.95} metalness={0} />
      </mesh>
      {/* Left side wall — split around stair door opening (z ≈ D/2-0.8, 1.0 wide) */}
      {/* Bulk of wall behind door */}
      <mesh position={[4.06, 4.0, D / 2 - 3.125]}>
        <boxGeometry args={[0.12, 2.2, 3.65]} />
        <meshStandardMaterial map={cinderblockTexture} color="#969696" roughness={0.95} metalness={0} />
      </mesh>
      {/* Thin strip in front of door */}
      <mesh position={[4.06, 4.0, D / 2 - 0.175]}>
        <boxGeometry args={[0.12, 2.2, 0.25]} />
        <meshStandardMaterial map={cinderblockTexture} color="#969696" roughness={0.95} metalness={0} />
      </mesh>
      {/* Panel above door opening */}
      <mesh position={[4.06, 4.95, D / 2 - 0.8]}>
        <boxGeometry args={[0.12, 0.3, 1.0]} />
        <meshStandardMaterial map={cinderblockTexture} color="#969696" roughness={0.95} metalness={0} />
      </mesh>
      {/* Stair door — hinged at left side (opens inward) */}
      <mesh position={[4.1, 3.8, D / 2 - 0.8]}>
        <boxGeometry args={[0.06, 2.0, 1.0]} />
        <meshStandardMaterial color="#2a2018" roughness={0.8} metalness={0.05} />
      </mesh>
      {/* Door frame */}
      <mesh position={[4.06, 3.8, D / 2 - 1.32]}><boxGeometry args={[0.1, 2.06, 0.06]} /><meshStandardMaterial color="#1e1a12" roughness={0.7} metalness={0.1} /></mesh>
      <mesh position={[4.06, 3.8, D / 2 - 0.28]}><boxGeometry args={[0.1, 2.06, 0.06]} /><meshStandardMaterial color="#1e1a12" roughness={0.7} metalness={0.1} /></mesh>
      <mesh position={[4.06, 4.82, D / 2 - 0.8]}><boxGeometry args={[0.1, 0.06, 1.1]} /><meshStandardMaterial color="#1e1a12" roughness={0.7} metalness={0.1} /></mesh>
      {/* Door knob */}
      <mesh position={[4.18, 3.8, D / 2 - 1.18]}>
        <sphereGeometry args={[0.04, 8, 6]} />
        <meshStandardMaterial color="#888" roughness={0.2} metalness={0.9} />
      </mesh>

      {/* Right side wall (no windows) */}
      <mesh position={[10.94, 4.0, D / 2 - 2.5]}>
        <boxGeometry args={[0.12, 2.2, 4.9]} />
        <meshStandardMaterial map={cinderblockTexture} color="#969696" roughness={0.95} metalness={0} />
      </mesh>
      {/* Office ceiling */}
      <mesh position={[7.5, 5.12, D / 2 - 2.5]}>
        <boxGeometry args={[6.9, 0.12, 4.9]} />
        <meshStandardMaterial color="#242424" roughness={0.95} metalness={0.05} />
      </mesh>
      {[[5.5, D/2 - 0.2], [9.5, D/2 - 0.2], [5.5, D/2 - 4.8], [9.5, D/2 - 4.8]].map(([px, pz], i) => (
        <mesh key={i} position={[px, 1.4, pz]}>
          <boxGeometry args={[0.18, 2.8, 0.18]} />
          <meshStandardMaterial color="#333" roughness={0.7} metalness={0.5} />
        </mesh>
      ))}
      {/* Safety railing front edge */}
      <mesh position={[7.5, 3.22, D / 2 - 0.05]}>
        <boxGeometry args={[7, 0.06, 0.06]} />
        <meshStandardMaterial color="#444" roughness={0.6} metalness={0.6} />
      </mesh>
      {[-2.8, -0.9, 0.9, 2.8].map((ox, i) => (
        <mesh key={i} position={[7.5 + ox, 3.05, D / 2 - 0.05]}>
          <boxGeometry args={[0.05, 0.52, 0.05]} />
          <meshStandardMaterial color="#444" roughness={0.6} metalness={0.6} />
        </mesh>
      ))}
      {/* Office door */}
      <mesh position={[4.5, 3.22, D / 2 - 0.08]} rotation={[0, Math.PI, 0]}>
        <boxGeometry args={[1.0, 2.2, 0.08]} />
        <meshStandardMaterial color="#2a2018" roughness={0.8} metalness={0.05} />
      </mesh>
      {/* Office interior glow */}
      <pointLight position={[7.5, 3.8, D / 2 - 2.6]} intensity={0.6} distance={5} decay={2} color="#f0e8c8" />

      {/* ── Staircase (rotated 90° — now runs along X axis beside mezzanine) ── */}
      {/* Pivot-rotate-unpivot around the top-landing attach point so all child
          positions stay unchanged while the whole assembly turns 90° CCW. */}
      <group position={[4.1, 0, D / 2 - 0.62]}>
        <group rotation={[0, Math.PI / 2, 0]}>
          <group position={[-4.1, 0, -(D / 2 - 0.62)]}>
            {Array.from({ length: 12 }).map((_, i) => {
              const stepH = 2.8 / 12
              const stepD = 2.4 / 12
              return (
                <mesh key={i} position={[4.1, stepH * i + stepH / 2, D / 2 - 3.2 + stepD * i]} receiveShadow>
                  <boxGeometry args={[1.7, stepH, stepD + 0.03]} />
                  <meshStandardMaterial color="#2f2f35" roughness={0.85} metalness={0.15} />
                </mesh>
              )
            })}
            {/* Top landing */}
            <mesh position={[4.2, 2.86, D / 2 - 0.62]} receiveShadow>
              <boxGeometry args={[2.0, 0.12, 1.25]} />
              <meshStandardMaterial color="#2f2f35" roughness={0.85} metalness={0.15} />
            </mesh>
            {/* Stair stringers */}
            <mesh position={[4.97, 1.45, D / 2 - 2.0]} rotation={[-Math.atan2(2.8, 2.4), 0, 0]}>
              <boxGeometry args={[0.06, 0.06, 3.1]} />
              <meshStandardMaterial color="#333" roughness={0.7} metalness={0.5} />
            </mesh>
            <mesh position={[3.23, 1.45, D / 2 - 2.0]} rotation={[-Math.atan2(2.8, 2.4), 0, 0]}>
              <boxGeometry args={[0.06, 0.06, 3.1]} />
              <meshStandardMaterial color="#333" roughness={0.7} metalness={0.5} />
            </mesh>
            {/* Stair rail posts */}
            {Array.from({ length: 5 }).map((_, i) => {
              const t = i / 4
              const y = 0.25 + t * 2.6
              const z = D / 2 - 3.1 + t * 2.35
              return (
                <mesh key={i} position={[4.95, y, z]}>
                  <boxGeometry args={[0.05, 0.5, 0.05]} />
                  <meshStandardMaterial color="#4a4a4a" roughness={0.55} metalness={0.55} />
                </mesh>
              )
            })}
            {/* Stair top rail */}
            <mesh position={[4.95, 1.75, D / 2 - 1.9]} rotation={[-Math.atan2(2.8, 2.4), 0, 0]}>
              <boxGeometry args={[0.04, 0.04, 2.7]} />
              <meshStandardMaterial color="#4a4a4a" roughness={0.55} metalness={0.55} />
            </mesh>
          </group>
        </group>
      </group>

      {/* ── Ceiling ── */}
      <mesh position={[0, H, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial
          map={ceilingTexture}
          color="#1c1c1c"
          roughness={1}
          metalness={0.1}
        />
      </mesh>

      {/* ── Ceiling beams ── */}
      {[-5, -1, 3, 7].map((z) => (
        <CeilingBeam key={z} z={z} roomH={H} roomW={W} />
      ))}

      {/* ── Longitudinal center beam ── */}
      <group position={[0, H - 0.18, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <boxGeometry args={[D, 0.06, 0.22]} />
          <meshStandardMaterial color="#333333" roughness={0.7} metalness={0.6} />
        </mesh>
        <mesh position={[0, -0.2, 0]}>
          <boxGeometry args={[D, 0.34, 0.07]} />
          <meshStandardMaterial color="#2a2a2a" roughness={0.8} metalness={0.5} />
        </mesh>
        <mesh position={[0, -0.38, 0]}>
          <boxGeometry args={[D, 0.06, 0.22]} />
          <meshStandardMaterial color="#333333" roughness={0.7} metalness={0.6} />
        </mesh>
      </group>

      {/* ── Ceiling strip lights ── */}
      {[-4.5, 0, 4.5].map((x) =>
        [-4, 2].map((z) => (
          <CeilingLight key={`${x}-${z}`} x={x} z={z} roomH={H} />
        ))
      )}

      {/* ── Rollup door ── */}
      <RollupDoor wallZ={-D / 2} />

      {/* EXIT sign above garage door */}
      <group position={[1.2, 3.55, -D / 2 + 0.12]}>
        <mesh>
          <boxGeometry args={[1.9, 0.74, 0.07]} />
          <meshStandardMaterial color="#111" roughness={0.5} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0, 0.04]}>
          <planeGeometry args={[1.74, 0.62]} />
          <meshBasicMaterial map={exitSignTexture} toneMapped={false} transparent />
        </mesh>
        <pointLight position={[0, 0, 0.25]} intensity={0.18} distance={3.5} color="#a2ffd1" />
      </group>

      {/* ── Shelving on left wall ── */}
      <ShelfUnit x={-W / 2 + 1.1} z={-3} />

      {/* ── Wall work tables / shop props ── */}
      <WallWorkbench x={-W / 2 + 1.25} z={1.8} rotY={Math.PI / 2} width={2.6} />
      <WrapRollRack x={-W / 2 + 1.18} z={4.2} rotY={Math.PI / 2} />

      {/* Random prop cluster: right wall tires + cone + crate */}
      <group position={[W / 2 - 1.1, 0, 3.0]} rotation={[0, -Math.PI / 2, 0]}>
        {[0, 0.24, 0.48].map((y, i) => (
          <mesh key={i} position={[-0.28, y + 0.12, -0.06]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.24, 0.24, 0.14, 20]} />
            <meshStandardMaterial color="#1e1e1e" roughness={0.86} metalness={0.08} />
          </mesh>
        ))}
        <mesh position={[0.05, 0.12, -0.06]}>
          <boxGeometry args={[0.34, 0.24, 0.34]} />
          <meshStandardMaterial color="#7b613f" roughness={0.88} metalness={0.04} />
        </mesh>
        <mesh position={[0.36, 0.18, 0.1]}>
          <coneGeometry args={[0.11, 0.36, 14]} />
          <meshStandardMaterial color="#f47d20" roughness={0.5} metalness={0.05} />
        </mesh>
      </group>

      {/* Random prop cluster: front wall rolling cart + drums */}
      <group position={[-2.6, 0, D / 2 - 1.0]} rotation={[0, Math.PI, 0]}>
        <mesh position={[0, 0.52, -0.22]} castShadow>
          <boxGeometry args={[1.25, 0.92, 0.52]} />
          <meshStandardMaterial color="#2f3944" roughness={0.45} metalness={0.58} />
        </mesh>
        {[[-0.48, 0.08, -0.38], [0.48, 0.08, -0.38], [-0.48, 0.08, -0.06], [0.48, 0.08, -0.06]].map(([x, y, z], i) => (
          <mesh key={i} position={[x as number, y as number, z as number]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.06, 14]} />
            <meshStandardMaterial color="#101010" roughness={0.82} metalness={0.15} />
          </mesh>
        ))}
        <mesh position={[-0.78, 0.34, 0.08]} rotation={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.68, 18]} />
          <meshStandardMaterial color="#1e5aa9" roughness={0.58} metalness={0.3} />
        </mesh>
        <mesh position={[-0.5, 0.3, 0.1]} rotation={[0, -0.22, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.6, 18]} />
          <meshStandardMaterial color="#a12b2b" roughness={0.6} metalness={0.26} />
        </mesh>
      </group>

      {/* ── Floor drain strip ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 1]}>
        <planeGeometry args={[0.08, D * 0.6]} />
        <meshStandardMaterial color="#555" roughness={0.6} metalness={0.5} />
      </mesh>

      {/* ── Base cove — where floor meets walls (darker strip) ── */}
      {[
        { pos: [0, 0.06, -D / 2 + 0.02] as [number,number,number], rot: [0, 0, 0] as [number,number,number], w: W },
        { pos: [-W / 2 + 0.02, 0.06, 0] as [number,number,number], rot: [0, Math.PI / 2, 0] as [number,number,number], w: D },
        { pos: [W / 2 - 0.02, 0.06, 0] as [number,number,number], rot: [0, -Math.PI / 2, 0] as [number,number,number], w: D },
      ].map(({ pos, rot, w }, i) => (
        <mesh key={i} position={pos} rotation={rot}>
          <planeGeometry args={[w, 0.12]} />
          <meshStandardMaterial color="#222" roughness={0.9} metalness={0.1} />
        </mesh>
      ))}

      {/* ── Structural corner columns ── */}
      {[
        [-W / 2 + 0.15, -D / 2 + 0.15],
        [W / 2 - 0.15, -D / 2 + 0.15],
        [-W / 2 + 0.15, D / 2 - 0.15],
        [W / 2 - 0.15, D / 2 - 0.15],
      ].map(([cx, cz], i) => (
        <mesh key={i} position={[cx, H / 2, cz]} castShadow receiveShadow>
          <boxGeometry args={[0.3, H, 0.3]} />
          <meshStandardMaterial color="#555" roughness={0.85} metalness={0.3} />
        </mesh>
      ))}
    </group>
  )
}
