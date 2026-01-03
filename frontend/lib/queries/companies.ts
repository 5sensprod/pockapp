// frontend/lib/queries/companies.ts
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface Company {
	id: string
	collectionId: string
	collectionName: string
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
	is_first?: boolean
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

// 📋 Liste des entreprises
export function useCompanies(options: { enabled?: boolean } = {}) {
	const { enabled = true } = options
	const pb = usePocketBase()

	return useQuery({
		queryKey: ['companies'],
		queryFn: async () => {
			const records = await pb.collection('companies').getFullList<Company>({
				sort: '+created',
			})

			// Marquer la première entreprise (non supprimable)
			if (records.length > 0) {
				const firstId = records[0].id
				return records.map((r) => ({ ...r, is_first: r.id === firstId }))
			}

			return records
		},
		enabled,
	})
}

// 📦 Détails d'une entreprise
export function useCompany(companyId?: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: ['companies', companyId],
		queryFn: async () => {
			if (!companyId) throw new Error('companyId is required')
			return await pb.collection('companies').getOne<Company>(companyId)
		},
		enabled: !!companyId,
	})
}

// ➕ Créer une entreprise
export function useCreateCompany() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: CompanyDto & { logo?: File | null }) => {
			const formData = new FormData()

			for (const [key, value] of Object.entries(data)) {
				if (key === 'logo') continue
				if (value !== undefined && value !== null && value !== '') {
					formData.append(key, String(value))
				}
			}

			if (data.logo instanceof File) {
				formData.append('logo', data.logo)
			}

			return await pb.collection('companies').create<Company>(formData)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['companies'] })
		},
	})
}

// ✏️ Modifier une entreprise
export function useUpdateCompany() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			data,
		}: {
			id: string
			data: Partial<CompanyDto> & { logo?: File | null; removeLogo?: boolean }
		}) => {
			const formData = new FormData()
			const { logo, removeLogo, ...rest } = data

			for (const [key, value] of Object.entries(rest)) {
				if (value === undefined) continue

				if (typeof value === 'boolean') {
					formData.append(key, value ? 'true' : 'false')
				} else if (typeof value === 'number') {
					formData.append(key, String(value))
				} else if (value === null || value === '') {
					formData.append(key, '')
				} else {
					formData.append(key, String(value))
				}
			}

			// Gestion du logo
			if (removeLogo) {
				formData.append('logo', '')
			} else if (logo instanceof File) {
				formData.append('logo', logo)
			}

			return await pb.collection('companies').update<Company>(id, formData)
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ['companies'] })
			queryClient.invalidateQueries({ queryKey: ['companies', variables.id] })
		},
	})
}

// 🗑️ Supprimer une entreprise
export function useDeleteCompany() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (companyId: string) => {
			const companies = await pb.collection('companies').getFullList({
				sort: '+created',
				fields: 'id',
			})

			if (companies.length > 0 && companies[0].id === companyId) {
				throw new Error(
					"Impossible de supprimer l'entreprise principale (première créée)",
				)
			}

			return await pb.collection('companies').delete(companyId)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['companies'] })
		},
	})
}

// 🖼️ Helper pour obtenir l'URL du logo
// ✅ Utilise une URL relative qui sera proxiée par Wails vers PocketBase
export function getLogoUrl(
	_pb: ReturnType<typeof usePocketBase>,
	company: Company,
): string | null {
	if (!company.logo) {
		return null
	}

	// URL relative - Wails proxy vers PocketBase sur /api/*
	const collectionIdOrName =
		company.collectionId || company.collectionName || 'companies'
	return `/api/files/${collectionIdOrName}/${company.id}/${company.logo}`
}
