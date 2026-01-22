// frontend/lib/queries/payment-methods.ts
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

interface PaymentMethod {
	id: string
	company: string
	code: string
	name: string
	description: string
	type: 'default' | 'custom'
	accounting_category: 'cash' | 'card' | 'check' | 'transfer' | 'other'
	enabled: boolean
	requires_session: boolean
	icon: string
	color: string
	text_color: string
	display_order: number
	created: string
	updated: string
}

interface PaymentMethodInput {
	code: string
	name: string
	description?: string
	accounting_category: 'cash' | 'card' | 'check' | 'transfer' | 'other'
	enabled: boolean
	requires_session: boolean
	icon?: string
	color?: string
	text_color?: string
	display_order?: number
}

/**
 * Hook pour gérer les moyens de paiement d'une company
 */
export function usePaymentMethods(companyId: string | undefined | null) {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	// Récupérer la liste des moyens
	const { data: paymentMethods, isLoading } = useQuery({
		queryKey: ['payment-methods', companyId],
		queryFn: async () => {
			if (!companyId) return []

			const response = await fetch(
				`/api/payment-methods?company_id=${companyId}`,
				{
					headers: {
						Authorization: pb.authStore.token,
					},
				},
			)

			if (!response.ok) {
				throw new Error('Erreur récupération moyens de paiement')
			}

			return response.json() as Promise<PaymentMethod[]>
		},
		enabled: !!companyId,
	})

	// Créer un moyen custom
	const createMethod = useMutation({
		mutationFn: async (data: PaymentMethodInput) => {
			const response = await fetch(
				`/api/payment-methods?company_id=${companyId}`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: pb.authStore.token,
					},
					body: JSON.stringify(data),
				},
			)

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.message || 'Erreur création')
			}

			return response.json()
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ['payment-methods', companyId],
			})
		},
	})

	// Mettre à jour un moyen
	const updateMethod = useMutation({
		mutationFn: async ({
			id,
			data,
		}: { id: string; data: Partial<PaymentMethodInput> }) => {
			const response = await fetch(`/api/payment-methods/${id}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					Authorization: pb.authStore.token,
				},
				body: JSON.stringify(data),
			})

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.message || 'Erreur mise à jour')
			}

			return response.json()
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ['payment-methods', companyId],
			})
		},
	})

	// Supprimer un moyen custom
	const deleteMethod = useMutation({
		mutationFn: async (id: string) => {
			const response = await fetch(`/api/payment-methods/${id}`, {
				method: 'DELETE',
				headers: {
					Authorization: pb.authStore.token,
				},
			})

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.message || 'Erreur suppression')
			}

			return response.json()
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ['payment-methods', companyId],
			})
		},
	})

	// Toggle activé/désactivé
	const toggleMethod = useMutation({
		mutationFn: async (id: string) => {
			const response = await fetch(`/api/payment-methods/${id}/toggle`, {
				method: 'POST',
				headers: {
					Authorization: pb.authStore.token,
				},
			})

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.message || 'Erreur toggle')
			}

			return response.json()
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ['payment-methods', companyId],
			})
		},
	})

	return {
		paymentMethods,
		isLoading,
		createMethod,
		updateMethod,
		deleteMethod,
		toggleMethod,
	}
}
