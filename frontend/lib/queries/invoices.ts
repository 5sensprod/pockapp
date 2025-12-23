// frontend/lib/queries/invoices.ts
// Service de facturation conforme ISCA v2
// 🔢 Le numéro est maintenant généré automatiquement par le backend
// ✅ FIX: Ajout des champs optionnels pour les tickets POS
// ✅ AJOUT: Support vat_breakdown pour ventilation TVA multi-taux

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
import type { ClientResponseError } from 'pocketbase'

export type InvoiceItem = InvoiceItemType

// ✅ AJOUT: Type pour la ventilation TVA
export interface VatBreakdownItem {
	rate: number // Taux de TVA (ex: 20, 10, 5.5, 2.1)
	base_ht: number // Base HT pour ce taux
	vat: number // Montant de TVA pour ce taux
	total_ttc: number // Total TTC pour ce taux
}

// ---------------------------------------------------------------------------
// ✅ POS REFUND (TICKET -> AVOIR) - /api/pos/refund
// ---------------------------------------------------------------------------

export interface RefundTicketInput {
	originalTicketId: string
	refundType: 'full' | 'partial'
	refundMethod: 'especes' | 'cb' | 'cheque' | 'autre'
	refundedItems?: {
		originalItemIndex: number
		quantity: number
		reason?: string
	}[]
	reason: string
}

// Fallback minimal (si tu n'as pas encore un type dédié cash movement)
export interface CashMovementResponse {
	id: string
	[key: string]: any
}

export interface RefundResult {
	creditNote: InvoiceResponse
	cashMovement?: CashMovementResponse
	originalUpdated: InvoiceResponse
}

function formatRefundTicketError(err: unknown): Error {
	const e = err as Partial<ClientResponseError> & {
		status?: number
		data?: any
		message?: string
	}

	const status = e?.status
	const apiMsg =
		typeof e?.data?.message === 'string'
			? e.data.message
			: typeof e?.message === 'string'
				? e.message
				: ''

	if (status === 404) return new Error('Ticket introuvable.')
	if (status === 401 || status === 403)
		return new Error('Accès refusé. Veuillez vous reconnecter.')
	if (status === 400) {
		// Le backend renvoie généralement un message explicite (déjà remboursé, session manquante, etc.)
		return new Error(apiMsg || 'Requête invalide.')
	}

	return new Error(apiMsg || 'Une erreur est survenue lors du remboursement.')
}

export function useRefundTicket() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (input: RefundTicketInput): Promise<RefundResult> => {
			if (!input.originalTicketId) {
				throw new Error('originalTicketId est requis.')
			}
			if (!input.reason) {
				throw new Error('reason est requis.')
			}
			if (
				input.refundType === 'partial' &&
				(!input.refundedItems || input.refundedItems.length === 0)
			) {
				throw new Error('refundedItems est requis si refundType = partial.')
			}

			const payload = {
				original_ticket_id: input.originalTicketId,
				refund_type: input.refundType,
				refund_method: input.refundMethod,
				refunded_items:
					input.refundType === 'partial' ? input.refundedItems : undefined,
				reason: input.reason,
			}

			try {
				const res = await pb.send('/api/pos/refund', {
					method: 'POST',
					body: payload,
				})

				// res = { credit_note, cash_movement?, original_updated }
				return {
					creditNote: res.credit_note as InvoiceResponse,
					cashMovement: res.cash_movement as CashMovementResponse | undefined,
					originalUpdated: res.original_updated as InvoiceResponse,
				}
			} catch (err) {
				throw formatRefundTicketError(err)
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
			queryClient.invalidateQueries({ queryKey: ['cash-sessions'] })
		},
	})
}

// ✅ FIX: Extension du type pour inclure les champs optionnels de caisse
export type CreateInvoiceParams = Omit<InvoiceCreateDto, 'number'> & {
	// Champs spécifiques aux tickets POS (optionnels)
	is_pos_ticket?: boolean
	session?: string | null
	cash_register?: string | null
	sold_by?: string | null

	// Champs spécifiques à la conversion ticket → facture (optionnels)
	original_invoice_id?: string | null
	converted_to_invoice?: boolean
	converted_invoice_id?: string | null

	// ✅ AJOUT: Ventilation TVA
	vat_breakdown?: VatBreakdownItem[]
}

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
				expand: 'customer,original_invoice_id,sold_by,session',
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
				expand: 'customer,original_invoice_id,sold_by',
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
 * ✅ FIX: Support des champs de caisse (is_pos_ticket, session, cash_register)
 * ✅ AJOUT: Support vat_breakdown
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
			data: Partial<InvoiceCreateDto> & { vat_breakdown?: VatBreakdownItem[] }
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
 * ✏️ Mettre à jour une facture brouillon
 */
export function useUpdateInvoice() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			data,
		}: {
			id: string
			data: Partial<InvoiceCreateDto> & { vat_breakdown?: VatBreakdownItem[] }
		}) => {
			const existing = await pb.collection('invoices').getOne(id)

			if (existing.status !== 'draft') {
				throw new Error(
					'Seuls les brouillons peuvent être modifiés. ' +
						'Pour une facture validée, créez un avoir.',
				)
			}

			const result = await pb.collection('invoices').update(id, data)
			return result as unknown as InvoiceResponse
		},
		onSuccess: (_, { id }) => {
			queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
			queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(id) })
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
 * ✅ AJOUT: Copie du vat_breakdown avec valeurs inversées
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

			// 3. Inverser la ventilation TVA si elle existe
			const originalVatBreakdown = (original as any).vat_breakdown as
				| VatBreakdownItem[]
				| undefined
			const invertedVatBreakdown = originalVatBreakdown?.map((vb) => ({
				rate: vb.rate,
				base_ht: -Math.abs(vb.base_ht),
				vat: -Math.abs(vb.vat),
				total_ttc: -Math.abs(vb.total_ttc),
			}))

			// 4. CRÉER l'avoir (numéro généré automatiquement par le backend)
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
				vat_breakdown: invertedVatBreakdown, // ✅ AJOUT
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
