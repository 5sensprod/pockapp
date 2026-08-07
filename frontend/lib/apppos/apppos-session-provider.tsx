// frontend/lib/apppos/apppos-session-provider.tsx
// ═══════════════════════════════════════════════════════════════════════════
// POINT D'AUTHENTIFICATION UNIQUE À APPPOS
// ═══════════════════════════════════════════════════════════════════════════
// Avant ce fichier, rien n'authentifiait AppPos au lancement : chacune des neuf
// pages qui en dépendent rouvrait sa propre session dans un `useEffect`
// (useStockModule.ts:55, CashTerminalPage.tsx:272, sept pages de `connect`).
// Le jeton vivant en sessionStorage (apppos-api.ts:84-87), tout marchait — à
// condition d'être passé par une de ces pages d'abord. Ouvrir un écran qui n'en
// faisait pas partie donnait des données incomplètes, selon l'ordre de
// navigation.
//
// Ce provider ouvre la session une fois, au montage de l'application. Les neuf
// appelants restent en place : leur garde `getAppPosToken()` les rend
// inoffensifs dès qu'une session existe en amont, et deux d'entre eux sont dans
// la caisse, qu'on ne touche pas sans raison.
//
// **Il ne bloque rien.** AppPos éteint est un cas normal, pas une panne : le
// provider rend ses enfants immédiatement et met son contexte à jour quand la
// requête retombe, réussie ou non. Il est monté au-dessus d'AuthProvider dans
// main.tsx, donc la requête part au lancement, sans attendre l'authentification
// PocketBase et sans peser sur le `loading` de celle-ci.
//
// Pas de nouvelle sortie réseau : AppPos est le point 2 de CLAUDE.md.
// ═══════════════════════════════════════════════════════════════════════════

import {
	type ReactNode,
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
} from 'react'
import { getAppPosToken, loginToAppPos } from './apppos-api'

/** Les identifiants viennent de l'environnement, comme le font déjà `stock` et
 *  `site`. Huit des neuf appelants historiques écrivent le couple en dur dans
 *  leur source et l'expédient dans le bundle — problème réel, ticket à part ;
 *  on ne propage pas l'habitude ici. */
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

const AppPosSessionContext = createContext<AppPosSession>({
	isConnected: false,
	isConnecting: false,
	error: null,
})

export function AppPosSessionProvider({ children }: { children: ReactNode }) {
	const [isConnected, setIsConnected] = useState(() => !!getAppPosToken())
	const [isConnecting, setIsConnecting] = useState(() => !getAppPosToken())
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		// Un jeton a survécu au rechargement en sessionStorage : rien à refaire.
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
				// Rien n'est signalé à l'utilisateur ici : AppPos éteint est un état
				// normal, et c'est à chaque écran de décider ce qu'il en dit.
				setError(e instanceof Error ? e.message : 'AppPos injoignable')
				setIsConnected(false)
			} finally {
				if (!cancelled) setIsConnecting(false)
			}
		}

		void connect()

		// StrictMode monte deux fois en dev ; sans ce garde-fou le premier montage
		// pose son état après démontage.
		return () => {
			cancelled = true
		}
	}, [])

	const value = useMemo(
		() => ({ isConnected, isConnecting, error }),
		[isConnected, isConnecting, error],
	)

	return (
		<AppPosSessionContext.Provider value={value}>
			{children}
		</AppPosSessionContext.Provider>
	)
}

/**
 * État de la session AppPos ouverte au lancement.
 *
 * N'ouvre aucune connexion : c'est une lecture. Un écran qui a besoin d'AppPos
 * s'en sert pour savoir s'il peut lire le catalogue, et pour dire proprement
 * qu'il ne peut pas.
 */
export function useAppPosSession(): AppPosSession {
	return useContext(AppPosSessionContext)
}
