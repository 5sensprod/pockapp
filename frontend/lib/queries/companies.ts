import type { CompaniesResponse } from '@/lib/pocketbase-types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface CompanyDto {
	name: string
	trade_name?: string
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

export interface UseCompaniesOptions {
	enabled?: boolean
}

// 📋 Liste des entreprises
export function useCompanies(options: UseCompaniesOptions = {}) {
	const pb = usePocketBase()
	const { enabled = true } = options

	return useQuery({
		queryKey: ['companies'],
		queryFn: async () => {
			return await pb.collection('companies').getFullList<CompaniesResponse>({
				sort: '-created',
			})
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
			return await pb
				.collection('companies')
				.getOne<CompaniesResponse>(companyId)
		},
		enabled: !!companyId,
	})
}

// ➕ Créer une entreprise (avec support fichier)
// ➕ Créer une entreprise (avec support fichier)
export function useCreateCompany() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: CompanyDto & { logo?: File | null }) => {
			const formData = new FormData()

			// Champs texte
			for (const [key, value] of Object.entries(data)) {
				if (key === 'logo') continue
				if (value !== undefined && value !== null && value !== '') {
					formData.append(key, String(value))
				}
			}

			// Fichier logo
			if (data.logo instanceof File) {
				formData.append('logo', data.logo)
			}

			// Debug : voir ce qui part
			console.log('🧪 [create] FormData :')
			for (const [key, value] of formData.entries()) {
				if (value instanceof File) {
					console.log(`  ${key}: File(${value.name}, ${value.type})`)
				} else {
					console.log(`  ${key}: ${value}`)
				}
			}

			return await pb
				.collection('companies')
				.create<CompaniesResponse>(formData)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['companies'] })
		},
	})
}

// ✏️ Modifier une entreprise (avec support fichier)
// ✏️ Modifier une entreprise (avec support fichier)
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

			// Champs texte
			for (const [key, value] of Object.entries(rest)) {
				if (value !== undefined && value !== null) {
					formData.append(key, value === '' ? '' : String(value))
				}
			}

			// Gestion du logo
			if (removeLogo) {
				// string vide = effacement du fichier dans PB
				formData.append('logo', '')
			} else if (logo instanceof File) {
				formData.append('logo', logo)
			}

			// Debug
			console.log('🧪 [update] FormData :')
			for (const [key, value] of formData.entries()) {
				if (value instanceof File) {
					console.log(`  ${key}: File(${value.name}, ${value.type})`)
				} else {
					console.log(`  ${key}: ${value}`)
				}
			}

			return await pb
				.collection('companies')
				.update<CompaniesResponse>(id, formData)
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
			return await pb.collection('companies').delete(companyId)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['companies'] })
		},
	})
}

// 🖼️ Helper pour obtenir l'URL du logo
export function getLogoUrl(
	pb: ReturnType<typeof usePocketBase>,
	company: CompaniesResponse,
): string | null {
	if (!company.logo) return null
	return pb.files.getUrl(company, company.logo)
}
