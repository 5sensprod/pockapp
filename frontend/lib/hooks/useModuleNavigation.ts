import { findSidebarItemByPath } from '@/lib/sidebar-navigation'
import { setLastRouteForModule } from '@/lib/stores/moduleNavigationStore'
import { allModules } from '@/modules/_registry'
import { useLocation } from '@tanstack/react-router'
import { useEffect } from 'react'

const IGNORED_ROUTES = ['/login', '/setup', '/']

const normalizePath = (path: string) => (path || '/').replace(/\/+$/, '') || '/'

function getModuleIdFromPath(pathname: string): string | null {
	for (const m of allModules) {
		// Les alias comptent : le module `stock` a pour route `/stock/produits`,
		// si bien que `/stock/marques` ne serait rattaché à AUCUN module et que
		// rien n'y serait mémorisé.
		const bases = [m.route, ...(m.aliases ?? [])]
		for (const base of bases) {
			if (!base || base === '/') continue
			if (pathname === base || pathname.startsWith(`${base}/`)) {
				return m.id
			}
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

		const module = allModules.find((m) => m.id === moduleId)
		if (!module) return

		// La route racine du module ne devient pas SA dernière route (évite les
		// boucles de redirection : `/cash` relit cette clé pour rediriger).
		const estRacineDuModule =
			location.pathname === module.route ||
			location.pathname === `${module.route}/`

		if (!estRacineDuModule) {
			setLastRouteForModule(moduleId, location.pathname)
		}

		// Sauvegarde uniquement dans la section la plus précise. Par exemple,
		// `/stats/especes` ne doit jamais devenir la dernière route de `/stats`.
		//
		// ⚠️ Cette sauvegarde-là se fait MÊME sur la racine du module, et c'est
		// tout l'objet du correctif : trois modules ont pour racine une page de
		// liste qui est AUSSI une entrée de la barre latérale — `stock`
		// (`/stock/produits`), `stats` (`/stats`) et `stick` (`/stick`). Le
		// retour tôt d'avant faisait qu'y revenir n'écrasait jamais la clé de
		// section : la fiche produit ouverte auparavant restait la « dernière
		// vue », et le clic sur « Catalogue produits » y ramenait alors que
		// l'utilisateur avait bel et bien fini sur la table.
		const matchedItem = findSidebarItemByPath(
			module.sidebarMenu ?? [],
			location.pathname,
		)?.item
		if (matchedItem) {
			const sectionPath = normalizePath(matchedItem.to)
			setLastRouteForModule(`${moduleId}:${sectionPath}`, location.pathname)
		}
	}, [location.pathname])
}
