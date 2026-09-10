// frontend/modules/site/components/MenuTreeEditor.tsx
// ═══════════════════════════════════════════════════════════════════════════
// ÉDITEUR D'ARBRE DU MENU  (ticket 4)
// ═══════════════════════════════════════════════════════════════════════════
// Créer, renommer, ordonner, imbriquer, masquer, supprimer les entrées du
// menu. Écrit dans `site_menu` et nulle part ailleurs.
//
// **La publication est le seul chemin qui sort du poste**, par le bouton
// « Publier le menu » (ticket 6, `PublishMenuButton`). Tout le reste de cet
// écran n'écrit que dans PocketBase local.
//
// L'ordre se change par boutons — monter, descendre, indenter, désindenter.
// Pas de glisser-déposer pour réordonner : aucune bibliothèque de ce genre
// n'existe dans le dépôt, et on n'en ajoute pas une sur une hypothèse
// d'ergonomie.
//
// Un seul glisser, depuis le 10 septembre 2026 : une catégorie de l'arbre de
// gauche (`MenuCategorySource`) déposée sur un sous-menu y crée une entrée. La
// règle est `categoryDrop` (`../lib/menu-tree.ts`). C'est désormais le SEUL
// moyen de créer une entrée de catégorie : la liste déroulante du formulaire
// est retirée.
// ═══════════════════════════════════════════════════════════════════════════

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ResizableExplorerHandle } from '@/components/ui/resizable-explorer-handle'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useResizableExplorer } from '@/lib/hooks/useResizableExplorer'
import { categoryPathNames } from '@/lib/queries/category-tree'
import { useCatalogCounts } from '@/lib/queries/products'
import { useCatalogCategories } from '@/lib/queries/site-catalog'
import {
	type SiteMenuRecord,
	type SiteMenuRefType,
	type SiteMenuResponse,
	useCreateSiteMenuEntry,
	useDeleteSiteMenuEntry,
	useReorderSiteMenu,
	useReplaceSiteMenu,
	useSiteMenuEntries,
	useUpdateSiteMenuEntry,
} from '@/lib/queries/site-menu'
import { cn } from '@/lib/utils'
import {
	AlertTriangle,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	Eye,
	EyeOff,
	FileUp,
	Loader2,
	Pencil,
	Plus,
	Trash2,
} from 'lucide-react'
import {
	type CSSProperties,
	type DragEvent as ReactDragEvent,
	useMemo,
	useRef,
	useState,
} from 'react'
import { toast } from 'sonner'

import { useDestinationIndex } from '../hooks/use-menu-destinations'
import { type ParseMenuResult, parseMenuDocument } from '../lib/import-menu'
import {
	MENU_CATEGORY_DRAG_TYPE,
	ROOT,
	buildMenuTree,
	categoryDrop,
	flattenMenuTree,
	hiddenByAncestor,
	indent,
	moveDown,
	moveUp,
	nextPosition,
	outdent,
} from '../lib/menu-tree'
import { MenuCategorySource } from './MenuCategorySource'
import { type CategoryTarget, MenuEntryDialog } from './MenuEntryDialog'
import { PublishMenuButton } from './PublishMenuButton'

const EXPLORER_WIDTH_DEFAULT = 272
const EXPLORER_WIDTH_MIN = 220
const EXPLORER_WIDTH_MAX = 480
const MENU_WIDTH_MIN = 480
const RESIZE_HANDLE_WIDTH = 16

type PendingImport = Extract<ParseMenuResult, { ok: true }>

/** Les quatre types qui portent un `ref_id` à résoudre. */
const REF_TYPES = ['category', 'brand', 'product', 'page'] as const
const isRefType = (t: string): t is SiteMenuRefType =>
	(REF_TYPES as readonly string[]).includes(t)

const REF_TYPE_NOUNS: Record<SiteMenuRefType, string> = {
	category: 'catégorie',
	brand: 'marque',
	product: 'produit',
	page: 'page',
}

/**
 * Résumé de la destination, en mots. Volontairement pas une URL : l'URL
 * n'existe qu'à la publication (§3 du contrat).
 *
 * `resolve` rend le nom de la cible quand il est connu, `null` sinon —
 * catalogue encore en cours de lecture, catalogue illisible, ou cible
 * supprimée depuis. On retombe alors sur l'identifiant : moins lisible, mais
 * jamais faux, et c'est précisément ce qui permettra de repérer une
 * destination devenue orpheline.
 */
function destinationLabel(
	entry: SiteMenuResponse,
	resolve: (type: SiteMenuRefType, refId: string) => string | null,
): string {
	if (entry.link_type === 'none') return 'sous-menu'
	if (entry.link_type === 'manual') return entry.link_url || 'adresse manquante'
	if (!isRefType(entry.link_type)) return entry.link_type

	const noun = REF_TYPE_NOUNS[entry.link_type]
	const name = resolve(entry.link_type, entry.ref_id)
	return name ? `${noun} · ${name}` : `${noun} ${entry.ref_id}`
}

const acceptsCategory = (event: ReactDragEvent) =>
	Array.from(event.dataTransfer.types).includes(MENU_CATEGORY_DRAG_TYPE)

export function MenuTreeEditor() {
	const {
		width: explorerWidth,
		gridRef: menuGridRef,
		handleProps: explorerResizeHandleProps,
	} = useResizableExplorer({
		storageKey: 'site-menu-largeur-explorateur',
		defaultWidth: EXPLORER_WIDTH_DEFAULT,
		minWidth: EXPLORER_WIDTH_MIN,
		maxWidth: EXPLORER_WIDTH_MAX,
		contentMinWidth: MENU_WIDTH_MIN,
		handleWidth: RESIZE_HANDLE_WIDTH,
	})
	const { data: entries, isLoading, isError } = useSiteMenuEntries()

	const createEntry = useCreateSiteMenuEntry()
	const updateEntry = useUpdateSiteMenuEntry()
	const deleteEntry = useDeleteSiteMenuEntry()
	const replaceMenu = useReplaceSiteMenu()
	const reorder = useReorderSiteMenu()

	// Les catégories et leurs décomptes PUBLIÉS : l'arbre de gauche, le dépôt et
	// le badge « hors ligne » lisent les mêmes données.
	const { activeCompanyId } = useActiveCompany()
	const categoriesQuery = useCatalogCategories()
	const countsQuery = useCatalogCounts(activeCompanyId ?? undefined)
	const categories = useMemo(
		() => categoriesQuery.data ?? [],
		[categoriesQuery.data],
	)
	const publishedCounts = countsQuery.data?.parCategoriePubliee

	const [dialogOpen, setDialogOpen] = useState(false)
	const [editing, setEditing] = useState<SiteMenuResponse | undefined>()
	const [creatingUnder, setCreatingUnder] = useState<string>(ROOT)
	const [pendingDelete, setPendingDelete] = useState<
		SiteMenuResponse | undefined
	>()
	const [pendingImport, setPendingImport] = useState<
		PendingImport | undefined
	>()
	const [dragOverId, setDragOverId] = useState<string | null>(null)
	const importInputRef = useRef<HTMLInputElement>(null)

	const list = useMemo(() => entries ?? [], [entries])
	const tree = useMemo(() => buildMenuTree(list), [list])
	const rows = useMemo(() => flattenMenuTree(tree), [tree])
	const inheritedHidden = useMemo(() => hiddenByAncestor(tree), [tree])

	// Types de destination réellement employés : seuls ceux-là conditionnent
	// la publication.
	const usedTypes = useMemo(() => {
		const types = new Set<SiteMenuRefType>()
		for (const entry of list) {
			if (isRefType(entry.link_type)) types.add(entry.link_type)
		}
		return types
	}, [list])
	// Les destinations viennent du catalogue PocketBase. L'éditeur ne dépend
	// plus d'AppPos depuis le 10 septembre 2026 (chantier C de CLAUDE.md).
	const {
		labelFor,
		urlFor,
		loaded: catalogLoaded,
		vides: listesVides,
		isError: catalogError,
	} = useDestinationIndex(usedTypes)

	// Les noms de destinations manquent, le menu lui-même est intact : c'est un
	// avertissement, pas une erreur bloquante.
	const catalogUnavailable = catalogError

	const categoryById = useMemo(
		() => new Map(categories.map((c) => [c.id, c])),
		[categories],
	)
	const categoryByLegacyId = useMemo(
		() => new Map(categories.map((c) => [c.legacy_id, c])),
		[categories],
	)

	/** `null` tant que les décomptes publiés ne sont pas connus : ne rien
	 *  affirmer plutôt que marquer tout le menu « hors ligne ». */
	const isOnline = (categoryId: string): boolean | null =>
		publishedCounts ? (publishedCounts[categoryId]?.total ?? 0) > 0 : null

	/** Une entrée catégorie dont la catégorie n'a plus de produit publié. */
	const isOffline = (entry: SiteMenuResponse): boolean => {
		if (entry.link_type !== 'category') return false
		const category = categoryByLegacyId.get(entry.ref_id)
		return category ? isOnline(category.id) === false : false
	}

	const categoryTarget = useMemo((): CategoryTarget | undefined => {
		if (editing?.link_type !== 'category') return undefined
		const category = categoryByLegacyId.get(editing.ref_id)
		return {
			path: category ? categoryPathNames(categories, category.id) : [],
			url: urlFor('category', editing.ref_id),
			online: category
				? publishedCounts
					? (publishedCounts[category.id]?.total ?? 0) > 0
					: null
				: null,
		}
	}, [editing, categoryByLegacyId, categories, publishedCounts, urlFor])

	const parentLabel = useMemo(
		() =>
			creatingUnder === ROOT
				? undefined
				: list.find((e) => e.id === creatingUnder)?.title,
		[creatingUnder, list],
	)

	const descendantCount = useMemo(() => {
		if (!pendingDelete) return 0
		const byParent = new Map<string, string[]>()
		for (const e of list) {
			const p = e.parent || ROOT
			byParent.set(p, [...(byParent.get(p) ?? []), e.id])
		}
		let count = 0
		const walk = (id: string) => {
			for (const child of byParent.get(id) ?? []) {
				count += 1
				walk(child)
			}
		}
		walk(pendingDelete.id)
		return count
	}, [pendingDelete, list])

	const applyMoves = async (
		moves: ReturnType<typeof moveUp>,
		label: string,
	) => {
		if (moves.length === 0) return
		try {
			await reorder.mutateAsync(moves)
		} catch (error) {
			toast.error(`Déplacement impossible (${label})`, {
				description: error instanceof Error ? error.message : undefined,
			})
		}
	}

	const openCreate = (parentId: string) => {
		setEditing(undefined)
		setCreatingUnder(parentId)
		setDialogOpen(true)
	}

	const openEdit = (entry: SiteMenuResponse) => {
		setEditing(entry)
		setDialogOpen(true)
	}

	const handleSubmit = async (data: SiteMenuRecord) => {
		try {
			if (editing) {
				await updateEntry.mutateAsync({ id: editing.id, data })
				toast.success('Entrée modifiée')
			} else {
				await createEntry.mutateAsync({
					...data,
					parent: creatingUnder || undefined,
					position: nextPosition(list, creatingUnder),
				})
				toast.success('Entrée créée')
			}
		} catch (error) {
			toast.error('Enregistrement impossible', {
				description: error instanceof Error ? error.message : undefined,
			})
			throw error
		}
	}

	const handleCategoryDrop = async (parent: SiteMenuResponse, id: string) => {
		const category = categoryById.get(id)
		if (!category) {
			toast.error('Catégorie introuvable dans le catalogue.')
			return
		}
		const result = categoryDrop(list, parent.id, {
			legacyId: category.legacy_id,
			name: category.name,
			online: isOnline(category.id) === true,
		})
		if (!result.ok) {
			toast.error('Dépôt refusé', { description: result.reason })
			return
		}
		try {
			await createEntry.mutateAsync(result.record)
			toast.success(`« ${category.name} » ajoutée sous « ${parent.title} »`)
		} catch (error) {
			toast.error('Enregistrement impossible', {
				description: error instanceof Error ? error.message : undefined,
			})
		}
	}

	const handleToggleVisible = async (entry: SiteMenuResponse) => {
		try {
			await updateEntry.mutateAsync({
				id: entry.id,
				data: { visible: entry.visible === false },
			})
		} catch (error) {
			toast.error('Changement de visibilité impossible', {
				description: error instanceof Error ? error.message : undefined,
			})
		}
	}

	const handleDelete = async () => {
		if (!pendingDelete) return
		try {
			await deleteEntry.mutateAsync(pendingDelete.id)
			toast.success('Entrée supprimée')
		} catch (error) {
			toast.error('Suppression impossible', {
				description: error instanceof Error ? error.message : undefined,
			})
		} finally {
			setPendingDelete(undefined)
		}
	}

	const handleImportFile = async (file: File | undefined) => {
		if (!file) return
		try {
			const parsed = parseMenuDocument(await file.text())
			if (!parsed.ok) {
				toast.error('Menu JSON invalide', { description: parsed.error })
				return
			}
			setPendingImport(parsed)
		} catch (error) {
			toast.error('Lecture du fichier impossible', {
				description: error instanceof Error ? error.message : undefined,
			})
		}
	}

	const handleImport = async () => {
		if (!pendingImport) return
		const count = pendingImport.records.length
		try {
			await replaceMenu.mutateAsync(pendingImport.records)
			toast.success(
				`${count} entrée${count > 1 ? 's importées' : ' importée'}.`,
			)
		} catch (error) {
			toast.error('Import interrompu : le menu local peut être partiel.', {
				description: error instanceof Error ? error.message : undefined,
			})
		} finally {
			setPendingImport(undefined)
		}
	}

	if (isLoading) {
		return (
			<div className='flex items-center gap-2 py-8 text-muted-foreground text-sm'>
				<Loader2 className='h-4 w-4 animate-spin' />
				Chargement du menu…
			</div>
		)
	}

	if (isError) {
		return (
			<p className='py-8 text-destructive text-sm'>
				Le menu n'a pas pu être lu depuis PocketBase.
			</p>
		)
	}

	return (
		<div
			ref={menuGridRef}
			className='grid items-start gap-4 lg:grid-cols-[var(--menu-explorer-width)_1rem_minmax(0,1fr)] lg:gap-0'
			style={
				{
					'--menu-explorer-width': `${explorerWidth}px`,
				} as CSSProperties
			}
		>
			{/* Le document est le scrollport : aucun ancêtre entre le layout et cette
			    grille ne porte d'overflow. Le sticky suit donc réellement la fenêtre,
			    sous le header global, tandis que la liste de l'arbre défile seule. */}
			<div className='min-h-0 lg:sticky lg:top-header lg:h-[calc(100dvh-var(--header-h))] lg:self-start'>
				<MenuCategorySource
					categories={categories}
					publishedCounts={publishedCounts}
					isLoading={categoriesQuery.isLoading || countsQuery.isLoading}
					isError={categoriesQuery.isError || countsQuery.isError}
				/>
			</div>

			<ResizableExplorerHandle
				label='Redimensionner l’arbre des catégories en ligne'
				{...explorerResizeHandleProps}
			/>

			<div className='min-w-0 space-y-4'>
				<div className='flex items-center justify-between gap-2'>
					<p className='text-muted-foreground text-sm'>
						{rows.length === 0
							? 'Aucune entrée.'
							: `${rows.length} entrée${rows.length > 1 ? 's' : ''}.`}{' '}
						Les modifications sont enregistrées localement. Le site ne change
						qu'à la publication.
					</p>
					<div className='flex shrink-0 items-center gap-2'>
						<Button
							size='sm'
							variant='outline'
							onClick={() => openCreate(ROOT)}
						>
							<Plus className='mr-2 h-4 w-4' />
							Entrée racine
						</Button>
						<input
							ref={importInputRef}
							type='file'
							accept='application/json'
							className='sr-only'
							onChange={(event) => {
								const file = event.currentTarget.files?.[0]
								event.currentTarget.value = ''
								void handleImportFile(file)
							}}
						/>
						<Button
							size='sm'
							variant='outline'
							disabled={replaceMenu.isPending}
							onClick={() => importInputRef.current?.click()}
						>
							<FileUp className='mr-2 h-4 w-4' />
							Importer un menu JSON
						</Button>
						<PublishMenuButton
							entries={list}
							index={{ urlFor }}
							catalogReady={catalogLoaded}
						/>
					</div>
				</div>

				{listesVides.length > 0 && (
					<div className='flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm'>
						<AlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-amber-600' />
						<div>
							<p className='font-medium'>
								Catalogue lu vide (
								{listesVides.map((t) => REF_TYPE_NOUNS[t]).join(', ')}) —
								publication bloquée.
							</p>
							<p className='text-muted-foreground text-xs'>
								Le catalogue n'est jamais vide : la lecture a probablement eu
								lieu avant la connexion. Elle se refait d'elle-même à la
								connexion ; si ce message reste, quitter l'écran et y revenir.
							</p>
						</div>
					</div>
				)}

				{catalogUnavailable && (
					<div className='flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm'>
						<AlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-amber-600' />
						<div>
							<p className='font-medium'>
								Catalogue illisible — les destinations s'affichent par
								identifiant.
							</p>
							<p className='text-muted-foreground text-xs'>
								Les noms des catégories, marques et produits n'ont pas pu être
								lus dans PocketBase. Le menu lui-même est intact et reste
								modifiable.
							</p>
						</div>
					</div>
				)}

				{rows.length > 0 && (
					<div className='divide-y rounded-md border'>
						{rows.map((node) => {
							const { entry, depth } = node
							const selfHidden = entry.visible === false
							const parentHidden = inheritedHidden.has(entry.id)
							const dimmed = selfHidden || parentHidden
							const offline = isOffline(entry)
							// Seul un sous-menu reçoit une catégorie. Les autres lignes
							// n'appellent pas `preventDefault` : le navigateur affiche
							// alors le curseur d'interdiction, sans rien à coder.
							const dropTarget = entry.link_type === 'none'

							const canUp = moveUp(list, entry.id).length > 0
							const canDown = moveDown(list, entry.id).length > 0
							const canIndent = indent(list, entry.id).length > 0
							const canOutdent = outdent(list, entry.id).length > 0

							return (
								<div
									key={entry.id}
									onDragEnter={(event) => {
										if (!dropTarget || !acceptsCategory(event)) return
										setDragOverId(entry.id)
									}}
									onDragOver={(event) => {
										if (!dropTarget || !acceptsCategory(event)) return
										event.preventDefault()
										event.dataTransfer.dropEffect = 'copy'
									}}
									onDragLeave={(event) => {
										if (
											event.relatedTarget instanceof Node &&
											event.currentTarget.contains(event.relatedTarget)
										)
											return
										setDragOverId((current) =>
											current === entry.id ? null : current,
										)
									}}
									onDrop={(event) => {
										if (!dropTarget || !acceptsCategory(event)) return
										event.preventDefault()
										setDragOverId(null)
										const id = event.dataTransfer.getData(
											MENU_CATEGORY_DRAG_TYPE,
										)
										if (id) void handleCategoryDrop(entry, id)
									}}
									className={cn(
										'flex items-center gap-2 px-3 py-2 transition-colors',
										dragOverId === entry.id &&
											'bg-violet-100 ring-2 ring-primary/50 ring-inset dark:bg-violet-900/50',
									)}
									style={{ paddingLeft: `${depth * 24 + 12}px` }}
								>
									<div className='min-w-0 flex-1'>
										<div className='flex items-center gap-2'>
											<span
												className={`truncate font-medium text-sm ${
													dimmed ? 'text-muted-foreground line-through' : ''
												}`}
											>
												{entry.title}
											</span>
											{selfHidden && (
												<Badge variant='outline' className='shrink-0'>
													masquée
												</Badge>
											)}
											{!selfHidden && parentHidden && (
												<Badge variant='outline' className='shrink-0'>
													masquée par un parent
												</Badge>
											)}
											{offline && (
												<Badge
													variant='outline'
													className='shrink-0 border-amber-500/50 text-amber-700 dark:text-amber-400'
													title="Plus aucun produit publié dans cette catégorie : sa page n'existe pas sur le site."
												>
													hors ligne
												</Badge>
											)}
										</div>
										<p className='truncate text-muted-foreground text-xs'>
											{destinationLabel(entry, labelFor)}
										</p>
									</div>

									<div className='flex shrink-0 items-center gap-0.5'>
										<Button
											variant='ghost'
											size='icon'
											title='Monter'
											disabled={!canUp || reorder.isPending}
											onClick={() =>
												applyMoves(moveUp(list, entry.id), 'monter')
											}
										>
											<ChevronUp className='h-4 w-4' />
										</Button>
										<Button
											variant='ghost'
											size='icon'
											title='Descendre'
											disabled={!canDown || reorder.isPending}
											onClick={() =>
												applyMoves(moveDown(list, entry.id), 'descendre')
											}
										>
											<ChevronDown className='h-4 w-4' />
										</Button>
										<Button
											variant='ghost'
											size='icon'
											title="Désindenter — sortir d'un niveau"
											disabled={!canOutdent || reorder.isPending}
											onClick={() =>
												applyMoves(outdent(list, entry.id), 'désindenter')
											}
										>
											<ChevronLeft className='h-4 w-4' />
										</Button>
										<Button
											variant='ghost'
											size='icon'
											title="Indenter — passer sous l'entrée précédente"
											disabled={!canIndent || reorder.isPending}
											onClick={() =>
												applyMoves(indent(list, entry.id), 'indenter')
											}
										>
											<ChevronRight className='h-4 w-4' />
										</Button>

										<Button
											variant='ghost'
											size='icon'
											title={selfHidden ? 'Afficher' : 'Masquer'}
											onClick={() => handleToggleVisible(entry)}
										>
											{selfHidden ? (
												<EyeOff className='h-4 w-4' />
											) : (
												<Eye className='h-4 w-4' />
											)}
										</Button>
										<Button
											variant='ghost'
											size='icon'
											title='Ajouter une sous-entrée'
											onClick={() => openCreate(entry.id)}
										>
											<Plus className='h-4 w-4' />
										</Button>
										<Button
											variant='ghost'
											size='icon'
											title='Modifier'
											onClick={() => openEdit(entry)}
										>
											<Pencil className='h-4 w-4' />
										</Button>
										<Button
											variant='ghost'
											size='icon'
											title='Supprimer'
											onClick={() => setPendingDelete(entry)}
										>
											<Trash2 className='h-4 w-4 text-destructive' />
										</Button>
									</div>
								</div>
							)
						})}
					</div>
				)}
			</div>

			<MenuEntryDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				entry={editing}
				parentLabel={editing ? undefined : parentLabel}
				categoryTarget={categoryTarget}
				onSubmit={handleSubmit}
				isSubmitting={createEntry.isPending || updateEntry.isPending}
			/>

			<AlertDialog
				open={!!pendingDelete}
				onOpenChange={(open) => !open && setPendingDelete(undefined)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Supprimer « {pendingDelete?.title} » ?
						</AlertDialogTitle>
						<AlertDialogDescription>
							{descendantCount > 0
								? `Cette entrée contient ${descendantCount} sous-entrée${
										descendantCount > 1 ? 's' : ''
									}, qui ${descendantCount > 1 ? 'seront supprimées' : 'sera supprimée'} avec elle. Cette action est définitive.`
								: 'Cette action est définitive.'}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Annuler</AlertDialogCancel>
						<AlertDialogAction onClick={handleDelete}>
							Supprimer
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={!!pendingImport}
				onOpenChange={(open) => !open && setPendingImport(undefined)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remplacer tout le menu local ?</AlertDialogTitle>
						<AlertDialogDescription className='space-y-2'>
							<span className='block'>
								Fichier publié le{' '}
								{pendingImport &&
									new Date(pendingImport.publishedAt).toLocaleString('fr-FR')}
								. Il contient {pendingImport?.records.length ?? 0} entrée
								{(pendingImport?.records.length ?? 0) > 1 ? 's' : ''}.
							</span>
							<span className='block'>
								Les {list.length} entrée{list.length > 1 ? 's' : ''} locale
								{list.length > 1 ? 's' : ''} seront remplacées. Les entrées
								masquées disparaîtront aussi, car le fichier publié ne les
								contient pas.
							</span>
							<span className='block'>Cette action est définitive.</span>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={replaceMenu.isPending}>
							Annuler
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={replaceMenu.isPending}
							onClick={handleImport}
						>
							{replaceMenu.isPending && (
								<Loader2 className='mr-2 h-4 w-4 animate-spin' />
							)}
							Remplacer le menu
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}
