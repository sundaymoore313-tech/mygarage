declare module 'clipper-lib'
declare module 'opentype.js'
declare const __APP_BUILD_ID__: string

interface Window {
	__MYGARAGE_PERF__?: Array<{
		event: string
		atMs: number
		detail?: Record<string, string | number | boolean | null | undefined>
	}>
}
