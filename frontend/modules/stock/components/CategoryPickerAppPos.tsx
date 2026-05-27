// frontend/modules/stock/components/CategoryPickerAppPos.tsx
// Picker de catégories AppPOS avec arbre expand/collapse — même UX que CategoryPicker.
// Reçoit les CategoriesResponse déjà transformées par appPosTransformers.categories().

import { Input } from '@/components/ui/input'
import { type CategoryNode, buildAppPosCategoryTree } from '@/lib/apppos'
import type { CategoriesResponse } from '@/lib/pocketbase-types'
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

interface CategoryPickerAppPosProps {
	categories: CategoriesResponse[]
	value: string[]
	onChange: (value: string[]) => void
	maxHeight?: string
	searchPlaceholder?: string
}

export function CategoryPickerAppPos({
	categories,
	value,
	onChange,
	maxHeight = '200px',
	searchPlaceholder = 'Rechercher une catégorie...',
}: CategoryPickerAppPosProps) {
	const [search, setSearch] = useState('')
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

	// Arbre trié alpha
	const sortedCategories = useMemo(
		() => [...categories].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
		[categories],
	)
	const tree = useMemo(
		() =>
			buildAppPosCategoryTree(sortedCategories).sort((a, b) =>
				a.name.localeCompare(b.name, 'fr'),
			),
		[sortedCategories],
	)

	// Mode recherche : liste plate filtrée
	const searchLower = search.trim().toLowerCase()
	const flatFiltered = useMemo(() => {
		if (!searchLower) return []
		return sortedCategories.filter((c) =>
			c.name.toLowerCase().includes(searchLower),
		)
	}, [sortedCategories, searchLower])

	const toggle = (id: string) => {
		onChange(
			value.includes(id) ? value.filter((v) => v !== id) : [...value, id],
		)
	}

	const toggleExpand = (id: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev)
			next.has(id) ? next.delete(id) : next.add(id)
			return next
		})
	}

	// Tags des catégories sélectionnées
	const selectedItems = useMemo(
		() => categories.filter((c) => value.includes(c.id)),
		[categories, value],
	)

	return (
		<div className='space-y-2'>
			{/* Tags sélectionnés */}
			{selectedItems.length > 0 && (
				<div className='flex flex-wrap gap-1'>
					{selectedItems.map((cat) => (
						<span
							key={cat.id}
							className='flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full'
						>
							{cat.name}
							<button
								type='button'
								onClick={() => toggle(cat.id)}
								className='hover:opacity-70'
							>
								<X className='h-3 w-3' />
							</button>
						</span>
					))}
				</div>
			)}

			{/* Recherche */}
			<div className='relative'>
				<Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none' />
				<Input
					placeholder={searchPlaceholder}
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className='pl-8 h-9 text-sm'
				/>
			</div>

			{/* Liste */}
			<div className='border rounded-md overflow-y-auto' style={{ maxHeight }}>
				{categories.length === 0 ? (
					<p className='text-xs text-muted-foreground p-3 text-center'>
						Aucune catégorie disponible
					</p>
				) : searchLower ? (
					// Mode recherche — liste plate
					flatFiltered.length === 0 ? (
						<p className='text-xs text-muted-foreground p-3 text-center'>
							Aucun résultat
						</p>
					) : (
						flatFiltered.map((cat) => (
							<FlatRow
								key={cat.id}
								category={cat}
								selected={value.includes(cat.id)}
								onToggle={toggle}
							/>
						))
					)
				) : (
					// Mode arbre — racines repliées par défaut
					tree.map((node) => (
						<TreeNode
							key={node.id}
							node={node}
							level={0}
							selectedIds={value}
							expandedIds={expandedIds}
							onToggle={toggle}
							onToggleExpand={toggleExpand}
						/>
					))
				)}
			</div>
		</div>
	)
}

// ── Ligne plate (mode recherche) ─────────────────────────────────────────────

function FlatRow({
	category,
	selected,
	onToggle,
}: {
	category: CategoriesResponse
	selected: boolean
	onToggle: (id: string) => void
}) {
	return (
		<button
			type='button'
			onClick={() => onToggle(category.id)}
			className={cn(
				'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors',
				selected && 'bg-primary/10 text-primary',
			)}
		>
			<Checkbox checked={selected} />
			<Folder className='h-4 w-4 text-muted-foreground shrink-0' />
			<span className='truncate'>{category.name}</span>
			{selected && <span className='ml-auto text-primary text-xs'>✓</span>}
		</button>
	)
}

// ── Nœud arbre ───────────────────────────────────────────────────────────────

function TreeNode({
	node,
	level,
	selectedIds,
	expandedIds,
	onToggle,
	onToggleExpand,
}: {
	node: CategoryNode
	level: number
	selectedIds: string[]
	expandedIds: Set<string>
	onToggle: (id: string) => void
	onToggleExpand: (id: string) => void
}) {
	const hasChildren = node.children.length > 0
	const isExpanded = expandedIds.has(node.id)
	const isSelected = selectedIds.includes(node.id)

	// Tri alpha des enfants
	const sortedChildren = useMemo(
		() => [...node.children].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
		[node.children],
	)

	return (
		<div>
			<div
				className={cn(
					'flex items-center hover:bg-accent transition-colors',
					isSelected && 'bg-primary/10',
				)}
				style={{ paddingLeft: `${8 + level * 16}px`, paddingRight: '8px' }}
			>
				{/* Chevron expand */}
				<button
					type='button'
					onClick={() => onToggleExpand(node.id)}
					className={cn(
						'p-1 rounded hover:bg-muted shrink-0',
						!hasChildren && 'invisible',
					)}
				>
					{isExpanded ? (
						<ChevronDown className='h-3 w-3' />
					) : (
						<ChevronRight className='h-3 w-3' />
					)}
				</button>

				{/* Sélection */}
				<button
					type='button'
					onClick={() => onToggle(node.id)}
					className='flex-1 flex items-center gap-2 py-2 text-sm text-left min-w-0'
				>
					<Checkbox checked={isSelected} />
					{isExpanded && hasChildren ? (
						<FolderOpen className='h-4 w-4 text-muted-foreground shrink-0' />
					) : (
						<Folder className='h-4 w-4 text-muted-foreground shrink-0' />
					)}
					<span
						className={cn('truncate', isSelected && 'text-primary font-medium')}
					>
						{node.name}
					</span>
					{hasChildren && (
						<span className='ml-auto text-xs text-muted-foreground shrink-0'>
							{node.children.length}
						</span>
					)}
				</button>
			</div>

			{/* Enfants */}
			{isExpanded && hasChildren && (
				<div>
					{sortedChildren.map((child) => (
						<TreeNode
							key={child.id}
							node={child}
							level={level + 1}
							selectedIds={selectedIds}
							expandedIds={expandedIds}
							onToggle={onToggle}
							onToggleExpand={onToggleExpand}
						/>
					))}
				</div>
			)}
		</div>
	)
}

// ── Checkbox visuelle ────────────────────────────────────────────────────────

function Checkbox({ checked }: { checked: boolean }) {
	return (
		<div
			className={cn(
				'h-4 w-4 rounded border shrink-0 flex items-center justify-center',
				checked ? 'bg-primary border-primary' : 'border-input bg-background',
			)}
		>
			{checked && (
				<svg
					viewBox='0 0 10 8'
					className='h-2.5 w-2.5 text-primary-foreground fill-none stroke-current stroke-2'
					aria-hidden='true'
					focusable='false'
				>
					<polyline points='1,4 4,7 9,1' />
				</svg>
			)}
		</div>
	)
}
