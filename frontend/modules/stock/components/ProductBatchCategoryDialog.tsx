import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import {
	type CatalogCategoryBatchMode,
	useUpdateCatalogProductCategoriesBatch,
} from '@/lib/queries/catalog-products'
import type { StockProductRow } from '@/lib/queries/catalog-rows'
import { pocketbaseErrorMessage } from '@/lib/queries/pb-error'
import { FolderPlus, Loader2, Replace } from 'lucide-react'
import { toast } from 'sonner'

interface ProductBatchCategoryDialogProps {
	target: { id: string; name: string } | null
	products: StockProductRow[]
	onCancel: () => void
	onComplete: () => void
}

export function ProductBatchCategoryDialog({
	target,
	products,
	onCancel,
	onComplete,
}: ProductBatchCategoryDialogProps) {
	const update = useUpdateCatalogProductCategoriesBatch()
	const count = products.length

	const apply = async (mode: CatalogCategoryBatchMode) => {
		if (!target || count === 0) return
		try {
			const result = await update.mutateAsync({
				products: products.map((product) => ({
					id: product.id,
					categories: product.categoryIds,
				})),
				destinationId: target.id,
				mode,
			})
			if (result.updated === 0) {
				toast.info('Les produits portent déjà cette catégorie')
			} else {
				toast.success(
					mode === 'add'
						? `Catégorie ajoutée à ${result.updated} produit${result.updated > 1 ? 's' : ''}`
						: `Catégories remplacées sur ${result.updated} produit${result.updated > 1 ? 's' : ''}`,
				)
			}
			onComplete()
		} catch (error) {
			toast.error(
				`Modification du lot refusée : ${pocketbaseErrorMessage(error)}`,
			)
		}
	}

	return (
		<Dialog
			open={target !== null}
			onOpenChange={(open) => {
				if (!open && !update.isPending) onCancel()
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						Classer {count} produit{count > 1 ? 's' : ''}
					</DialogTitle>
					<DialogDescription>
						Destination :{' '}
						<strong className='text-foreground'>{target?.name}</strong>.
						Choisissez comment modifier les catégories du lot.
					</DialogDescription>
				</DialogHeader>

				<div className='grid gap-3 sm:grid-cols-2'>
					<button
						type='button'
						disabled={update.isPending}
						onClick={() => void apply('add')}
						className='rounded-lg border bg-violet-50/70 p-4 text-left transition-colors hover:border-primary/40 hover:bg-violet-100 disabled:pointer-events-none disabled:opacity-50 dark:bg-violet-950/30 dark:hover:bg-violet-900/40'
					>
						<FolderPlus className='h-5 w-5 text-primary' />
						<span className='mt-3 block font-semibold'>Ajouter</span>
						<span className='mt-1 block text-muted-foreground text-xs leading-relaxed'>
							Conserve les catégories actuelles et ajoute « {target?.name} ».
						</span>
					</button>

					<button
						type='button'
						disabled={update.isPending}
						onClick={() => void apply('replace')}
						className='rounded-lg border p-4 text-left transition-colors hover:border-amber-500/50 hover:bg-amber-50 disabled:pointer-events-none disabled:opacity-50 dark:hover:bg-amber-950/30'
					>
						<Replace className='h-5 w-5 text-amber-600' />
						<span className='mt-3 block font-semibold'>Remplacer</span>
						<span className='mt-1 block text-muted-foreground text-xs leading-relaxed'>
							Retire toutes les catégories actuelles et garde uniquement «{' '}
							{target?.name} ».
						</span>
					</button>
				</div>

				<DialogFooter>
					<Button
						variant='ghost'
						disabled={update.isPending}
						onClick={onCancel}
					>
						Annuler
					</Button>
					{update.isPending && (
						<span className='inline-flex items-center gap-2 px-3 text-muted-foreground text-sm'>
							<Loader2 className='h-4 w-4 animate-spin' />
							Modification du lot…
						</span>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
