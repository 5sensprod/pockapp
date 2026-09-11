import type PocketBase from 'pocketbase'

// La comparaison se fait côté Go (`backend/routes/product_duplicates_routes.go`) :
// ce fichier ne fait que la demander. Ne pas la réécrire ici.

export type ProductIdentity = {
	designation?: string
	sku?: string
	barcode?: string
}
export type DuplicateField = 'designation' | 'sku' | 'barcode'
export type DuplicateProduct = {
	id: string
	name: string
	designation: string
	sku: string
	barcode: string
	status: string
}
export type ProductDuplicate = {
	product: DuplicateProduct
	fields: DuplicateField[]
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
				exclude: excludeId ?? '',
			},
			requestKey: null,
		},
	)
	return reponse.matches ?? []
}
