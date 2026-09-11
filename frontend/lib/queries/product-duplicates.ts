import type PocketBase from 'pocketbase'

// La comparaison se fait côté Go (`backend/routes/product_duplicates_routes.go`) :
// ce fichier ne fait que la demander. Ne pas la réécrire ici.

export type ProductIdentity = {
	designation?: string
	sku?: string
	barcode?: string
	// Valeurs du formulaire, même non modifiées : ne sont pas comparées, mais
	// écartent une fiche signalée par sa seule désignation quand sa référence
	// ou son code-barres diffère (règle en Go).
	enteredSku?: string
	enteredBarcode?: string
}
export type DuplicateField = 'designation' | 'sku' | 'barcode'
export type DuplicateProduct = {
	id: string
	name: string
	designation: string
	sku: string
	barcode: string
	status: string
	// Pour le dépliant de l'avertissement ; non comparés.
	price_ttc: number
	stock: number
	stock_b: number
	brand: string
	image: string
}
export type ProductDuplicate = {
	product: DuplicateProduct
	fields: DuplicateField[]
	// `identical` : un champ au moins est identique. `similar` : la désignation
	// seule ressemble (`backend/routes/product_similarity.go`).
	kind: 'identical' | 'similar'
	score: number
	// Décidé en Go (identique, ou ressemblant au-dessus du seuil fort) : c'est
	// lui, et lui seul, qui ouvre le dialogue de validation.
	strong: boolean
}

export const DUPLICATE_LABELS: Record<DuplicateField, string> = {
	designation: 'Désignation',
	sku: 'Référence',
	barcode: 'Code-barres',
}

export function hasProductIdentity(identity: ProductIdentity): boolean {
	return !!(
		identity.designation?.trim() ||
		identity.sku?.trim() ||
		identity.barcode?.trim()
	)
}

export async function fetchProductDuplicates(
	pb: PocketBase,
	companyId: string,
	identity: ProductIdentity,
	excludeId?: string,
): Promise<ProductDuplicate[]> {
	if (!hasProductIdentity(identity)) return []
	const reponse: { matches?: ProductDuplicate[] } = await pb.send(
		'/api/catalog/products/duplicates',
		{
			method: 'GET',
			query: {
				company: companyId,
				designation: identity.designation ?? '',
				sku: identity.sku ?? '',
				barcode: identity.barcode ?? '',
				entered_sku: identity.enteredSku ?? '',
				entered_barcode: identity.enteredBarcode ?? '',
				exclude: excludeId ?? '',
			},
			requestKey: null,
		},
	)
	return reponse.matches ?? []
}
