import type {
	CatalogProductStatus,
	CatalogProductWrite,
} from './catalog-products'
import type { GalleryEntry } from './gallery-order'

export interface ConsignmentProductSource {
	description: string
	store_price: number
	customer: string
}

export interface ConsignmentProductInput {
	company: string
	name: string
	description: string
	status: CatalogProductStatus
	taxRate: number
	brand?: string
	categories: string[]
	gallery: GalleryEntry[]
}

/**
 * Traduit un dépôt en fiche catalogue, sans écrire de stock et sans jamais
 * transformer le particulier en fournisseur.
 */
export function consignmentProductPayload(
	item: ConsignmentProductSource,
	input: ConsignmentProductInput,
): CatalogProductWrite {
	const name = input.name.trim()
	return {
		name,
		designation: name,
		description: input.description.trim(),
		type: 'simple',
		status: input.status,
		commercial_state: 'used',
		price_ttc: item.store_price,
		tax_rate: input.taxRate,
		brand: input.brand ?? '',
		categories: input.categories,
		company: input.company,
		consignor: item.customer,
		// À la création il n'existe aucun fichier en base : cette liste est donc
		// nécessairement complète. Tous les fichiers entrent par `gallery`.
		gallery: input.gallery.length > 0 ? input.gallery : undefined,
	}
}
