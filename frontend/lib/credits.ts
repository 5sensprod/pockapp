// frontend/lib/pocketapp-credits.ts
// Hook pour récupérer le solde de crédits depuis le SaaS PocketApp
// La clé API est chargée depuis PocketBase local (app_settings)
// via GET /api/settings/pocketapp-key

import { useCallback, useEffect, useRef, useState } from 'react'

const POCKETAPP_URL = 'https://pocketapp.5sensprod.com'
const REFRESH_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export interface PocketAppCredits {
	balanceEur: number
	loading: boolean
	error: string | null
	lastUpdated: Date | null
	refresh: () => void
}

// Récupère la clé API depuis PocketBase local
async function loadApiKey(): Promise<string> {
	try {
		const res = await fetch('/api/settings/pocketapp-key')
		if (!res.ok) return ''
		const data = await res.json()
		return data.api_key ?? ''
	} catch {
		return ''
	}
}

export function usePocketAppCredits(): PocketAppCredits {
	const [balanceEur, setBalanceEur] = useState<number>(0)
	const [loading, setLoading] = useState<boolean>(true)
	const [error, setError] = useState<string | null>(null)
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
	const apiKeyRef = useRef<string>('')

	const fetchBalance = useCallback(async () => {
		// Charger la clé si pas encore en mémoire
		if (!apiKeyRef.current) {
			apiKeyRef.current = await loadApiKey()
		}

		if (!apiKeyRef.current) {
			setError('Clé API PocketApp non configurée')
			setLoading(false)
			return
		}

		try {
			setLoading(true)
			setError(null)

			const res = await fetch(`${POCKETAPP_URL}/api/usage.php?balance=1`, {
				method: 'GET',
				headers: {
					'X-API-Key': apiKeyRef.current,
				},
			})

			if (!res.ok) throw new Error(`HTTP ${res.status}`)

			const data = await res.json()
			setBalanceEur(Number.parseFloat(String(data.balance_eur ?? 0)))
			setLastUpdated(new Date())
		} catch (err: any) {
			setError(err.message ?? 'Erreur réseau')
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchBalance()
		intervalRef.current = setInterval(fetchBalance, REFRESH_INTERVAL_MS)
		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current)
		}
	}, [fetchBalance])

	return { balanceEur, loading, error, lastUpdated, refresh: fetchBalance }
}
