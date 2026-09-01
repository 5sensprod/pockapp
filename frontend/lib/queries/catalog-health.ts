export const PRODUCT_HEALTH_MAX = 6

export type ProductHealthInput = {
	name?: string
	description?: string
	image?: string
	categories?: string[]
	price_ttc?: number
	slug?: string
}

const healthChecks = [
	{
		label: 'nom en ligne',
		valid: (product: ProductHealthInput) => !!product.name?.trim(),
	},
	{
		label: 'description',
		valid: (product: ProductHealthInput) => !!product.description?.trim(),
	},
	{
		label: 'image principale',
		valid: (product: ProductHealthInput) => !!product.image?.trim(),
	},
	{
		label: 'catégorie',
		valid: (product: ProductHealthInput) =>
			(product.categories?.length ?? 0) > 0,
	},
	{
		label: 'prix',
		valid: (product: ProductHealthInput) => (product.price_ttc ?? 0) > 0,
	},
	{
		label: 'adresse du site',
		valid: (product: ProductHealthInput) => !!product.slug?.trim(),
	},
] as const

/** Santé éditoriale en vue d'une publication : six prérequis concrets du site.
 * La marque et le fournisseur restent filtrables, mais ne pénalisent pas une
 * fiche car ils sont légitimement facultatifs pour certains produits/services. */
export function productHealth(product: ProductHealthInput) {
	const missing = healthChecks
		.filter((criterion) => !criterion.valid(product))
		.map((criterion) => criterion.label)
	return {
		score: PRODUCT_HEALTH_MAX - missing.length,
		max: PRODUCT_HEALTH_MAX,
		missing,
	}
}
