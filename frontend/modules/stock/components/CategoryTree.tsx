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
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
	ChevronDown,
	ChevronRight,
	Folder,
	FolderOpen,
	MoreHorizontal,
	Pencil,
	Plus,
	Search,
	Star,
	Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import type { CatalogCategoryShape } from '@/lib/queries/catalog-shapes'
import {
	type CategoryNode,
	buildCategoryTree,
	useCategories,
	useDeleteCategory,
	useUpdateCategory,
} from '@/lib/queries/categories'
import {
	type CatalogCounts,
	countsOfCategory,
	useCatalogCounts,
} from '@/lib/queries/products'
import { usePocketBase } from '@/lib/use-pocketbase'
import { toast } from 'sonner'
import { CategoryDialog } from './CategoryDialog'
import { ImageBatchOptimizer } from './ImageBatchOptimizer'

// Une image de catégorie sert de bandeau et de vignette de rayon. Ce plafond
// doit rester égal à celui de `CategoryDialog.tsx`.
const MAX_SIDE_CATEGORIE = 1024

function filtrerArbre(
	nodes: CategoryNode[],
	recherche: string,
): CategoryNode[] {
	if (recherche === '') return nodes

	const resultat: CategoryNode[] = []
	for (const node of nodes) {
		const children = filtrerArbre(node.children, recherche)
		const correspond =
			node.name.toLowerCase().includes(recherche) ||
			(node.slug ?? '').toLowerCase().includes(recherche)

		if (correspond || children.length > 0) {
			resultat.push({ ...node, children })
		}
	}
	return resultat
}

function idsDeBranches(nodes: CategoryNode[]): Set<string> {
	const ids = new Set<string>()
	const visiter = (node: CategoryNode) => {
		if (node.children.length > 0) ids.add(node.id)
		for (const child of node.children) visiter(child)
	}
	for (const node of nodes) visiter(node)
	return ids
}

/**
 * ⚠️ LES DÉCOMPTES NE SE CALCULENT PLUS ICI.
 *
 * Ce fichier portait un `countsOf` récursif qui dédoublonnait les produits
 * d'une branche — un produit rangé dans deux catégories sœurs ne comptant
 * qu'une fois dans leur ancêtre commun. Pour le nourrir, il fallait les
 * IDENTIFIANTS des 2999 produits, soit six allers-retours HTTP en série à
 * chaque montage de l'arbre.
 *
 * La même règle vit maintenant dans `backend/routes/catalog_counts_routes.go`,
 * écrite UNE fois et gardée par un test. Ne pas la réécrire ici : deux
 * comptages séparés finissent toujours par diverger.
 */

export function CategoryTree() {
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase()
	const { data: categories, isLoading } = useCategories({
		companyId: activeCompanyId ?? undefined,
	})
	const { data: catalogCounts } = useCatalogCounts(activeCompanyId ?? undefined)
	const deleteCategory = useDeleteCategory()
	const updateCategory = useUpdateCategory()
	const [search, setSearch] = useState('')
	// `null` signifie « état initial » : seules les racines sont ouvertes. Dès
	// que l'utilisateur agit, CE set devient l'unique état d'expansion — les
	// boutons globaux et les chevrons modifient exactement la même donnée.
	const [expandedIds, setExpandedIds] = useState<Set<string> | null>(null)

	const [dialogOpen, setDialogOpen] = useState(false)
	const [editCategory, setEditCategory] = useState<CatalogCategoryShape | null>(
		null,
	)
	const [defaultParentId, setDefaultParentId] = useState<string | undefined>()

	const [confirmOpen, setConfirmOpen] = useState(false)
	const [categoryToDelete, setCategoryToDelete] =
		useState<CatalogCategoryShape | null>(null)

	const tree = useMemo(
		() => (categories ? buildCategoryTree(categories) : []),
		[categories],
	)
	const recherche = search.trim().toLowerCase()
	const filteredTree = useMemo(
		() => filtrerArbre(tree, recherche),
		[tree, recherche],
	)
	const defaultExpandedIds = useMemo(
		() =>
			new Set(tree.filter((node) => node.children.length > 0).map((n) => n.id)),
		[tree],
	)
	const expansion = expandedIds ?? defaultExpandedIds
	const matchingCount = useMemo(
		() =>
			recherche === ''
				? (categories?.length ?? 0)
				: (categories ?? []).filter(
						(category) =>
							category.name.toLowerCase().includes(recherche) ||
							(category.slug ?? '').toLowerCase().includes(recherche),
					).length,
		[categories, recherche],
	)

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

	const toggleExpanded = (id: string) => {
		setExpandedIds((courants) => {
			const suivants = new Set(courants ?? defaultExpandedIds)
			if (suivants.has(id)) suivants.delete(id)
			else suivants.add(id)
			return suivants
		})
	}

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
			<div className='flex flex-wrap items-center justify-between gap-3 border-b p-3'>
				<div className='flex items-baseline gap-3'>
					<h2 className='font-semibold text-lg'>
						Catégories ({categories?.length ?? 0})
					</h2>
					{recherche !== '' && (
						<span className='text-muted-foreground text-sm'>
							{matchingCount} résultat(s)
						</span>
					)}
				</div>
				<div className='flex flex-wrap items-center gap-2'>
					<div className='relative'>
						<Search className='-translate-y-1/2 absolute top-1/2 left-2 h-4 w-4 text-muted-foreground' />
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder='Nom ou slug…'
							className='w-56 pl-8'
						/>
					</div>
					<Button
						variant='outline'
						size='sm'
						disabled={tree.length === 0 || recherche !== ''}
						onClick={() => setExpandedIds(new Set())}
					>
						Tout replier
					</Button>
					<Button
						variant='outline'
						size='sm'
						disabled={tree.length === 0 || recherche !== ''}
						onClick={() => setExpandedIds(idsDeBranches(tree))}
					>
						Tout déplier
					</Button>
					{/* Le lot porte sur toutes les catégories chargées, jamais sur le
					    résultat de recherche ni sur les branches ouvertes. */}
					<ImageBatchOptimizer
						items={optimisables}
						maxSide={MAX_SIDE_CATEGORIE}
						nomImage='image'
						save={async (item, file) =>
							void (await updateCategory.mutateAsync({
								id: item.id,
								data: { name: item.label, image: file },
							}))
						}
					/>
					<Button onClick={() => handleAdd()}>
						<Plus className='mr-2 h-4 w-4' />
						Nouvelle catégorie
					</Button>
				</div>
			</div>

			<div className='flex-1 overflow-y-auto p-2'>
				{/* Arbre */}
				{filteredTree.map((node) => (
					<TreeNode
						key={node.id}
						node={node}
						level={0}
						onAdd={handleAdd}
						onEdit={handleEdit}
						onDelete={askDelete}
						catalogCounts={catalogCounts}
						expandedIds={expansion}
						onToggle={toggleExpanded}
						forceExpanded={recherche !== ''}
					/>
				))}
				{filteredTree.length === 0 && (
					<p className='py-10 text-center text-muted-foreground text-sm'>
						{categories?.length
							? 'Aucune catégorie ne correspond'
							: 'Aucune catégorie'}
					</p>
				)}
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
	onAdd: (parentId: string) => void
	onEdit: (cat: CatalogCategoryShape) => void
	onDelete: (cat: CatalogCategoryShape) => void
	catalogCounts?: CatalogCounts
	expandedIds: Set<string>
	onToggle: (id: string) => void
	forceExpanded: boolean
}

function TreeNode({
	node,
	level,
	onAdd,
	onEdit,
	onDelete,
	catalogCounts,
	expandedIds,
	onToggle,
	forceExpanded,
}: TreeNodeProps) {
	const hasChildren = node.children.length > 0
	const expanded = forceExpanded || expandedIds.has(node.id)
	const { direct, total } = countsOfCategory(catalogCounts, node.id)
	const pb = usePocketBase()
	const imageUrl = node.image ? pb.files.getUrl(node, node.image) : null

	return (
		<div>
			<div
				className={cn(
					'group flex items-center gap-1 px-2 py-1.5 rounded text-sm',
					'hover:bg-accent',
				)}
				style={{ paddingLeft: `${8 + level * 16}px` }}
			>
				{/* Chevron */}
				<button
					type='button'
					disabled={forceExpanded}
					aria-label={
						expanded ? `Replier ${node.name}` : `Déplier ${node.name}`
					}
					onClick={(e) => {
						e.stopPropagation()
						onToggle(node.id)
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
					onClick={() => onEdit(node)}
					className='flex min-w-0 flex-1 items-center gap-2 text-left'
					title={node.description || node.name}
				>
					{/* L'image de la catégorie remplace l'icône de dossier quand elle
					    existe — 36 des 464 en portent une, jamais affichée avant le
					    18 août 2026. `image` est un nom de fichier : c'est PocketBase
					    qui la sert, par `pb.files.getUrl`. */}
					{imageUrl ? (
						<img
							src={imageUrl}
							alt=''
							className='h-5 w-5 shrink-0 rounded object-cover'
						/>
					) : expanded && hasChildren ? (
						<FolderOpen className='h-4 w-4 text-muted-foreground' />
					) : (
						<Folder className='h-4 w-4 text-muted-foreground' />
					)}
					<span className='truncate'>{node.name}</span>
					{node.slug && (
						<span className='hidden truncate font-mono text-muted-foreground text-xs md:inline'>
							{node.slug}
						</span>
					)}
					{node.is_featured && (
						<Star className='h-3.5 w-3.5 shrink-0 text-amber-500' />
					)}
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
							onAdd={onAdd}
							onEdit={onEdit}
							onDelete={onDelete}
							catalogCounts={catalogCounts}
							expandedIds={expandedIds}
							onToggle={onToggle}
							forceExpanded={forceExpanded}
						/>
					))}
				</div>
			)}
		</div>
	)
}
