// frontend/modules/stick/labels/lib/use-produits-affiche.ts
//
// LA SOURCE PRODUITS DE L'ÉDITEUR D'AFFICHE — PocketBase, et elle seule.
//
// Dans AppPos, `ProductSelector` lisait `useProductDataStore` : un cache maison
// alimenté par REST + WebSocket, qui chargeait les 3 000 produits en mémoire
// puis filtrait côté navigateur. Ici on passe par le chemin du dépôt :
// `useCatalogProducts` — recherche ET pagination côté serveur, 25 par page,
// comme `/stock/produits`. Rien n'est recalculé côté React.
//
// Le résultat est projeté dans la forme que l'éditeur sait lire
// (`produit-adapte.ts`).

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useJourServeur } from '@/lib/pricing/use-jour-serveur'
import { useBrands } from '@/lib/queries/brands'
import { useCategories } from '@/lib/queries/categories'
import { useCatalogProducts } from '@/lib/queries/catalog-products'
import { useSuppliers } from '@/lib/queries/suppliers'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useEffect, useMemo, useState } from 'react'
import { imagesDe, urlParId } from './images-catalogue'
import {
	type ContexteProduitAffiche,
	type ProduitAffiche,
	versProduitAffiche,
} from './produit-adapte'

const PAR_PAGE = 20

export function useProduitsAffiche(options: {
	terme: string
	page: number
	/** Le sélecteur est fermé : rien ne part au serveur. */
	enabled?: boolean
}): {
	produits: ProduitAffiche[]
	total: number
	pageCount: number
	loading: boolean
	error: string | null
	/** Vrai tant que la frappe n'est pas encore partie au serveur. */
	isTyping: boolean
} {
	const { terme, page, enabled = true } = options
	const { activeCompanyId } = useActiveCompany()

	// L'anti-rebond est ici, comme dans `useCatalogProductSearch` : 300 ms, la
	// même valeur que `ProductsPage`.
	const [debounced, setDebounced] = useState(terme)
	useEffect(() => {
		const timer = window.setTimeout(() => setDebounced(terme), 300)
		return () => window.clearTimeout(timer)
	}, [terme])

	const companyId = activeCompanyId ?? undefined
	const requete = useCatalogProducts({
		companyId: enabled ? companyId : undefined,
		page,
		perPage: PAR_PAGE,
		search: debounced.trim() || undefined,
	})

	const ctx = useContexteAffiche()

	const produits = useMemo(
		() => (requete.data?.items ?? []).map((p) => versProduitAffiche(p, ctx)),
		[requete.data, ctx],
	)

	return {
		produits,
		total: requete.data?.totalItems ?? 0,
		pageCount: Math.max(1, requete.data?.totalPages ?? 1),
		loading: requete.isLoading || requete.isFetching,
		error: requete.error ? String(requete.error) : null,
		isTyping: debounced !== terme,
	}
}

/**
 * Ce que la projection lit en plus du produit : noms des marques et des
 * fournisseurs, images des marques et des catégories, URL des fichiers, jour du serveur. Tiré des requêtes VIVANTES
 * `brands` / `suppliers` : une marque renommée ailleurs, invalidée par le
 * temps réel, change ce contexte, donc la projection.
 */
export function useContexteAffiche(): ContexteProduitAffiche {
	const pb = usePocketBase()
	const { activeCompanyId } = useActiveCompany()
	const jour = useJourServeur()
	const companyId = activeCompanyId ?? undefined
	const brands = useBrands({ companyId })
	const suppliers = useSuppliers({ companyId })
	const categories = useCategories({ companyId })

	return useMemo(() => {
		const fileUrl = (record: any, nom: string) => pb.files.getUrl(record, nom)
		const brandById = new Map<string, string>()
		for (const b of brands.data ?? []) brandById.set(b.id, b.name)
		const supplierById = new Map<string, string>()
		for (const s of suppliers.data ?? []) supplierById.set(s.id, s.name)
		return {
			brandById,
			supplierById,
			// Logo de la marque et image de la catégorie, liables comme la photo
			imageMarqueById: urlParId(imagesDe(brands.data as any, fileUrl)),
			imageCategorieById: urlParId(imagesDe(categories.data as any, fileUrl)),
			fileUrl: (record: Parameters<typeof pb.files.getUrl>[0], nom: string) =>
				pb.files.getUrl(record, nom),
			jour,
		}
	}, [brands.data, suppliers.data, categories.data, pb, jour])
}
