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
import { useCatalogProducts } from '@/lib/queries/catalog-products'
import { useSuppliers } from '@/lib/queries/suppliers'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useEffect, useMemo, useState } from 'react'
import { type ProduitAffiche, versProduitAffiche } from './produit-adapte'

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
	const pb = usePocketBase()
	const { activeCompanyId } = useActiveCompany()
	const jour = useJourServeur()

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

	const brands = useBrands({ companyId })
	const suppliers = useSuppliers({ companyId })

	const ctx = useMemo(() => {
		const brandById = new Map<string, string>()
		for (const b of brands.data ?? []) brandById.set(b.id, b.name)
		const supplierById = new Map<string, string>()
		for (const s of suppliers.data ?? []) supplierById.set(s.id, s.name)
		return {
			brandById,
			supplierById,
			fileUrl: (record: Parameters<typeof pb.files.getUrl>[0], nom: string) =>
				pb.files.getUrl(record, nom),
			jour,
		}
	}, [brands.data, suppliers.data, pb, jour])

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
