// frontend/lib/queries/invoices.ts
// Service de facturation conforme ISCA v2
// 🔢 Le numéro est maintenant généré automatiquement par le backend
// ✅ FIX: Ajout des champs optionnels pour les tickets POS
// ✅ AJOUT: Support vat_breakdown pour ventilation TVA multi-taux
import { decrementStockFromItems } from '@/lib/apppos/stock-utils'
import type {
	InvoiceCreateDto,
	InvoiceItem as InvoiceItemType,
	InvoiceResponse,
	InvoicesListOptions,
	// PaymentMethod,
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
// ✅ B2B INVOICE REFUND (INVOICE -> CREDIT NOTE) - /api/invoices/refund
// ---------------------------------------------------------------------------

export interface RefundInvoiceInput {
	originalInvoiceId: string
	refundType: 'full' | 'partial'
	refundMethod: 'especes' | 'cb' | 'cheque' | 'autre'
	refundedItems?: {
		original_item_index: number
		quantity: number
		reason?: string
	}[]
	reason: string
}

function formatRefundInvoiceError(err: unknown): Error {
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

	if (status === 404) return new Error('Facture introuvable.')
	if (status === 401 || status === 403)
		return new Error('Accès refusé. Veuillez vous reconnecter.')
	if (status === 400) return new Error(apiMsg || 'Requête invalide.')

	return new Error(apiMsg || 'Une erreur est survenue lors du remboursement.')
}

export function useRefundInvoice() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (input: RefundInvoiceInput) => {
			if (!input.originalInvoiceId)
				throw new Error('originalInvoiceId est requis.')
			if (!input.reason) throw new Error('reason est requis.')
			if (
				input.refundType === 'partial' &&
				(!input.refundedItems || input.refundedItems.length === 0)
			) {
				throw new Error('refundedItems est requis si refundType = partial.')
			}

			const payload = {
				original_invoice_id: input.originalInvoiceId,
				refund_type: input.refundType,
				refund_method: input.refundMethod,
				refunded_items:
					input.refundType === 'partial' ? input.refundedItems : undefined,
				reason: input.reason,
			}

			try {
				return await pb.send('/api/invoices/refund', {
					method: 'POST',
					body: payload,
				})
			} catch (err) {
				throw formatRefundInvoiceError(err)
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
		},
	})
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
	// Stats globales (calculées côté backend, sans limite de pagination)
	stats: (
		companyId: string,
		fiscalYear?: number,
		dateFrom?: string,
		dateTo?: string,
	) =>
		[
			...invoiceKeys.all,
			'stats',
			companyId,
			fiscalYear ?? 'all',
			dateFrom ?? '',
			dateTo ?? '',
		] as const,
}

// ============================================================================
// HOOKS DE LECTURE
// ============================================================================

/**
 * 📋 Liste des factures avec filtres
 */
// Extension de InvoicesListOptions pour le filtre de période
type InvoicesListOptionsWithPeriod = InvoicesListOptions & {
	dateFrom?: string // "YYYY-MM-DD"
	dateTo?: string // "YYYY-MM-DD"
}

export function useInvoices(options: InvoicesListOptionsWithPeriod = {}) {
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
		dateFrom,
		dateTo,
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
			if (dateFrom) {
				filters.push(`date >= "${dateFrom}"`)
			}
			if (dateTo) {
				filters.push(`date <= "${dateTo} 23:59:59"`)
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
			}

			const result = await pb.collection('invoices').create(invoiceData)

			// ✅ Stock uniquement si création directe en validated
			// Exclure : brouillons, acomptes, avoirs, caisse, factures de solde
			if (
				invoiceData.status === 'validated' &&
				invoiceData.invoice_type === 'invoice' &&
				!invoiceData.is_pos_ticket &&
				!invoiceData.original_invoice_id &&
				invoiceData.items?.length
			) {
				await decrementStockFromItems(invoiceData.items)
			}

			return result as unknown as InvoiceResponse
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
			queryClient.invalidateQueries({
				queryKey: ['apppos', 'products', 'catalog'],
			})
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
			const existing = (await pb
				.collection('invoices')
				.getOne(invoiceId)) as unknown as InvoiceResponse

			if (existing.status !== 'draft') {
				throw new Error('Seul un brouillon peut être validé.')
			}

			const result = await pb.collection('invoices').update(invoiceId, {
				status: 'validated',
			})

			// ✅ Stock uniquement pour les factures de vente (brouillon → validated)
			// Exclure : acomptes, avoirs, caisse, factures de solde
			if (
				existing.invoice_type === 'invoice' &&
				!existing.is_pos_ticket &&
				!existing.original_invoice_id &&
				existing.items?.length
			) {
				await decrementStockFromItems(existing.items)
			}

			return result as unknown as InvoiceResponse
		},
		onSuccess: (_, invoiceId) => {
			queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
			queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(invoiceId) })
			queryClient.invalidateQueries({
				queryKey: ['apppos', 'products', 'catalog'],
			})
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
			paymentMethodLabel,
			paidAt,
		}: {
			invoiceId: string
			paymentMethod?: string
			paymentMethodLabel?: string
			paidAt?: string
		}) => {
			const response = await fetch(`/api/invoices/${invoiceId}/pay`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: pb.authStore.token,
				},
				body: JSON.stringify({
					payment_method: paymentMethod || 'autre',
					payment_method_label: paymentMethodLabel || '',
					paid_at: paidAt || '',
				}),
			})

			if (!response.ok) {
				const err = await response.json().catch(() => ({}))
				throw new Error(err?.message || `Erreur ${response.status}`)
			}

			const data = (await response.json()) as {
				invoice: InvoiceResponse
				parent_updated: InvoiceResponse | null
			}

			return data
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
			queryClient.invalidateQueries({
				queryKey: invoiceKeys.detail(data.invoice.id),
			})
			// Invalider la parente si facture de solde
			if (data.parent_updated) {
				queryClient.invalidateQueries({
					queryKey: invoiceKeys.detail(data.parent_updated.id),
				})
			}
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
// ✅ AJOUT: Hook pour récupérer les avoirs liés à un ticket/facture
// À ajouter dans frontend/lib/queries/invoices.ts
// ============================================================================

/**
 * 🔍 Récupérer les avoirs (credit_notes) liés à une facture/ticket
 * Utile pour afficher les remboursements associés à un document
 */
export function useCreditNotesForInvoice(invoiceId?: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: [...invoiceKeys.all, 'credit-notes-for', invoiceId],
		queryFn: async () => {
			if (!invoiceId) return []

			const result = await pb.collection('invoices').getList(1, 50, {
				filter: `invoice_type = "credit_note" && original_invoice_id = "${invoiceId}"`,
				sort: '-created',
			})

			return result.items as unknown as InvoiceResponse[]
		},
		enabled: !!invoiceId,
	})
}

// ============================================================================
// STATS GLOBALES
// ============================================================================

interface InvoiceStats {
	invoice_count: number
	credit_note_count: number
	total_ttc: number
	credit_notes_ttc: number
	paid: number
	pending: number
	overdue: number
}

/**
 * 📊 Stats globales des factures — calculées côté backend sur TOUTES les factures
 * (sans la limite de pagination de 50 items de useInvoices)
 */
export function useInvoiceStats(
	companyId: string | undefined,
	options?: {
		fiscalYear?: number
		dateFrom?: string // "YYYY-MM-DD"
		dateTo?: string // "YYYY-MM-DD"
	},
) {
	const pb = usePocketBase()
	const { fiscalYear, dateFrom, dateTo } = options ?? {}
	return useQuery({
		queryKey: invoiceKeys.stats(companyId ?? '', fiscalYear, dateFrom, dateTo),
		queryFn: async (): Promise<InvoiceStats> => {
			if (!companyId) {
				throw new Error('companyId is required')
			}

			const params = new URLSearchParams({ company_id: companyId })

			if (fiscalYear) params.set('fiscal_year', String(fiscalYear))
			if (dateFrom) params.set('date_from', dateFrom)
			if (dateTo) params.set('date_to', dateTo)

			const response = await fetch(`/api/invoices/stats?${params}`, {
				headers: {
					Authorization: pb.authStore.token,
				},
			})

			if (!response.ok) {
				const err = await response.json().catch(() => ({}))
				throw new Error(err?.message || `Erreur ${response.status}`)
			}

			return response.json()
		},
		enabled: !!companyId,
		staleTime: 30_000,
	})
}

// ============================================================================
// REMBOURSEMENT D'ACOMPTE
// ============================================================================

export interface RefundDepositInput {
	depositId: string
	reason: string
}

export function useRefundDeposit() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (input: RefundDepositInput) => {
			if (!input.depositId) throw new Error('depositId requis')
			if (!input.reason) throw new Error('reason requis')

			return await pb.send('/api/invoices/deposit/refund', {
				method: 'POST',
				body: {
					deposit_id: input.depositId,
					reason: input.reason,
				},
			})
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
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
