import { Input } from '@/components/ui/input'
import { type CategoryNode, buildAppPosCategoryTree } from '@/lib/apppos'
import type { CategoriesResponse } from '@/lib/pocketbase-types'
// frontend/modules/stock/components/CategoryTreeAppPos.tsx
import { cn } from '@/lib/utils'
import {
	ChevronDown,
	ChevronRight,
	Folder,
	FolderOpen,
	Search,
	X,
} from 'lucide-react'
import { useMemo, useState } from 'react'

interface CategoryTreeAppPosProps {
	categories: CategoriesResponse[]
	isLoading: boolean
	selectedId?: string | null
	onSelect: (category: CategoriesResponse | null) => void
	onClose?: () => void
}

export function CategoryTreeAppPos({
	categories,
	isLoading,
	selectedId,
	onSelect,
	onClose,
}: CategoryTreeAppPosProps) {
	const [search, setSearch] = useState('')

	// Tri alpha avant de construire l'arbre
	const sortedCategories = useMemo(
		() => [...categories].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
		[categories],
	)

	const tree = useMemo(
		() => buildAppPosCategoryTree(sortedCategories),
		[sortedCategories],
	)

	// Filtrage : on cherche dans toutes les catégories à plat
	const searchLower = search.trim().toLowerCase()
	const matchingIds = useMemo(() => {
		if (!searchLower) return null
		return new Set(
			sortedCategories
				.filter((c) => c.name.toLowerCase().includes(searchLower))
				.map((c) => c.id),
		)
	}, [sortedCategories, searchLower])

	return (
		<div className='flex flex-col h-full'>
			<div className='p-3 border-b flex items-center justify-between shrink-0'>
				<span className='font-medium text-sm'>Catégories AppPOS</span>
				<div className='flex items-center gap-2'>
					<span className='text-xs text-muted-foreground'>
						{categories.length}
					</span>
					{onClose && (
						<button
							type='button'
							onClick={onClose}
							className='p-1 rounded hover:bg-accent transition-colors'
							title='Fermer'
						>
							<X className='h-3.5 w-3.5 text-muted-foreground' />
						</button>
					)}
				</div>
			</div>

			<div className='px-2 py-2 border-b shrink-0'>
				<div className='relative'>
					<Search className='absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none' />
					<Input
						placeholder='Rechercher...'
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className='h-7 pl-7 text-xs'
					/>
				</div>
			</div>

			<div className='flex-1 overflow-y-auto p-2'>
				{isLoading ? (
					<p className='text-xs text-muted-foreground p-2'>Chargement...</p>
				) : (
					<>
						{!searchLower && (
							<button
								type='button'
								onClick={() => onSelect(null)}
								className={cn(
									'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-accent',
									selectedId === null && 'bg-accent font-medium',
								)}
							>
								<Folder className='h-4 w-4 shrink-0' />
								<span className='truncate'>Tous les produits</span>
							</button>
						)}

						{searchLower
							? // Mode recherche : liste plate triée
								sortedCategories
									.filter((c) => matchingIds?.has(c.id))
									.map((c) => (
										<button
											key={c.id}
											type='button'
											onClick={() => onSelect(c)}
											title={c.name}
											className={cn(
												'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-accent',
												selectedId === c.id &&
													'bg-primary/15 text-primary font-medium',
											)}
										>
											<Folder className='h-4 w-4 shrink-0 text-muted-foreground' />
											<span className='truncate'>{c.name}</span>
										</button>
									))
							: // Mode arbre
								tree.map((node) => (
									<TreeNode
										key={node.id}
										node={node}
										level={0}
										selectedId={selectedId}
										onSelect={onSelect}
									/>
								))}

						{searchLower && matchingIds?.size === 0 && (
							<p className='text-xs text-muted-foreground p-2'>
								Aucune catégorie
							</p>
						)}
					</>
				)}
			</div>
		</div>
	)
}

interface TreeNodeProps {
	node: CategoryNode
	level: number
	selectedId?: string | null
	onSelect: (category: CategoriesResponse | null) => void
}

function TreeNode({ node, level, selectedId, onSelect }: TreeNodeProps) {
	const [expanded, setExpanded] = useState(false)
	const hasChildren = node.children.length > 0
	const isSelected = selectedId === node.id

	// Tri alpha des enfants
	const sortedChildren = useMemo(
		() => [...node.children].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
		[node.children],
	)

	return (
		<div>
			<div
				className={cn(
					'group flex items-center gap-1 py-1.5 rounded text-sm',
					'hover:bg-accent cursor-pointer',
					isSelected && 'bg-primary/15 text-primary font-medium',
				)}
				style={{ paddingLeft: `${8 + level * 16}px`, paddingRight: '8px' }}
			>
				<button
					type='button'
					onClick={(e) => {
						e.stopPropagation()
						setExpanded(!expanded)
					}}
					className={cn(
						'p-0.5 rounded hover:bg-muted shrink-0',
						!hasChildren && 'invisible',
					)}
				>
					{expanded ? (
						<ChevronDown className='h-3 w-3' />
					) : (
						<ChevronRight className='h-3 w-3' />
					)}
				</button>

				<button
					type='button'
					onClick={() => onSelect(node)}
					className='flex-1 flex items-center gap-2 text-left min-w-0'
					title={node.name}
				>
					{expanded && hasChildren ? (
						<FolderOpen className='h-4 w-4 text-muted-foreground shrink-0' />
					) : (
						<Folder className='h-4 w-4 text-muted-foreground shrink-0' />
					)}
					<span className='truncate'>{node.name}</span>
				</button>
			</div>

			{expanded && hasChildren && (
				<div>
					{sortedChildren.map((child) => (
						<TreeNode
							key={child.id}
							node={child}
							level={level + 1}
							selectedId={selectedId}
							onSelect={onSelect}
						/>
					))}
				</div>
			)}
		</div>
	)
}
