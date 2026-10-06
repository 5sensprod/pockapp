// frontend/lib/credits.ts
// Hook pour récupérer le solde de crédits du SaaS PocketApp.
// Le solde est lu par le Go (GET /api/credits/balance), qui pose lui-même la
// clé : elle ne descend jamais dans le renderer. Jusqu'au 6 octobre 2026 ce
// fichier la demandait à GET /api/settings/pocketapp-key, qui la rendait
// déchiffrée sans aucune garde — route supprimée, ne pas la réintroduire.

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePocketBase } from './use-pocketbase'

const ROUTE_SOLDE = '/api/credits/balance'
const REFRESH_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export interface PocketAppCredits {
	balanceEur: number
	loading: boolean
	error: string | null
	lastUpdated: Date | null
	refresh: () => void
}

// Le solde ne se relit que toutes les 5 minutes : ce qui vient de consommer des
// crédits hors de l'en-tête (le détourage de PocketStick) demande ici à le relire.
const ecouteursSolde = new Set<() => void>()

export function rafraichirCreditsPocketApp(): void {
	for (const relire of ecouteursSolde) relire()
}

export function usePocketAppCredits(): PocketAppCredits {
	const [balanceEur, setBalanceEur] = useState<number>(0)
	const [loading, setLoading] = useState<boolean>(true)
	const [error, setError] = useState<string | null>(null)
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
	const pb = usePocketBase()

	const fetchBalance = useCallback(async () => {
		try {
			setLoading(true)
			setError(null)

			const data = (await pb.send(ROUTE_SOLDE, {
				method: 'GET',
				requestKey: null,
			})) as {
				configured?: boolean
				balance_eur?: number
			}

			if (!data.configured) {
				setError('Clé API PocketApp non configurée')
				return
			}

			setBalanceEur(Number.parseFloat(String(data.balance_eur ?? 0)))
			setLastUpdated(new Date())
		} catch (err: any) {
			setError(err.message ?? 'Erreur réseau')
		} finally {
			setLoading(false)
		}
	}, [pb])

	useEffect(() => {
		fetchBalance()
		intervalRef.current = setInterval(fetchBalance, REFRESH_INTERVAL_MS)
		ecouteursSolde.add(fetchBalance)
		return () => {
			ecouteursSolde.delete(fetchBalance)
			if (intervalRef.current) clearInterval(intervalRef.current)
		}
	}, [fetchBalance])

	return { balanceEur, loading, error, lastUpdated, refresh: fetchBalance }
}
