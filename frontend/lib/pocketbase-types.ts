/**
 * This file was @generated using pocketbase-typegen
 * Updated manually to add invoices collection and ISCA-compliant invoice fields
 */

import type PocketBase from 'pocketbase'
import type { RecordService } from 'pocketbase'

export enum Collections {
	Brands = 'brands',
	Categories = 'categories',
	Companies = 'companies',
	Customers = 'customers',
	Invoices = 'invoices',
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
// INVOICES – FACTURES SÉCURISÉES (ISCA)
// ============================================================================

// Statuts ISCA (plus de "cancelled", on passe par des avoirs)
export enum InvoicesStatusOptions {
	draft = 'draft',
	validated = 'validated',
	sent = 'sent',
	paid = 'paid',
}

// Type de facture : facture normale ou avoir
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

// Items de facture (stockés en JSON dans le champ items)
export type InvoiceItem = {
	product_id?: string
	name: string
	quantity: number
	unit_price_ht: number
	tva_rate: number
	total_ht: number
	total_ttc: number
}

// Record côté PocketBase (doit refléter EXACTEMENT le schéma PB)
export type InvoicesRecord = {
	// Base facture
	number: string
	invoice_type: InvoicesInvoiceTypeOptions
	date: IsoDateString
	due_date?: IsoDateString
	customer: RecordIdString
	owner_company: RecordIdString
	status: InvoicesStatusOptions
	items: InvoiceItem[]
	total_ht: number
	total_tva: number
	total_ttc: number
	currency: string
	notes?: string
	payment_method?: InvoicesPaymentMethodOptions
	paid_at?: IsoDateString

	// Intégrité / ISCA
	sequence_number: number
	fiscal_year: number
	hash: string
	previous_hash: string
	is_locked?: boolean

	// Liens éventuels
	original_invoice_id?: RecordIdString // pour les avoirs
	closure_id?: RecordIdString // quand la facture est incluse dans une clôture
	cancellation_reason?: string // si tu l'utilises côté métier
}

// NOTES
export type NotesRecord = {
	content?: string
	title?: string
}

// PRODUCTS
// ✅ Mis à jour pour correspondre au schéma PocketBase réel
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
// RESPONSE TYPES (incluent les champs système PocketBase)
// ============================================================================

export type BrandsResponse<Texpand = unknown> = Required<BrandsRecord> &
	BaseSystemFields<Texpand>

export type CategoriesResponse<Texpand = unknown> = Required<CategoriesRecord> &
	BaseSystemFields<Texpand>

export type CompaniesResponse<Texpand = unknown> = Required<CompaniesRecord> &
	BaseSystemFields<Texpand>

export type CustomersResponse<Texpand = unknown> = Required<CustomersRecord> &
	BaseSystemFields<Texpand>

// Factures complètes (avec hash, séquence, etc.)
export type InvoicesResponse<Texpand = unknown> = Required<InvoicesRecord> &
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
	notes: NotesResponse
	products: ProductsResponse
	suppliers: SuppliersResponse
	users: UsersResponse
}

// ============================================================================
// TYPED POCKETBASE CLIENT
// ============================================================================

// Type for usage with type asserted PocketBase instance
// https://github.com/pocketbase/js-sdk#specify-typescript-definitions

export type TypedPocketBase = PocketBase & {
	collection(idOrName: 'brands'): RecordService<BrandsResponse>
	collection(idOrName: 'categories'): RecordService<CategoriesResponse>
	collection(idOrName: 'companies'): RecordService<CompaniesResponse>
	collection(idOrName: 'customers'): RecordService<CustomersResponse>
	collection(idOrName: 'invoices'): RecordService<InvoicesResponse>
	collection(idOrName: 'notes'): RecordService<NotesResponse>
	collection(idOrName: 'products'): RecordService<ProductsResponse>
	collection(idOrName: 'suppliers'): RecordService<SuppliersResponse>
	collection(idOrName: 'users'): RecordService<UsersResponse>
}

// ============================================================================
// ALIAS "MÉTIER" PRATIQUES POUR LE RESTE DU FRONT
// ============================================================================

export type InvoiceType = InvoicesInvoiceTypeOptions // 'invoice' | 'credit_note'
export type InvoiceStatus = InvoicesStatusOptions // 'draft' | 'validated' | 'sent' | 'paid'
export type PaymentMethod = InvoicesPaymentMethodOptions

// Transitions de statut autorisées côté métier
export const ALLOWED_STATUS_TRANSITIONS: Record<
	InvoiceStatus,
	InvoiceStatus[]
> = {
	draft: [InvoicesStatusOptions.validated],
	validated: [InvoicesStatusOptions.sent, InvoicesStatusOptions.paid],
	sent: [InvoicesStatusOptions.paid],
	paid: [],
}

export function canTransitionTo(
	currentStatus: InvoiceStatus,
	targetStatus: InvoiceStatus,
): boolean {
	return (
		ALLOWED_STATUS_TRANSITIONS[currentStatus]?.includes(targetStatus) ?? false
	)
}

// Helpers simples utilisables partout dans le front
export function isInvoiceLocked(invoice: InvoicesResponse): boolean {
	return invoice.is_locked || invoice.status !== InvoicesStatusOptions.draft
}
