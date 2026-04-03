// frontend/modules/cash/components/ticket-detail/useTicketDetail.ts
//
// Responsabilité unique : fetching + calculs dérivés du ticket.
// Zéro effet de bord UI, zéro action métier — juste des données.

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import type { CompaniesResponse } from '@/lib/pocketbase-types'
import { useDepositsForInvoice } from '@/lib/queries/deposits'
import { useCreditNotesForInvoice, useInvoice } from '@/lib/queries/invoices'
import {
	type InvoiceResponse,
	getDisplayStatus,
	isOverdue,
} from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useEffect, useMemo, useState } from 'react'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export type VatBreakdown = {
	rate: number
	base_ht: number
	vat: number
	total_ttc: number
}

export type DiscountSummary = {
	hasAnyDiscount: boolean
	totalTtc: number
	grandSubtotal: number
	lineDiscountsTtc: number
	cartDiscountTtc: number
	cartDiscountLabel: string
}

export interface TicketDetailData {
	// État de chargement
	isLoading: boolean
	invoice: InvoiceResponse | undefined

	// Société
	company: CompaniesResponse | null

	// Données liées
	depositsData: ReturnType<typeof useDepositsForInvoice>['data']
	linkedCreditNotes: ReturnType<typeof useCreditNotesForInvoice>['data']

	// Flags sémantiques
	isCreditNote: boolean
	isDeposit: boolean
	isTicket: boolean
	overdue: boolean
	remainingAmount: number
	needsTicketSidebar: boolean

	// Calculs
	vatBreakdown: VatBreakdown[]
	discounts: DiscountSummary
	displayStatus: ReturnType<typeof getDisplayStatus>

	// Helpers d'affichage
	customer: any
	originalId: string | undefined
	originalNumber: string | undefined
	soldByLabel: string
}

function getSoldByLabel(invoice: any): string {
	const soldBy = invoice?.expand?.sold_by
	return (
		soldBy?.name ||
		soldBy?.username ||
		soldBy?.email ||
		(invoice?.sold_by ? String(invoice.sold_by) : '-')
	)
}

export function useTicketDetail(invoiceId: string): TicketDetailData {
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase() as any

	const { data: invoice, isLoading } = useInvoice(invoiceId)
	const [company, setCompany] = useState<CompaniesResponse | null>(null)

	const isCreditNote = invoice?.invoice_type === 'credit_note'
	const isDeposit = invoice?.invoice_type === 'deposit'
	const isTicket = !!invoice?.is_pos_ticket
	const originalId = (invoice as any)?.original_invoice_id as string | undefined

	const { data: depositsData } = useDepositsForInvoice(
		!isCreditNote && !isDeposit ? invoiceId : undefined,
	)
	const { data: linkedCreditNotes } = useCreditNotesForInvoice(
		!isCreditNote ? invoiceId : undefined,
	)

	// Chargement de l'entreprise active
	useEffect(() => {
		if (!activeCompanyId) return
		pb.collection('companies')
			.getOne(activeCompanyId)
			.then((c: CompaniesResponse) => setCompany(c))
			.catch((err: unknown) => console.error(err))
	}, [activeCompanyId, pb])

	const vatBreakdown = useMemo<VatBreakdown[]>(() => {
		const items = Array.isArray((invoice as any)?.items)
			? (invoice as any).items
			: []
		const map = new Map<number, VatBreakdown>()
		for (const it of items) {
			const rate = Number(it?.tva_rate ?? 20)
			const ht = Number(it?.total_ht ?? 0)
			const ttc = Number(it?.total_ttc ?? 0)
			const vat = ttc - ht
			const entry = map.get(rate) ?? { rate, base_ht: 0, vat: 0, total_ttc: 0 }
			entry.base_ht = round2(entry.base_ht + ht)
			entry.vat = round2(entry.vat + vat)
			entry.total_ttc = round2(entry.total_ttc + ttc)
			map.set(rate, entry)
		}
		return Array.from(map.values()).sort((a, b) => a.rate - b.rate)
	}, [invoice])

	const discounts = useMemo<DiscountSummary>(() => {
		const inv: any = invoice
		const totalTtc = Number(inv?.total_ttc ?? 0)
		const lineDiscountsTtc = Number(inv?.line_discounts_total_ttc ?? 0)
		const cartDiscountTtc = Number(inv?.cart_discount_ttc ?? 0)
		const subtotalAfterLine = round2(totalTtc + cartDiscountTtc)
		const grandSubtotal = round2(subtotalAfterLine + lineDiscountsTtc)
		const hasAnyDiscount = lineDiscountsTtc > 0 || cartDiscountTtc > 0

		let cartDiscountLabel = ''
		const mode = inv?.cart_discount_mode
		const value = inv?.cart_discount_value
		if (cartDiscountTtc > 0 && mode && value != null) {
			cartDiscountLabel =
				mode === 'percent'
					? `(${Number(value) || 0}%)`
					: `(${round2(Number(value) || 0).toFixed(2)} €)`
		}

		return {
			hasAnyDiscount,
			totalTtc: round2(totalTtc),
			grandSubtotal,
			lineDiscountsTtc: round2(lineDiscountsTtc),
			cartDiscountTtc: round2(cartDiscountTtc),
			cartDiscountLabel,
		}
	}, [invoice])

	const displayStatus = invoice
		? getDisplayStatus(invoice)
		: { label: '', variant: 'outline' as const, isPaid: false }

	const overdue = invoice ? isOverdue(invoice) : false

	const remainingAmount =
		typeof (invoice as any)?.remaining_amount === 'number'
			? (invoice as any).remaining_amount
			: (invoice?.total_ttc ?? 0) - ((invoice as any)?.credit_notes_total ?? 0)

	const hasTicketLinkedDocs =
		(invoice?.converted_to_invoice && invoice?.converted_invoice_id) ||
		(linkedCreditNotes && linkedCreditNotes.length > 0)
	const hasTicketNotes = !!invoice?.notes
	const needsTicketSidebar = !!(
		hasTicketLinkedDocs ||
		hasTicketNotes ||
		remainingAmount <= 0
	)

	const originalDocument = (invoice as any)?.expand?.original_invoice_id
	const customer = (invoice as any)?.expand?.customer ?? null

	return {
		isLoading,
		invoice,
		company,
		depositsData,
		linkedCreditNotes,
		isCreditNote,
		isDeposit,
		isTicket,
		overdue,
		remainingAmount,
		needsTicketSidebar,
		vatBreakdown,
		discounts,
		displayStatus,
		customer,
		originalId,
		originalNumber: originalDocument?.number,
		soldByLabel: invoice ? getSoldByLabel(invoice) : '-',
	}
}
