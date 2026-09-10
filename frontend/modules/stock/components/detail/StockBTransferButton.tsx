import { useQueryClient } from '@tanstack/react-query'
import { Archive, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { invalidateCatalog } from '@/lib/queries/catalog-products'
import { transferToStockB } from '@/lib/queries/stock-adjust'
import { usePocketBase } from '@/lib/use-pocketbase'

import type { ProductDetailValues } from './product-detail-form'

// LE PASSAGE NEUF → STOCK B, UN SEUL GESTE.
//
// Il part TOUT DE SUITE, hors du bouton « Enregistrer » : c'est un mouvement
// de stock, pas une modification de fiche, et le serveur le fait tenir dans
// une seule transaction (−N neuf, +N B, un événement). Retirer à la main 1 au
// neuf puis ajouter 1 au B ferait deux mouvements, deux motifs, et un
// historique qui raconte une perte suivie d'un réassort.
//
// ⚠️ Désactivé tant que le stock est modifié dans le formulaire : transférer
// sur une valeur que l'écran montre mais que la base n'a pas encore serait
// transférer depuis un chiffre faux.
export function StockBTransferButton({
	productId,
	form,
}: {
	productId: string
	form: UseFormReturn<ProductDetailValues>
}) {
	const pb = usePocketBase()
	const queryClient = useQueryClient()
	const [open, setOpen] = useState(false)
	const [quantite, setQuantite] = useState('1')
	const [commentaire, setCommentaire] = useState('')
	const [enCours, setEnCours] = useState(false)

	const dirty = form.formState.dirtyFields
	const stockModifie = Boolean(dirty.stock || dirty.stock_b)
	const neuf = Number(form.formState.defaultValues?.stock ?? 0)
	const q = Number(quantite)
	const valide = Number.isInteger(q) && q >= 1 && q <= neuf

	const fermer = () => {
		setOpen(false)
		setQuantite('1')
		setCommentaire('')
	}

	const transferer = async () => {
		if (!valide) return
		setEnCours(true)
		const resultat = await transferToStockB(pb, productId, q, {
			comment: commentaire,
			metadata: { origin: 'product_detail' },
		})
		setEnCours(false)
		if (!resultat.applied) {
			toast.error(
				`Transfert refusé : ${resultat.error ?? 'le serveur n’a rien appliqué'}`,
			)
			return
		}
		// La base a bougé : les nouvelles valeurs deviennent les valeurs
		// d'ORIGINE du formulaire, sans marquer la fiche « modifiée ».
		form.resetField('stock', { defaultValue: resultat.stockAfter ?? neuf - q })
		form.resetField('stock_b', { defaultValue: resultat.stockBAfter ?? 0 })
		invalidateCatalog(queryClient)
		toast.success(`${q} unité(s) passée(s) en Stock B`)
		fermer()
	}

	return (
		<>
			<Button
				type='button'
				variant='outline'
				size='sm'
				disabled={stockModifie || neuf < 1}
				title={
					stockModifie
						? 'Enregistrez d’abord la modification du stock'
						: neuf < 1
							? 'Aucune unité neuve à transférer'
							: undefined
				}
				onClick={() => setOpen(true)}
			>
				<Archive className='mr-2 h-4 w-4' />
				Passer en Stock B
			</Button>
			<Dialog
				open={open}
				onOpenChange={(ouvert) => {
					if (enCours) return
					if (ouvert) setOpen(true)
					else fermer()
				}}
			>
				<DialogContent className='sm:max-w-[440px]'>
					<DialogHeader>
						<DialogTitle>Passer en Stock B</DialogTitle>
						<DialogDescription>
							Retire du stock neuf et ajoute au Stock B, en un seul mouvement.{' '}
							{neuf} unité(s) neuve(s) disponible(s).
						</DialogDescription>
					</DialogHeader>
					<div className='grid gap-4'>
						<div className='grid gap-2'>
							<label htmlFor='stock-b-quantite' className='font-medium text-sm'>
								Quantité
							</label>
							<Input
								id='stock-b-quantite'
								type='number'
								min={1}
								max={neuf}
								step={1}
								value={quantite}
								onChange={(event) => setQuantite(event.target.value)}
							/>
							{!valide && quantite !== '' && (
								<p className='text-destructive text-xs'>
									Entre 1 et {neuf}, en unités entières.
								</p>
							)}
						</div>
						<div className='grid gap-2'>
							<label
								htmlFor='stock-b-commentaire'
								className='font-medium text-sm'
							>
								Commentaire
							</label>
							<Input
								id='stock-b-commentaire'
								placeholder='Facultatif : carton ouvert, rayure…'
								maxLength={500}
								value={commentaire}
								onChange={(event) => setCommentaire(event.target.value)}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							type='button'
							variant='outline'
							onClick={fermer}
							disabled={enCours}
						>
							Annuler
						</Button>
						<Button
							type='button'
							onClick={() => void transferer()}
							disabled={!valide || enCours}
						>
							{enCours && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
							Transférer
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}
