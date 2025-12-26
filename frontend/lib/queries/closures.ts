// frontend/lib/queries/closures.ts
// ═══════════════════════════════════════════════════════════════════════════
// VERSION FINALE - Alignée avec backend/hash/hash.go
// ═══════════════════════════════════════════════════════════════════════════

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

			const filter = `owner_company = "${companyId}" && closure_type = "daily" && period_start >= "${startOfDay.toISOString()}" && period_start <= "${endOfDay.toISOString()}"`

			const existingClosure = await pb.collection('closures').getList(1, 1, {
				filter,
			})
			if (existingClosure.items.length > 0) {
				throw new Error('Une clôture journalière existe déjà pour cette date.')
			}

			const invoices = (await pb.collection('invoices').getFullList({
				filter: `owner_company = "${companyId}" && created >= "${startOfDay.toISOString()}" && created <= "${endOfDay.toISOString()}" && is_pos_ticket = false`,
				sort: 'sequence_number',
			})) as unknown as InvoiceResponse[]

			const invoicesOnly = invoices.filter((i) => i.invoice_type === 'invoice')
			const creditNotes = invoices.filter(
				(i) => i.invoice_type === 'credit_note',
			)

			const totalHt = invoices.reduce((sum, inv) => sum + inv.total_ht, 0)
			const totalTva = invoices.reduce((sum, inv) => sum + inv.total_tva, 0)
			const totalTtc = invoices.reduce((sum, inv) => sum + inv.total_ttc, 0)

			const allHashes = invoices.map((i) => i.hash).join('')
			const cumulativeHash = await computeHashBrowser(allHashes)

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

export function useVerifyInvoiceIntegrity(invoiceId?: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: integrityKeys.invoice(invoiceId || ''),
		queryFn: async (): Promise<IntegrityCheckResult> => {
			if (!invoiceId) throw new Error('invoiceId is required')

			const invoice = (await pb
				.collection('invoices')
				.getOne(invoiceId)) as unknown as InvoiceResponse

			const expectedHash = await computeDocumentHash(invoice)

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
			let filter = `owner_company = "${companyId}"`

			switch (docType) {
				case 'invoice':
					filter += ` && invoice_type = "invoice" && is_pos_ticket = false`
					break
				case 'pos_ticket':
					filter += ` && is_pos_ticket = true && invoice_type = "invoice"`
					break
				case 'credit_note':
					filter += ` && invoice_type = "credit_note"`
					break
			}

			const invoices = (await pb.collection('invoices').getFullList({
				filter,
				sort: 'created',
			})) as unknown as InvoiceResponse[]

			// Trier par sequence_number
			invoices.sort((a, b) => {
				const seqA = a.sequence_number || 0
				const seqB = b.sequence_number || 0
				if (seqA === 0 && seqB === 0) return 0
				if (seqA === 0) return 1
				if (seqB === 0) return -1
				return seqA - seqB
			})

			const results: IntegrityCheckResult[] = []
			let allValid = true
			let chainBreaks = 0

			const summary = {
				invoices: { count: 0, valid: 0 },
				posTickets: { count: 0, valid: 0 },
				creditNotes: { count: 0, valid: 0 },
			}

			for (let i = 0; i < invoices.length; i++) {
				const invoice = invoices[i]
				const errors: string[] = []

				const hasSequence =
					invoice.sequence_number && invoice.sequence_number > 0
				const hasHash = invoice.hash && invoice.hash.length > 0

				let hashValid = true
				let chainValid = true

				if (!hasSequence || !hasHash) {
					errors.push(
						`Document non chaîné (sequence_number: ${invoice.sequence_number || 'vide'}, hash: ${hasHash ? 'présent' : 'absent'})`,
					)
					hashValid = false
					chainValid = false
					allValid = false
				} else {
					const expectedHash = await computeDocumentHash(invoice)

					hashValid = invoice.hash === expectedHash
					if (!hashValid) {
						errors.push(`Hash incorrect pour ${invoice.number}`)
						allValid = false

						// Debug: afficher les détails pour comprendre la différence
						console.log(`🔍 Debug hash ${invoice.number}:`)
						console.log(`   Attendu: ${expectedHash}`)
						console.log(`   Stocké:  ${invoice.hash}`)
					}

					if (i === 0) {
						if (invoice.sequence_number === 1) {
							chainValid =
								invoice.previous_hash ===
								'0000000000000000000000000000000000000000000000000000000000000000'
						} else {
							const prevDoc = await pb.collection('invoices').getList(1, 1, {
								filter: `owner_company = "${companyId}" && sequence_number = ${invoice.sequence_number - 1}`,
							})
							if (prevDoc.items.length > 0) {
								const prev = prevDoc.items[0] as unknown as InvoiceResponse
								chainValid = invoice.previous_hash === prev.hash
							}
						}
					} else {
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
				}

				const isValid = hashValid && chainValid

				// ✅ Détection robuste de is_pos_ticket
				const rawIsPosTicket = (invoice as any).is_pos_ticket
				const isPosTicket =
					rawIsPosTicket === true ||
					rawIsPosTicket === 'true' ||
					rawIsPosTicket === 1
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
					expectedHash: hasHash ? await computeDocumentHash(invoice) : '',
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

export function useIntegritySummary(companyId?: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: integrityKeys.summary(companyId || ''),
		queryFn: async (): Promise<IntegritySummary> => {
			if (!companyId) throw new Error('companyId is required')

			const allDocs = (await pb.collection('invoices').getFullList({
				filter: `owner_company = "${companyId}"`,
				sort: 'created',
			})) as unknown as InvoiceResponse[]

			allDocs.sort((a, b) => {
				const seqA = a.sequence_number || 0
				const seqB = b.sequence_number || 0
				if (seqA === 0 && seqB === 0) return 0
				if (seqA === 0) return 1
				if (seqB === 0) return -1
				return seqA - seqB
			})

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
				// ✅ Détection robuste de is_pos_ticket (peut être boolean, string ou number)
				const rawIsPosTicket = (doc as any).is_pos_ticket
				const isPosTicket =
					rawIsPosTicket === true ||
					rawIsPosTicket === 'true' ||
					rawIsPosTicket === 1
				const isCreditNote = doc.invoice_type === 'credit_note'

				const hasSequence = doc.sequence_number && doc.sequence_number > 0
				const hasHash = doc.hash && doc.hash.length > 0

				let hashValid = true
				let chainValid = true

				if (!hasSequence || !hasHash) {
					hashValid = false
					chainValid = false
				} else {
					const expectedHash = await computeDocumentHash(doc)
					hashValid = doc.hash === expectedHash

					if (i === 0 || !allDocs[i - 1].sequence_number) {
						if (doc.sequence_number === 1) {
							chainValid =
								doc.previous_hash ===
								'0000000000000000000000000000000000000000000000000000000000000000'
						} else {
							const prevDocs = allDocs.filter(
								(d) => d.sequence_number === doc.sequence_number - 1,
							)
							if (prevDocs.length > 0) {
								chainValid = doc.previous_hash === prevDocs[0].hash
							}
						}
					} else {
						chainValid = doc.previous_hash === allDocs[i - 1].hash
					}
				}

				if (!chainValid) chainBreaks++

				const isValid = hashValid && chainValid

				if (isValid) {
					validCount++
				} else {
					invalidCount++
				}

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
		staleTime: 300000,
	})
}

export function useVerifyCreditNotesIntegrity(originalInvoiceId?: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: [...integrityKeys.all, 'credit-notes', originalInvoiceId],
		queryFn: async () => {
			if (!originalInvoiceId) return null

			const original = (await pb
				.collection('invoices')
				.getOne(originalInvoiceId)) as unknown as InvoiceResponse

			const creditNotes = (await pb.collection('invoices').getFullList({
				filter: `invoice_type = "credit_note" && original_invoice_id = "${originalInvoiceId}"`,
				sort: 'sequence_number',
			})) as unknown as InvoiceResponse[]

			const originalTotal = Math.abs(original.total_ttc)
			const refundedTotal = creditNotes.reduce(
				(sum, cn) => sum + Math.abs(cn.total_ttc),
				0,
			)
			const remainingAmount = originalTotal - refundedTotal

			const creditNoteResults: IntegrityCheckResult[] = []
			for (const cn of creditNotes) {
				const expectedHash = await computeDocumentHash(cn)
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
// FONCTIONS DE HASH - ALIGNÉES AVEC backend/hash/hash.go
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
 * Normalise un montant (arrondi à 2 décimales)
 * DOIT correspondre à normalizeAmount() dans hash.go
 */
function normalizeAmount(amount: number): number {
	return Math.round(amount * 100) / 100
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FONCTION DE HASH CENTRALISÉE - ALIGNÉE AVEC backend/hash/hash.go
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cette fonction DOIT produire EXACTEMENT le même hash que ComputeDocumentHash()
 * dans backend/hash/hash.go
 *
 * Champs inclus (ordre alphabétique) :
 * - customer, date, fiscal_year, invoice_type, number, owner_company
 * - previous_hash, sequence_number
 * - total_ht, total_ttc, total_tva
 * - original_invoice_id (si présent)
 *
 * Champs EXCLUS :
 * - items, currency, vat_breakdown, is_pos_ticket, session, etc.
 */
async function computeDocumentHash(invoice: InvoiceResponse): Promise<string> {
	// Construire les données avec les mêmes normalisations que le backend
	const data: Record<string, unknown> = {
		customer: invoice.customer,
		date: invoice.date, // Le backend garde la date telle quelle
		fiscal_year: invoice.fiscal_year,
		invoice_type: invoice.invoice_type,
		number: invoice.number,
		owner_company: invoice.owner_company,
		previous_hash: invoice.previous_hash,
		sequence_number: invoice.sequence_number,
		total_ht: normalizeAmount(invoice.total_ht),
		total_ttc: normalizeAmount(invoice.total_ttc),
		total_tva: normalizeAmount(invoice.total_tva),
	}

	// Ajouter original_invoice_id SEULEMENT si présent et non vide
	if (invoice.original_invoice_id) {
		data.original_invoice_id = invoice.original_invoice_id
	}

	// Trier les clés alphabétiquement (comme le backend)
	const orderedKeys = Object.keys(data).sort()

	// Construire le JSON manuellement (comme le backend Go)
	const parts: string[] = []
	for (const key of orderedKeys) {
		const keyJSON = JSON.stringify(key)
		const valueJSON = JSON.stringify(data[key])
		parts.push(`${keyJSON}:${valueJSON}`)
	}
	const jsonString = `{${parts.join(',')}}`

	// Debug: afficher le JSON hashé
	// console.log('JSON à hasher:', jsonString)

	return computeHashBrowser(jsonString)
}

// ============================================================================
// EXPORTS
// ============================================================================

export { computeHashBrowser, computeDocumentHash }
