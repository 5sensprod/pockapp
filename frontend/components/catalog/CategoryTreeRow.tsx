// frontend/components/catalog/CategoryTreeRow.tsx
//
// UNE LIGNE DE L'ARBRE DES CATÉGORIES — chevron, retrait, nom, décompte.
//
// Extraite de `ProductCategoryFilterTree` le 10 septembre 2026 pour que l'arbre
// du menu du site (`MenuCategorySource`) ait exactement la même apparence sans
// recopier le rendu. Ce qui diffère d'un écran à l'autre passe par les props :
// `onLabelClick` (filtrer), `actions` (étoile, engrenage), et les attributs
// HTML restants, posés sur la ligne — `draggable`, `onDragStart`, `onDrop`…
//
// Le décompte n'est jamais calculé ici : il est reçu, tel que le serveur l'a
// rendu (`GET /api/catalog/counts`).

import type { CategoryOption } from '@/lib/queries/category-tree'
import type { CategoryCounts } from '@/lib/queries/products'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { HTMLAttributes, ReactNode } from 'react'

export const CATEGORY_SELECTED_CLASS =
	'bg-violet-50/80 text-primary shadow-sm hover:bg-violet-100 dark:bg-violet-950/35 dark:text-foreground dark:hover:bg-violet-900/55'

export const CATEGORY_HIGHLIGHTED_CLASS =
	'bg-violet-100 text-primary ring-2 ring-primary/50 ring-inset dark:bg-violet-900/50'

export interface CategoryTreeRowProps
	extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> {
	option: CategoryOption
	hasChildren: boolean
	expanded: boolean
	onToggle: () => void
	/** Pendant une recherche, tout est déplié et le chevron ne sert à rien. */
	toggleDisabled?: boolean
	selected?: boolean
	/** Cible d'un glisser en cours. */
	highlighted?: boolean
	/** Absent : aucun décompte affiché (réponse du serveur inexploitable). */
	counts?: CategoryCounts
	labelTitle?: string
	/** Absent : le nom n'est pas un bouton. */
	onLabelClick?: () => void
	/** Rendues entre le nom et le décompte. */
	actions?: ReactNode
}

export function CategoryTreeRow({
	option,
	hasChildren,
	expanded,
	onToggle,
	toggleDisabled = false,
	selected = false,
	highlighted = false,
	counts,
	labelTitle,
	onLabelClick,
	actions,
	className,
	style,
	...rest
}: CategoryTreeRowProps) {
	const label = <span className='min-w-0 flex-1 truncate'>{option.name}</span>

	return (
		<div
			role='treeitem'
			aria-level={option.depth + 1}
			aria-selected={selected}
			aria-expanded={hasChildren ? expanded : undefined}
			{...rest}
			className={cn(
				'group mb-0.5 flex min-w-0 items-center rounded-md transition-colors',
				highlighted
					? CATEGORY_HIGHLIGHTED_CLASS
					: selected
						? CATEGORY_SELECTED_CLASS
						: 'hover:bg-accent',
				className,
			)}
			style={{ paddingLeft: `${4 + option.depth * 13}px`, ...style }}
		>
			<button
				type='button'
				disabled={!hasChildren || toggleDisabled}
				onClick={onToggle}
				aria-label={
					expanded ? `Replier ${option.name}` : `Déplier ${option.name}`
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
			{onLabelClick ? (
				<button
					type='button'
					onClick={onLabelClick}
					className='flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm'
					title={labelTitle}
				>
					{label}
				</button>
			) : (
				<span
					className='flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm'
					title={labelTitle}
				>
					{label}
				</span>
			)}
			{actions}
			{counts && (
				<span className='shrink-0 pr-2 text-[11px] tabular-nums opacity-60'>
					{counts.direct === counts.total
						? counts.total
						: `${counts.direct}/${counts.total}`}
				</span>
			)}
		</div>
	)
}
