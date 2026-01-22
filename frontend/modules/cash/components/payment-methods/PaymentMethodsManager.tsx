import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { usePaymentMethods } from '@/lib/queries/payment-methods'
import { AlertCircle, Check, Plus, Settings, X } from 'lucide-react'
// frontend/modules/cash/components/payment-methods/PaymentMethodsManager.tsx
import * as React from 'react'

interface PaymentMethod {
	id: string
	company: string
	code: string
	name: string
	description: string
	type: 'default' | 'custom'
	accounting_category: 'cash' | 'card' | 'check' | 'transfer' | 'other'
	enabled: boolean
	requires_session: boolean
	icon: string
	color: string
	text_color: string
	display_order: number
}

interface PaymentMethodsManagerProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function PaymentMethodsManager({
	open,
	onOpenChange,
}: PaymentMethodsManagerProps) {
	const { activeCompanyId } = useActiveCompany()
	const {
		paymentMethods,
		isLoading,
		createMethod,
		updateMethod,
		deleteMethod,
		toggleMethod,
	} = usePaymentMethods(activeCompanyId)

	const [editingId, setEditingId] = React.useState<string | null>(null)
	const [showAddForm, setShowAddForm] = React.useState(false)

	// État du formulaire
	const [formData, setFormData] = React.useState<{
		code: string
		name: string
		description: string
		accounting_category: 'cash' | 'card' | 'check' | 'transfer' | 'other'
		enabled: boolean
		requires_session: boolean
		icon: string
		color: string
		text_color: string
		display_order: number
	}>({
		code: '',
		name: '',
		description: '',
		accounting_category: 'other',
		enabled: true,
		requires_session: false,
		icon: 'Receipt',
		color: '#f8fafc',
		text_color: '#475569',
		display_order: 5,
	})

	const resetForm = () => {
		setFormData({
			code: '',
			name: '',
			description: '',
			accounting_category: 'other',
			enabled: true,
			requires_session: false,
			icon: 'Receipt',
			color: '#f8fafc',
			text_color: '#475569',
			display_order: 5,
		})
		setEditingId(null)
		setShowAddForm(false)
	}

	const handleEdit = (method: PaymentMethod) => {
		setFormData({
			code: method.code,
			name: method.name,
			description: method.description || '',
			accounting_category: method.accounting_category,
			enabled: method.enabled,
			requires_session: method.requires_session,
			icon: method.icon || 'Receipt',
			color: method.color || '#f8fafc',
			text_color: method.text_color || '#475569',
			display_order: method.display_order || 5,
		})
		setEditingId(method.id)
		setShowAddForm(true)
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()

		if (editingId) {
			await updateMethod.mutateAsync({ id: editingId, data: formData })
		} else {
			await createMethod.mutateAsync(formData)
		}

		resetForm()
	}

	const handleDelete = async (id: string) => {
		if (confirm('Supprimer ce moyen de paiement ?')) {
			await deleteMethod.mutateAsync(id)
		}
	}

	const handleToggle = async (id: string) => {
		await toggleMethod.mutateAsync(id)
	}

	if (isLoading) {
		return (
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className='max-w-3xl'>
					<div className='flex items-center justify-center py-8'>
						<div className='text-sm text-muted-foreground'>Chargement...</div>
					</div>
				</DialogContent>
			</Dialog>
		)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-3xl max-h-[90vh] overflow-y-auto'>
				<DialogHeader>
					<DialogTitle className='flex items-center gap-2'>
						<Settings className='h-5 w-5' />
						Gestion des moyens de paiement
					</DialogTitle>
					<DialogDescription>
						Configurez les moyens de paiement disponibles en caisse. Les moyens
						par défaut ne peuvent pas être supprimés.
					</DialogDescription>
				</DialogHeader>

				<div className='space-y-4'>
					{/* Liste des moyens existants */}
					<div className='space-y-2'>
						{paymentMethods?.map((method) => (
							<div
								key={method.id}
								className={`flex items-center justify-between rounded-md border p-3 ${
									method.enabled ? 'bg-slate-50' : 'bg-slate-50/50 opacity-60'
								}`}
							>
								<div className='flex items-center gap-3'>
									<div
										className={`flex h-10 w-10 items-center justify-center rounded-md`}
										style={{
											backgroundColor: method.color,
											color: method.text_color,
										}}
									>
										{method.icon === 'CreditCard' && '💳'}
										{method.icon === 'Banknote' && '💵'}
										{method.icon === 'Receipt' && '🧾'}
										{method.icon === 'ArrowRightLeft' && '↔️'}
									</div>
									<div>
										<div className='flex items-center gap-2'>
											<span className='font-medium'>{method.name}</span>
											{method.type === 'default' && (
												<Badge variant='outline' className='text-xs'>
													Défaut
												</Badge>
											)}
											{method.type === 'custom' && (
												<Badge
													variant='outline'
													className='bg-blue-50 text-blue-700 text-xs'
												>
													Custom
												</Badge>
											)}
										</div>
										{method.description && (
											<p className='text-xs text-muted-foreground'>
												{method.description}
											</p>
										)}
										<p className='text-xs text-muted-foreground'>
											Catégorie comptable: {method.accounting_category}
										</p>
									</div>
								</div>

								<div className='flex items-center gap-2'>
									<Switch
										checked={method.enabled}
										onCheckedChange={() => handleToggle(method.id)}
									/>

									{method.type === 'custom' && (
										<>
											<Button
												variant='ghost'
												size='sm'
												onClick={() => handleEdit(method)}
											>
												Modifier
											</Button>
											<Button
												variant='ghost'
												size='sm'
												onClick={() => handleDelete(method.id)}
												className='text-red-600 hover:text-red-700'
											>
												<X className='h-4 w-4' />
											</Button>
										</>
									)}

									{method.type === 'default' && (
										<Button
											variant='ghost'
											size='sm'
											onClick={() => handleEdit(method)}
										>
											<Settings className='h-4 w-4' />
										</Button>
									)}
								</div>
							</div>
						))}
					</div>

					{/* Bouton d'ajout */}
					{!showAddForm && (
						<Button
							variant='outline'
							className='w-full'
							onClick={() => setShowAddForm(true)}
						>
							<Plus className='mr-2 h-4 w-4' />
							Ajouter un moyen custom
						</Button>
					)}

					{/* Formulaire d'ajout/édition */}
					{showAddForm && (
						<form
							onSubmit={handleSubmit}
							className='space-y-4 rounded-lg border p-4 bg-slate-50'
						>
							<div className='flex items-center justify-between'>
								<h3 className='font-medium'>
									{editingId ? 'Modifier le moyen' : 'Nouveau moyen custom'}
								</h3>
								<Button
									type='button'
									variant='ghost'
									size='sm'
									onClick={resetForm}
								>
									<X className='h-4 w-4' />
								</Button>
							</div>

							<div className='grid gap-4 sm:grid-cols-2'>
								<div className='space-y-2'>
									<Label htmlFor='code'>
										Code <span className='text-red-500'>*</span>
									</Label>
									<Input
										id='code'
										value={formData.code}
										onChange={(e) =>
											setFormData({ ...formData, code: e.target.value })
										}
										placeholder='pass_culture'
										required
										disabled={!!editingId}
									/>
									<p className='text-xs text-muted-foreground'>
										Identifiant unique (lowercase, underscore)
									</p>
								</div>

								<div className='space-y-2'>
									<Label htmlFor='name'>
										Nom <span className='text-red-500'>*</span>
									</Label>
									<Input
										id='name'
										value={formData.name}
										onChange={(e) =>
											setFormData({ ...formData, name: e.target.value })
										}
										placeholder='Pass Culture'
										required
									/>
								</div>

								<div className='space-y-2 sm:col-span-2'>
									<Label htmlFor='description'>Description / Note</Label>
									<Textarea
										id='description'
										value={formData.description}
										onChange={(e) =>
											setFormData({ ...formData, description: e.target.value })
										}
										placeholder='Ex: Encaissement via Pass Culture pour les jeunes de 18 ans'
										rows={2}
									/>
								</div>

								<div className='space-y-2'>
									<Label htmlFor='accounting_category'>
										Catégorie comptable
									</Label>
									<Select
										value={formData.accounting_category}
										onValueChange={(value) =>
											setFormData({
												...formData,
												accounting_category: value as
													| 'cash'
													| 'card'
													| 'check'
													| 'transfer'
													| 'other',
											})
										}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='cash'>Espèces</SelectItem>
											<SelectItem value='card'>Carte</SelectItem>
											<SelectItem value='check'>Chèque</SelectItem>
											<SelectItem value='transfer'>Virement</SelectItem>
											<SelectItem value='other'>Autre</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className='space-y-2'>
									<Label htmlFor='icon'>Icône</Label>
									<Input
										id='icon'
										value={formData.icon}
										onChange={(e) =>
											setFormData({ ...formData, icon: e.target.value })
										}
										placeholder='Receipt'
									/>
								</div>

								<div className='flex items-center justify-between'>
									<Label htmlFor='enabled'>Activé</Label>
									<Switch
										id='enabled'
										checked={formData.enabled}
										onCheckedChange={(checked) =>
											setFormData({ ...formData, enabled: checked })
										}
									/>
								</div>

								<div className='flex items-center justify-between'>
									<Label htmlFor='requires_session'>
										Nécessite session ouverte
									</Label>
									<Switch
										id='requires_session'
										checked={formData.requires_session}
										onCheckedChange={(checked) =>
											setFormData({ ...formData, requires_session: checked })
										}
									/>
								</div>
							</div>

							<div className='flex gap-2'>
								<Button type='submit' className='flex-1'>
									<Check className='mr-2 h-4 w-4' />
									{editingId ? 'Mettre à jour' : 'Créer'}
								</Button>
								<Button type='button' variant='outline' onClick={resetForm}>
									Annuler
								</Button>
							</div>
						</form>
					)}

					{/* Info box */}
					<div className='rounded-md border border-blue-200 bg-blue-50 p-3'>
						<div className='flex gap-2'>
							<AlertCircle className='h-4 w-4 text-blue-600 mt-0.5' />
							<div className='text-xs text-blue-900'>
								<p className='font-medium'>Exemples de moyens customs :</p>
								<ul className='mt-1 list-disc list-inside space-y-0.5'>
									<li>Carte cadeau / Avoir magasin</li>
									<li>Pass Culture (jeunes 18 ans)</li>
									<li>Chorus (administration publique)</li>
									<li>Titre restaurant</li>
								</ul>
							</div>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
