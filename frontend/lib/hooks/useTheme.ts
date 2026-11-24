// frontend/lib/hooks/useTheme.ts
// Menu de thèmes : Clair, Sombre et trois thèmes CONTRASTÉS (les utilisateurs
// trouvaient l'écran trop clair). Le thème est une classe sur <html> — `dark`
// pour Sombre, `theme-*` pour un contrasté, rien pour Clair ; leurs variables
// sont dans `styles/index.css`. Le choix est gardé sur le poste (localStorage,
// protégé : il peut être indisponible).

import { useCallback, useEffect, useState } from 'react'

export type ThemeId = 'clair' | 'sombre' | 'indigo' | 'bleu' | 'vert'

export const THEMES: { id: ThemeId; label: string; pastille: string }[] = [
	{ id: 'clair', label: 'Clair', pastille: '#f4f4ff' },
	{ id: 'sombre', label: 'Sombre', pastille: '#030712' },
	{ id: 'indigo', label: 'Indigo contrasté', pastille: '#2e2275' },
	{ id: 'bleu', label: 'Bleu nuit contrasté', pastille: '#0e3d82' },
	{ id: 'vert', label: 'Vert sapin contrasté', pastille: '#146b3a' },
]

const CLE = 'pocketapp:theme'
/** Ancienne clé du bouton « Contraste » : '1' devient le thème indigo. */
const ANCIENNE_CLE = 'pocketapp:contraste'
const CLASSES_THEME = ['theme-indigo', 'theme-bleu', 'theme-vert'] as const

function estTheme(v: unknown): v is ThemeId {
	return THEMES.some((t) => t.id === v)
}

function lire(): ThemeId {
	try {
		const v = window.localStorage.getItem(CLE)
		if (estTheme(v)) return v
		// Migration unique de l'ancien interrupteur.
		if (window.localStorage.getItem(ANCIENNE_CLE) === '1') {
			window.localStorage.setItem(CLE, 'indigo')
			window.localStorage.removeItem(ANCIENNE_CLE)
			return 'indigo'
		}
	} catch {
		// Stockage indisponible : thème clair.
	}
	return 'clair'
}

function appliquer(theme: ThemeId) {
	const classes = document.documentElement.classList
	classes.remove('dark', ...CLASSES_THEME)
	if (theme === 'sombre') classes.add('dark')
	else if (theme !== 'clair') classes.add(`theme-${theme}`)
}

/** À appeler une fois au démarrage, avant le premier rendu, pour éviter l'éclair clair. */
export function appliquerThemeMemorise() {
	appliquer(lire())
}

export function useTheme() {
	const [theme, setThemeState] = useState<ThemeId>(lire)

	useEffect(() => {
		appliquer(theme)
	}, [theme])

	const setTheme = useCallback((suivant: ThemeId) => {
		try {
			window.localStorage.setItem(CLE, suivant)
		} catch {
			// Sans stockage, le choix vaut pour la session seulement.
		}
		setThemeState(suivant)
	}, [])

	return { theme, setTheme }
}
