// frontend/lib/queries/invoices.ts
// Service de facturation conforme ISCA v2
// 🔢 Le numéro est maintenant généré automatiquement par le backend

import type {
	InvoiceCreateDto,
	InvoiceItem as InvoiceItemType,
	InvoiceResponse,
	InvoicesListOptions,
	PaymentMethod,
} from '@/lib/types/invoice.types'
import {
	ALLOWED_STATUS_TRANSITIONS,
	canEditInvoice,
	canMarkAsPaid,
	canTransitionTo,
} from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export type InvoiceItem = InvoiceItemType
export type CreateInvoiceParams = Omit<InvoiceCreateDto, 'number'>
// ============================================================================
// QUERY KEYS
// ============================================================================

export const invoiceKeys = {
	all: ['invoices'] as const,
	lists: () => [...invoiceKeys.all, 'list'] as const,
	list: (options: InvoicesListOptions) =>
		[...invoiceKeys.lists(), options] as const,
	details: () => [...invoiceKeys.all, 'detail'] as const,
	detail: (id: string) => [...invoiceKeys.details(), id] as const,
	integrity: (id: string) => [...invoiceKeys.all, 'integrity', id] as const,
}

// ============================================================================
// HOOKS DE LECTURE
// ============================================================================

/**
 * 📋 Liste des factures avec filtres
 */
export function useInvoices(options: InvoicesListOptions = {}) {
	const pb = usePocketBase()
	const {
		companyId,
		customerId,
		status,
		invoiceType,
		fiscalYear,
		isPaid,
		filter,
		sort,
		page = 1,
		perPage = 50,
	} = options

	return useQuery({
		queryKey: invoiceKeys.list(options),
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
			if (invoiceType) {
				filters.push(`invoice_type = "${invoiceType}"`)
			}
			if (fiscalYear) {
				filters.push(`fiscal_year = ${fiscalYear}`)
			}
			if (isPaid !== undefined) {
				filters.push(`is_paid = ${isPaid}`)
			}
			if (filter) {
				filters.push(filter)
			}

			const finalFilter = filters.length ? filters.join(' && ') : undefined

			const result = await pb.collection('invoices').getList(page, perPage, {
				sort: sort || '-sequence_number',
				expand: 'customer,original_invoice_id',
				filter: finalFilter,
			})

			return result as unknown as {
				items: InvoiceResponse[]
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

/**
 * 📋 Liste uniquement les factures (pas les avoirs)
 */
export function useInvoicesOnly(
	options: Omit<InvoicesListOptions, 'invoiceType'> = {},
) {
	return useInvoices({ ...options, invoiceType: 'invoice' })
}

/**
 * 📋 Liste uniquement les avoirs
 */
export function useCreditNotes(
	options: Omit<InvoicesListOptions, 'invoiceType'> = {},
) {
	return useInvoices({ ...options, invoiceType: 'credit_note' })
}

/**
 * 📋 Liste des factures impayées
 */
export function useUnpaidInvoices(
	options: Omit<InvoicesListOptions, 'isPaid' | 'invoiceType'> = {},
) {
	return useInvoices({ ...options, invoiceType: 'invoice', isPaid: false })
}

/**
 * 🔍 Détail d'une facture
 */
export function useInvoice(invoiceId?: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: invoiceKeys.detail(invoiceId || ''),
		queryFn: async () => {
			if (!invoiceId) throw new Error('invoiceId is required')
			const result = await pb.collection('invoices').getOne(invoiceId, {
				expand: 'customer,original_invoice_id',
			})
			return result as unknown as InvoiceResponse
		},
		enabled: !!invoiceId,
	})
}

// ============================================================================
// HOOKS DE CRÉATION
// ============================================================================

/**
 * ➕ Créer une facture (brouillon par défaut)
 * 🔢 Le numéro est généré automatiquement par le backend
 */
export function useCreateInvoice() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: CreateInvoiceParams) => {
			const invoiceData = {
				...data,
				status: data.status || 'draft',
				is_paid: false,
				// ⚠️ Ne pas envoyer 'number' - le backend le génère automatiquement
			}

			const result = await pb.collection('invoices').create(invoiceData)
			return result as unknown as InvoiceResponse
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
		},
	})
}

// ============================================================================
// HOOKS DE MODIFICATION (RESTREINTS)
// ============================================================================

/**
 * ✏️ Modifier un brouillon
 * ⚠️ UNIQUEMENT pour les factures en statut "draft"
 */
export function useUpdateDraft() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			data,
		}: {
			id: string
			data: Partial<InvoiceCreateDto>
		}) => {
			const existing = await pb.collection('invoices').getOne(id)

			if (existing.status !== 'draft') {
				throw new Error(
					'Seuls les brouillons peuvent être modifiés. ' +
						'Pour une facture validée, créez un avoir.',
				)
			}

			if (existing.is_locked) {
				throw new Error(
					'Cette facture est verrouillée et ne peut pas être modifiée.',
				)
			}

			const result = await pb.collection('invoices').update(id, data)
			return result as unknown as InvoiceResponse
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
			queryClient.invalidateQueries({
				queryKey: invoiceKeys.detail(variables.id),
			})
		},
	})
}

/**
 * ✅ Valider une facture (draft → validated)
 */
export function useValidateInvoice() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (invoiceId: string) => {
			const existing = await pb.collection('invoices').getOne(invoiceId)

			if (existing.status !== 'draft') {
				throw new Error('Seul un brouillon peut être validé.')
			}

			const result = await pb.collection('invoices').update(invoiceId, {
				status: 'validated',
			})
			return result as unknown as InvoiceResponse
		},
		onSuccess: (_, invoiceId) => {
			queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
			queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(invoiceId) })
		},
	})
}

/**
 * 📤 Marquer comme envoyée (validated → sent)
 */
export function useMarkInvoiceAsSent() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (invoiceId: string) => {
			const existing = (await pb
				.collection('invoices')
				.getOne(invoiceId)) as unknown as InvoiceResponse

			if (!canTransitionTo(existing.status, 'sent')) {
				throw new Error(
					`Transition invalide: ${existing.status} → sent. ` +
						`Transitions autorisées: ${ALLOWED_STATUS_TRANSITIONS[existing.status].join(', ') || 'aucune'}`,
				)
			}

			const result = await pb.collection('invoices').update(invoiceId, {
				status: 'sent',
			})
			return result as unknown as InvoiceResponse
		},
		onSuccess: (_, invoiceId) => {
			queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
			queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(invoiceId) })
		},
	})
}

/**
 * 💰 Enregistrer un paiement (indépendant du statut)
 */
export function useRecordPayment() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			invoiceId,
			paymentMethod,
			paidAt,
		}: {
			invoiceId: string
			paymentMethod?: PaymentMethod
			paidAt?: string
		}) => {
			// 1) Charger la facture
			const existing = (await pb
				.collection('invoices')
				.getOne(invoiceId)) as unknown as InvoiceResponse

			// 2) Règles métier "classiques"
			if (!canMarkAsPaid(existing)) {
				if (existing.is_paid) {
					throw new Error('Cette facture est déjà marquée comme payée.')
				}
				if (existing.status === 'draft') {
					throw new Error(
						'Impossible de marquer un brouillon comme payé. ' +
							"Validez d'abord la facture.",
					)
				}
				if (existing.invoice_type === 'credit_note') {
					throw new Error('Les avoirs ne peuvent pas être marqués comme payés.')
				}
			}

			// 3) 🔒 Nouveau : interdire le paiement si un avoir d'annulation existe
			const creditNotes = await pb.collection('invoices').getList(1, 1, {
				filter: `invoice_type = "credit_note" && original_invoice_id = "${invoiceId}"`,
			})

			if (creditNotes.items.length > 0) {
				throw new Error(
					"Impossible d'enregistrer un paiement: la facture a été annulée par un avoir.",
				)
			}

			// 4) Enregistrer le paiement
			const result = await pb.collection('invoices').update(invoiceId, {
				is_paid: true,
				payment_method: paymentMethod,
				paid_at: paidAt || new Date().toISOString(),
			})

			return result as unknown as InvoiceResponse
		},
		onSuccess: (_, { invoiceId }) => {
			queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
			queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(invoiceId) })
		},
	})
}

/**
 * 💸 Annuler un paiement (correction d'erreur)
 */
export function useCancelPayment() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (invoiceId: string) => {
			const existing = (await pb
				.collection('invoices')
				.getOne(invoiceId)) as unknown as InvoiceResponse

			if (!existing.is_paid) {
				throw new Error("Cette facture n'est pas marquée comme payée.")
			}

			const result = await pb.collection('invoices').update(invoiceId, {
				is_paid: false,
				payment_method: null,
				paid_at: null,
			})
			return result as unknown as InvoiceResponse
		},
		onSuccess: (_, invoiceId) => {
			queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
			queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(invoiceId) })
		},
	})
}

// ============================================================================
// HOOK DE CRÉATION D'AVOIR (ANNULATION)
// ============================================================================

/**
 * 🔄 Annuler une facture par création d'avoir
 * 🔢 Le numéro d'avoir est généré automatiquement par le backend
 */
export function useCancelInvoice() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			invoiceId,
			reason,
		}: {
			invoiceId: string
			reason: string
		}) => {
			// 1. Récupérer la facture originale
			const original = (await pb
				.collection('invoices')
				.getOne(invoiceId)) as unknown as InvoiceResponse

			// 2. Vérifications
			if (original.status === 'draft') {
				throw new Error(
					'Impossible de créer un avoir pour un brouillon. Supprimez-le directement.',
				)
			}

			// 3. CRÉER l'avoir (numéro généré automatiquement par le backend)
			const creditNoteData = {
				// ⚠️ Pas de 'number' - généré par le backend
				invoice_type: 'credit_note' as const,
				date: new Date().toISOString(),
				customer: original.customer,
				owner_company: original.owner_company,
				original_invoice_id: invoiceId,
				status: 'validated' as const,
				is_paid: false,

				items: original.items.map((item) => ({
					...item,
					quantity: -Math.abs(item.quantity),
					total_ht: -Math.abs(item.total_ht),
					total_ttc: -Math.abs(item.total_ttc),
				})),
				total_ht: -Math.abs(original.total_ht),
				total_tva: -Math.abs(original.total_tva),
				total_ttc: -Math.abs(original.total_ttc),
				currency: original.currency,
				cancellation_reason: reason,
				notes: `Avoir d'annulation pour la facture ${original.number}. Motif: ${reason}`,
			}

			const creditNote = await pb.collection('invoices').create(creditNoteData)
			return creditNote as unknown as InvoiceResponse
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
		},
	})
}

// ============================================================================
// ENVOI EMAIL
// ============================================================================

export interface SendInvoiceEmailParams {
	invoiceId: string
	recipientEmail: string
	recipientName?: string
	subject?: string
	message?: string
	pdfBase64?: string
	pdfFilename?: string
}

export function useSendInvoiceEmail() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (params: SendInvoiceEmailParams) => {
			const response = await fetch('/api/invoices/send-email', {
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
			queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
			queryClient.invalidateQueries({
				queryKey: invoiceKeys.detail(variables.invoiceId),
			})
		},
	})
}

// ============================================================================
// HELPERS EXPORTÉS
// ============================================================================

export {
	canTransitionTo,
	canEditInvoice,
	canMarkAsPaid,
	ALLOWED_STATUS_TRANSITIONS,
}

/**
 * 🗑️ Supprimer un brouillon
 * ⚠️ UNIQUEMENT pour les factures en statut "draft"
 */
export function useDeleteDraftInvoice() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (invoiceId: string) => {
			const existing = await pb.collection('invoices').getOne(invoiceId)

			if (existing.status !== 'draft') {
				throw new Error('Seuls les brouillons peuvent être supprimés.')
			}

			if (existing.is_locked) {
				throw new Error(
					'Ce brouillon est verrouillé et ne peut pas être supprimé.',
				)
			}

			await pb.collection('invoices').delete(invoiceId)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
		},
	})
}
