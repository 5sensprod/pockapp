// frontend/lib/types/invoice.types.ts
// Types pour le système de facturation conforme ISCA

// ============================================================================
// ENUMS
// ============================================================================

export type InvoiceType = 'invoice' | 'credit_note'

// IMPORTANT: 'cancelled' a été supprimé - on utilise les avoirs maintenant
export type InvoiceStatus = 'draft' | 'validated' | 'sent' | 'paid'

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
	items: InvoiceItem[]
	total_ht: number
	total_tva: number
	total_ttc: number
	currency: string
	notes?: string
	payment_method?: PaymentMethod
	paid_at?: string
}

// Pour la création (les champs hash/sequence sont générés par le backend)
export interface InvoiceCreateDto extends Omit<InvoiceBase, 'invoice_type'> {
	invoice_type?: 'invoice' // Par défaut
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
	// Si correction partielle, on peut spécifier les items
	items?: InvoiceItem[]
	// Sinon, on reprend automatiquement les items de la facture d'origine (inversés)
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
// TRANSITIONS DE STATUT AUTORISÉES
// ============================================================================

export const ALLOWED_STATUS_TRANSITIONS: Record<
	InvoiceStatus,
	InvoiceStatus[]
> = {
	draft: ['validated'],
	validated: ['sent', 'paid'],
	sent: ['paid'],
	paid: [], // Terminal
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
	// On peut créer un avoir pour annuler une facture validée/envoyée/payée
	// mais pas pour un brouillon (on peut juste le modifier)
	return invoice.invoice_type === 'invoice' && invoice.status !== 'draft'
}

export function getInvoiceTypeLabel(type: InvoiceType): string {
	return type === 'invoice' ? 'Facture' : 'Avoir'
}

export function getStatusLabel(status: InvoiceStatus): string {
	const labels: Record<InvoiceStatus, string> = {
		draft: 'Brouillon',
		validated: 'Validée',
		sent: 'Envoyée',
		paid: 'Payée',
	}
	return labels[status]
}

export function getStatusColor(status: InvoiceStatus): string {
	const colors: Record<InvoiceStatus, string> = {
		draft: 'bg-gray-100 text-gray-800',
		validated: 'bg-blue-100 text-blue-800',
		sent: 'bg-amber-100 text-amber-800',
		paid: 'bg-green-100 text-green-800',
	}
	return colors[status]
}
