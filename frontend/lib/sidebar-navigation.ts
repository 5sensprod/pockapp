import type { SidebarGroup, SidebarMenuItem } from '@/modules/_registry'

/** Retourne l'entrée dont la route est la correspondance la plus précise. */
export function findSidebarItemByPath(
	groups: SidebarGroup[],
	pathname: string,
): { group: SidebarGroup; item: SidebarMenuItem } | undefined {
	const path = (pathname || '/').replace(/\/+$/, '') || '/'
	let bestMatch:
		| { group: SidebarGroup; item: SidebarMenuItem; pathLength: number }
		| undefined

	for (const group of groups) {
		for (const item of group.items ?? []) {
			const itemPath = (item.to || '/').replace(/\/+$/, '') || '/'
			const matches = path === itemPath || path.startsWith(`${itemPath}/`)
			if (matches && itemPath.length > (bestMatch?.pathLength ?? -1)) {
				bestMatch = { group, item, pathLength: itemPath.length }
			}
		}
	}

	return bestMatch
}

/** Retourne le groupe dont la route est la correspondance la plus précise. */
export function findSidebarGroupByPath(
	groups: SidebarGroup[],
	pathname: string,
): SidebarGroup | undefined {
	return findSidebarItemByPath(groups, pathname)?.group
}
