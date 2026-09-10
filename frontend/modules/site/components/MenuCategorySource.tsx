// frontend/modules/site/components/MenuCategorySource.tsx
// ═══════════════════════════════════════════════════════════════════════════
// LES CATÉGORIES EN LIGNE, À GLISSER DANS LE MENU
// ═══════════════════════════════════════════════════════════════════════════
// Remplace, le 10 septembre 2026, la liste déroulante du formulaire d'entrée :
// 460 noms à plat, triés par ordre alphabétique, avec leurs homonymes — on y
// choisissait la mauvaise catégorie. Ici l'arbre dit qui est sous qui.
//
// Même apparence que la page Produits : les lignes sont `CategoryTreeRow`, la
// recherche et le dépliage sont les fonctions de `category-tree.ts`.
//
// **N'apparaissent que les catégories en ligne** — `total > 0` dans les
// décomptes PUBLIÉS rendus par le serveur (`par_categorie_publiee`). Une
// catégorie sans produit publié n'a pas de page sur le site ; la proposer, ce
// serait publier un lien vers une page absente. Le dépôt la refuse aussi
// (`categoryDrop`), pour le cas où l'arbre serait en retard sur un autre poste.
//
// Ce composant n'écrit rien : il pose l'identifiant de la catégorie dans le
// `DataTransfer`. C'est `MenuTreeEditor` qui crée l'entrée.
// ═══════════════════════════════════════════════════════════════════════════

import { CategoryTreeRow } from '@/components/catalog/CategoryTreeRow'
import { Input } from '@/components/ui/input'
import {
	parentMap,
	parentsWithVisibleChildren,
	searchCategoryIds,
	toCategoryOptions,
	visibleCategoryOptions,
} from '@/lib/queries/category-tree'
import type { CategoryCounts } from '@/lib/queries/products'
import type { CatalogCategory } from '@/lib/queries/site-catalog'
import { FolderTree, GripVertical, Loader2, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { MENU_CATEGORY_DRAG_TYPE } from '../lib/menu-tree'

interface MenuCategorySourceProps {
	categories: CatalogCategory[]
	/** `undefined` tant que les décomptes publiés ne sont pas connus. */
	publishedCounts: Record<string, CategoryCounts> | undefined
	isLoading: boolean
	isError: boolean
}

export function MenuCategorySource({
	categories,
	publishedCounts,
	isLoading,
	isError,
}: MenuCategorySourceProps) {
	const [search, setSearch] = useState('')
	const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

	const parents = useMemo(() => parentMap(categories), [categories])
	const options = useMemo(
		() =>
			publishedCounts
				? toCategoryOptions(categories).filter(
						(option) => (publishedCounts[option.id]?.total ?? 0) > 0,
					)
				: [],
		[categories, publishedCounts],
	)
	const withChildren = useMemo(
		() => parentsWithVisibleChildren(categories, options),
		[categories, options],
	)
	const searchedIds = useMemo(
		() => searchCategoryIds(categories, search),
		[categories, search],
	)
	const visible = useMemo(
		() => visibleCategoryOptions(options, parents, expandedIds, searchedIds),
		[expandedIds, options, parents, searchedIds],
	)

	const toggle = (id: string) =>
		setExpandedIds((current) => {
			const next = new Set(current)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})

	const searching = search.trim() !== ''

	return (
		<div className='flex min-h-0 flex-col overflow-hidden rounded-md border lg:h-full'>
			<div className='shrink-0 border-b bg-muted/30 p-3'>
				<div className='mb-2 flex items-center justify-between gap-2'>
					<p className='flex items-center gap-1.5 font-medium text-sm'>
						<FolderTree className='h-4 w-4' />
						Catégories en ligne
					</p>
					<span className='text-muted-foreground text-xs tabular-nums'>
						{options.length}
					</span>
				</div>
				<div className='relative'>
					<Search className='-translate-y-1/2 absolute top-1/2 left-2.5 h-3.5 w-3.5 text-muted-foreground' />
					<Input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder='Chercher une catégorie…'
						aria-label='Chercher dans les catégories en ligne'
						className='h-8 pr-8 pl-8 text-sm'
					/>
					{search && (
						<button
							type='button'
							onClick={() => setSearch('')}
							aria-label='Effacer la recherche'
							className='-translate-y-1/2 absolute top-1/2 right-2 rounded-sm text-muted-foreground hover:text-foreground'
						>
							<X className='h-3.5 w-3.5' />
						</button>
					)}
				</div>
				<p className='mt-2 text-muted-foreground text-xs'>
					Glisser une catégorie sur un sous-menu pour l'y ajouter.
				</p>
			</div>

			<div className='max-h-72 min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 lg:max-h-none'>
				{isError ? (
					<p className='py-8 text-center text-destructive text-sm'>
						Catalogue illisible.
					</p>
				) : isLoading || !publishedCounts ? (
					<div className='flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm'>
						<Loader2 className='h-4 w-4 animate-spin' />
						Lecture du catalogue…
					</div>
				) : visible.length === 0 ? (
					<p className='py-8 text-center text-muted-foreground text-sm'>
						{searching
							? 'Aucune catégorie en ligne trouvée'
							: 'Aucune catégorie en ligne'}
					</p>
				) : (
					<div role='tree' aria-label='Catégories en ligne'>
						{visible.map((option) => (
							<CategoryTreeRow
								key={option.id}
								option={option}
								hasChildren={withChildren.has(option.id)}
								expanded={searching || expandedIds.has(option.id)}
								onToggle={() => toggle(option.id)}
								toggleDisabled={searching}
								counts={publishedCounts[option.id]}
								labelTitle={`${option.name} — glisser sur un sous-menu`}
								draggable
								onDragStart={(event) => {
									event.dataTransfer.effectAllowed = 'copy'
									event.dataTransfer.setData(MENU_CATEGORY_DRAG_TYPE, option.id)
								}}
								className='cursor-grab active:cursor-grabbing'
								actions={
									<GripVertical className='mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100' />
								}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	)
}
