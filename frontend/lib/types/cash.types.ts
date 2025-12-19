// frontend/lib/types/cash.types.ts
// ✅ Version complète avec RapportX et RapportZ

export type CashSessionStatus = 'open' | 'closed' | 'canceled'

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

	created: string
	updated: string
}

export type CashMovementType =
	| 'cash_in'
	| 'cash_out'
	| 'safe_drop'
	| 'adjustment'

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
// ✅ TYPES RAPPORT X (AJOUTÉS)
// ============================================================================

export interface RapportX {
	report_type: 'x'
	generated_at: string
	session: {
		id: string
		cash_register: string
		opened_at: string
		status: 'open'
	}
	opening_float: number
	sales: {
		invoice_count: number
		total_ttc: number
		by_method: Record<string, number>
	}
	movements: {
		cash_in: number
		cash_out: number
		safe_drop: number
		total: number
	}
	expected_cash: {
		opening_float: number
		sales_cash: number
		movements: number
		total: number
	}
	note: string
}

// ============================================================================
// ✅ TYPES RAPPORT Z (AJOUTÉS)
// ============================================================================

export interface RapportZ {
	report_type: 'z'
	generated_at: string
	cash_register: {
		id: string
		code: string
		name: string
	}
	date: string
	sessions: Array<{
		id: string
		opened_at: string
		closed_at: string
		opened_by: string
		opened_by_name: string
		closed_by: string
		closed_by_name: string
		invoice_count: number
		total_ttc: number
		opening_float: number // ✅ AJOUTER
		expected_cash_total: number // ✅ AJOUTER
		counted_cash_total: number // ✅ AJOUTER
		cash_difference: number
		totals_by_method: Record<string, number> // ✅ AJOUTER
	}>
	daily_totals: {
		sessions_count: number
		invoice_count: number
		total_ttc: number
		by_method: Record<string, number>
		total_cash_difference: number
	}
	note: string
	is_locked: boolean
}
