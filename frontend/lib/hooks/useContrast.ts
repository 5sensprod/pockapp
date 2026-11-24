// frontend/lib/hooks/useContrast.ts
// Mode « contraste renforcé » : les utilisateurs trouvent l'écran trop clair.
// La classe `contrast` est posée sur <html> ; ses variables sont dans
// `styles/index.css`. Le choix est gardé sur le poste (localStorage, protégé :
// il peut être indisponible).

import { useCallback, useEffect, useState } from 'react'

const CLE = 'pocketapp:contraste'
const CLASSE = 'contrast'

function lire(): boolean {
	try {
		return window.localStorage.getItem(CLE) === '1'
	} catch {
		return false
	}
}

function appliquer(actif: boolean) {
	document.documentElement.classList.toggle(CLASSE, actif)
}

/** À appeler une fois au démarrage, avant le premier rendu, pour éviter l'éclair clair. */
export function appliquerContrasteMemorise() {
	appliquer(lire())
}

export function useContrast() {
	const [actif, setActif] = useState<boolean>(lire)

	useEffect(() => {
		appliquer(actif)
	}, [actif])

	const basculer = useCallback(() => {
		setActif((precedent) => {
			const suivant = !precedent
			try {
				window.localStorage.setItem(CLE, suivant ? '1' : '0')
			} catch {
				// Sans stockage, le choix vaut pour la session seulement.
			}
			return suivant
		})
	}, [])

	return { actif, basculer }
}
