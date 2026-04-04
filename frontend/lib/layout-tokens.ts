// frontend/lib/layout-tokens.ts
//
// Miroir TypeScript des variables CSS définies dans index.css.
// Utiliser ces constantes dans le JS/TSX partout où une valeur
// de layout doit être lue (animations, calculs de position, portails…).
//
// ⚠️ Si tu modifies une valeur dans index.css → mettre à jour ici aussi.
//    Les deux fichiers constituent la source de vérité du layout.
//
// Usage :
//   import { LAYOUT } from '@/lib/layout-tokens'
//   style={{ top: LAYOUT.HEADER_H }}
//   className={`mt-[${LAYOUT.HEADER_H}]`}   ← éviter, préférer les classes Tailwind
//   const offset = LAYOUT.RAIL_W_PX + LAYOUT.PANEL_W_PX

// ─── Dimensions en pixels (pour les calculs numériques) ────────────────────
export const LAYOUT = {
	// Hauteurs
	HEADER_H: 56, // px — Header global
	SUBHEADER_H: 72, // px — Sub-header ModulePageShell

	// Sidebar
	RAIL_W: 56, // px — Rail d'icônes (3.5rem)
	PANEL_W: 256, // px — Panneau déplié (16rem)
	SIDEBAR_OPEN_W: 56 + 256, // px — Rail + panneau = 312px

	// ── Strings CSS pour usage direct dans style={} ─────────────────────────
	// Préférer les classes Tailwind (h-header, w-rail…) quand c'est possible.
	HEADER_H_CSS: 'var(--header-h)',
	SUBHEADER_H_CSS: 'var(--subheader-h)',
	RAIL_W_CSS: 'var(--rail-w)',
	PANEL_W_CSS: 'var(--panel-w)',
	SIDEBAR_OPEN_W_CSS: 'var(--sidebar-open-w)',
} as const

// ─── Breakpoints (doivent correspondre à tailwind.config.cjs > screens) ────
export const BREAKPOINTS = {
	MOBILE: 375,
	TABLET: 768,
	DESKTOP: 1024,
} as const

// ─── Hook utilitaire ────────────────────────────────────────────────────────
// Lit les variables CSS à l'exécution (utile si elles changent dynamiquement
// via JS — cas rares, mais prévu pour les futures animations de resize).
export function getLayoutVar(name: keyof typeof LAYOUT): string {
	if (typeof window === 'undefined') return ''
	return getComputedStyle(document.documentElement)
		.getPropertyValue(`--${name.toLowerCase().replace(/_/g, '-')}`)
		.trim()
}
