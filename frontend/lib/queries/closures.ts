// frontend/lib/queries/closures.ts
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
	chain: (companyId: string) =>
		[...integrityKeys.all, 'chain', companyId] as const,
}

// ============================================================================
// CLÔTURES
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
 * 🔒 Effectuer une clôture journalière
 */
export function usePerformDailyClosure() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (companyId: string) => {
			// Calculer les dates de la journée
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

			// Récupérer toutes les factures de la journée
			const invoices = (await pb.collection('invoices').getFullList({
				filter: `owner_company = "${companyId}" && created >= "${startOfDay.toISOString()}" && created <= "${endOfDay.toISOString()}"`,
				sort: 'sequence_number',
			})) as unknown as InvoiceResponse[]

			// Séparer factures et avoirs
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
 * 🔐 Vérifier l'intégrité d'une facture individuelle
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
				// Récupérer la facture précédente
				const previousInvoices = await pb.collection('invoices').getList(1, 1, {
					filter: `owner_company = "${invoice.owner_company}" && sequence_number = ${invoice.sequence_number - 1}`,
				})

				if (previousInvoices.items.length > 0) {
					const previous = previousInvoices
						.items[0] as unknown as InvoiceResponse
					chainValid = invoice.previous_hash === previous.hash
				}
			} else {
				// Première facture - doit avoir le genesis hash
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
		staleTime: 60000, // 1 minute
	})
}

/**
 * 🔗 Vérifier l'intégrité de toute la chaîne de factures
 */
export function useVerifyInvoiceChain() {
	const pb = usePocketBase()

	return useMutation({
		mutationFn: async (companyId: string) => {
			const invoices = (await pb.collection('invoices').getFullList({
				filter: `owner_company = "${companyId}"`,
				sort: 'sequence_number',
			})) as unknown as InvoiceResponse[]

			const results: IntegrityCheckResult[] = []
			let allValid = true

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
				let chainValid = true
				if (i === 0) {
					chainValid =
						invoice.previous_hash ===
						'0000000000000000000000000000000000000000000000000000000000000000'
				} else {
					chainValid = invoice.previous_hash === invoices[i - 1].hash
				}

				if (!chainValid) {
					errors.push(`Rupture de chaîne à ${invoice.number}`)
					allValid = false
				}

				results.push({
					isValid: hashValid && chainValid,
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
				details: results,
			}
		},
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
 * Calcule le hash d'une facture côté navigateur
 * ⚠️ Doit correspondre EXACTEMENT à la logique backend
 */
async function computeInvoiceHashBrowser(
	invoice: InvoiceResponse,
): Promise<string> {
	// Structure identique au backend (ordre alphabétique des clés)
	const data: Record<string, unknown> = {
		currency: invoice.currency,
		customer: invoice.customer,
		date: invoice.date,
		fiscal_year: invoice.fiscal_year,
		invoice_type: invoice.invoice_type,
		items: invoice.items,
		number: invoice.number,
		owner_company: invoice.owner_company,
		previous_hash: invoice.previous_hash,
		sequence_number: invoice.sequence_number,
		total_ht: invoice.total_ht,
		total_ttc: invoice.total_ttc,
		total_tva: invoice.total_tva,
	}

	if (invoice.original_invoice_id) {
		data.original_invoice_id = invoice.original_invoice_id
	}

	// Sérialisation avec clés ordonnées
	const orderedKeys = Object.keys(data).sort()
	const orderedData: Record<string, unknown> = {}
	for (const key of orderedKeys) {
		orderedData[key] = data[key]
	}

	const jsonString = JSON.stringify(orderedData)
	return computeHashBrowser(jsonString)
}

// ============================================================================
// EXPORTS
// ============================================================================

export { computeHashBrowser, computeInvoiceHashBrowser }
