import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { CategoryNode } from '@/lib/queries/category-tree'
import {
	collectBranchIds,
	toCategoryOptions,
} from '@/lib/queries/category-tree'
import { type CatalogCounts, countsOfCategory } from '@/lib/queries/products'
import { cn } from '@/lib/utils'
import {
	ChevronDown,
	ChevronRight,
	Folder,
	FolderOpen,
	FolderTree,
	Loader2,
	Search,
	X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

interface ProductCategoryFilterTreeProps {
	categories: CategoryNode[]
	counts?: CatalogCounts
	value: string
	noneValue: string
	onChange: (value: string) => void
	loading?: boolean
}

function normalizeSearch(value: string) {
	return value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLocaleLowerCase('fr')
}

/**
 * Arbre de navigation du catalogue. Il ne possède aucun état de filtre : la
 * sélection reçue est exactement le `categoryId` envoyé par ProductsPage à la
 * requête serveur. Un parent sélectionné représente toute sa branche.
 */
export function ProductCategoryFilterTree({
	categories,
	counts,
	value,
	noneValue,
	onChange,
	loading = false,
}: ProductCategoryFilterTreeProps) {
	const [search, setSearch] = useState('')
	const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

	// `total` est déjà remonté par le serveur. Les branches sans produit peuvent
	// disparaître sans calculer ni parcourir les produits dans le navigateur.
	const options = useMemo(() => {
		const treeOrder = toCategoryOptions(categories)
		if (!counts) return treeOrder
		return treeOrder.filter(
			(category) => countsOfCategory(counts, category.id).total > 0,
		)
	}, [categories, counts])
	const optionIds = useMemo(
		() => new Set(options.map((option) => option.id)),
		[options],
	)
	const parentById = useMemo(
		() =>
			new Map(
				categories.map((category) => [category.id, category.parent || '']),
			),
		[categories],
	)
	const parentsWithChildren = useMemo(() => {
		const parents = new Set<string>()
		for (const category of categories) {
			const parent = category.parent || ''
			if (parent && optionIds.has(parent) && optionIds.has(category.id)) {
				parents.add(parent)
			}
		}
		return parents
	}, [categories, optionIds])

	// Une sélection restaurée doit être visible immédiatement, même si ses
	// parents étaient repliés avant le démontage de la page.
	useEffect(() => {
		if (!value || value === noneValue) return
		setExpandedIds((current) => {
			const next = new Set(current)
			const visited = new Set<string>()
			let parent = parentById.get(value) || ''
			while (parent && !visited.has(parent)) {
				visited.add(parent)
				next.add(parent)
				parent = parentById.get(parent) || ''
			}
			return next
		})
	}, [noneValue, parentById, value])

	const normalizedSearch = normalizeSearch(search.trim())
	const searchedIds = useMemo(() => {
		if (!normalizedSearch) return null
		const included = new Set<string>()
		for (const category of categories) {
			if (!normalizeSearch(category.name).includes(normalizedSearch)) continue

			// Le résultat conserve ses parents pour expliquer où il se trouve, et sa
			// descendance pour que chercher une famille garde ses sous-catégories.
			for (const id of collectBranchIds(categories, category.id))
				included.add(id)
			const visited = new Set<string>()
			let parent = category.parent || ''
			while (parent && !visited.has(parent)) {
				visited.add(parent)
				included.add(parent)
				parent = parentById.get(parent) || ''
			}
		}
		return included
	}, [categories, normalizedSearch, parentById])

	const visibleOptions = useMemo(() => {
		if (searchedIds)
			return options.filter((option) => searchedIds.has(option.id))
		return options.filter((option) => {
			const visited = new Set<string>()
			let parent = parentById.get(option.id) || ''
			while (parent && optionIds.has(parent) && !visited.has(parent)) {
				if (!expandedIds.has(parent)) return false
				visited.add(parent)
				parent = parentById.get(parent) || ''
			}
			return true
		})
	}, [expandedIds, optionIds, options, parentById, searchedIds])

	const toggle = (id: string) => {
		setExpandedIds((current) => {
			const next = new Set(current)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	return (
		<Card className='overflow-hidden xl:sticky xl:top-[calc(var(--header-h)+4.5rem)]'>
			<CardContent className='p-0'>
				<div className='border-b bg-muted/30 p-3'>
					<div className='mb-2 flex items-center justify-between gap-2'>
						<div className='flex items-center gap-2'>
							<FolderTree className='h-4 w-4 text-sky-700' />
							<h2 className='font-semibold text-sm'>Catégories</h2>
						</div>
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
							aria-label='Chercher dans les catégories'
							className='h-8 pr-8 pl-8 text-sm'
						/>
						{search && (
							<button
								type='button'
								onClick={() => setSearch('')}
								aria-label='Effacer la recherche de catégorie'
								className='-translate-y-1/2 absolute top-1/2 right-2 rounded-sm text-muted-foreground hover:text-foreground'
							>
								<X className='h-3.5 w-3.5' />
							</button>
						)}
					</div>
				</div>

				<div className='max-h-72 overflow-y-auto p-2 xl:max-h-[calc(100vh-var(--header-h)-9.5rem)]'>
					<button
						type='button'
						onClick={() => onChange('')}
						aria-pressed={value === ''}
						className={cn(
							'mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left font-medium text-sm transition-colors',
							value === ''
								? 'bg-primary text-primary-foreground'
								: 'hover:bg-accent',
						)}
					>
						<FolderTree className='h-4 w-4 shrink-0' />
						<span className='min-w-0 flex-1 truncate'>Tous les produits</span>
						{counts && (
							<span className='text-xs tabular-nums opacity-70'>
								{counts.totalProduits}
							</span>
						)}
					</button>
					<button
						type='button'
						onClick={() => onChange(noneValue)}
						aria-pressed={value === noneValue}
						className={cn(
							'mb-1.5 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors',
							value === noneValue
								? 'bg-primary text-primary-foreground'
								: 'text-muted-foreground hover:bg-accent hover:text-foreground',
						)}
					>
						<Folder className='h-4 w-4 shrink-0' />
						<span className='truncate'>Sans catégorie</span>
					</button>

					{loading ? (
						<div className='flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm'>
							<Loader2 className='h-4 w-4 animate-spin' />
							Chargement…
						</div>
					) : visibleOptions.length === 0 ? (
						<p className='py-8 text-center text-muted-foreground text-sm'>
							{normalizedSearch
								? 'Aucune catégorie trouvée'
								: 'Aucune catégorie peuplée'}
						</p>
					) : (
						<div role='tree' aria-label='Arbre des catégories'>
							{visibleOptions.map((option) => {
								const hasChildren = parentsWithChildren.has(option.id)
								const expanded =
									normalizedSearch !== '' || expandedIds.has(option.id)
								const categoryCounts = countsOfCategory(counts, option.id)
								const selected = value === option.id
								return (
									<div
										key={option.id}
										role='treeitem'
										aria-level={option.depth + 1}
										aria-selected={selected}
										aria-expanded={hasChildren ? expanded : undefined}
										className={cn(
											'group mb-0.5 flex min-w-0 items-center rounded-md transition-colors',
											selected
												? 'bg-primary text-primary-foreground'
												: 'hover:bg-accent',
										)}
										style={{ paddingLeft: `${4 + option.depth * 13}px` }}
									>
										<button
											type='button'
											disabled={!hasChildren || normalizedSearch !== ''}
											onClick={() => toggle(option.id)}
											aria-label={
												expanded
													? `Replier ${option.name}`
													: `Déplier ${option.name}`
											}
											className={cn(
												'm-0.5 rounded p-1 hover:bg-background/20',
												!hasChildren && 'invisible',
											)}
										>
											{expanded ? (
												<ChevronDown className='h-3.5 w-3.5' />
											) : (
												<ChevronRight className='h-3.5 w-3.5' />
											)}
										</button>
										<button
											type='button'
											onClick={() => onChange(option.id)}
											className='flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pr-2 text-left text-sm'
											title={`${option.name} — ${categoryCounts.direct} directement, ${categoryCounts.total} dans la branche`}
										>
											{expanded && hasChildren ? (
												<FolderOpen className='h-3.5 w-3.5 shrink-0 opacity-70' />
											) : (
												<Folder className='h-3.5 w-3.5 shrink-0 opacity-70' />
											)}
											<span className='min-w-0 flex-1 truncate'>
												{option.name}
											</span>
											{counts && (
												<span className='shrink-0 text-[11px] tabular-nums opacity-60'>
													{categoryCounts.direct === categoryCounts.total
														? categoryCounts.total
														: `${categoryCounts.direct}/${categoryCounts.total}`}
												</span>
											)}
										</button>
									</div>
								)
							})}
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	)
}
