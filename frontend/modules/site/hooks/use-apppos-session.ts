// frontend/modules/site/hooks/use-apppos-session.ts
// ═══════════════════════════════════════════════════════════════════════════
// SESSION APPPOS DU MODULE SITE
// ═══════════════════════════════════════════════════════════════════════════
// L'éditeur lit les destinations chez AppPos, qui exige un jeton Bearer. Or
// **rien n'authentifie AppPos au démarrage de l'application** : chacune des
// neuf pages qui en ont besoin refait sa propre connexion dans un `useEffect`
// (useStockModule.ts:47, CashTerminalPage.tsx:272, et sept pages de `connect`).
// Le jeton vit ensuite en sessionStorage (apppos-api.ts:20), ce qui donne
// l'illusion que tout marche — dès lors qu'on est passé par une de ces pages
// d'abord.
//
// Sans ce hook, le module site héritait de ce hasard : ouvrir PocketSite en
// premier affichait des identifiants bruts au lieu des noms de catégories.
// Il fait donc ici ce que les neuf autres font chez elles.
//
// Ce n'est pas la bonne place et on le sait : cette connexion a vocation à
// être faite une fois au lancement. Voir « Laissé ouvert par le ticket 4 »
// dans PocketSite-docs/README.md. En attendant, ce hook est une dixième copie
// assumée plutôt qu'une dépendance à l'ordre de navigation.
// ═══════════════════════════════════════════════════════════════════════════

import { getAppPosToken, loginToAppPos } from '@/lib/apppos'
import { useEffect, useState } from 'react'

/** Mêmes variables d'environnement que le module stock
 *  (useStockModule.ts:23). Les huit autres appelants écrivent le couple en
 *  dur dans leur source ; on ne reprend pas cette habitude. */
const CREDENTIALS = {
	username: import.meta.env.VITE_APPPOS_USERNAME ?? '',
	password: import.meta.env.VITE_APPPOS_PASSWORD ?? '',
}

export interface AppPosSession {
	/** Vrai dès qu'un jeton est disponible, qu'il vienne d'ici ou d'ailleurs. */
	isConnected: boolean
	isConnecting: boolean
	error: string | null
}

/**
 * Assure qu'un jeton AppPos existe.
 *
 * Ne bloque rien : l'éditeur de menu reste pleinement utilisable sans AppPos.
 * Seuls les *noms* des destinations manquent — le menu, lui, vit dans
 * PocketBase et ne dépend pas d'AppPos.
 */
export function useAppPosSession(): AppPosSession {
	const [isConnected, setIsConnected] = useState(() => !!getAppPosToken())
	const [isConnecting, setIsConnecting] = useState(() => !getAppPosToken())
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		// Un autre écran a déjà ouvert la session : on ne la rouvre pas.
		if (getAppPosToken()) {
			setIsConnected(true)
			setIsConnecting(false)
			return
		}

		let cancelled = false

		const connect = async () => {
			try {
				const res = await loginToAppPos(
					CREDENTIALS.username,
					CREDENTIALS.password,
				)
				if (cancelled) return
				if (res.success && res.token) setIsConnected(true)
				else throw new Error('Identifiants AppPos refusés')
			} catch (e) {
				if (cancelled) return
				setError(e instanceof Error ? e.message : 'AppPos injoignable')
				setIsConnected(false)
			} finally {
				if (!cancelled) setIsConnecting(false)
			}
		}

		void connect()

		// Le composant peut être démonté avant la fin de la requête — changer
		// d'onglet suffit. Sans ce garde-fou, React se plaint d'un état posé
		// après démontage.
		return () => {
			cancelled = true
		}
	}, [])

	return { isConnected, isConnecting, error }
}
