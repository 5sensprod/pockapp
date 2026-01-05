// frontend/wails-env.d.ts
export {}

declare global {
	interface Window {
		go?: Record<string, any>
		runtime?: Record<string, any>
	}
}
