// frontend/modules/stock/components/DeleteProductDialog.tsx
//
// SUPPRIMER UN PRODUIT — la confirmation, et ce qu'elle annonce.
//
// La règle et sa justification sont dans `lib/queries/catalog-products.ts` :
// aucune collection ne pointe vers `products` par une relation, donc PocketBase
// n'oppose aucun refus et rien ne se met à jour en cascade. Cet écran ne fait
// que RENDRE VISIBLE ce que la couche décide :
//
//   • le nom du produit est écrit dans la boîte — supprimer la mauvaise fiche
//     depuis un menu de ligne est trop facile pour se contenter d'un « OK ? » ;
//   • les documents de vente qui le citent BLOQUENT le geste, et l'écran
//     propose alors le seul archivage que le schéma porte : passer en
//     brouillon (`status: 'draft'`) ;
//   • les entrées d'inventaire et le journal `product_events` ne bloquent pas,
//     mais leur nombre est annoncé : ce sont autant de lignes qui afficheront
//     « produit absent du catalogue », comme les 95 déjà mesurées
//     (docs/DECISIONS.md, 2026-08-19).

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
import { Button } from '@/components/ui/button'
import {
	type ProductReferences,
	useDeleteCatalogProduct,
	useProductReferences,
	useUpdateCatalogProduct,
} from '@/lib/queries/catalog-products'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useState } from 'react'

/** Le strict nécessaire pour confirmer : la couche relit le reste elle-même. */
export type ProduitASupprimer = {
	id: string
	name: string
	legacy_id?: string
	status?: 'draft' | 'published'
}

function pluriel(nombre: number, singulier: string, plurielMot?: string) {
	return `${nombre} ${nombre > 1 ? (plurielMot ?? `${singulier}s`) : singulier}`
}

/** Ce qui bloque, en toutes lettres. Vide quand rien ne bloque. */
function listerBloquantes(references: ProductReferences): string[] {
	const parts: string[] = []
	if (references.invoices > 0) {
		parts.push(pluriel(references.invoices, 'facture ou ticket de caisse'))
	}
	if (references.quotes > 0) parts.push(pluriel(references.quotes, 'devis'))
	if (references.orders > 0) parts.push(pluriel(references.orders, 'commande'))
	return parts
}

export function DeleteProductDialog({
	produit,
	onOpenChange,
}: {
	/** `null` ferme la boîte — et arrête le décompte, qui n'est pas mis en cache. */
	produit: ProduitASupprimer | null
	onOpenChange: (ouvert: boolean) => void
}) {
	const references = useProductReferences(produit ?? undefined)
	const suppression = useDeleteCatalogProduct()
	const miseAJour = useUpdateCatalogProduct()
	const [erreur, setErreur] = useState<string | null>(null)

	if (!produit) return null

	const refs = references.data
	const bloque = (refs?.bloquantes ?? 0) > 0
	const bloquantes = refs ? listerBloquantes(refs) : []
	const occupe =
		references.isLoading || suppression.isPending || miseAJour.isPending

	const fermer = () => {
		setErreur(null)
		onOpenChange(false)
	}

	const supprimer = async () => {
		setErreur(null)
		try {
			await suppression.mutateAsync({
				id: produit.id,
				legacy_id: produit.legacy_id,
			})
			fermer()
		} catch (e) {
			setErreur(e instanceof Error ? e.message : 'La suppression a échoué.')
		}
	}

	const passerEnBrouillon = async () => {
		setErreur(null)
		try {
			await miseAJour.mutateAsync({
				id: produit.id,
				// Rien d'autre que l'intention de publication : une mise à jour
				// partielle ne doit pas ré-écrire le nom ni la galerie.
				data: { status: 'draft' },
			})
			fermer()
		} catch (e) {
			setErreur(e instanceof Error ? e.message : 'La mise à jour a échoué.')
		}
	}

	return (
		<AlertDialog open onOpenChange={(ouvert) => !ouvert && fermer()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{bloque
							? `« ${produit.name} » ne peut pas être supprimé`
							: `Supprimer « ${produit.name} » ?`}
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className='space-y-3 text-sm'>
							{references.isLoading ? (
								<span className='flex items-center gap-2'>
									<Loader2 className='h-4 w-4 animate-spin' />
									Recherche des documents qui citent ce produit…
								</span>
							) : null}

							{refs && bloque ? (
								<>
									<span className='flex items-start gap-2 text-destructive'>
										<AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
										<span>
											Ce produit est cité par {bloquantes.join(', ')}. Ces
											documents sont scellés : leur retirer le produit qu'ils
											désignent ne se rattrape pas.
										</span>
									</span>
									<span className='block'>
										À la place, passez la fiche en <strong>brouillon</strong> :
										elle sort des grilles de vente et du site, ses documents
										restent lisibles.
									</span>
								</>
							) : null}

							{refs && !bloque ? (
								<>
									<span className='block'>
										La fiche et <strong>toutes ses images</strong> seront
										effacées définitivement. Cette action est irréversible.
									</span>
									{refs.orphelines > 0 ? (
										<span className='flex items-start gap-2'>
											<AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
											<span>
												{refs.inventoryEntries > 0
													? `${pluriel(refs.inventoryEntries, "entrée d'inventaire", "entrées d'inventaire")}`
													: null}
												{refs.inventoryEntries > 0 && refs.events > 0
													? ' et '
													: null}
												{refs.events > 0
													? `${pluriel(refs.events, 'ligne de journal produit', 'lignes de journal produit')}`
													: null}{' '}
												le désignent encore et afficheront « produit absent du
												catalogue ».
											</span>
										</span>
									) : null}
									<span className='block text-muted-foreground'>
										Le site n'est pas nettoyé par ce geste : si la fiche est
										publiée en ligne, passez-la d'abord en brouillon et
										ré-exportez-la.
									</span>
								</>
							) : null}

							{erreur ? (
								<span className='block text-destructive'>{erreur}</span>
							) : null}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={occupe}>Annuler</AlertDialogCancel>
					{bloque ? (
						produit.status === 'draft' ? null : (
							<Button
								variant='secondary'
								disabled={occupe}
								onClick={passerEnBrouillon}
							>
								{miseAJour.isPending ? (
									<Loader2 className='mr-2 h-4 w-4 animate-spin' />
								) : null}
								Passer en brouillon
							</Button>
						)
					) : (
						<AlertDialogAction
							disabled={occupe}
							className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
							onClick={(event) => {
								// Sans cela, Radix ferme la boîte au clic et l'erreur
								// éventuelle de la suppression ne serait jamais lue.
								event.preventDefault()
								void supprimer()
							}}
						>
							{suppression.isPending ? (
								<Loader2 className='mr-2 h-4 w-4 animate-spin' />
							) : null}
							Supprimer définitivement
						</AlertDialogAction>
					)}
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
