// frontend/modules/connect/hooks/useOrderNavigation.ts
//
// Wrapper de useDocumentNavigation pour les bons de commande.
// Conservé pour compatibilité avec OrderDetailPage, CustomerOrdersTab, etc.

import { useDocumentNavigation } from './useDocumentNavigation'

export function useOrderNavigation() {
	const { goBack, goToDetail, goToNew, search } = useDocumentNavigation('order')
	return {
		goBack,
		goToOrder: goToDetail, // alias sémantique
		goToNewOrder: goToNew,
		search,
	}
}
