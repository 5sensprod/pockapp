import { setLastRouteForModule } from '@/lib/stores/moduleNavigationStore'
import { allModules } from '@/modules/_registry'
import { useLocation } from '@tanstack/react-router'
import { useEffect } from 'react'

const IGNORED_ROUTES = ['/login', '/setup', '/']

function getModuleIdFromPath(pathname: string): string | null {
	for (const m of allModules) {
		if (pathname === m.route || pathname.startsWith(`${m.route}/`)) {
			return m.id
		}
	}
	return null
}

export function useSaveModuleRoute() {
	const location = useLocation()
	useEffect(() => {
		if (IGNORED_ROUTES.includes(location.pathname)) return
		const moduleId = getModuleIdFromPath(location.pathname)
		if (!moduleId) return

		// ✅ Ne pas sauvegarder la route racine du module (évite les boucles)
		const module = allModules.find((m) => m.id === moduleId)
		if (
			!module ||
			location.pathname === module.route ||
			location.pathname === `${module.route}/`
		)
			return

		setLastRouteForModule(moduleId, location.pathname)
	}, [location.pathname])
}
