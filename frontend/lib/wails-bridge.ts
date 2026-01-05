// frontend/src/lib/wails-bridge.ts
export const isWails = (): boolean =>
	typeof window !== 'undefined' &&
	!!(window as any).runtime &&
	!!(window as any).go

export const tryWails = async <T>(
	fn: () => Promise<T>,
	fallback: T,
): Promise<T> => {
	if (!isWails()) return fallback
	try {
		return await fn()
	} catch {
		return fallback
	}
}

export const tryWailsVoid = async (fn: () => Promise<any>) => {
	if (!isWails()) return
	try {
		await fn()
	} catch {
		// silent
	}
}

export const tryWailsSub = (
	subscribe: () => (() => void) | undefined,
): (() => void) => {
	if (!isWails()) return () => {}

	try {
		return subscribe() ?? (() => {})
	} catch {
		return () => {}
	}
}
