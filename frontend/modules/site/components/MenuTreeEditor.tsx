// frontend/modules/site/components/MenuTreeEditor.tsx
// ═══════════════════════════════════════════════════════════════════════════
// ÉDITEUR D'ARBRE DU MENU  (ticket 4)
// ═══════════════════════════════════════════════════════════════════════════
// Créer, renommer, ordonner, imbriquer, masquer, supprimer les entrées du
// menu. Écrit dans `site_menu` et nulle part ailleurs.
//
// **Ce composant ne publie rien.** La publication est le ticket 6, et
// l'endpoint qui la reçoit n'existe pas encore. Aucun bouton d'ici ne sort du
// poste.
//
// L'ordre se change par boutons — monter, descendre, indenter, désindenter.
// Pas de glisser-déposer : aucune bibliothèque de ce genre n'existe dans le
// dépôt, et on n'en ajoute pas une sur une hypothèse d'ergonomie.
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
import {
	type SiteMenuRecord,
	type SiteMenuRefType,
	type SiteMenuResponse,
	useCreateSiteMenuEntry,
	useDeleteSiteMenuEntry,
	useReorderSiteMenu,
	useSiteMenuEntries,
	useUpdateSiteMenuEntry,
} from '@/lib/queries/site-menu'
import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	Eye,
	EyeOff,
	Loader2,
	Pencil,
	Plus,
	Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { useDestinationIndex } from '../hooks/use-menu-destinations'
import {
	ROOT,
	buildMenuTree,
	flattenMenuTree,
	hiddenByAncestor,
	indent,
	moveDown,
	moveUp,
	nextPosition,
	outdent,
} from '../lib/menu-tree'
import { MenuEntryDialog } from './MenuEntryDialog'

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
 * catalogue encore en cours de lecture, AppPos injoignable, ou cible
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

export function MenuTreeEditor() {
	const { data: entries, isLoading, isError } = useSiteMenuEntries()

	const createEntry = useCreateSiteMenuEntry()
	const updateEntry = useUpdateSiteMenuEntry()
	const deleteEntry = useDeleteSiteMenuEntry()
	const reorder = useReorderSiteMenu()

	const [dialogOpen, setDialogOpen] = useState(false)
	const [editing, setEditing] = useState<SiteMenuResponse | undefined>()
	const [creatingUnder, setCreatingUnder] = useState<string>(ROOT)
	const [pendingDelete, setPendingDelete] = useState<
		SiteMenuResponse | undefined
	>()

	const list = useMemo(() => entries ?? [], [entries])
	const tree = useMemo(() => buildMenuTree(list), [list])
	const rows = useMemo(() => flattenMenuTree(tree), [tree])
	const inheritedHidden = useMemo(() => hiddenByAncestor(tree), [tree])

	// Ne lire chez AppPos que les types de destination réellement employés.
	const usedTypes = useMemo(() => {
		const types = new Set<SiteMenuRefType>()
		for (const entry of list) {
			if (isRefType(entry.link_type)) types.add(entry.link_type)
		}
		return types
	}, [list])
	const { labelFor } = useDestinationIndex(usedTypes)

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
		<div className='space-y-4'>
			<div className='flex items-center justify-between'>
				<p className='text-muted-foreground text-sm'>
					{rows.length === 0
						? 'Aucune entrée.'
						: `${rows.length} entrée${rows.length > 1 ? 's' : ''}.`}{' '}
					Les modifications sont enregistrées localement ; rien n'est envoyé au
					site.
				</p>
				<Button size='sm' onClick={() => openCreate(ROOT)}>
					<Plus className='mr-2 h-4 w-4' />
					Entrée racine
				</Button>
			</div>

			{rows.length > 0 && (
				<div className='divide-y rounded-md border'>
					{rows.map((node) => {
						const { entry, depth } = node
						const selfHidden = entry.visible === false
						const parentHidden = inheritedHidden.has(entry.id)
						const dimmed = selfHidden || parentHidden

						const canUp = moveUp(list, entry.id).length > 0
						const canDown = moveDown(list, entry.id).length > 0
						const canIndent = indent(list, entry.id).length > 0
						const canOutdent = outdent(list, entry.id).length > 0

						return (
							<div
								key={entry.id}
								className='flex items-center gap-2 px-3 py-2'
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
										onClick={() => applyMoves(moveUp(list, entry.id), 'monter')}
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

			<MenuEntryDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				entry={editing}
				parentLabel={editing ? undefined : parentLabel}
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
		</div>
	)
}
