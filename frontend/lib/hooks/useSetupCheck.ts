import { useLocation, useNavigate } from '@tanstack/react-router'
// frontend/lib/hooks/useSetupCheck.ts
import { useEffect, useState } from 'react'

export function useSetupCheck() {
	const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
	const [loading, setLoading] = useState(true)
	const navigate = useNavigate()
	const { pathname } = useLocation()

	useEffect(() => {
		// Ne vérifie que si on n'est pas déjà sur /setup ou /login
		if (pathname === '/setup' || pathname === '/login') {
			setLoading(false)
			return
		}

		const checkSetup = async () => {
			try {
				const response = await fetch('/api/setup/status')
				const data = await response.json()

				console.log('Setup status:', data) // Debug
				setNeedsSetup(data.needsSetup)

				// Si setup nécessaire, redirige vers /setup
				if (data.needsSetup) {
					navigate({ to: '/setup' })
				}
			} catch (error) {
				console.error('Erreur lors de la vérification du setup:', error)
			} finally {
				setLoading(false)
			}
		}

		checkSetup()
	}, [pathname, navigate])

	return { needsSetup, loading }
}
