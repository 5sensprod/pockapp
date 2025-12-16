/**
 * This file was @generated using pocketbase-typegen
 * Updated for ISCA v2 - is_paid separated from status
 */

import type PocketBase from 'pocketbase'
import type { RecordService } from 'pocketbase'

export enum Collections {
	Brands = 'brands',
	Categories = 'categories',
	Companies = 'companies',
	Customers = 'customers',
	Invoices = 'invoices',
	Closures = 'closures',
	AuditLogs = 'audit_logs',
	Notes = 'notes',
	Products = 'products',
	Suppliers = 'suppliers',
	Users = 'users',
}

// Alias types for improved usability
export type IsoDateString = string
export type RecordIdString = string
export type HTMLString = string

// ============================================================================
// SYSTEM FIELDS
// ============================================================================

export type BaseSystemFields<T = never> = {
	id: RecordIdString
	created: IsoDateString
	updated: IsoDateString
	collectionId: string
	collectionName: Collections
	expand?: T
}

export type AuthSystemFields<T = never> = {
	email: string
	emailVisibility: boolean
	username: string
	verified: boolean
} & BaseSystemFields<T>

// ============================================================================
// RECORD TYPES
// ============================================================================

// BRANDS
export type BrandsRecord = {
	company: RecordIdString
	description?: string
	logo?: string
	name: string
	website?: string
}

// CATEGORIES
export type CategoriesRecord = {
	color?: string
	company: RecordIdString
	icon?: string
	name: string
	order?: number
	parent?: RecordIdString
}

// COMPANIES
export enum CompaniesDefaultPaymentMethodOptions {
	virement = 'virement',
	cb = 'cb',
	especes = 'especes',
	cheque = 'cheque',
	autre = 'autre',
}

export type CompaniesRecord = {
	account_holder?: string
	active?: boolean
	address_line1?: string
	address_line2?: string
	ape_naf?: string
	bank_name?: string
	bic?: string
	city?: string
	country?: string
	default_payment_method?: CompaniesDefaultPaymentMethodOptions
	default_payment_terms_days?: number
	email?: string
	iban?: string
	invoice_footer?: string
	invoice_prefix?: string
	is_default?: boolean
	legal_form?: string
	logo?: string
	name: string
	phone?: string
	rcs?: string
	share_capital?: number
	siren?: string
	siret?: string
	trade_name?: string
	vat_number?: string
	website?: string
	zip_code?: string
}

// CUSTOMERS
export enum CustomersTagsOptions {
	vip = 'vip',
	prospect = 'prospect',
	actif = 'actif',
	inactif = 'inactif',
}

export type CustomersRecord = {
	address?: string
	avatar?: string
	company?: string
	email?: string
	name: string
	notes?: string
	owner_company: RecordIdString
	phone?: string
	tags?: CustomersTagsOptions[]
}

// ============================================================================
// INVOICES — FACTURES SÉCURISÉES (ISCA v2)
// ============================================================================

// Statuts workflow (SANS "paid" - c'est maintenant un champ séparé)
export enum InvoicesStatusOptions {
	draft = 'draft',
	validated = 'validated',
	sent = 'sent',
}

// Type de facture
export enum InvoicesInvoiceTypeOptions {
	invoice = 'invoice',
	credit_note = 'credit_note',
}

// Méthodes de paiement
export enum InvoicesPaymentMethodOptions {
	virement = 'virement',
	cb = 'cb',
	especes = 'especes',
	cheque = 'cheque',
	autre = 'autre',
}

// Items de facture
export type InvoiceItem = {
	product_id?: string
	name: string
	quantity: number
	unit_price_ht: number
	tva_rate: number
	total_ht: number
	total_ttc: number
}

// Record côté PocketBase
export type InvoicesRecord = {
	// Identification
	number: string
	invoice_type: InvoicesInvoiceTypeOptions

	// Dates
	date: IsoDateString
	due_date?: IsoDateString

	// Relations
	customer: RecordIdString
	owner_company: RecordIdString

	// Workflow
	status: InvoicesStatusOptions

	// Paiement
	is_paid?: boolean
	paid_at?: IsoDateString
	payment_method?: InvoicesPaymentMethodOptions

	// Contenu
	items: InvoiceItem[]
	total_ht: number
	total_tva: number
	total_ttc: number
	currency: string
	notes?: string

	// Intégrité / ISCA
	sequence_number?: number
	fiscal_year?: number
	hash?: string
	previous_hash?: string
	is_locked?: boolean

	// Avoirs
	original_invoice_id?: RecordIdString
	cancellation_reason?: string

	// Clôture
	closure_id?: RecordIdString

	// ✅ POS / conversion
	converted_to_invoice?: boolean
	converted_invoice_id?: RecordIdString
	is_pos_ticket?: boolean
}

// ============================================================================
// CLOSURES - Clôtures périodiques
// ============================================================================

export enum ClosuresClosureTypeOptions {
	daily = 'daily',
	monthly = 'monthly',
	annual = 'annual',
}

export type ClosuresRecord = {
	closure_type: ClosuresClosureTypeOptions
	owner_company: RecordIdString
	period_start: IsoDateString
	period_end: IsoDateString
	fiscal_year: number
	invoice_count?: number
	credit_note_count?: number
	total_ht?: number
	total_tva?: number
	total_ttc?: number
	first_sequence?: number
	last_sequence?: number
	first_hash?: string
	last_hash?: string
	cumulative_hash?: string
	closure_hash?: string
	closed_by?: RecordIdString
}

// ============================================================================
// AUDIT_LOGS - Piste d'audit
// ============================================================================

export enum AuditLogsActionOptions {
	invoice_created = 'invoice_created',
	invoice_validated = 'invoice_validated',
	invoice_sent = 'invoice_sent',
	payment_recorded = 'payment_recorded',
	credit_note_created = 'credit_note_created',
	closure_performed = 'closure_performed',
	integrity_check = 'integrity_check',
	export_generated = 'export_generated',
	pdf_generated = 'pdf_generated',
}

export enum AuditLogsEntityTypeOptions {
	invoice = 'invoice',
	credit_note = 'credit_note',
	closure = 'closure',
}

export type AuditLogsRecord = {
	action: AuditLogsActionOptions
	entity_type: AuditLogsEntityTypeOptions
	entity_id: string
	entity_number?: string
	owner_company: RecordIdString
	user_id?: RecordIdString
	user_email?: string
	ip_address?: string
	user_agent?: string
	details?: Record<string, unknown>
	previous_values?: Record<string, unknown>
	new_values?: Record<string, unknown>
	hash?: string
	previous_hash?: string
}

// NOTES
export type NotesRecord = {
	content?: string
	title?: string
}

// PRODUCTS
export type ProductsRecord = {
	active?: boolean
	barcode?: string
	brand?: RecordIdString
	categories?: RecordIdString[]
	company: RecordIdString
	cost_price?: number
	description?: string
	images?: string
	name: string
	price_ht?: number
	price_ttc?: number
	sku?: string
	stock_quantity?: number
	stock_min?: number
	stock_max?: number
	supplier?: RecordIdString
	tva_rate?: number
	unit?: string
	weight?: number
}

// SUPPLIERS
export type SuppliersRecord = {
	active?: boolean
	address?: string
	brands?: RecordIdString[]
	company: RecordIdString
	contact?: string
	email?: string
	name: string
	notes?: string
	phone?: string
}

// USERS
export type UsersRecord = {
	avatar?: string
	name?: string
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export type BrandsResponse<Texpand = unknown> = Required<BrandsRecord> &
	BaseSystemFields<Texpand>

export type CategoriesResponse<Texpand = unknown> = Required<CategoriesRecord> &
	BaseSystemFields<Texpand>

export type CompaniesResponse<Texpand = unknown> = Required<CompaniesRecord> &
	BaseSystemFields<Texpand>

export type CustomersResponse<Texpand = unknown> = Required<CustomersRecord> &
	BaseSystemFields<Texpand>

export type InvoicesResponse<Texpand = unknown> = Required<InvoicesRecord> &
	BaseSystemFields<Texpand>

export type ClosuresResponse<Texpand = unknown> = Required<ClosuresRecord> &
	BaseSystemFields<Texpand>

export type AuditLogsResponse<Texpand = unknown> = Required<AuditLogsRecord> &
	BaseSystemFields<Texpand>

export type NotesResponse<Texpand = unknown> = Required<NotesRecord> &
	BaseSystemFields<Texpand>

export type ProductsResponse<Texpand = unknown> = Required<ProductsRecord> &
	BaseSystemFields<Texpand>

export type SuppliersResponse<Texpand = unknown> = Required<SuppliersRecord> &
	BaseSystemFields<Texpand>

export type UsersResponse<Texpand = unknown> = Required<UsersRecord> &
	AuthSystemFields<Texpand>

// ============================================================================
// COLLECTION RECORD/RESPONSE MAPS
// ============================================================================

export type CollectionRecords = {
	brands: BrandsRecord
	categories: CategoriesRecord
	companies: CompaniesRecord
	customers: CustomersRecord
	invoices: InvoicesRecord
	closures: ClosuresRecord
	audit_logs: AuditLogsRecord
	notes: NotesRecord
	products: ProductsRecord
	suppliers: SuppliersRecord
	users: UsersRecord
}

export type CollectionResponses = {
	brands: BrandsResponse
	categories: CategoriesResponse
	companies: CompaniesResponse
	customers: CustomersResponse
	invoices: InvoicesResponse
	closures: ClosuresResponse
	audit_logs: AuditLogsResponse
	notes: NotesResponse
	products: ProductsResponse
	suppliers: SuppliersResponse
	users: UsersResponse
}

// ============================================================================
// TYPED POCKETBASE CLIENT
// ============================================================================

export type TypedPocketBase = PocketBase & {
	collection(idOrName: 'brands'): RecordService<BrandsResponse>
	collection(idOrName: 'categories'): RecordService<CategoriesResponse>
	collection(idOrName: 'companies'): RecordService<CompaniesResponse>
	collection(idOrName: 'customers'): RecordService<CustomersResponse>
	collection(idOrName: 'invoices'): RecordService<InvoicesResponse>
	collection(idOrName: 'closures'): RecordService<ClosuresResponse>
	collection(idOrName: 'audit_logs'): RecordService<AuditLogsResponse>
	collection(idOrName: 'notes'): RecordService<NotesResponse>
	collection(idOrName: 'products'): RecordService<ProductsResponse>
	collection(idOrName: 'suppliers'): RecordService<SuppliersResponse>
	collection(idOrName: 'users'): RecordService<UsersResponse>
}

// ============================================================================
// ALIAS MÉTIER
// ============================================================================

export type InvoiceType = InvoicesInvoiceTypeOptions
export type InvoiceStatus = InvoicesStatusOptions
export type PaymentMethod = InvoicesPaymentMethodOptions
export type ClosureType = ClosuresClosureTypeOptions
export type AuditAction = AuditLogsActionOptions

// Transitions de statut autorisées (workflow uniquement)
export const ALLOWED_STATUS_TRANSITIONS: Record<
	InvoiceStatus,
	InvoiceStatus[]
> = {
	draft: [InvoicesStatusOptions.validated],
	validated: [InvoicesStatusOptions.sent],
	sent: [],
}

export function canTransitionTo(
	currentStatus: InvoiceStatus,
	targetStatus: InvoiceStatus,
): boolean {
	return (
		ALLOWED_STATUS_TRANSITIONS[currentStatus]?.includes(targetStatus) ?? false
	)
}

export function isInvoiceLocked(invoice: InvoicesResponse): boolean {
	return invoice.is_locked || invoice.status !== InvoicesStatusOptions.draft
}

export function canMarkAsPaid(invoice: InvoicesResponse): boolean {
	return (
		invoice.invoice_type === InvoicesInvoiceTypeOptions.invoice &&
		!invoice.is_paid &&
		invoice.status !== InvoicesStatusOptions.draft
	)
}
