import { usePocketBase } from '@/lib/use-pocketbase'
// frontend/lib/queries/companies.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface CompanyDto {
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
	default_payment_method?: string
	invoice_footer?: string
	invoice_prefix?: string
}

export interface CompaniesListOptions {
	filter?: string
	sort?: string
	expand?: string
	[key: string]: unknown
}

// 📋 Liste des entreprises
export function useCompanies(options: CompaniesListOptions = {}) {
	const pb = usePocketBase() as any

	return useQuery({
		queryKey: ['companies', options],
		queryFn: async () => {
			return await pb.collection('companies').getList(1, 50, {
				sort: 'name',
				expand: '',
				...options,
			})
		},
	})
}

// 👤 Détails d'une entreprise
export function useCompany(companyId?: string) {
	const pb = usePocketBase() as any

	return useQuery({
		queryKey: ['companies', companyId],
		queryFn: async () => {
			if (!companyId) throw new Error('companyId is required')
			return await pb.collection('companies').getOne(companyId, {
				expand: '',
			})
		},
		enabled: !!companyId,
	})
}

// ➕ Créer une entreprise
export function useCreateCompany() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: CompanyDto) => {
			return await pb.collection('companies').create(data)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['companies'] })
		},
	})
}

// ✏️ Modifier une entreprise
export function useUpdateCompany() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			data,
		}: { id: string; data: Partial<CompanyDto> }) => {
			return await pb.collection('companies').update(id, data)
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ['companies'] })
			queryClient.invalidateQueries({ queryKey: ['companies', variables.id] })
		},
	})
}

// 🗑️ Supprimer une entreprise
export function useDeleteCompany() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (companyId: string) => {
			return await pb.collection('companies').delete(companyId)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['companies'] })
		},
	})
}

// ⭐ Définir une entreprise active
export function useSetActiveCompany() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: async (companyId: string) => {
			// 1) Récupérer toutes les entreprises actives
			const currentlyActive = await pb.collection('companies').getFullList({
				filter: 'active = true',
			})
			// 2) Les désactiver (sauf celle qu'on veut activer)
			await Promise.all(
				currentlyActive
					.filter((c: any) => c.id !== companyId)
					.map((c: any) =>
						pb.collection('companies').update(c.id, { active: false }),
					),
			)
			// 3) Activer celle cliquée
			return await pb.collection('companies').update(companyId, {
				active: true,
			})
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['companies'] })
			queryClient.invalidateQueries({ queryKey: ['products'] }) // ⭐ AJOUTE CETTE LIGNE
		},
	})
}
