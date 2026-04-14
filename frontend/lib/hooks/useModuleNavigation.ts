import { setLastRouteForModule } from '@/lib/stores/moduleNavigationStore'
import { allModules } from '@/modules/_registry'
import { useLocation } from '@tanstack/react-router'
import { useEffect } from 'react'

const IGNORED_ROUTES = ['/login', '/setup', '/']

const normalizePath = (path: string) => (path || '/').replace(/\/+$/, '') || '/'

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

		// Sauvegarde par module (comportement existant)
		setLastRouteForModule(moduleId, location.pathname)

		// Sauvegarde par section (clé = moduleId:sectionPath)
		// Permet à la sidebar de restaurer la bonne page par section cliquée
		for (const group of module.sidebarMenu ?? []) {
			for (const item of group.items ?? []) {
				const sectionPath = normalizePath(item.to)
				if (location.pathname.startsWith(sectionPath)) {
					setLastRouteForModule(`${moduleId}:${sectionPath}`, location.pathname)
				}
			}
		}
	}, [location.pathname])
}
