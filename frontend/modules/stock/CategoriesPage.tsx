// frontend/modules/stock/CategoriesPage.tsx
//
// DEUXIÈME ENTITÉ BRANCHÉE SUR POCKETBASE — 13 août 2026, après les marques.
//
// Écran de GESTION des catégories : lit et écrit `categories` dans PocketBase,
// et nulle part ailleurs (décision « source explicite, par entité »,
// docs/DECISIONS.md, 2026-08-13).
//
// Ne pas confondre avec `components/CategoryTreeAppPos.tsx`, qui filtre la
// liste des produits venus d'AppPos : même forme, autre rôle — comme pour les
// marques (`BrandFilterPanel`). Tant que les produits viennent d'AppPos, le
// panneau de filtre doit lire AppPos, sinon les identifiants ne correspondent
// plus et le filtre ne rend rien.

import { Card, CardContent } from '@/components/ui/card'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import type { CatalogCategoryShape } from '@/lib/queries/catalog-shapes'
import { useCategories, useUpdateCategory } from '@/lib/queries/categories'
import { usePocketBase } from '@/lib/use-pocketbase'
import { Star, Tags } from 'lucide-react'
import { useMemo, useState } from 'react'

import { CategoryTree } from './components/CategoryTree'
import { ImageBatchOptimizer } from './components/ImageBatchOptimizer'

// 1024 px, le DOUBLE des marques : une image de catégorie sert de bandeau de
// rayon, pas de pastille. DOIT rester égal au plafond de `CategoryDialog.tsx`
// — sinon la même image ressort à deux tailles selon qu'on passe par le
// dialogue ou par le lot.
const MAX_SIDE_CATEGORIE = 1024

export function CategoriesPage() {
	const [selected, setSelected] = useState<CatalogCategoryShape | null>(null)
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase()
	const { data: categories } = useCategories({
		companyId: activeCompanyId ?? undefined,
	})
	const updateCategory = useUpdateCategory()

	// Ce que le lot peut traiter : les catégories qui PORTENT une image. Une
	// catégorie sans visuel n'a rien à optimiser et gonflerait le total annoncé.
	const optimisables = useMemo(
		() =>
			(categories ?? [])
				.filter((categorie) => !!categorie.image)
				.map((categorie) => ({
					id: categorie.id,
					label: categorie.name,
					url: pb.files.getUrl(categorie, categorie.image as string),
				})),
		[categories, pb],
	)

	return (
		<div className='container mx-auto px-6 py-8'>
			<div className='mb-6'>
				<div className='mb-2 flex items-center gap-3'>
					<div className='flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10'>
						<Tags className='h-6 w-6 text-primary' />
					</div>
					<h1 className='font-bold text-3xl'>Catégories</h1>
				</div>
				<p className='text-muted-foreground'>
					Organisez l’arborescence du catalogue. Le compteur distingue ce qui est
					rattaché à la catégorie même de ce que toute sa branche emporte.
				</p>
			</div>

			{/* Le lot porte sur TOUTES les catégories chargées, pas sur la branche
			    dépliée ni sur la sélection : faire dépendre un traitement de fond
			    de l'état d'un arbre serait un piège. */}
			<div className='mb-4 flex justify-end'>
				<ImageBatchOptimizer
					items={optimisables}
					maxSide={MAX_SIDE_CATEGORIE}
					nomImage='image'
					save={async (item, file) =>
						void (await updateCategory.mutateAsync({
							id: item.id,
							// `name` est obligatoire dans `CategoryWrite` ; on renvoie
							// celui qu'on a, sans le modifier.
							data: { name: item.label, image: file },
						}))
					}
				/>
			</div>

			<div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]'>
				<Card>
					<CardContent className='max-h-[70vh] overflow-y-auto p-0'>
						<CategoryTree
							selectedId={selected?.id ?? null}
							onSelect={setSelected}
						/>
					</CardContent>
				</Card>

				{/* Le détail montre ce que l'arbre ne peut pas : le slug, la
				    description, la mise en avant. Sans lui, ces champs seraient
				    saisissables mais invisibles une fois le dialogue fermé. */}
				<Card className='h-fit'>
					<CardContent className='space-y-3 pt-6 text-sm'>
						{selected ? (
							<>
								<div>
									<p className='text-muted-foreground text-xs uppercase tracking-wide'>
										Catégorie
									</p>
									<p className='font-medium'>{selected.name}</p>
								</div>

								<div>
									<p className='text-muted-foreground text-xs uppercase tracking-wide'>
										Slug
									</p>
									{selected.slug ? (
										<p className='font-mono text-xs'>{selected.slug}</p>
									) : (
										<p className='text-muted-foreground'>—</p>
									)}
									<p className='mt-1 text-muted-foreground text-xs'>
										Figé au premier envoi vers le site, non modifiable ici.
									</p>
								</div>

								<div>
									<p className='text-muted-foreground text-xs uppercase tracking-wide'>
										Description
									</p>
									<p className='whitespace-pre-wrap'>
										{selected.description || (
											<span className='text-muted-foreground'>—</span>
										)}
									</p>
								</div>

								{selected.is_featured && (
									<p className='flex items-center gap-1.5 text-amber-600'>
										<Star className='h-4 w-4' />
										Mise en avant sur le site
									</p>
								)}
							</>
						) : (
							<p className='text-muted-foreground'>
								Sélectionnez une catégorie dans l’arbre pour voir son slug, sa
								description et sa mise en avant.
							</p>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
