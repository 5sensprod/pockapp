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
import { Label } from '@/components/ui/label'
import { useEffect, useState } from 'react'

/** Première étape locale : aucune écriture avant l'enregistrement de la fiche. */
export function CatalogProductDialog({
	open,
	onOpenChange,
	onContinue,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onContinue: (designation: string) => void
}) {
	const [designation, setDesignation] = useState('')
	useEffect(() => {
		if (open) setDesignation('')
	}, [open])
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>Nouveau produit</DialogTitle>
					<DialogDescription>
						Indiquez la désignation, puis complétez la fiche. Un prix de vente
						sera requis pour enregistrer le produit.
					</DialogDescription>
				</DialogHeader>
				<form
					onSubmit={(event) => {
						event.preventDefault()
						if (!designation.trim()) return
						onOpenChange(false)
						onContinue(designation.trim())
					}}
					className='space-y-5'
				>
					<div className='space-y-2'>
						<Label htmlFor='new-product-designation'>Désignation</Label>
						<Input
							id='new-product-designation'
							autoFocus
							required
							maxLength={255}
							value={designation}
							onChange={(event) => setDesignation(event.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button
							type='button'
							variant='outline'
							onClick={() => onOpenChange(false)}
						>
							Annuler
						</Button>
						<Button type='submit' disabled={!designation.trim()}>
							Compléter la fiche
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
