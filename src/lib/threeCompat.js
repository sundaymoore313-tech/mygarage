// Vite aliases bare "three" imports to this file so we can centralize compatibility tweaks.
// Re-export from the canonical ESM entry to avoid import loops with the alias itself.
export * from 'three/src/Three.js'
import * as THREE from 'three/src/Three.js'

// three@0.184 emits a Clock deprecation warning from upstream internals used by r3f.
// Keep the console clean by filtering only this specific warning.
if (typeof console !== 'undefined' && !globalThis.__mygarageThreeWarnPatchApplied) {
	const originalWarn = console.warn.bind(console)
	console.warn = (...args) => {
		if (
			typeof args[0] === 'string' &&
			args[0].includes('THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.')
		) {
			return
		}
		originalWarn(...args)
	}
	globalThis.__mygarageThreeWarnPatchApplied = true
}

export default THREE
