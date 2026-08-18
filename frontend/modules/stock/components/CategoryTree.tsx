import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
	ChevronDown,
	ChevronRight,
	Folder,
	FolderOpen,
	MoreHorizontal,
	Pencil,
	Plus,
	Trash2,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import type { CatalogCategoryShape } from '@/lib/queries/catalog-shapes'
import {
	type CategoryNode,
	buildCategoryTree,
	useCategories,
	useDeleteCategory,
} from '@/lib/queries/categories'
import { useProductIdsByCategory } from '@/lib/queries/products'
import { toast } from 'sonner'
import { CategoryDialog } from './CategoryDialog'

interface CategoryTreeProps {
	selectedId?: string | null
	onSelect: (category: CatalogCategoryShape | null) => void
}

/** Objet vide PARTAGÉ : `{}` créé à la volée change d'identité à chaque rendu
 *  et ferait recalculer tout l'arbre pour rien. */
const EMPTY_IDS: Record<string, string[]> = {}

/**
 * Décomptes d'une branche : ce qui est rattaché ICI, et ce que la branche
 * entière emporte, **dédoublonné**.
 *
 * Un produit rattaché à deux catégories sœurs ne compte qu'une fois dans leur
 * ancêtre commun : le total d'un parent n'est donc pas la somme de ceux de ses
 * enfants. C'est la même règle que côté site (§6 bis du contrat catalogue), et
 * elle doit rester la même — deux comptages écrits séparément finissent
 * toujours par diverger.
 */
function countsOf(
	node: CategoryNode,
	idsByCategory: Record<string, string[]>,
): { direct: number; total: number; subtree: Set<string> } {
	const subtree = new Set<string>(idsByCategory[node.id] ?? [])
	for (const child of node.children) {
		for (const id of countsOf(child, idsByCategory).subtree) subtree.add(id)
	}
	return {
		direct: idsByCategory[node.id]?.length ?? 0,
		total: subtree.size,
		subtree,
	}
}

export function CategoryTree({ selectedId, onSelect }: CategoryTreeProps) {
	const { activeCompanyId } = useActiveCompany()
	const {
		data: categories,
		isLoading,
		refetch,
	} = useCategories({ companyId: activeCompanyId ?? undefined })
	const { data: idsByCategory } = useProductIdsByCategory(
		activeCompanyId ?? undefined,
	)
	const deleteCategory = useDeleteCategory()

	const [dialogOpen, setDialogOpen] = useState(false)
	const [editCategory, setEditCategory] = useState<CatalogCategoryShape | null>(
		null,
	)
	const [defaultParentId, setDefaultParentId] = useState<string | undefined>()

	const [confirmOpen, setConfirmOpen] = useState(false)
	const [categoryToDelete, setCategoryToDelete] =
		useState<CatalogCategoryShape | null>(null)

	// Refetch quand l'entreprise change
	useEffect(() => {
		if (activeCompanyId) {
			refetch()
		}
	}, [activeCompanyId, refetch])

	const tree = categories ? buildCategoryTree(categories) : []

	const handleAdd = (parentId?: string) => {
		setEditCategory(null)
		setDefaultParentId(parentId)
		setDialogOpen(true)
	}

	const handleEdit = (cat: CatalogCategoryShape) => {
		setEditCategory(cat)
		setDefaultParentId(undefined)
		setDialogOpen(true)
	}

	const askDelete = (cat: CatalogCategoryShape) => {
		setCategoryToDelete(cat)
		setConfirmOpen(true)
	}

	const confirmDelete = async () => {
		if (!categoryToDelete) return
		try {
			await deleteCategory.mutateAsync(categoryToDelete.id)
			toast.success(`Catégorie "${categoryToDelete.name}" supprimée`)
			if (selectedId === categoryToDelete.id) {
				onSelect(null)
			}
		} catch (error) {
			toast.error('Erreur lors de la suppression')
		} finally {
			setConfirmOpen(false)
			setCategoryToDelete(null)
		}
	}

	if (isLoading) {
		return (
			<div className='p-4 text-sm text-muted-foreground'>Chargement...</div>
		)
	}

	return (
		<div className='flex flex-col h-full'>
			<div className='p-3 border-b flex items-center justify-between'>
				<span className='font-medium text-sm'>Catégories</span>
				<Button
					variant='ghost'
					size='icon'
					className='h-7 w-7'
					onClick={() => handleAdd()}
				>
					<Plus className='h-4 w-4' />
				</Button>
			</div>

			<div className='flex-1 overflow-y-auto p-2'>
				{/* Option "Tous les produits" */}
				<button
					type='button'
					onClick={() => onSelect(null)}
					className={cn(
						'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left',
						'hover:bg-accent',
						selectedId === null && 'bg-accent font-medium',
					)}
				>
					<Folder className='h-4 w-4' />
					Tous les produits
				</button>

				{/* Arbre */}
				{tree.map((node) => (
					<TreeNode
						key={node.id}
						node={node}
						level={0}
						selectedId={selectedId}
						onSelect={onSelect}
						onAdd={handleAdd}
						onEdit={handleEdit}
						onDelete={askDelete}
						idsByCategory={idsByCategory ?? EMPTY_IDS}
					/>
				))}
			</div>

			<CategoryDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				category={editCategory}
				defaultParentId={defaultParentId}
			/>

			<Dialog
				open={confirmOpen}
				onOpenChange={(open) => {
					setConfirmOpen(open)
					if (!open) setCategoryToDelete(null)
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Supprimer cette catégorie ?</DialogTitle>
						<DialogDescription>
							{categoryToDelete
								? `"${categoryToDelete.name}" sera supprimée. Les produits ne seront pas supprimés.`
								: ''}
						</DialogDescription>
					</DialogHeader>
					<div className='flex justify-end gap-2 pt-4'>
						<Button variant='outline' onClick={() => setConfirmOpen(false)}>
							Annuler
						</Button>
						<Button variant='destructive' onClick={confirmDelete}>
							Supprimer
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}

interface TreeNodeProps {
	node: CategoryNode
	level: number
	selectedId?: string | null
	onSelect: (category: CatalogCategoryShape | null) => void
	onAdd: (parentId: string) => void
	onEdit: (cat: CatalogCategoryShape) => void
	onDelete: (cat: CatalogCategoryShape) => void
	idsByCategory: Record<string, string[]>
}

function TreeNode({
	node,
	level,
	selectedId,
	onSelect,
	onAdd,
	onEdit,
	onDelete,
	idsByCategory,
}: TreeNodeProps) {
	// Replié par défaut hors racines : le catalogue porte 463 catégories, et
	// tout déplier d'emblée noyait la structure au lieu de la montrer.
	const [expanded, setExpanded] = useState(level === 0)
	const hasChildren = node.children.length > 0
	const isSelected = selectedId === node.id
	const { direct, total } = countsOf(node, idsByCategory)

	return (
		<div>
			<div
				className={cn(
					'group flex items-center gap-1 px-2 py-1.5 rounded text-sm',
					'hover:bg-accent cursor-pointer',
					isSelected && 'bg-accent font-medium',
				)}
				style={{ paddingLeft: `${8 + level * 16}px` }}
			>
				{/* Chevron */}
				<button
					type='button'
					onClick={(e) => {
						e.stopPropagation()
						setExpanded(!expanded)
					}}
					className={cn(
						'p-0.5 rounded hover:bg-muted',
						!hasChildren && 'invisible',
					)}
				>
					{expanded ? (
						<ChevronDown className='h-3 w-3' />
					) : (
						<ChevronRight className='h-3 w-3' />
					)}
				</button>

				{/* Icon + Name */}
				<button
					type='button'
					onClick={() => onSelect(node)}
					className='flex-1 flex items-center gap-2 text-left'
				>
					{expanded && hasChildren ? (
						<FolderOpen className='h-4 w-4 text-muted-foreground' />
					) : (
						<Folder className='h-4 w-4 text-muted-foreground' />
					)}
					<span className='truncate'>{node.name}</span>
				</button>

				{/* Un seul nombre quand la branche n'apporte rien de plus ; sinon
				    « ici / branche ». Une catégorie de pur classement porte 0 produit
				    en propre, et n'afficher que ce 0 la ferait croire vide. */}
				<span
					className='shrink-0 text-muted-foreground text-xs tabular-nums'
					title={
						total === direct
							? `${direct} produit(s)`
							: `${direct} rattaché(s) ici, ${total} dans la branche`
					}
				>
					{total === direct ? (
						direct
					) : (
						<>
							{direct} / {total}
						</>
					)}
				</span>

				{/* Actions */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant='ghost'
							size='icon'
							className='h-6 w-6 opacity-0 group-hover:opacity-100'
							onClick={(e) => e.stopPropagation()}
						>
							<MoreHorizontal className='h-3 w-3' />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align='end'>
						<DropdownMenuItem onClick={() => onAdd(node.id)}>
							<Plus className='h-4 w-4 mr-2' />
							Sous-catégorie
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => onEdit(node)}>
							<Pencil className='h-4 w-4 mr-2' />
							Modifier
						</DropdownMenuItem>
						<DropdownMenuItem
							className='text-red-600'
							onClick={() => onDelete(node)}
						>
							<Trash2 className='h-4 w-4 mr-2' />
							Supprimer
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Children */}
			{expanded && hasChildren && (
				<div>
					{node.children.map((child) => (
						<TreeNode
							key={child.id}
							node={child}
							level={level + 1}
							selectedId={selectedId}
							onSelect={onSelect}
							onAdd={onAdd}
							onEdit={onEdit}
							onDelete={onDelete}
							idsByCategory={idsByCategory}
						/>
					))}
				</div>
			)}
		</div>
	)
}
