// frontend/modules/stock/components/CategoryTreeAppPos.tsx
// Arbre de catégories pour AppPOS (lecture seule)

import { cn } from '@/lib/utils'
import {
	ChevronDown,
	ChevronRight,
	Folder,
	FolderOpen,
} from 'lucide-react'
import { useState } from 'react'

import type { CategoriesResponse } from '@/lib/pocketbase-types'
import { buildAppPosCategoryTree, type CategoryNode } from '@/lib/apppos'

interface CategoryTreeAppPosProps {
	categories: CategoriesResponse[]
	isLoading: boolean
	selectedId?: string | null
	onSelect: (category: CategoriesResponse | null) => void
}

export function CategoryTreeAppPos({
	categories,
	isLoading,
	selectedId,
	onSelect,
}: CategoryTreeAppPosProps) {
	const tree = buildAppPosCategoryTree(categories)

	if (isLoading) {
		return (
			<div className='p-4 text-sm text-muted-foreground'>Chargement...</div>
		)
	}

	return (
		<div className='flex flex-col h-full'>
			<div className='p-3 border-b flex items-center justify-between'>
				<span className='font-medium text-sm'>Catégories AppPOS</span>
				<span className='text-xs text-muted-foreground'>
					{categories.length}
				</span>
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
					/>
				))}
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

function TreeNode({
	node,
	level,
	selectedId,
	onSelect,
}: TreeNodeProps) {
	const [expanded, setExpanded] = useState(level < 2) // Auto-expand les 2 premiers niveaux
	const hasChildren = node.children.length > 0
	const isSelected = selectedId === node.id

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
						/>
					))}
				</div>
			)}
		</div>
	)
}
