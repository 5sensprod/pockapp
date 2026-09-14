// frontend/modules/stick/labels/lib/produit-adapte.ts
//
// DU PRODUIT POCKETBASE À LA FORME QUE L'ÉDITEUR D'AFFICHE SAIT LIRE.
//
// L'éditeur vient d'AppPos et a été porté À L'IDENTIQUE : `utils/dataBinding.js`
// et les panneaux d'images lisent une forme NeDB — `_id`, `price`, `sale_price`,
// `brand_ref.name`, `image.src`, `meta_data[{key:'barcode'}]`. Plutôt que de
// réécrire ces 8 000 lignes, on projette le produit PocketBase dans cette forme,
// en UN seul endroit.
//
// C'est la dette assumée du portage : quand l'éditeur sera nettoyé, c'est
// `dataBinding` qui devra lire `CatalogProductShape` directement, et ce fichier
// disparaîtra. Voir `PocketStick-docs/01-portage-affiche.md`.

import { type JourServeur, prixPromoActif } from '@/lib/pricing/promo-price'
import type { CatalogProductShape } from '@/lib/queries/catalog-products'
import { urlProduitSurLeSite } from '@/lib/site/url-publique'

/** Ce que l'éditeur consomme. Les noms sont ceux d'AppPos, pas les nôtres. */
export interface ProduitAffiche {
	_id: string
	name: string
	designation?: string
	sku?: string
	description?: string
	price?: number | null
	sale_price?: number | null
	stock?: number | null
	website_url?: string
	brand_ref?: { name: string } | null
	supplier_ref?: { name: string } | null
	meta_data: Array<{ key: string; value: unknown }>
	image?: { src: string; url: string } | null
	gallery_images: Array<{ src: string; url: string }>
}

export interface ContexteProduitAffiche {
	brandById: Map<string, string>
	supplierById: Map<string, string>
	/** `pb.files.getUrl` — passé plutôt qu'importé, comme dans `catalog-rows.ts`. */
	fileUrl: (record: CatalogProductShape, filename: string) => string
	/** Le jour du serveur, pour juger la période de promo. Jamais l'horloge
	 *  du navigateur (`promo-price.ts`). */
	jour: JourServeur
}

export function versProduitAffiche(
	produit: CatalogProductShape,
	ctx: ContexteProduitAffiche,
): ProduitAffiche {
	// `image` et `gallery` sont des NOMS DE FICHIER : seul `pb.files.getUrl` en
	// fait des URL, et l'éditeur ne sait poser qu'une URL dans un `<img>` ou
	// dans un `Konva.Image`.
	const imageUrl = produit.image ? ctx.fileUrl(produit, produit.image) : null
	const galerie = (produit.gallery ?? []).map((nom) => {
		const url = ctx.fileUrl(produit, nom)
		return { src: url, url }
	})

	return {
		_id: produit.id,
		// Le NOM DU COMPTOIR d'abord : c'est lui qui s'imprime, `name` est le
		// titre de la page du site (`catalog-products.ts:94`).
		name: produit.designation || produit.name,
		designation: produit.designation,
		sku: produit.sku,
		description: produit.description,
		price: produit.price_ttc ?? null,
		// La promo suit la règle unique du dépôt, période comprise : une promo
		// expirée ne doit pas s'imprimer sur une affiche.
		sale_price: prixPromoActif(produit, ctx.jour),
		stock: produit.stock ?? null,
		// Le QR code encode CETTE valeur (`QRCodeTemplates.jsx`) : elle doit être
		// une adresse complète, pas un chemin — un QR ne se scanne pas « depuis »
		// une page, il n'a aucune origine à laquelle se raccrocher.
		website_url: urlProduitSurLeSite(produit.slug) || undefined,
		brand_ref: produit.brand
			? { name: ctx.brandById.get(produit.brand) ?? '' }
			: null,
		supplier_ref: produit.supplier
			? { name: ctx.supplierById.get(produit.supplier) ?? '' }
			: null,
		// `dataBinding.getProductField` lit le code-barres DANS les métadonnées,
		// comme le faisait NeDB. On l'y remet plutôt que de toucher à la règle.
		meta_data: [{ key: 'barcode', value: produit.barcode ?? '' }],
		image: imageUrl ? { src: imageUrl, url: imageUrl } : null,
		gallery_images: galerie,
	}
}
