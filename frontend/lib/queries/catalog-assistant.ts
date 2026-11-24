// frontend/lib/queries/catalog-assistant.ts
//
// Les deux appels de l'assistant du catalogue. La logique est dans
// `lib/catalog/assistant-catalogue.ts` ; ici, seulement le réseau.

import type {
	ReponseAssistant,
	TourAssistant,
} from '@/lib/catalog/assistant-catalogue'

import {
	type CatalogProductQuery,
	buildCatalogProductsFilter,
} from './catalog-products'

/** La demande du vendeur → des réglages de filtres (ou une question). */
export async function demanderAssistantCatalogue(
	pb: any,
	corps: {
		message: string
		company: string
		historique: TourAssistant[]
		derniers?: Record<string, unknown>
	},
): Promise<ReponseAssistant> {
	return (await pb.send('/api/assistant/catalogue', {
		method: 'POST',
		body: corps,
		// Deux demandes ne s'annulent pas l'une l'autre dans le SDK
		requestKey: null,
	})) as ReponseAssistant
}

/**
 * Le nombre de produits que la LISTE rendrait pour cette requête : même
 * collection, même filtre (`buildCatalogProductsFilter`), et le `totalItems`
 * de PocketBase. C'est le seul décompte de l'assistant.
 */
export async function compterProduitsDuFiltre(
	pb: any,
	query: CatalogProductQuery,
): Promise<number> {
	const page = await pb.collection('products').getList(1, 1, {
		filter: buildCatalogProductsFilter(pb, query),
		fields: 'id',
		requestKey: null,
	})
	return (page.totalItems as number) ?? 0
}
