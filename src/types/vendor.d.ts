declare module 'clipper-lib'
declare module 'opentype.js'

interface Window {
	__MYGARAGE_PERF__?: Array<{
		event: string
		atMs: number
		detail?: Record<string, string | number | boolean | null | undefined>
	}>
}
