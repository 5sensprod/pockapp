// frontend/lib/queries/companies.ts
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface Company {
	id: string
	name: string
	trade_name?: string
	logo?: string
	active?: boolean
	is_default?: boolean
	siren?: string
	siret?: string
	vat_number?: string
	legal_form?: string
	rcs?: string
	ape_naf?: string
	share_capital?: number
	address_line1?: string
	address_line2?: string
	zip_code?: string
	city?: string
	country?: string
	phone?: string
	email?: string
	website?: string
	bank_name?: string
	iban?: string
	bic?: string
	account_holder?: string
	default_payment_terms_days?: number
	default_payment_method?: 'virement' | 'cb' | 'especes' | 'cheque' | 'autre'
	invoice_footer?: string
	invoice_prefix?: string
	created?: string
	updated?: string
	is_first?: boolean // Marqueur pour la première entreprise (non supprimable)
}

export interface CompanyDto {
	name: string
	trade_name?: string
	active?: boolean
	is_default?: boolean
	email?: string
	phone?: string
	website?: string
	address_line1?: string
	address_line2?: string
	zip_code?: string
	city?: string
	country?: string
	siren?: string
	siret?: string
	vat_number?: string
	legal_form?: string
	rcs?: string
	ape_naf?: string
	share_capital?: number
	bank_name?: string
	iban?: string
	bic?: string
	account_holder?: string
	default_payment_terms_days?: number
	default_payment_method?: 'virement' | 'cb' | 'especes' | 'cheque' | 'autre'
	invoice_footer?: string
	invoice_prefix?: string
}

// Helper pour les requêtes authentifiées (via PocketBase authStore)
async function fetchWithAuth(
	pbToken: string | null | undefined,
	url: string,
	options: RequestInit = {},
) {
	const headers = new Headers(options.headers)
	headers.set('Content-Type', 'application/json')
	if (pbToken) {
		headers.set('Authorization', `Bearer ${pbToken}`)
	}

	const response = await fetch(url, { ...options, headers })

	if (!response.ok) {
		const error = await response
			.json()
			.catch(() => ({ error: 'Erreur inconnue' }))
		throw new Error(error.error || 'Erreur de requête')
	}

	return response.json()
}

// 📋 Liste des entreprises (admin only)
export function useCompanies(options: { enabled?: boolean } = {}) {
	const { enabled = true } = options
	const pb = usePocketBase()
	const token = pb.authStore.token

	return useQuery({
		queryKey: ['companies'],
		queryFn: async () =>
			(await fetchWithAuth(token, '/api/companies')) as Company[],
		enabled,
	})
}

// 📦 Détails d'une entreprise (admin only)
export function useCompany(companyId?: string) {
	const pb = usePocketBase()
	const token = pb.authStore.token

	return useQuery({
		queryKey: ['companies', companyId],
		queryFn: async () => {
			if (!companyId) throw new Error('companyId is required')
			return (await fetchWithAuth(
				token,
				`/api/companies/${companyId}`,
			)) as Company
		},
		enabled: !!companyId,
	})
}

// ➕ Créer une entreprise (admin only)
export function useCreateCompany() {
	const pb = usePocketBase()
	const token = pb.authStore.token
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: CompanyDto) => {
			return await fetchWithAuth(token, '/api/companies', {
				method: 'POST',
				body: JSON.stringify(data),
			})
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['companies'] })
		},
		onError: (error) => {
			console.error('❌ Create company error:', error)
		},
	})
}

// ✏️ Modifier une entreprise (admin only)
export function useUpdateCompany() {
	const pb = usePocketBase()
	const token = pb.authStore.token
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			data,
		}: { id: string; data: Partial<CompanyDto> }) => {
			return await fetchWithAuth(token, `/api/companies/${id}`, {
				method: 'PATCH',
				body: JSON.stringify(data),
			})
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ['companies'] })
			queryClient.invalidateQueries({ queryKey: ['companies', variables.id] })
		},
		onError: (error) => {
			console.error('❌ Update company error:', error)
		},
	})
}

// 🗑️ Supprimer une entreprise (admin only, sauf la première)
export function useDeleteCompany() {
	const pb = usePocketBase()
	const token = pb.authStore.token
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (companyId: string) => {
			return await fetchWithAuth(token, `/api/companies/${companyId}`, {
				method: 'DELETE',
			})
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['companies'] })
		},
		onError: (error) => {
			console.error('❌ Delete company error:', error)
		},
	})
}
