// frontend/lib/queries/invoices.ts
// Service de facturation conforme ISCA (Inaltérabilité, Sécurisation, Conservation, Archivage)

import type {
	InvoiceCreateDto,
	InvoiceResponse,
	InvoiceStatus,
	InvoicesListOptions,
	PaymentMethod,
} from '@/lib/types/invoice.types'
import {
	ALLOWED_STATUS_TRANSITIONS,
	canEditInvoice,
	canTransitionTo,
} from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

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
 * Le hash et le chaînage sont générés automatiquement par le backend
 */
export function useCreateInvoice() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: InvoiceCreateDto) => {
			// S'assurer que le type est défini
			const invoiceData = {
				...data,
				invoice_type: 'invoice' as const,
				status: data.status || 'draft',
			}

			const result = await pb.collection('invoices').create(invoiceData)
			return result as unknown as InvoiceResponse
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
		},
	})
}

/**
 * 🔢 Générer un numéro de facture séquentiel
 */
export function useGenerateInvoiceNumber() {
	const pb = usePocketBase()

	return useMutation({
		mutationFn: async (companyId: string) => {
			const year = new Date().getFullYear()
			const prefix = `FAC-${year}-`

			try {
				const lastInvoice = await pb.collection('invoices').getList(1, 1, {
					filter: `owner_company = "${companyId}" && invoice_type = "invoice" && number ~ "${prefix}"`,
					sort: '-sequence_number',
				})

				let nextNumber = 1
				if (lastInvoice.items.length > 0) {
					const lastNumber = (lastInvoice.items[0] as InvoiceResponse).number
					const match = lastNumber.match(/FAC-\d{4}-(\d+)/)
					if (match) {
						nextNumber = Number.parseInt(match[1], 10) + 1
					}
				}

				return `${prefix}${String(nextNumber).padStart(6, '0')}`
			} catch {
				return `${prefix}000001`
			}
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
			// Vérifier d'abord que c'est un brouillon
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
 * Après validation, la facture est verrouillée et ne peut plus être modifiée
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
			const existing = await pb.collection('invoices').getOne(invoiceId)

			if (!canTransitionTo(existing.status as InvoiceStatus, 'sent')) {
				throw new Error(
					`Transition invalide: ${existing.status} → sent. ` +
						`Transitions autorisées: ${ALLOWED_STATUS_TRANSITIONS[existing.status as InvoiceStatus].join(', ') || 'aucune'}`,
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
 * 💰 Enregistrer un paiement (validated/sent → paid)
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
			const existing = await pb.collection('invoices').getOne(invoiceId)

			if (!canTransitionTo(existing.status as InvoiceStatus, 'paid')) {
				throw new Error(
					`Transition invalide: ${existing.status} → paid. ` +
						`Transitions autorisées: ${ALLOWED_STATUS_TRANSITIONS[existing.status as InvoiceStatus].join(', ') || 'aucune'}`,
				)
			}

			const result = await pb.collection('invoices').update(invoiceId, {
				status: 'paid',
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

// ============================================================================
// HOOK DE CRÉATION D'AVOIR (ANNULATION)
// ============================================================================

/**
 * 🔄 Annuler une facture par création d'avoir
 * C'est la SEULE façon d'annuler une facture validée
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

			if (original.invoice_type !== 'invoice') {
				throw new Error("Impossible d'annuler un avoir.")
			}

			if (original.status === 'draft') {
				throw new Error(
					'Un brouillon peut être modifié directement. ' +
						"Utilisez la modification au lieu de l'annulation.",
				)
			}

			// 2. Vérifier qu'il n'y a pas déjà un avoir d'annulation
			const existingCreditNotes = await pb
				.collection('invoices')
				.getList(1, 1, {
					filter: `original_invoice_id = "${invoiceId}" && invoice_type = "credit_note"`,
				})

			if (existingCreditNotes.items.length > 0) {
				throw new Error('Cette facture a déjà été annulée par un avoir.')
			}

			// 3. Générer le numéro d'avoir
			const year = new Date().getFullYear()
			const prefix = `AVO-${year}-`

			const lastCreditNote = await pb.collection('invoices').getList(1, 1, {
				filter: `owner_company = "${original.owner_company}" && invoice_type = "credit_note" && number ~ "${prefix}"`,
				sort: '-sequence_number',
			})

			let nextNumber = 1
			if (lastCreditNote.items.length > 0) {
				const lastNum = (lastCreditNote.items[0] as InvoiceResponse).number
				const match = lastNum.match(/AVO-\d{4}-(\d+)/)
				if (match) {
					nextNumber = Number.parseInt(match[1], 10) + 1
				}
			}

			const creditNoteNumber = `${prefix}${String(nextNumber).padStart(6, '0')}`

			// 4. Créer l'avoir (montants inversés)
			const creditNoteData = {
				number: creditNoteNumber,
				invoice_type: 'credit_note' as const,
				date: new Date().toISOString(),
				customer: original.customer,
				owner_company: original.owner_company,
				original_invoice_id: invoiceId,
				status: 'validated' as const, // Un avoir est immédiatement validé
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
// ❌ HOOKS SUPPRIMÉS (NON CONFORMES)
// ============================================================================

/**
 * @deprecated ❌ SUPPRIMÉ - Les factures ne peuvent pas être supprimées
 * Utilisez useCancelInvoice() pour créer un avoir d'annulation
 */
// export function useDeleteInvoice() { ... }

/**
 * @deprecated ❌ SUPPRIMÉ - Utilisez useUpdateDraft() pour les brouillons
 * ou useValidateInvoice/useMarkInvoiceAsSent/useRecordPayment pour les transitions
 */
// export function useUpdateInvoice() { ... }

/**
 * @deprecated ❌ SUPPRIMÉ - Utilisez useRecordPayment() à la place
 */
// export function useMarkInvoiceAsPaid() { ... }

// ============================================================================
// HELPERS EXPORTÉS
// ============================================================================

export { canTransitionTo, canEditInvoice, ALLOWED_STATUS_TRANSITIONS }
