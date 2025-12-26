// frontend/lib/queries/closures.ts
// ✅ VERSION CORRIGÉE - Hash aligné avec le backend
// Service de clôtures périodiques et vérification d'intégrité

import type {
	ClosureResponse,
	ClosuresListOptions,
	IntegrityCheckResult,
	InvoiceResponse,
} from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ============================================================================
// QUERY KEYS
// ============================================================================

export const closureKeys = {
	all: ['closures'] as const,
	lists: () => [...closureKeys.all, 'list'] as const,
	list: (options: ClosuresListOptions) =>
		[...closureKeys.lists(), options] as const,
	detail: (id: string) => [...closureKeys.all, 'detail', id] as const,
}

export const integrityKeys = {
	all: ['integrity'] as const,
	invoice: (id: string) => [...integrityKeys.all, 'invoice', id] as const,
	chain: (companyId: string, docType?: string) =>
		[...integrityKeys.all, 'chain', companyId, docType ?? 'all'] as const,
	summary: (companyId: string) =>
		[...integrityKeys.all, 'summary', companyId] as const,
}

// ============================================================================
// TYPES
// ============================================================================

export type DocumentType = 'all' | 'invoice' | 'pos_ticket' | 'credit_note'

export interface IntegritySummary {
	totalDocuments: number
	validDocuments: number
	invalidDocuments: number
	chainBreaks: number
	byType: {
		invoices: { total: number; valid: number; invalid: number }
		posTickets: { total: number; valid: number; invalid: number }
		creditNotes: { total: number; valid: number; invalid: number }
	}
	checkedAt: string
	allValid: boolean
}

export interface ChainVerificationResult {
	allValid: boolean
	checkedAt: string
	totalChecked: number
	validCount: number
	invalidCount: number
	chainBreaks: number
	details: IntegrityCheckResult[]
	summary: {
		invoices: { count: number; valid: number }
		posTickets: { count: number; valid: number }
		creditNotes: { count: number; valid: number }
	}
}

// ============================================================================
// CLÔTURES (B2B uniquement)
// ============================================================================

/**
 * 📋 Liste des clôtures
 */
export function useClosures(options: ClosuresListOptions = {}) {
	const pb = usePocketBase()
	const { companyId, closureType, fiscalYear, sort } = options

	return useQuery({
		queryKey: closureKeys.list(options),
		queryFn: async () => {
			const filters: string[] = []

			if (companyId) {
				filters.push(`owner_company = "${companyId}"`)
			}
			if (closureType) {
				filters.push(`closure_type = "${closureType}"`)
			}
			if (fiscalYear) {
				filters.push(`fiscal_year = ${fiscalYear}`)
			}

			const finalFilter = filters.length ? filters.join(' && ') : undefined

			const result = await pb.collection('closures').getList(1, 100, {
				sort: sort || '-created',
				filter: finalFilter,
			})

			return result as unknown as {
				items: ClosureResponse[]
				totalItems: number
			}
		},
		enabled: !!companyId,
	})
}

/**
 * 🔒 Effectuer une clôture journalière B2B (factures classiques uniquement)
 * ⚠️ Ne concerne PAS les tickets POS (qui ont leurs rapports Z)
 */
export function usePerformDailyClosure() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (companyId: string) => {
			const today = new Date()
			const startOfDay = new Date(today)
			startOfDay.setHours(0, 0, 0, 0)
			const endOfDay = new Date(today)
			endOfDay.setHours(23, 59, 59, 999)

			// 🔒 Vérifier qu'il n'y a pas déjà une clôture pour cette journée
			const filter = `owner_company = "${companyId}" && closure_type = "daily" && period_start >= "${startOfDay.toISOString()}" && period_start <= "${endOfDay.toISOString()}"`

			const existingClosure = await pb.collection('closures').getList(1, 1, {
				filter,
			})
			if (existingClosure.items.length > 0) {
				throw new Error('Une clôture journalière existe déjà pour cette date.')
			}

			// ✅ MODIFIÉ: Récupérer uniquement les factures B2B (pas les tickets POS)
			const invoices = (await pb.collection('invoices').getFullList({
				filter: `owner_company = "${companyId}" && created >= "${startOfDay.toISOString()}" && created <= "${endOfDay.toISOString()}" && is_pos_ticket = false`,
				sort: 'sequence_number',
			})) as unknown as InvoiceResponse[]

			// Séparer factures et avoirs B2B
			const invoicesOnly = invoices.filter((i) => i.invoice_type === 'invoice')
			const creditNotes = invoices.filter(
				(i) => i.invoice_type === 'credit_note',
			)

			// Calculer les totaux
			const totalHt = invoices.reduce((sum, inv) => sum + inv.total_ht, 0)
			const totalTva = invoices.reduce((sum, inv) => sum + inv.total_tva, 0)
			const totalTtc = invoices.reduce((sum, inv) => sum + inv.total_ttc, 0)

			// Calculer le hash cumulatif
			const allHashes = invoices.map((i) => i.hash).join('')
			const cumulativeHash = await computeHashBrowser(allHashes)

			// Calculer le hash de clôture
			const closureData = {
				type: 'daily',
				period_start: startOfDay.toISOString(),
				period_end: endOfDay.toISOString(),
				invoice_count: invoicesOnly.length,
				credit_note_count: creditNotes.length,
				total_ht: totalHt,
				total_tva: totalTva,
				total_ttc: totalTtc,
				cumulative_hash: cumulativeHash,
			}
			const closureHash = await computeHashBrowser(JSON.stringify(closureData))

			// Créer la clôture
			const closure = await pb.collection('closures').create({
				closure_type: 'daily',
				owner_company: companyId,
				period_start: startOfDay.toISOString(),
				period_end: endOfDay.toISOString(),
				fiscal_year: today.getFullYear(),
				invoice_count: invoicesOnly.length,
				credit_note_count: creditNotes.length,
				total_ht: totalHt,
				total_tva: totalTva,
				total_ttc: totalTtc,
				first_sequence: invoices[0]?.sequence_number || 0,
				last_sequence: invoices[invoices.length - 1]?.sequence_number || 0,
				first_hash: invoices[0]?.hash || '',
				last_hash: invoices[invoices.length - 1]?.hash || '',
				cumulative_hash: cumulativeHash,
				closure_hash: closureHash,
				closed_by: pb.authStore.model?.id,
			})

			// Mettre à jour les factures avec l'ID de clôture
			for (const invoice of invoices) {
				await pb.collection('invoices').update(invoice.id, {
					closure_id: closure.id,
				})
			}

			return closure as unknown as ClosureResponse
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: closureKeys.all })
			queryClient.invalidateQueries({ queryKey: ['invoices'] })
		},
	})
}

// ============================================================================
// VÉRIFICATION D'INTÉGRITÉ
// ============================================================================

/**
 * 🔍 Vérifier l'intégrité d'une facture individuelle
 */
export function useVerifyInvoiceIntegrity(invoiceId?: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: integrityKeys.invoice(invoiceId || ''),
		queryFn: async (): Promise<IntegrityCheckResult> => {
			if (!invoiceId) throw new Error('invoiceId is required')

			const invoice = (await pb
				.collection('invoices')
				.getOne(invoiceId)) as unknown as InvoiceResponse

			// Recalculer le hash attendu
			const expectedHash = await computeInvoiceHashBrowser(invoice)

			// Vérifier le chaînage
			let chainValid = true
			if (invoice.sequence_number > 1) {
				const previousInvoices = await pb.collection('invoices').getList(1, 1, {
					filter: `owner_company = "${invoice.owner_company}" && sequence_number = ${invoice.sequence_number - 1}`,
				})

				if (previousInvoices.items.length > 0) {
					const previous = previousInvoices
						.items[0] as unknown as InvoiceResponse
					chainValid = invoice.previous_hash === previous.hash
				}
			} else {
				chainValid =
					invoice.previous_hash ===
					'0000000000000000000000000000000000000000000000000000000000000000'
			}

			const errors: string[] = []

			if (invoice.hash !== expectedHash) {
				errors.push(
					`Hash incorrect: attendu ${expectedHash.substring(0, 16)}..., trouvé ${invoice.hash.substring(0, 16)}...`,
				)
			}

			if (!chainValid) {
				errors.push('Rupture dans la chaîne de hachage détectée')
			}

			return {
				isValid: invoice.hash === expectedHash && chainValid,
				checkedAt: new Date().toISOString(),
				invoiceId: invoice.id,
				invoiceNumber: invoice.number,
				expectedHash,
				actualHash: invoice.hash,
				chainValid,
				errors,
			}
		},
		enabled: !!invoiceId,
		staleTime: 60000,
	})
}

/**
 * 🔗 Vérifier l'intégrité de la chaîne de documents
 * ✅ AMÉLIORÉ: Supporte le filtrage par type de document
 * @param docType - 'all' | 'invoice' | 'pos_ticket' | 'credit_note'
 */
export function useVerifyInvoiceChain() {
	const pb = usePocketBase()

	return useMutation({
		mutationFn: async ({
			companyId,
			docType = 'all',
		}: {
			companyId: string
			docType?: DocumentType
		}): Promise<ChainVerificationResult> => {
			// ✅ Construire le filtre selon le type de document
			let filter = `owner_company = "${companyId}"`

			switch (docType) {
				case 'invoice':
					// Factures B2B uniquement (pas POS)
					filter += ` && invoice_type = "invoice" && is_pos_ticket = false`
					break
				case 'pos_ticket':
					// Tickets POS uniquement
					filter += ` && is_pos_ticket = true && invoice_type = "invoice"`
					break
				case 'credit_note':
					// Tous les avoirs
					filter += ` && invoice_type = "credit_note"`
					break
				// 'all' - pas de filtre supplémentaire
			}

			const invoices = (await pb.collection('invoices').getFullList({
				filter,
				sort: 'sequence_number',
			})) as unknown as InvoiceResponse[]

			const results: IntegrityCheckResult[] = []
			let allValid = true
			let chainBreaks = 0

			// ✅ AJOUT: Compteurs par type
			const summary = {
				invoices: { count: 0, valid: 0 },
				posTickets: { count: 0, valid: 0 },
				creditNotes: { count: 0, valid: 0 },
			}

			for (let i = 0; i < invoices.length; i++) {
				const invoice = invoices[i]
				const expectedHash = await computeInvoiceHashBrowser(invoice)
				const errors: string[] = []

				// Vérifier le hash
				const hashValid = invoice.hash === expectedHash
				if (!hashValid) {
					errors.push(`Hash incorrect pour ${invoice.number}`)
					allValid = false
				}

				// Vérifier le chaînage
				// ⚠️ IMPORTANT: La chaîne est GLOBALE, pas par type de document
				let chainValid = true
				if (i === 0) {
					// Premier document de la liste filtrée
					if (invoice.sequence_number === 1) {
						chainValid =
							invoice.previous_hash ===
							'0000000000000000000000000000000000000000000000000000000000000000'
					} else {
						// Il y a des documents avant celui-ci dans la chaîne globale
						const prevDoc = await pb.collection('invoices').getList(1, 1, {
							filter: `owner_company = "${companyId}" && sequence_number = ${invoice.sequence_number - 1}`,
						})
						if (prevDoc.items.length > 0) {
							const prev = prevDoc.items[0] as unknown as InvoiceResponse
							chainValid = invoice.previous_hash === prev.hash
						}
					}
				} else {
					// Pour les documents suivants dans la liste filtrée
					const prevDoc = await pb.collection('invoices').getList(1, 1, {
						filter: `owner_company = "${companyId}" && sequence_number = ${invoice.sequence_number - 1}`,
					})
					if (prevDoc.items.length > 0) {
						const prev = prevDoc.items[0] as unknown as InvoiceResponse
						chainValid = invoice.previous_hash === prev.hash
					}
				}

				if (!chainValid) {
					errors.push(`Rupture de chaîne à ${invoice.number}`)
					allValid = false
					chainBreaks++
				}

				const isValid = hashValid && chainValid

				// ✅ Mettre à jour les compteurs
				const isPosTicket = (invoice as any).is_pos_ticket === true
				const isCreditNote = invoice.invoice_type === 'credit_note'

				if (isCreditNote) {
					summary.creditNotes.count++
					if (isValid) summary.creditNotes.valid++
				} else if (isPosTicket) {
					summary.posTickets.count++
					if (isValid) summary.posTickets.valid++
				} else {
					summary.invoices.count++
					if (isValid) summary.invoices.valid++
				}

				results.push({
					isValid,
					checkedAt: new Date().toISOString(),
					invoiceId: invoice.id,
					invoiceNumber: invoice.number,
					expectedHash,
					actualHash: invoice.hash,
					chainValid,
					errors,
				})
			}

			return {
				allValid,
				checkedAt: new Date().toISOString(),
				totalChecked: invoices.length,
				validCount: results.filter((r) => r.isValid).length,
				invalidCount: results.filter((r) => !r.isValid).length,
				chainBreaks,
				details: results,
				summary,
			}
		},
	})
}

/**
 * 📊 Obtenir un résumé rapide de l'intégrité
 */
export function useIntegritySummary(companyId?: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: integrityKeys.summary(companyId || ''),
		queryFn: async (): Promise<IntegritySummary> => {
			if (!companyId) throw new Error('companyId is required')

			// Récupérer tous les documents
			const allDocs = (await pb.collection('invoices').getFullList({
				filter: `owner_company = "${companyId}"`,
				sort: 'sequence_number',
			})) as unknown as InvoiceResponse[]

			let validCount = 0
			let invalidCount = 0
			let chainBreaks = 0

			const byType = {
				invoices: { total: 0, valid: 0, invalid: 0 },
				posTickets: { total: 0, valid: 0, invalid: 0 },
				creditNotes: { total: 0, valid: 0, invalid: 0 },
			}

			for (let i = 0; i < allDocs.length; i++) {
				const doc = allDocs[i]
				const isPosTicket = (doc as any).is_pos_ticket === true
				const isCreditNote = doc.invoice_type === 'credit_note'

				// Vérifier le hash
				const expectedHash = await computeInvoiceHashBrowser(doc)
				const hashValid = doc.hash === expectedHash

				// Vérifier la chaîne
				let chainValid = true
				if (i === 0) {
					chainValid =
						doc.previous_hash ===
						'0000000000000000000000000000000000000000000000000000000000000000'
				} else {
					chainValid = doc.previous_hash === allDocs[i - 1].hash
				}

				if (!chainValid) chainBreaks++

				const isValid = hashValid && chainValid

				if (isValid) {
					validCount++
				} else {
					invalidCount++
				}

				// Compteurs par type
				if (isCreditNote) {
					byType.creditNotes.total++
					if (isValid) byType.creditNotes.valid++
					else byType.creditNotes.invalid++
				} else if (isPosTicket) {
					byType.posTickets.total++
					if (isValid) byType.posTickets.valid++
					else byType.posTickets.invalid++
				} else {
					byType.invoices.total++
					if (isValid) byType.invoices.valid++
					else byType.invoices.invalid++
				}
			}

			return {
				totalDocuments: allDocs.length,
				validDocuments: validCount,
				invalidDocuments: invalidCount,
				chainBreaks,
				byType,
				checkedAt: new Date().toISOString(),
				allValid: invalidCount === 0 && chainBreaks === 0,
			}
		},
		enabled: !!companyId,
		staleTime: 300000, // 5 minutes
	})
}

/**
 * 🔍 Vérifier l'intégrité des avoirs liés à un document original
 */
export function useVerifyCreditNotesIntegrity(originalInvoiceId?: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: [...integrityKeys.all, 'credit-notes', originalInvoiceId],
		queryFn: async () => {
			if (!originalInvoiceId) return null

			// Récupérer l'original
			const original = (await pb
				.collection('invoices')
				.getOne(originalInvoiceId)) as unknown as InvoiceResponse

			// Récupérer les avoirs liés
			const creditNotes = (await pb.collection('invoices').getFullList({
				filter: `invoice_type = "credit_note" && original_invoice_id = "${originalInvoiceId}"`,
				sort: 'sequence_number',
			})) as unknown as InvoiceResponse[]

			// Calculer les totaux
			const originalTotal = Math.abs(original.total_ttc)
			const refundedTotal = creditNotes.reduce(
				(sum, cn) => sum + Math.abs(cn.total_ttc),
				0,
			)
			const remainingAmount = originalTotal - refundedTotal

			// Vérifier l'intégrité de chaque avoir
			const creditNoteResults: IntegrityCheckResult[] = []
			for (const cn of creditNotes) {
				const expectedHash = await computeInvoiceHashBrowser(cn)
				const hashValid = cn.hash === expectedHash

				creditNoteResults.push({
					isValid: hashValid,
					checkedAt: new Date().toISOString(),
					invoiceId: cn.id,
					invoiceNumber: cn.number,
					expectedHash,
					actualHash: cn.hash,
					chainValid: true,
					errors: hashValid ? [] : ['Hash incorrect'],
				})
			}

			return {
				original: {
					id: original.id,
					number: original.number,
					totalTtc: originalTotal,
					isPosTicket: (original as any).is_pos_ticket,
				},
				creditNotes: creditNoteResults,
				totals: {
					originalAmount: originalTotal,
					refundedAmount: refundedTotal,
					remainingAmount,
					isFullyRefunded: remainingAmount <= 0.01,
				},
				checkedAt: new Date().toISOString(),
			}
		},
		enabled: !!originalInvoiceId,
	})
}

// ============================================================================
// UTILITAIRES CRYPTO (WEB CRYPTO API)
// ============================================================================

/**
 * Calcule un hash SHA-256 côté navigateur
 */
async function computeHashBrowser(data: string): Promise<string> {
	const encoder = new TextEncoder()
	const dataBuffer = encoder.encode(data)
	const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
	const hashArray = Array.from(new Uint8Array(hashBuffer))
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * ✅ CORRIGÉ: Calcule le hash d'une facture côté navigateur
 * ⚠️ DOIT correspondre EXACTEMENT à computeRecordHash() du backend (cash_routes.go)
 *
 * Le backend inclut UNIQUEMENT ces champs :
 * - number, invoice_type, customer, owner_company, date
 * - total_ht, total_tva, total_ttc
 * - previous_hash, sequence_number, fiscal_year
 * - original_invoice_id (si présent)
 *
 * ❌ NE PAS INCLURE : currency, items, vat_breakdown, is_pos_ticket, session, etc.
 */
async function computeInvoiceHashBrowser(
	invoice: InvoiceResponse,
): Promise<string> {
	// ✅ Structure IDENTIQUE au backend computeRecordHash()
	const data: Record<string, unknown> = {
		customer: invoice.customer,
		date: invoice.date,
		fiscal_year: invoice.fiscal_year,
		invoice_type: invoice.invoice_type,
		number: invoice.number,
		owner_company: invoice.owner_company,
		previous_hash: invoice.previous_hash,
		sequence_number: invoice.sequence_number,
		total_ht: invoice.total_ht,
		total_ttc: invoice.total_ttc,
		total_tva: invoice.total_tva,
	}

	// Ajouter original_invoice_id SEULEMENT si présent (comme le backend)
	if (invoice.original_invoice_id) {
		data.original_invoice_id = invoice.original_invoice_id
	}

	// ✅ Sérialisation avec clés ordonnées alphabétiquement (comme le backend)
	const orderedKeys = Object.keys(data).sort()

	// ✅ Construire le JSON manuellement comme le backend Go
	// Le backend Go utilise json.Marshal qui produit un format spécifique
	const parts: string[] = []
	for (const key of orderedKeys) {
		const keyJSON = JSON.stringify(key)
		const valueJSON = JSON.stringify(data[key])
		parts.push(`${keyJSON}:${valueJSON}`)
	}
	const jsonString = `{${parts.join(',')}}`

	return computeHashBrowser(jsonString)
}

// ============================================================================
// EXPORTS
// ============================================================================

export { computeHashBrowser, computeInvoiceHashBrowser }
