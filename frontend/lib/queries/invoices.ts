import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ============================================================================
// TYPES
// ============================================================================

export interface InvoiceItemDto {
	product_id?: string
	name: string
	quantity: number
	unit_price_ht: number
	tva_rate: number
	total_ht: number
	total_ttc: number
}

export interface InvoiceDto {
	number: string
	date: string
	customer: string
	owner_company: string
	status: 'draft' | 'sent' | 'paid' | 'cancelled'
	due_date?: string
	total_ht: number
	total_tva: number
	total_ttc: number
	currency: string
	items: InvoiceItemDto[]
	notes?: string
	payment_method?: 'virement' | 'cb' | 'especes' | 'cheque' | 'autre'
	paid_at?: string
}

export interface InvoiceResponse extends InvoiceDto {
	id: string
	created: string
	updated: string
	expand?: {
		customer?: {
			id: string
			name: string
			email?: string
			phone?: string
			address?: string
			company?: string
		}
	}
}

export interface InvoicesListOptions {
	companyId?: string
	customerId?: string
	status?: string
	filter?: string
	sort?: string
	[key: string]: unknown
}

// ============================================================================
// HOOKS
// ============================================================================

// 📋 Liste des factures
export function useInvoices(options: InvoicesListOptions = {}) {
	const pb = usePocketBase()
	const { companyId, customerId, status, filter, sort, ...otherOptions } =
		options

	return useQuery({
		queryKey: ['invoices', companyId, customerId, status, filter, sort],
		queryFn: async () => {
			const filters: string[] = []

			if (companyId) {
				filters.push(`owner_company = "${companyId}"`)
			}
			if (customerId) {
				filters.push(`customer = "${customerId}"`)
			}
			if (status) {
				filters.push(`status = "${status}"`)
			}
			if (filter) {
				filters.push(filter)
			}

			const finalFilter = filters.length ? filters.join(' && ') : undefined

			const result = await pb.collection('invoices').getList(1, 50, {
				sort: sort || '-date',
				expand: 'customer',
				filter: finalFilter,
				...otherOptions,
			})

			return result as unknown as {
				items: InvoiceResponse[]
				totalItems: number
				totalPages: number
			}
		},
		enabled: !!companyId,
		refetchOnMount: 'always',
		staleTime: 0,
	})
}

// 📄 Détail d'une facture
export function useInvoice(invoiceId?: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: ['invoices', invoiceId],
		queryFn: async () => {
			if (!invoiceId) throw new Error('invoiceId is required')
			const result = await pb.collection('invoices').getOne(invoiceId, {
				expand: 'customer',
			})
			return result as unknown as InvoiceResponse
		},
		enabled: !!invoiceId,
	})
}

// ➕ Créer une facture
export function useCreateInvoice() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: InvoiceDto) => {
			const result = await pb.collection('invoices').create(data)
			return result as unknown as InvoiceResponse
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['invoices'] })
		},
	})
}

// ✏️ Modifier une facture
export function useUpdateInvoice() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			data,
		}: {
			id: string
			data: Partial<InvoiceDto>
		}) => {
			const result = await pb.collection('invoices').update(id, data)
			return result as unknown as InvoiceResponse
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ['invoices'] })
			queryClient.invalidateQueries({ queryKey: ['invoices', variables.id] })
		},
	})
}

// 🗑️ Supprimer une facture
export function useDeleteInvoice() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (invoiceId: string) => {
			return await pb.collection('invoices').delete(invoiceId)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['invoices'] })
		},
	})
}

// 🔢 Générer un numéro de facture
export function useGenerateInvoiceNumber() {
	const pb = usePocketBase()

	return useMutation({
		mutationFn: async (companyId: string) => {
			// Récupérer la dernière facture de l'année
			const year = new Date().getFullYear()
			const prefix = `FAC-${year}-`

			try {
				const lastInvoice = await pb.collection('invoices').getList(1, 1, {
					filter: `owner_company = "${companyId}" && number ~ "${prefix}"`,
					sort: '-number',
				})

				let nextNumber = 1
				if (lastInvoice.items.length > 0) {
					const lastNumber = (lastInvoice.items[0] as any).number
					const match = lastNumber.match(/FAC-\d{4}-(\d+)/)
					if (match) {
						nextNumber = Number.parseInt(match[1], 10) + 1
					}
				}

				return `${prefix}${String(nextNumber).padStart(4, '0')}`
			} catch {
				return `${prefix}0001`
			}
		},
	})
}

// 💰 Marquer comme payée
export function useMarkInvoiceAsPaid() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			payment_method,
		}: {
			id: string
			payment_method?: string
		}) => {
			const result = await pb.collection('invoices').update(id, {
				status: 'paid',
				paid_at: new Date().toISOString(),
				payment_method,
			})
			return result as unknown as InvoiceResponse
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ['invoices'] })
			queryClient.invalidateQueries({ queryKey: ['invoices', variables.id] })
		},
	})
}
