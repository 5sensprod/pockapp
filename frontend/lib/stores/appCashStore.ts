// frontend/lib/stores/appCashStore.ts
//
// Store mémoire global pour le module Cash.
// Persiste l'état entre navigations (sans Context ni Provider).
// Chaque "section" a son propre namespace de clés.

import type { CartItem } from '@/modules/cash/components/terminal/types/cart'
import type { ParkedCart } from '@/modules/cash/components/terminal/hooks/useCartManager'

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface TerminalState {
	cart: CartItem[]
	parkedCarts: ParkedCart[]
}

export interface TicketsListState {
	searchTerm: string
	conversionFilter: 'all' | 'converted' | 'not_converted'
	dateFilter: string
}

// Extend ici pour ajouter d'autres sections du module cash :
// export interface SessionsListState { ... }
// export interface ReportsState { ... }

// ─────────────────────────────────────────────
// ÉTAT INTERNE (simple objet module-level)
// ─────────────────────────────────────────────

// Terminal : isolé par cashRegisterId
const terminalStore: Record<string, TerminalState> = {}

// Tickets list : une seule instance (pas besoin de clé)
let ticketsListStore: TicketsListState = {
	searchTerm: '',
	conversionFilter: 'all',
	dateFilter: '',
}

// ─────────────────────────────────────────────
// TERMINAL — lecture / écriture / reset
// ─────────────────────────────────────────────

const defaultTerminalState = (): TerminalState => ({
	cart: [],
	parkedCarts: [],
})

export function getTerminalState(registerId: string): TerminalState {
	return terminalStore[registerId] ?? defaultTerminalState()
}

export function setTerminalState(registerId: string, state: TerminalState) {
	terminalStore[registerId] = state
}

export function clearTerminalState(registerId: string) {
	delete terminalStore[registerId]
}

// ─────────────────────────────────────────────
// TICKETS LIST — lecture / écriture / reset
// ─────────────────────────────────────────────

export function getTicketsListState(): TicketsListState {
	return ticketsListStore
}

export function setTicketsListState(partial: Partial<TicketsListState>) {
	ticketsListStore = { ...ticketsListStore, ...partial }
}

export function clearTicketsListState() {
	ticketsListStore = {
		searchTerm: '',
		conversionFilter: 'all',
		dateFilter: '',
	}
}
