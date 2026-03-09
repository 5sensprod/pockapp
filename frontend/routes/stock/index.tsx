import { useAuth } from '@/modules/auth/AuthProvider'
import { StockPage } from '@/modules/stock'
// frontend/routes/stock/index.tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/stock/')({
	component: StockRoute,
})

function StockRoute() {
	const { user } = useAuth()
	const navigate = useNavigate()
	const userRole = (user as any)?.role ?? 'user'
	const isUser = userRole === 'user'

	useEffect(() => {
		if (isUser) {
			navigate({ to: '/inventory-apppos' })
		}
	}, [isUser, navigate])

	// Évite un flash du StockPage avant la redirection
	if (isUser) return null

	return <StockPage />
}
