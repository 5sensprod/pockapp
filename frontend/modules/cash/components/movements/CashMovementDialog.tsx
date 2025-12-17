'use client'

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
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useCreateCashMovement } from '@/lib/queries/cash'
import type { CashMovementType } from '@/lib/types/cash.types'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

const movementSchema = z.object({
	movementType: z.enum(['cash_in', 'cash_out', 'safe_drop', 'adjustment']),
	amount: z.number().positive('Le montant doit être positif'),
	reason: z.string().min(3, 'Motif obligatoire (min 3 caractères)'),
})

type MovementForm = z.infer<typeof movementSchema>

interface CashMovementDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	sessionId: string
	cashRegisterId: string
}

const MOVEMENT_TYPES: Array<{
	value: CashMovementType
	label: string
	description: string
}> = [
	{
		value: 'cash_in',
		label: 'Entrée espèces',
		description: "Ajout d'espèces (appoint, remise de fond)",
	},
	{
		value: 'cash_out',
		label: 'Sortie espèces',
		description: "Retrait d'espèces (dépenses, change)",
	},
	{
		value: 'safe_drop',
		label: 'Dépôt coffre',
		description: 'Mise en sécurité au coffre',
	},
	{
		value: 'adjustment',
		label: 'Ajustement',
		description: "Correction d'écart ou erreur",
	},
]

export function CashMovementDialog({
	open,
	onOpenChange,
	sessionId,
	cashRegisterId,
}: CashMovementDialogProps) {
	const { mutate: createMovement, isPending } = useCreateCashMovement()

	const form = useForm<MovementForm>({
		resolver: zodResolver(movementSchema),
		defaultValues: {
			reason: '',
		},
	})

	const onSubmit = (data: MovementForm) => {
		createMovement(
			{
				sessionId,
				cashRegisterId,
				movementType: data.movementType,
				amount: data.amount,
				reason: data.reason,
			},
			{
				onSuccess: () => {
					toast.success('Mouvement de caisse enregistré')
					onOpenChange(false)
					form.reset()
				},
				onError: (error) => {
					toast.error(`Erreur: ${error.message}`)
				},
			},
		)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Enregistrer un mouvement de caisse</DialogTitle>
					<DialogDescription>
						Saisissez les détails du mouvement d'espèces
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
						{/* Type de mouvement */}
						<FormField
							control={form.control}
							name='movementType'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Type de mouvement</FormLabel>
									<Select
										onValueChange={field.onChange}
										defaultValue={field.value}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder='Sélectionnez un type' />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{MOVEMENT_TYPES.map((type) => (
												<SelectItem key={type.value} value={type.value}>
													<div>
														<div className='font-medium'>{type.label}</div>
														<div className='text-xs text-muted-foreground'>
															{type.description}
														</div>
													</div>
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Montant */}
						<FormField
							control={form.control}
							name='amount'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Montant (€)</FormLabel>
									<FormControl>
										<Input
											type='number'
											step='0.01'
											min='0'
											placeholder='0.00'
											{...field}
											onChange={(e) =>
												field.onChange(Number.parseFloat(e.target.value))
											}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Motif */}
						<FormField
							control={form.control}
							name='reason'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Motif</FormLabel>
									<FormControl>
										<Textarea
											placeholder='Ex: Appoint début de journée, remboursement client, etc.'
											{...field}
											rows={3}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter>
							<Button
								type='button'
								variant='outline'
								onClick={() => onOpenChange(false)}
								disabled={isPending}
							>
								Annuler
							</Button>
							<Button type='submit' disabled={isPending}>
								{isPending ? (
									<>
										<Loader2 className='mr-2 h-4 w-4 animate-spin' />
										Enregistrement...
									</>
								) : (
									'Enregistrer'
								)}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
