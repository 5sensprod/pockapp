// frontend/modules/connect/hooks/useDocumentNavigation.ts
//
// Hook générique de navigation pour les documents commerciaux.
// Gère le retour intelligent (liste ou fiche client) et la navigation
// vers les pages de détail avec contexte d'origine.
//
// Remplace useOrderNavigation — ce hook est compatible avec les 3 types.

import { navigationActions } from '@/lib/stores/navigationStore'
import { useNavigate, useSearch } from '@tanstack/react-router'

export type DocumentType = 'order' | 'quote' | 'invoice'

const ROUTES = {
	order: {
		list: '/connect/orders' as const,
		detail: '/connect/orders/$orderId' as const,
		paramKey: 'orderId',
	},
	quote: {
		list: '/connect/quotes' as const,
		detail: '/connect/quotes/$quoteId' as const,
		paramKey: 'quoteId',
	},
	invoice: {
		list: '/connect/invoices' as const,
		detail: '/connect/invoices/$invoiceId' as const,
		paramKey: 'invoiceId',
	},
} as const

interface NavigationSearch {
	from?: string
	customerId?: string
	tab?: string
}

export function useDocumentNavigation(type: DocumentType) {
	const navigate = useNavigate()
	const search = useSearch({ strict: false }) as NavigationSearch

	// Retour intelligent : store → search params → liste
	const goBack = () => {
		// Priorité 1 : store (navigation croisée inter-documents)
		const previous = navigationActions.peek()
		if (previous) {
			navigationActions.pop()
			navigate({
				to: previous.path as any,
				params: previous.params as any,
				search: previous.search as any,
			})
			return
		}

		// Priorité 2 : search params URL (compat — navigation depuis CustomerDetailPage)
		if (search.from === 'customer' && search.customerId) {
			navigate({
				to: '/connect/customers/$customerId',
				params: { customerId: search.customerId },
				search: { tab: `${type}s` }, // 'orders' | 'quotes' | 'invoices'
			})
			return
		}

		// Fallback : liste du type courant
		navigate({ to: ROUTES[type].list })
	}

	// Navigation vers le détail avec contexte d'origine (depuis fiche client)
	const goToDetail = (docId: string, customerId?: string) => {
		const s = customerId ? { from: 'customer', customerId } : undefined
		if (type === 'order') {
			navigate({
				to: '/connect/orders/$orderId',
				params: { orderId: docId },
				search: s,
			})
		} else if (type === 'quote') {
			navigate({
				to: '/connect/quotes/$quoteId',
				params: { quoteId: docId },
				search: s,
			})
		} else {
			navigate({
				to: '/connect/invoices/$invoiceId',
				params: { invoiceId: docId },
				search: s,
			})
		}
	}

	// Navigation vers la création avec contexte client optionnel
	const goToNew = (customerId?: string) => {
		if (type === 'order') {
			navigate({
				to: '/connect/orders/new',
				search: customerId ? { customerId } : undefined,
			})
		} else if (type === 'quote') {
			navigate({
				to: '/connect/quotes/new',
				search: customerId ? { customerId } : undefined,
			})
		} else {
			navigate({ to: '/connect/invoices/new' })
		}
	}

	return {
		goBack,
		goToDetail,
		goToNew,
		search,
		// Exposé pour que les pages puissent pousser dans la pile avant une navigation croisée
		push: navigationActions.push,
	}
}
