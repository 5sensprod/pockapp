// frontend/lib/queries/quotes.ts
// 🔢 Le numéro de devis est maintenant généré automatiquement par le backend

import type {
	QuoteCreateDto,
	QuoteResponse,
	QuotesListOptions,
} from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const quoteKeys = {
	all: ['quotes'] as const,
	lists: () => [...quoteKeys.all, 'list'] as const,
	list: (options: QuotesListOptions) =>
		[...quoteKeys.lists(), options] as const,
	details: () => [...quoteKeys.all, 'detail'] as const,
	detail: (id: string) => [...quoteKeys.details(), id] as const,
}

// 📋 Liste des devis
export function useQuotes(options: QuotesListOptions = {}) {
	const pb = usePocketBase()
	const {
		companyId,
		customerId,
		status,
		filter,
		sort,
		page = 1,
		perPage = 50,
	} = options

	return useQuery({
		queryKey: quoteKeys.list(options),
		queryFn: async () => {
			const filters: string[] = []

			if (companyId) filters.push(`owner_company = "${companyId}"`)
			if (customerId) filters.push(`customer = "${customerId}"`)
			if (status) filters.push(`status = "${status}"`)
			if (filter) filters.push(filter)

			const finalFilter = filters.length ? filters.join(' && ') : undefined

			const result = await pb.collection('quotes').getList(page, perPage, {
				sort: sort || '-created',
				filter: finalFilter,
				expand: 'customer,generated_invoice_id',
			})

			return result as unknown as {
				items: QuoteResponse[]
				totalItems: number
				totalPages: number
				page: number
				perPage: number
			}
		},
		enabled: !!companyId,
		refetchOnMount: 'always',
		staleTime: 0,
	})
}

// 🔍 Détail devis
export function useQuote(quoteId?: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: quoteKeys.detail(quoteId || ''),
		queryFn: async () => {
			if (!quoteId) throw new Error('quoteId is required')
			const result = await pb.collection('quotes').getOne(quoteId, {
				expand: 'customer,generated_invoice_id',
			})
			return result as unknown as QuoteResponse
		},
		enabled: !!quoteId,
	})
}

// ➕ Créer un devis
// 🔢 Le numéro est généré automatiquement par le backend
export function useCreateQuote() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: Omit<QuoteCreateDto, 'number'>) => {
			const result = await pb.collection('quotes').create(data)
			return result as unknown as QuoteResponse
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: quoteKeys.all })
		},
	})
}

// ✏️ Mettre à jour un devis
export function useUpdateQuote() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			data,
		}: {
			id: string
			data: Partial<QuoteCreateDto>
		}) => {
			const result = await pb.collection('quotes').update(id, data)
			return result as unknown as QuoteResponse
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: quoteKeys.all })
			queryClient.invalidateQueries({
				queryKey: quoteKeys.detail(variables.id),
			})
		},
	})
}

// 🗑️ Supprimer un devis
export function useDeleteQuote() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (quoteId: string) => {
			await pb.collection('quotes').delete(quoteId)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: quoteKeys.all })
		},
	})
}

// 📧 Envoyer un devis par email
export interface SendQuoteEmailParams {
	quoteId: string
	recipientEmail: string
	recipientName?: string
	subject?: string
	message?: string
	pdfBase64?: string
	pdfFilename?: string
}

export function useSendQuoteEmail() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (params: SendQuoteEmailParams) => {
			const response = await fetch('/api/quotes/send-email', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: pb.authStore.token
						? `Bearer ${pb.authStore.token}`
						: '',
				},
				body: JSON.stringify(params),
			})

			if (!response.ok) {
				const error = await response.json().catch(() => ({}))
				throw new Error(error.message || "Erreur lors de l'envoi de l'email")
			}

			return response.json()
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: quoteKeys.all })
			queryClient.invalidateQueries({
				queryKey: quoteKeys.detail(variables.quoteId),
			})
		},
	})
}

// 🔄 Convertir un devis en facture
// 🔢 Le numéro de facture est généré automatiquement par le backend
export function useConvertQuoteToInvoice() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (quoteId: string) => {
			// 1. Récupérer le devis
			const quote = (await pb
				.collection('quotes')
				.getOne(quoteId)) as unknown as QuoteResponse

			// Si déjà converti → erreur
			if (quote.generated_invoice_id) {
				throw new Error('Ce devis a déjà été converti en facture.')
			}

			// Si rejeté → interdit
			if (quote.status === 'rejected') {
				throw new Error('Un devis rejeté ne peut pas être converti en facture.')
			}

			// On accepte les statuts "draft" ou "accepted"
			if (quote.status !== 'draft' && quote.status !== 'accepted') {
				throw new Error(
					`Ce devis ne peut pas être converti depuis le statut ${quote.status}.`,
				)
			}

			// 2. Créer la facture (numéro généré par le backend)
			const invoiceData = {
				// ⚠️ Pas de 'number' - généré par le backend
				invoice_type: 'invoice' as const,
				date: new Date().toISOString(),
				customer: quote.customer,
				owner_company: quote.owner_company,
				status: 'validated' as const, // 👈 facture directement validée
				is_paid: false,
				items: quote.items,
				total_ht: quote.total_ht,
				total_tva: quote.total_tva,
				total_ttc: quote.total_ttc,
				currency: quote.currency,
				notes: quote.notes
					? `${quote.notes}\n\nConverti depuis le devis ${quote.number}`
					: `Converti depuis le devis ${quote.number}`,
			}

			const invoice = await pb.collection('invoices').create(invoiceData)

			// 3. Mettre à jour le devis :
			//    - le lier à la facture
			//    - s'il était en brouillon, le passer en "accepted"
			await pb.collection('quotes').update(quoteId, {
				status: 'accepted',
				generated_invoice_id: invoice.id,
			})

			return invoice
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: quoteKeys.all })
			queryClient.invalidateQueries({ queryKey: ['invoices'] })
		},
	})
}
