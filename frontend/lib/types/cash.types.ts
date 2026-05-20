// frontend/lib/types/cash.types.ts
// ✅ VERSION AMÉLIORÉE avec TVA ventilée et conformité NF525

// ============================================================================
// TYPES DE BASE
// ============================================================================

export type CashSessionStatus = 'open' | 'closed' | 'canceled'

export type CashMovementType =
	| 'cash_in'
	| 'cash_out'
	| 'safe_drop'
	| 'adjustment'
	| 'refund_out'

// ============================================================================
// CAISSE (CASH REGISTER)
// ============================================================================

export interface CashRegister {
	id: string
	collectionId: string
	collectionName: 'cash_registers'
	name: string
	code?: string | null
	owner_company: string
	location?: string | null
	is_active?: boolean
	settings?: Record<string, any> | null
	created: string
	updated: string
}

// ============================================================================
// SESSION DE CAISSE
// ============================================================================

export interface CashSession {
	id: string
	collectionId: string
	collectionName: 'cash_sessions'
	owner_company: string
	cash_register: string
	opened_by: string
	closed_by?: string | null
	status: CashSessionStatus
	opened_at: string
	closed_at?: string | null
	opening_float?: number | null
	expected_cash_total?: number | null
	counted_cash_total?: number | null
	cash_difference?: number | null
	invoice_count?: number | null
	total_ttc?: number | null
	totals_by_method?: Record<string, number> | null
	z_report_id?: string | null // 🆕 Lien vers le rapport Z
	created: string
	updated: string
}

// ============================================================================
// MOUVEMENT DE CAISSE
// ============================================================================

export interface CashMovement {
	id: string
	collectionId: string
	collectionName: 'cash_movements'
	owner_company: string
	session: string
	created_by?: string | null
	movement_type: CashMovementType
	amount: number
	reason?: string | null
	meta?: Record<string, any> | null
	created: string
	updated: string
}

// ============================================================================
// 🆕 TVA VENTILÉE
// ============================================================================

export interface VATDetail {
	rate: number // Taux (ex: 20.0, 10.0, 5.5, 2.1)
	base_ht: number // Base HT
	vat_amount: number // Montant TVA
	total_ttc: number // Total TTC pour ce taux
}

export type VATByRate = Record<string, VATDetail> // Clé = "20.0", "10.0", etc.

// NOUVEAUX TYPES — RAPPORT X ENRICHI
// ============================================================================

// Ventilation par type de client (e-reporting)
export type CustomerType =
	| 'individual'
	| 'professional'
	| 'administration'
	| 'association'

export interface CustomerTypeSummary {
	count: number
	total_ht: number
	total_tva: number
	total_ttc: number
}

// Journal de caisse ligne par ligne
export interface MovementDetail {
	id: string
	movement_type:
		| 'cash_in'
		| 'cash_out'
		| 'refund_out'
		| 'safe_drop'
		| 'adjustment'
	amount: number
	reason: string
	created_at: string
	related_doc?: string // ID facture ou avoir lié
	created_by?: string // ID utilisateur
}

// Mouvements avec journal détaillé
export interface MovementsSummaryX {
	cash_in: number
	cash_out: number
	safe_drop: number
	total: number
	details: MovementDetail[]
}

// Ventes enrichies
export interface SalesSummaryX {
	invoice_count: number
	total_ht: number
	total_tva: number
	total_ttc: number
	net_ttc: number // total_ttc - avoirs
	by_method: Record<string, number>
	vat_by_rate: Record<string, any>
	net_by_method: Record<string, number>
	by_customer_type: Record<CustomerType, CustomerTypeSummary> // ventilation e-reporting
	deposits_count: number
	deposits_ttc: number
	by_method_labels?: Record<string, string>
}

export interface RefundsSummaryX {
	credit_notes_count: number
	total_ttc: number
	by_method: Record<string, number>
	by_method_labels?: Record<string, string>
}

// ============================================================================
// RAPPORT X (Lecture intermédiaire)
// ============================================================================

export interface RapportX {
	report_type: 'x'
	generated_at: string
	session: {
		id: string
		cash_register: string
		opened_at: string
		status: 'open' | 'closed'
	}
	opening_float: number
	sales: SalesSummaryX
	refunds: RefundsSummaryX
	movements: MovementsSummaryX // remplace l'ancien MovementsSummary
	expected_cash: {
		opening_float: number
		sales_cash: number
		movements: number
		total: number
	}
	note: string
}

// ============================================================================
// RAPPORT Z (Clôture journalière) - VERSION AMÉLIORÉE
// ============================================================================

export interface RapportZ {
	report_type: 'z'
	generated_at: string
	number: string // 🆕 Z-2025-000001
	sequence_number: number // 🆕
	hash: string // 🆕 SHA-256
	previous_hash: string // 🆕 Chaînage
	z_report_id: string // 🆕 ID en BDD
	cash_register: {
		id: string
		code: string
		name: string
	}
	date: string
	fiscal_year: number // 🆕
	sessions: RapportZSession[]
	daily_totals: RapportZDailyTotals
	note: string
	is_locked: boolean
}

export interface RapportZSession {
	id: string
	opened_at: string
	closed_at: string
	opened_by: string
	opened_by_name: string
	closed_by: string
	closed_by_name: string
	invoice_count: number
	total_ht: number // 🆕
	total_tva: number // 🆕
	total_ttc: number
	opening_float: number
	expected_cash_total: number
	counted_cash_total: number
	cash_difference: number
	totals_by_method: Record<string, number>
	vat_by_rate: VATByRate // 🆕
}

export interface RapportZDailyTotals {
	sessions_count: number
	invoice_count: number
	total_ht: number
	total_tva: number
	total_ttc: number

	by_method: Record<string, number>
	vat_by_rate: VATByRate

	total_cash_expected: number
	total_cash_counted: number
	total_cash_difference: number
	total_discounts: number

	credit_notes_count: number
	credit_notes_total: number

	// ✅ optionnels (dès que le backend les expose)
	refunds_by_method?: Record<string, number>
	net_by_method?: Record<string, number>
}

// ============================================================================
// 🆕 LISTE DES RAPPORTS Z
// ============================================================================

export interface ZReportListItem {
	id: string
	number: string
	date: string
	total_ttc: number
	invoice_count: number
	sessions_count: number
	generated_at: string
}

export interface ZReportCheckResponse {
	exists: boolean
	report_id?: string
	number?: string
	available_sessions?: number
	can_generate?: boolean
	message: string
}

// ============================================================================
// 🆕 RAPPORT Z STOCKÉ EN BDD
// ============================================================================

export interface ZReportRecord {
	id: string
	collectionId: string
	collectionName: 'z_reports'
	number: string
	owner_company: string
	cash_register: string
	date: string
	fiscal_year: number
	sequence_number: number
	session_ids: string[]
	sessions_count: number
	invoice_count: number
	total_ht: number
	total_tva: number
	total_ttc: number
	vat_breakdown: VATByRate
	totals_by_method: Record<string, number>
	total_cash_expected: number
	total_cash_counted: number
	total_cash_difference: number
	total_discounts: number
	credit_notes_count: number
	credit_notes_total: number
	hash: string
	previous_hash: string
	full_report: string // JSON stringifié du RapportZ complet
	generated_by?: string
	generated_at: string
	note: string
	created: string
	updated: string
}

// ============================================================================
// HELPERS POUR L'AFFICHAGE
// ============================================================================

export const VAT_RATE_LABELS: Record<string, string> = {
	'20.0': 'TVA 20%',
	'10.0': 'TVA 10%',
	'5.5': 'TVA 5,5%',
	'2.1': 'TVA 2,1%',
	'0.0': 'Exonéré',
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
	especes: 'Espèces',
	cb: 'Carte bancaire',
	cheque: 'Chèque',
	virement: 'Virement',
	autre: 'Autre',
}

export function getVATRateLabel(rate: string): string {
	return VAT_RATE_LABELS[rate] || `TVA ${rate}%`
}

export function getPaymentMethodLabel(method: string): string {
	return PAYMENT_METHOD_LABELS[method] || method
}

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
	individual: 'Particuliers (B2C)',
	professional: 'Professionnels (B2B)',
	administration: 'Administrations (B2B)',
	association: 'Associations (B2B)',
}

export const CUSTOMER_TYPE_EREPORTING: Record<CustomerType, 'B2C' | 'B2B'> = {
	individual: 'B2C',
	professional: 'B2B',
	administration: 'B2B',
	association: 'B2B',
}

export function getCustomerTypeLabel(type: CustomerType): string {
	return CUSTOMER_TYPE_LABELS[type] ?? type
}

export function isB2C(type: CustomerType): boolean {
	return CUSTOMER_TYPE_EREPORTING[type] === 'B2C'
}

// Agrège les totaux B2C et B2B depuis by_customer_type
export function aggregateEreporting(
	byCustomerType: Record<string, CustomerTypeSummary>,
): {
	b2c: CustomerTypeSummary
	b2b: CustomerTypeSummary
} {
	const b2c: CustomerTypeSummary = {
		count: 0,
		total_ht: 0,
		total_tva: 0,
		total_ttc: 0,
	}
	const b2b: CustomerTypeSummary = {
		count: 0,
		total_ht: 0,
		total_tva: 0,
		total_ttc: 0,
	}

	for (const [type, summary] of Object.entries(byCustomerType)) {
		const target = isB2C(type as CustomerType) ? b2c : b2b
		target.count += summary.count
		target.total_ht += summary.total_ht
		target.total_tva += summary.total_tva
		target.total_ttc += summary.total_ttc
	}

	return { b2c, b2b }
}
