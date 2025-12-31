import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
// frontend/modules/cash/components/setup/NoRegisterState.tsx
import * as React from 'react'

interface NoRegisterStateProps {
	onCreateRegister: (name: string, code?: string) => Promise<any>
	isCreating?: boolean
}

/**
 * Composant affiché lorsqu'aucune caisse n'est configurée
 * Permet de créer la première caisse
 */
export function NoRegisterState({
	onCreateRegister,
	isCreating = false,
}: NoRegisterStateProps) {
	const [isDialogOpen, setIsDialogOpen] = React.useState(false)
	const [name, setName] = React.useState('')
	const [code, setCode] = React.useState('')

	const handleSubmit = async () => {
		try {
			await onCreateRegister(name, code)
			setIsDialogOpen(false)
			setName('')
			setCode('')
		} catch {
			// L'erreur est déjà gérée dans le hook
		}
	}

	return (
		<>
			<div className='container mx-auto px-6 py-8'>
				<Card>
					<CardHeader>
						<CardTitle>Aucune caisse configurée</CardTitle>
						<CardDescription>
							Aucune caisse n&apos;a encore été créée pour cette entreprise.
						</CardDescription>
					</CardHeader>
					<CardContent className='flex justify-end'>
						<Button onClick={() => setIsDialogOpen(true)}>
							Créer une caisse
						</Button>
					</CardContent>
				</Card>
			</div>

			<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Créer une caisse</DialogTitle>
					</DialogHeader>

					<div className='space-y-3'>
						<div>
							<label htmlFor='register-name' className='text-xs'>
								Nom
							</label>
							<Input
								id='register-name'
								placeholder='Caisse principale'
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>

						<div>
							<label htmlFor='register-code' className='text-xs'>
								Code (optionnel)
							</label>
							<Input
								id='register-code'
								placeholder='POS-001'
								value={code}
								onChange={(e) => setCode(e.target.value)}
							/>
						</div>
					</div>

					<div className='flex justify-end gap-2 pt-4'>
						<Button
							variant='outline'
							onClick={() => setIsDialogOpen(false)}
							disabled={isCreating}
						>
							Annuler
						</Button>
						<Button onClick={handleSubmit} disabled={isCreating}>
							{isCreating ? 'Création...' : 'Enregistrer'}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	)
}
