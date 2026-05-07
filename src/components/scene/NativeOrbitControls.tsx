import { OrbitControls } from '@react-three/drei'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

type NativeOrbitControlsProps = React.ComponentProps<typeof OrbitControls>

export type NativeOrbitControlsHandle = OrbitControlsImpl

export const NativeOrbitControls = forwardRef<NativeOrbitControlsHandle, NativeOrbitControlsProps>(
  function NativeOrbitControls(props, ref) {
    const innerRef = useRef<OrbitControlsImpl | null>(null)

    useImperativeHandle(ref, () => innerRef.current as OrbitControlsImpl, [])

    return <OrbitControls ref={innerRef} {...props} />
  },
)
