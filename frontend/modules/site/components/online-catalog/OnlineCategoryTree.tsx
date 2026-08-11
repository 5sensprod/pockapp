// frontend/modules/site/components/online-catalog/OnlineCategoryTree.tsx
//
// L'arbre des catégories en ligne. Il montre la STRUCTURE — c'est ce que
// `ProductTable` ne sait pas faire : une table ne dit pas qu'une catégorie est
// en ligne uniquement parce qu'un produit vit trois niveaux plus bas.
//
// Le compteur est donc double, et c'est le point : « direct » est ce qui est
// rattaché ici, « total » ce que la branche emporte.

import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react'

import type { OnlineCategoryNode } from '../../lib/online-catalog'

type Props = {
	nodes: OnlineCategoryNode[]
	selectedId: string | null
	expanded: Set<string>
	onSelect: (node: OnlineCategoryNode) => void
	onToggle: (id: string) => void
}

type BranchProps = Omit<Props, 'nodes'> & { node: OnlineCategoryNode }

export function OnlineCategoryTree({
	nodes,
	selectedId,
	expanded,
	onSelect,
	onToggle,
}: Props) {
	if (!nodes.length) {
		return (
			<p className='px-3 py-6 text-center text-muted-foreground text-sm'>
				Aucune catégorie en ligne.
			</p>
		)
	}

	return (
		<ul className='space-y-0.5'>
			{nodes.map((node) => (
				<OnlineCategoryBranch
					key={node.category.id}
					node={node}
					selectedId={selectedId}
					expanded={expanded}
					onSelect={onSelect}
					onToggle={onToggle}
				/>
			))}
		</ul>
	)
}

function OnlineCategoryBranch({
	node,
	selectedId,
	expanded,
	onSelect,
	onToggle,
}: BranchProps) {
	const hasChildren = node.children.length > 0
	const isOpen = expanded.has(node.category.id)
	const isSelected = selectedId === node.category.id
	const Icon = isOpen && hasChildren ? FolderOpen : Folder

	return (
		<li>
			<div
				className={cn(
					'flex items-center gap-1 rounded-md pr-2 text-sm transition-colors',
					isSelected ? 'bg-accent font-semibold' : 'hover:bg-accent/50',
				)}
				style={{ paddingLeft: `${node.depth * 14}px` }}
			>
				{/* Le chevron n'est rendu que s'il y a une descendance : une pastille
				    inerte au même endroit ferait croire à un pliage possible. */}
				{hasChildren ? (
					<button
						type='button'
						onClick={() => onToggle(node.category.id)}
						className='shrink-0 rounded p-1 hover:bg-accent'
						aria-label={isOpen ? 'Replier' : 'Déplier'}
					>
						{isOpen ? (
							<ChevronDown className='h-3.5 w-3.5' />
						) : (
							<ChevronRight className='h-3.5 w-3.5' />
						)}
					</button>
				) : (
					<span className='w-[26px] shrink-0' />
				)}

				<button
					type='button'
					onClick={() => onSelect(node)}
					className='flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left'
				>
					<Icon className='h-4 w-4 shrink-0 text-muted-foreground' />
					<span className='truncate'>{node.category.name}</span>
				</button>

				{/* Un seul nombre quand la catégorie n'a pas de descendance qui
				    apporte des produits ; sinon « direct / branche », le zéro
				    compris — une catégorie de pur classement porte 0 produit en
				    propre, et l'écrire « / 12 » donnait un compteur amputé. */}
				<span
					className='shrink-0 text-muted-foreground text-xs tabular-nums'
					title={
						node.totalCount === node.directCount
							? `${node.directCount} produit(s) en ligne`
							: `${node.directCount} rattaché(s) ici, ${node.totalCount} dans la branche`
					}
				>
					{node.totalCount === node.directCount ? (
						<span className='text-foreground'>{node.directCount}</span>
					) : (
						<>
							<span
								className={node.directCount > 0 ? 'text-foreground' : undefined}
							>
								{node.directCount}
							</span>
							<span> / {node.totalCount}</span>
						</>
					)}
				</span>
			</div>

			{hasChildren && isOpen && (
				<ul className='space-y-0.5'>
					{node.children.map((child) => (
						<OnlineCategoryBranch
							key={child.category.id}
							node={child}
							selectedId={selectedId}
							expanded={expanded}
							onSelect={onSelect}
							onToggle={onToggle}
						/>
					))}
				</ul>
			)}
		</li>
	)
}
