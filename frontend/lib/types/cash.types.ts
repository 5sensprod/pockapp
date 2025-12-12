// frontend/lib/types/cash.types.ts

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
