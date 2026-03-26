// frontend/lib/stores/moduleNavigationStore.ts
const lastRouteByModule: Record<string, string> = {}

export function setLastRouteForModule(moduleId: string, route: string) {
	lastRouteByModule[moduleId] = route
}

export function getLastRouteForModule(moduleId: string): string | undefined {
	return lastRouteByModule[moduleId]
}

// ✅ NOUVEAU
export function clearLastRouteForModule(moduleId: string) {
	delete lastRouteByModule[moduleId]
}
