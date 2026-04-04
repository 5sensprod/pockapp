// frontend/lib/hooks/useBreakpoint.ts
//
// Détecte le mode d'affichage courant en fonction des breakpoints Stitch.
// Source unique de vérité pour toute décision responsive dans les composants.
//
// Breakpoints (définis dans tailwind.config.cjs > screens et BREAKPOINTS) :
//   mobile  : < 768px  → sidebar cachée, bottom nav, drawer sheet
//   tablet  : 768–1023px → rail visible, panel en overlay
//   desktop : ≥ 1024px  → rail + panel pushent le contenu
//
// Usage :
//   const { isMobile, isTablet, isDesktop, mode } = useBreakpoint()
//
//   if (isMobile)  → afficher bottom nav, cacher sidebar
//   if (isTablet)  → panel en overlay (pas de push)
//   if (isDesktop) → comportement actuel (push)

import { BREAKPOINTS } from '@/lib/layout-tokens'
import { useEffect, useState } from 'react'

export type BreakpointMode = 'mobile' | 'tablet' | 'desktop'

interface BreakpointState {
	mode: BreakpointMode
	isMobile: boolean
	isTablet: boolean
	isDesktop: boolean
	/** Vrai sur tablet ET desktop — "la sidebar rail est visible" */
	hasSidebarRail: boolean
	/** Vrai uniquement sur desktop — "le panel peut pousser le contenu" */
	canPushContent: boolean
}

function getMode(width: number): BreakpointMode {
	if (width < BREAKPOINTS.TABLET) return 'mobile'
	if (width < BREAKPOINTS.DESKTOP) return 'tablet'
	return 'desktop'
}

function buildState(mode: BreakpointMode): BreakpointState {
	return {
		mode,
		isMobile: mode === 'mobile',
		isTablet: mode === 'tablet',
		isDesktop: mode === 'desktop',
		hasSidebarRail: mode === 'tablet' || mode === 'desktop',
		canPushContent: mode === 'desktop',
	}
}

// SSR-safe : on suppose desktop par défaut côté serveur
const SSR_DEFAULT = buildState('desktop')

export function useBreakpoint(): BreakpointState {
	const [state, setState] = useState<BreakpointState>(() => {
		if (typeof window === 'undefined') return SSR_DEFAULT
		return buildState(getMode(window.innerWidth))
	})

	useEffect(() => {
		// matchMedia est plus performant que resize (pas de reflow)
		const mqlTablet = window.matchMedia(`(min-width: ${BREAKPOINTS.TABLET}px)`)
		const mqlDesktop = window.matchMedia(
			`(min-width: ${BREAKPOINTS.DESKTOP}px)`,
		)

		const update = () => {
			setState(buildState(getMode(window.innerWidth)))
		}

		mqlTablet.addEventListener('change', update)
		mqlDesktop.addEventListener('change', update)

		// Synchronisation initiale (cas hydratation SSR)
		update()

		return () => {
			mqlTablet.removeEventListener('change', update)
			mqlDesktop.removeEventListener('change', update)
		}
	}, [])

	return state
}
