// frontend/lib/apppos/apppos-hooks-websocket.ts
// Hook React pour gérer les événements WebSocket AppPOS

import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { AppPosProduct } from './apppos-types'
import { appPosWebSocket } from './apppos-websocket'

/**
 * Hook pour écouter les mises à jour de stock en temps réel
 *
 * @example
 * ```tsx
 * // Dans CashTerminalPage.tsx
 * useAppPosStockUpdates({ enabled: isAppPosConnected })
 * ```
 */
export function useAppPosStockUpdates(
	options: {
		enabled?: boolean
		onStockUpdate?: (productId: string, newStock: number) => void
	} = {},
) {
	const { enabled = true, onStockUpdate } = options
	const queryClient = useQueryClient()

	useEffect(() => {
		if (!enabled) {
			console.log('🔕 [AppPOS Stock] Écoute désactivée')
			return
		}

		console.log('🔔 [AppPOS Stock] Activation écoute mises à jour')

		// Connexion WebSocket
		appPosWebSocket.connect()

		// S'abonner aux événements
		const unsubscribe = appPosWebSocket.subscribe((event) => {
			if (event.type === 'stock.updated') {
				const { productId, newStock, productName, previousStock } = event.data

				console.log('🔍 [DEBUG] Event reçu:', event)
				console.log('🔍 [DEBUG] productId:', productId)
				console.log('🔍 [DEBUG] newStock:', newStock)

				console.log(
					`📦 [Stock Update] ${productName}: ${previousStock} → ${newStock}`,
				)
				// ✅ Mettre à jour le cache React Query

				// 1. Mettre à jour le catalogue complet
				queryClient.setQueryData(
					['apppos', 'products', 'catalog'],
					(oldData: { items: AppPosProduct[] } | undefined) => {
						if (!oldData) return oldData

						return {
							...oldData,
							items: oldData.items.map((product) =>
								product._id === productId
									? { ...product, stock: newStock }
									: product,
							),
						}
					},
				)

				// 2. Mettre à jour le produit individuel (si en cache)
				queryClient.setQueryData(
					['apppos', 'products', 'catalog'],
					(oldData: { items: AppPosProduct[] } | undefined) => {
						// ✅ AJOUTER CE LOG
						console.log('🔍 [DEBUG] oldData:', oldData)
						console.log('🔍 [DEBUG] Recherche productId:', productId)

						if (!oldData) return oldData

						const updatedItems = oldData.items.map((product) => {
							// ✅ AJOUTER CE LOG
							console.log(
								'🔍 [DEBUG] Comparaison:',
								product._id,
								'===',
								productId,
								'?',
								product._id === productId,
							)

							return product._id === productId
								? { ...product, stock: newStock }
								: product
						})

						// ✅ AJOUTER CE LOG
						console.log(
							'🔍 [DEBUG] Items mis à jour:',
							updatedItems.filter((p) => p._id === productId),
						)

						return {
							...oldData,
							items: updatedItems,
						}
					},
				)

				// 3. Invalider les requêtes pour forcer un refresh si nécessaire
				queryClient.invalidateQueries({
					queryKey: ['apppos', 'products'],
					refetchType: 'none', // Ne pas refetch, juste marquer comme stale
				})

				console.log('✅ [Cache] Produit mis à jour dans le cache React Query')

				// 4. Callback optionnel
				onStockUpdate?.(productId, newStock)
			}
		})

		// Cleanup : déconnexion au démontage
		return () => {
			console.log('🔕 [AppPOS Stock] Désactivation écoute')
			unsubscribe()
			// Note : on ne déconnecte pas le WebSocket ici car d'autres composants peuvent l'utiliser
		}
	}, [enabled, queryClient, onStockUpdate])

	return {
		isConnected: appPosWebSocket.isConnected(),
	}
}
