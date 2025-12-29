// frontend/lib/types/invoice.types.ts
// Types pour le système de facturation conforme ISCA v2
// NOUVEAU: is_paid est séparé du statut

// ============================================================================
// ENUMS
// ============================================================================

export type InvoiceType = 'invoice' | 'credit_note'

// NOUVEAU: Le statut ne contient plus "paid" - c'est un champ séparé
export type InvoiceStatus = 'draft' | 'validated' | 'sent'

export type PaymentMethod = 'virement' | 'cb' | 'especes' | 'cheque' | 'autre'

export type CreditNoteReason =
	| 'cancellation'
	| 'correction'
	| 'return'
	| 'discount'

export type AuditAction =
	| 'invoice_created'
	| 'invoice_validated'
	| 'invoice_sent'
	| 'payment_recorded'
	| 'credit_note_created'
	| 'closure_performed'
	| 'integrity_check'
	| 'export_generated'
	| 'pdf_generated'

export type ClosureType = 'daily' | 'monthly' | 'annual'

// ============================================================================
// INVOICE ITEM
// ============================================================================

export interface InvoiceItem {
	product_id?: string
	name: string
	quantity: number
	unit_price_ht: number
	tva_rate: number // 0, 5.5, 10, 20
	total_ht: number
	total_ttc: number
	line_discount_mode?: 'percent' | 'amount'
	line_discount_value?: number
	unit_price_ttc_before_discount?: number
}

// ============================================================================
// INVOICE (Base)
// ============================================================================

export interface InvoiceBase {
	number: string
	invoice_type: InvoiceType
	date: string
	due_date?: string
	customer: string
	owner_company: string
	status: InvoiceStatus
	// NOUVEAU: Paiement séparé
	is_paid: boolean
	paid_at?: string
	payment_method?: PaymentMethod
	// Contenu
	items: InvoiceItem[]
	total_ht: number
	total_tva: number
	total_ttc: number
	currency: string
	notes?: string

	// 🔹 LIAISON CAISSE / POS
	session?: string
	cash_register?: string
	sold_by?: string

	cart_discount_mode?: 'percent' | 'amount'
	cart_discount_value?: number
	cart_discount_ttc?: number
	line_discounts_total_ttc?: number
}

// Pour la création (hash/sequence générés par le backend)
export interface InvoiceCreateDto
	extends Omit<InvoiceBase, 'invoice_type' | 'is_paid'> {
	invoice_type?: 'invoice'
	is_paid?: boolean
}

// Réponse complète avec champs système et intégrité
export interface InvoiceResponse extends InvoiceBase {
	id: string
	created: string
	updated: string
	// Champs ISCA
	original_invoice_id?: string
	sequence_number: number
	fiscal_year: number
	hash: string
	previous_hash: string
	is_locked: boolean
	closure_id?: string
	cancellation_reason?: string
	// Expand
	expand?: {
		customer?: CustomerExpand
		original_invoice_id?: InvoiceResponse
	}
	converted_to_invoice: boolean
	converted_invoice_id?: string
	is_pos_ticket: boolean
	has_credit_note?: boolean
	credit_notes_total?: number
	remaining_amount?: number
}

export interface CustomerExpand {
	id: string
	name: string
	email?: string
	phone?: string
	address?: string
	company?: string
}

// ============================================================================
// CREDIT NOTE (Avoir)
// ============================================================================

export interface CreditNoteCreateDto {
	original_invoice_id: string
	reason: CreditNoteReason
	reason_details: string
	items?: InvoiceItem[]
}

// ============================================================================
// QUOTES (Devis)
// ============================================================================

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected'

export interface QuoteBase {
	number: string
	date: string
	valid_until?: string
	customer: string
	owner_company: string
	status: QuoteStatus
	items: InvoiceItem[]
	total_ht: number
	total_tva: number
	total_ttc: number
	currency: string
	notes?: string

	// ✅ NOUVEAU : Champs ajoutés pour correspondre à la logique Invoice
	issued_by?: string

	cart_discount_mode?: 'percent' | 'amount'
	cart_discount_value?: number
	cart_discount_ttc?: number
	line_discounts_total_ttc?: number
}

export interface QuoteCreateDto extends QuoteBase {}

export interface QuoteResponse extends QuoteBase {
	id: string
	created: string
	updated: string
	generated_invoice_id?: string
	vat_breakdown?: any[]
	expand?: {
		customer?: CustomerExpand
		generated_invoice_id?: InvoiceResponse
		issued_by?: {
			id: string
			email?: string
			name?: string
			username?: string
		}
	}
}
export interface QuotesListOptions {
	companyId?: string
	customerId?: string
	status?: QuoteStatus
	filter?: string
	sort?: string
	page?: number
	perPage?: number
}

// ============================================================================
// CLOSURE (Clôture)
// ============================================================================

export interface ClosureResponse {
	id: string
	closure_type: ClosureType
	owner_company: string
	period_start: string
	period_end: string
	fiscal_year: number
	invoice_count: number
	credit_note_count: number
	total_ht: number
	total_tva: number
	total_ttc: number
	first_sequence: number
	last_sequence: number
	first_hash: string
	last_hash: string
	cumulative_hash: string
	closure_hash: string
	closed_by: string
	created: string
}

// ============================================================================
// AUDIT LOG
// ============================================================================

export interface AuditLogResponse {
	id: string
	action: AuditAction
	entity_type: 'invoice' | 'credit_note' | 'closure'
	entity_id: string
	entity_number?: string
	owner_company: string
	user_id?: string
	user_email?: string
	ip_address?: string
	user_agent?: string
	details?: Record<string, unknown>
	previous_values?: Record<string, unknown>
	new_values?: Record<string, unknown>
	hash: string
	previous_hash: string
	created: string
}

// ============================================================================
// INTEGRITY CHECK
// ============================================================================

export interface IntegrityCheckResult {
	isValid: boolean
	checkedAt: string
	invoiceId: string
	invoiceNumber: string
	expectedHash: string
	actualHash: string
	chainValid: boolean
	errors: string[]
}

// ============================================================================
// LISTE OPTIONS
// ============================================================================

export interface InvoicesListOptions {
	companyId?: string
	customerId?: string
	status?: InvoiceStatus
	invoiceType?: InvoiceType
	fiscalYear?: number
	isPaid?: boolean // NOUVEAU
	filter?: string
	sort?: string
	page?: number
	perPage?: number
}

export interface ClosuresListOptions {
	companyId?: string
	closureType?: ClosureType
	fiscalYear?: number
	sort?: string
}

export interface AuditLogsListOptions {
	companyId?: string
	entityType?: 'invoice' | 'credit_note' | 'closure'
	entityId?: string
	action?: AuditAction
	startDate?: string
	endDate?: string
	sort?: string
	page?: number
	perPage?: number
}

// ============================================================================
// TRANSITIONS DE STATUT AUTORISÉES (workflow d'envoi uniquement)
// ============================================================================

export const ALLOWED_STATUS_TRANSITIONS: Record<
	InvoiceStatus,
	InvoiceStatus[]
> = {
	draft: ['validated'],
	validated: ['sent'],
	sent: [], // Terminal pour le workflow
}

export function canTransitionTo(
	currentStatus: InvoiceStatus,
	targetStatus: InvoiceStatus,
): boolean {
	return (
		ALLOWED_STATUS_TRANSITIONS[currentStatus]?.includes(targetStatus) ?? false
	)
}

// ============================================================================
// HELPERS
// ============================================================================

export function isInvoiceLocked(invoice: InvoiceResponse): boolean {
	return invoice.is_locked || invoice.status !== 'draft'
}

export function canEditInvoice(invoice: InvoiceResponse): boolean {
	return invoice.status === 'draft' && !invoice.is_locked
}

export function canCancelInvoice(invoice: InvoiceResponse): boolean {
	// On peut créer un avoir pour annuler une facture validée/envoyée
	// mais pas pour un brouillon (on peut juste le modifier)
	return invoice.invoice_type === 'invoice' && invoice.status !== 'draft'
}

export function canMarkAsPaid(invoice: InvoiceResponse): boolean {
	// On peut marquer comme payée si:
	// - C'est une facture (pas un avoir)
	// - Elle n'est pas déjà payée
	// - Elle n'est pas en brouillon
	return (
		invoice.invoice_type === 'invoice' &&
		!invoice.is_paid &&
		invoice.status !== 'draft'
	)
}

export function getInvoiceTypeLabel(type: InvoiceType): string {
	return type === 'invoice' ? 'Facture' : 'Avoir'
}

export function getStatusLabel(status: InvoiceStatus): string {
	const labels: Record<InvoiceStatus, string> = {
		draft: 'Brouillon',
		validated: 'Validée',
		sent: 'Envoyée',
	}
	return labels[status]
}

export function getStatusColor(status: InvoiceStatus): string {
	const colors: Record<InvoiceStatus, string> = {
		draft: 'bg-gray-100 text-gray-800',
		validated: 'bg-blue-100 text-blue-800',
		sent: 'bg-amber-100 text-amber-800',
	}
	return colors[status]
}

// NOUVEAU: Helper pour afficher le statut combiné (workflow + paiement)
export function getDisplayStatus(invoice: InvoiceResponse): {
	label: string
	variant: 'default' | 'secondary' | 'destructive' | 'outline'
	isPaid: boolean
} {
	if (invoice.invoice_type === 'credit_note') {
		return { label: 'Avoir', variant: 'destructive', isPaid: false }
	}

	if (invoice.is_paid) {
		return { label: 'Payée', variant: 'default', isPaid: true }
	}

	const statusConfig: Record<
		InvoiceStatus,
		{
			label: string
			variant: 'default' | 'secondary' | 'destructive' | 'outline'
		}
	> = {
		draft: { label: 'Brouillon', variant: 'secondary' },
		validated: { label: 'Validée', variant: 'outline' },
		sent: { label: 'Envoyée', variant: 'outline' },
	}

	return { ...statusConfig[invoice.status], isPaid: false }
}

// NOUVEAU: Vérifier si une facture est en retard de paiement
export function isOverdue(invoice: InvoiceResponse): boolean {
	if (invoice.is_paid || invoice.status === 'draft') {
		return false
	}

	if (!invoice.due_date) {
		return false
	}

	const dueDate = new Date(invoice.due_date)
	const today = new Date()
	today.setHours(0, 0, 0, 0)

	return dueDate < today
}
