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

	// ── Contrat « un total, quatre lignes » (ticket Z-6) ─────────────────────
	// Le X est l'aperçu du Z : il porte les mêmes lignes, avec le même sens.
	// `total_ttc` ci-dessus ne couvre plus que la ligne 1, et `deposits_ttc`,
	// jusqu'ici structurellement à zéro, est devenu la ligne 3.
	// Optionnels : un backend plus ancien ne les envoie pas.
	schema_version?: number
	collected_ttc?: number
	collected_by_method?: Record<string, number>
	collected_from_receivables_ttc?: number
	refunds_ttc?: number
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

/**
 * Une pièce du rapport, telle qu'elle a été comptée à sa clôture.
 *
 * Élargie le 28 août 2026 aux quatre lignes, sur le modèle du journal des
 * ventes : `kind` est la nature, `line` la ligne où la pièce a été comptée.
 * Les libellés viennent du Go — `natureDe` et `LigneZ.String()` — pour que le Z
 * et le journal nomment les mêmes choses des mêmes mots.
 *
 * `total_ttc` est le montant COMPTÉ dans sa ligne, pas le total du document.
 * `total_ht` / `total_tva` ne valent quelque chose que sur la ligne 1 : les
 * lignes 2 à 4 sont en TTC seul.
 */
export interface SalesDocument {
	id: string
	number: string
	kind: string
	line: string
	customer: string
	issued_at: string
	heure: string
	method: string
	total_ht: number
	total_tva: number
	total_ttc: number
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

	// ── Contrat « un total, quatre lignes » (23 août 2026) ───────────────────
	// frontend/modules/cash/PocketCash-docs/04-refonte-du-z.md
	//
	// ⚠️ TOUS ces champs sont optionnels, et ce n'est pas de la prudence : un
	// rapport émis avant ce contrat ne les porte pas, et son `total_ttc` ne veut
	// PAS dire la même chose que celui d'un rapport d'après. Un document fiscal
	// se relit sous la règle qui l'a produit — c'est `schema_version` qui la dit,
	// et c'est sur elle que l'affichage doit brancher.
	//   absent ou 1 = règle d'origine, total_ttc est un total mêlé
	//   2           = total_ttc ne porte que la ligne 1, les ventes du jour
	//   3           = idem, et le Z ne porte plus le rapprochement espèces
	//   4           = idem, et le Z ne porte plus le détail par session ; il
	//                 compte en revanche ses tickets et ses factures hors caisse
	//   5           = idem, et le Z porte la LISTE des documents de sa ligne 1
	//   6           = la liste couvre les QUATRE lignes, avec heure et client
	schema_version?: number

	// ── Contrat du 28 août 2026 ─────────────────────────────────────────────
	// Les deux populations de la ligne 1, scindées côté Go. Optionnels : un
	// rapport antérieur ne les porte pas, et lire un 0 comme « aucun ticket »
	// serait faux. Brancher sur `estZCompteLesDocuments`, jamais sur la valeur.
	// Invariant garanti par le backend :
	//   pos_ticket_count + external_invoice_count = invoice_count
	pos_ticket_count?: number
	external_invoice_count?: number

	// Les pièces du rapport, telles qu'il les a agrégées à sa clôture — les
	// quatre lignes depuis la v6. Stockée et hachée côté Go : ce n'est PAS une
	// liste à recharger, et rien ici ne se recalcule.
	sales_documents?: SalesDocument[]
	collected_ttc?: number
	collected_by_method?: Record<string, number>
	collected_from_receivables_ttc?: number
	collected_deposits_ttc?: number
	refunds_ttc?: number
}

/**
 * estZQuatreLignes dit si un rapport suit le contrat du 23 août 2026.
 *
 * Un seul endroit décide, pour que l'écran, le PDF et le dialogue X ne
 * puissent pas répondre différemment sur le même document.
 */
export function estZQuatreLignes(totals: {
	schema_version?: number
}): boolean {
	return (totals.schema_version ?? 1) >= 2
}

/**
 * estZSansRapprochementEspeces dit si le Z a cessé de porter le tiroir.
 *
 * Contrat du 27 août 2026 : le rapport Z n'a pas à connaître les mouvements de
 * caisse — un apport de fonds n'est ni une vente, ni un encaissement de vente.
 * Le rapprochement espèces sort donc du Z ; il reste là où on le vérifie
 * réellement, c'est-à-dire au moment du comptage du tiroir
 * (`CloseSessionDialog`) et dans le rapport X (`ExpectedCashCard`), et son
 * détail ligne à ligne ira au journal espèces du module `stats`.
 *
 * Les trois chiffres `total_cash_*` restent CALCULÉS et STOCKÉS : ils sont
 * justes, ils portent 2 930,08 € d'écart cumulé sur les 60 rapports, et ils
 * n'ont jamais été hachés — les effacer d'un document scellé serait détruire de
 * la donnée sans y être contraint. Ce prédicat ne dit pas qu'ils sont absents,
 * il dit qu'on ne les MONTRE plus.
 *
 * ⚠️ Ne PAS l'écrire `=== 3`. Un prédicat par égalité oblige à repasser sur
 * l'écran et le PDF à chaque version — et le premier oublié affichera un
 * rapport v4 comme un rapport v1, sans erreur.
 *
 * Deux branchements, et deux seulement : `RapportZPage.tsx` et `ZReportPDF.tsx`.
 * Le dialogue X n'en est PAS un : le X garde son rapprochement et son journal,
 * il n'est pas un document scellé mais l'aperçu d'une session en cours.
 */
export function estZSansRapprochementEspeces(totals: {
	schema_version?: number
}): boolean {
	return (totals.schema_version ?? 1) >= 3
}

/**
 * estZSansDetailSessions dit si le Z a cessé de montrer ses sessions une à une.
 *
 * Contrat du 28 août 2026 : un Z couvre la PÉRIODE écoulée depuis la clôture
 * précédente, et non sa seule date (04-refonte-du-z.md, §7). Une session peut
 * donc s'étendre sur plusieurs journées, et le bloc « Détail des sessions »
 * donnait à lire un découpage qui ne correspondait pas au document. Comme le
 * rapprochement espèces avant lui, ce n'est pas une donnée fausse : elle est
 * hors sujet dans un document fiscal, et elle aura sa propre statistique dans
 * le module `stats`, redécoupée par journée.
 *
 * `sessions_count` disparaît de l'affichage pour la même raison, et le tableau
 * `sessions` reste CALCULÉ et STOCKÉ dans `full_report` : c'est la statistique
 * qui le relira. On cache, on n'efface pas.
 *
 * ⚠️ Ne PAS l'écrire `=== 4`. Un prédicat par égalité oblige à repasser sur
 * l'écran et le PDF à chaque version — et le premier oublié affichera un
 * rapport v5 comme un rapport v1, sans erreur.
 *
 * Deux branchements, et deux seulement : `RapportZPage.tsx` et `ZReportPDF.tsx`.
 */
export function estZSansDetailSessions(totals: {
	schema_version?: number
}): boolean {
	return (totals.schema_version ?? 1) >= 4
}

/**
 * estZCompteLesDocuments dit si le Z porte le nombre de tickets et de factures
 * hors caisse qu'il agrège. Même seuil que ci-dessus, autre question : l'un
 * retire un bloc, l'autre en ajoute un. Les nommer séparément évite qu'un futur
 * contrat ne puisse plus les dissocier.
 */
export function estZCompteLesDocuments(totals: {
	schema_version?: number
}): boolean {
	return (totals.schema_version ?? 1) >= 4
}

/**
 * estZListeLesDocuments dit si le rapport porte lui-même les pièces qu'il
 * agrège — `sales_documents`, stockée et hachée à la clôture.
 *
 * Contrat du 28 août 2026. Avant lui, le PDF listait les tickets en
 * interrogeant `/api/pos/session/:id/tickets` au moment de l'impression
 * (`usePrintReport.tsx`) : la liste imprimée était donc celle d'aujourd'hui, pas
 * celle qui avait été comptée, et un document modifié après la clôture changeait
 * le PDF sans rompre le hash du Z. Les factures hors caisse, elles, n'y ont
 * jamais figuré.
 *
 * ⚠️ Seuil, jamais `=== 5`. Et rien ne se recalcule ici : si le rapport ne porte
 * pas la liste, on n'en reconstruit pas une — on n'affiche rien.
 */
export function estZListeLesDocuments(totals: {
	schema_version?: number
	sales_documents?: SalesDocument[]
}): boolean {
	return (totals.schema_version ?? 1) >= 5 && !!totals.sales_documents?.length
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
