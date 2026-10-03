// frontend/modules/stick/labels/lib/use-images-catalogue.ts
//
// Les images de PocketStock pour l'éditeur d'affiche, tirées des requêtes
// VIVANTES du dépôt (`brands`, `categories`, `companies`) : un logo changé
// dans /stock/marques arrive ici par le temps réel du catalogue, sans rien
// écouter de plus. La mise en forme est dans `images-catalogue.ts`.

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useBrands } from '@/lib/queries/brands'
import { useCategories } from '@/lib/queries/categories'
import { useCompany } from '@/lib/queries/companies'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMemo } from 'react'
import { type ImageCatalogue, imagesDe } from './images-catalogue'

export function useImagesCatalogue(): {
	marques: ImageCatalogue[]
	categories: ImageCatalogue[]
	/** Le logo de l'entreprise active, ou null si elle n'en a pas. */
	entreprise: ImageCatalogue | null
	chargement: boolean
} {
	const pb = usePocketBase()
	const { activeCompanyId } = useActiveCompany()
	const companyId = activeCompanyId ?? undefined
	const brands = useBrands({ companyId })
	const categories = useCategories({ companyId })
	const company = useCompany(companyId)

	return useMemo(() => {
		const fileUrl = (record: any, nom: string) => pb.files.getUrl(record, nom)
		const c = company.data
		return {
			marques: imagesDe(brands.data as any, fileUrl),
			categories: imagesDe(categories.data as any, fileUrl),
			entreprise: c?.logo ? { id: c.id, nom: c.trade_name || c.name, src: fileUrl(c, c.logo) } : null,
			chargement: brands.isLoading || categories.isLoading || company.isLoading,
		}
	}, [brands.data, categories.data, company.data, brands.isLoading, categories.isLoading, company.isLoading, pb])
}
