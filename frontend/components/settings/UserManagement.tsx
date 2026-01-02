// frontend/components/settings/UserManagement.tsx
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	type UserRole,
	useCreateUser,
	useDeleteUser,
	useUpdateUser,
	useUsers,
} from '@/lib/queries/users'
import { usePocketBase } from '@/lib/use-pocketbase'
import { Pencil, Plus, Trash2, User as UserIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface UserFormData {
	name: string
	email: string
	password: string
	role: UserRole
}

const roleLabels: Record<UserRole, string> = {
	admin: 'Administrateur',
	manager: 'Manager',
	caissier: 'Caissier',
	user: 'Utilisateur',
}

const roleColors: Record<UserRole, string> = {
	admin: 'bg-red-100 text-red-800 border-red-200',
	manager: 'bg-blue-100 text-blue-800 border-blue-200',
	caissier: 'bg-green-100 text-green-800 border-green-200',
	user: 'bg-gray-100 text-gray-800 border-gray-200',
}

export default function UserManagement() {
	const pb = usePocketBase()
	const [isDialogOpen, setIsDialogOpen] = useState(false)
	const [editingUserId, setEditingUserId] = useState<string | null>(null)
	const [formData, setFormData] = useState<UserFormData>({
		name: '',
		email: '',
		password: '',
		role: 'user',
	})

	// ✅ Utiliser les hooks React Query
	const { data: users = [], isLoading, error } = useUsers()
	const createUser = useCreateUser()
	const updateUser = useUpdateUser()
	const deleteUser = useDeleteUser()

	const currentUser = pb.authStore.model as any

	// Afficher les erreurs dans la console
	if (error) {
		console.error('Error loading users:', error)
	}

	// Ouvrir le dialog pour créer un utilisateur
	const handleCreate = () => {
		setEditingUserId(null)
		setFormData({
			name: '',
			email: '',
			password: '',
			role: 'user',
		})
		setIsDialogOpen(true)
	}

	// Ouvrir le dialog pour éditer un utilisateur
	const handleEdit = (user: any) => {
		setEditingUserId(user.id)
		setFormData({
			name: user.name,
			email: user.email,
			password: '', // Ne pas pré-remplir le mot de passe
			role: user.role,
		})
		setIsDialogOpen(true)
	}

	// Sauvegarder (créer ou modifier)
	const handleSave = async () => {
		try {
			// Validation
			if (!formData.name || !formData.email) {
				toast.error("Le nom et l'email sont obligatoires")
				return
			}

			if (!editingUserId && !formData.password) {
				toast.error(
					'Le mot de passe est obligatoire pour un nouvel utilisateur',
				)
				return
			}

			if (formData.password && formData.password.length < 8) {
				toast.error('Le mot de passe doit contenir au moins 8 caractères')
				return
			}

			if (editingUserId) {
				// Mise à jour
				const updateData: any = {
					name: formData.name,
					email: formData.email,
					role: formData.role,
				}

				// N'envoyer le mot de passe que s'il est fourni
				if (formData.password) {
					updateData.password = formData.password
				}

				await updateUser.mutateAsync({
					id: editingUserId,
					data: updateData,
				})

				toast.success('Utilisateur modifié avec succès')
			} else {
				// Création
				await createUser.mutateAsync(formData)
				toast.success('Utilisateur créé avec succès')
			}

			setIsDialogOpen(false)
		} catch (error: any) {
			console.error('Error saving user:', error)
			toast.error(error.message || 'Erreur lors de la sauvegarde')
		}
	}

	// Supprimer un utilisateur
	const handleDelete = async (user: any) => {
		if (
			!confirm(`Voulez-vous vraiment supprimer l'utilisateur "${user.name}" ?`)
		) {
			return
		}

		try {
			await deleteUser.mutateAsync(user.id)
			toast.success('Utilisateur supprimé')
		} catch (error: any) {
			console.error('Error deleting user:', error)
			toast.error(error.message || "Impossible de supprimer l'utilisateur")
		}
	}

	if (isLoading) {
		return (
			<div className='flex items-center justify-center p-8'>
				<p className='text-muted-foreground'>Chargement...</p>
			</div>
		)
	}

	if (error) {
		return (
			<div className='flex flex-col items-center justify-center p-8 gap-4'>
				<p className='text-red-600'>
					Erreur lors du chargement des utilisateurs
				</p>
				<p className='text-sm text-muted-foreground'>
					{error instanceof Error ? error.message : 'Erreur inconnue'}
				</p>
				<Button onClick={() => window.location.reload()}>
					Recharger la page
				</Button>
			</div>
		)
	}

	return (
		<div className='max-w-5xl'>
			<div className='bg-card rounded-lg border'>
				{/* Header */}
				<div className='p-6 border-b'>
					<div className='flex items-center justify-between'>
						<div>
							<h2 className='text-xl font-semibold'>
								Gestion des utilisateurs
							</h2>
							<p className='text-sm text-muted-foreground mt-1'>
								Créer et gérer les comptes utilisateurs de l'application
							</p>
						</div>
						<Button onClick={handleCreate} className='gap-2'>
							<Plus className='h-4 w-4' />
							Nouvel utilisateur
						</Button>
					</div>
				</div>

				{/* Table */}
				<div className='overflow-x-auto'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Utilisateur</TableHead>
								<TableHead>Email</TableHead>
								<TableHead>Rôle</TableHead>
								<TableHead>Créé le</TableHead>
								<TableHead className='text-right'>Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{users.map((user: any) => (
								<TableRow key={user.id}>
									<TableCell>
										<div className='flex items-center gap-3'>
											<div className='w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center'>
												<UserIcon className='h-4 w-4' />
											</div>
											<div>
												<div className='font-medium'>{user.name}</div>
												{user.id === currentUser?.id && (
													<span className='text-xs text-muted-foreground'>
														(vous)
													</span>
												)}
											</div>
										</div>
									</TableCell>
									<TableCell className='text-sm text-muted-foreground'>
										{user.email}
									</TableCell>
									<TableCell>
										<span
											className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
												roleColors[user.role as UserRole]
											}`}
										>
											{roleLabels[user.role as UserRole]}
										</span>
									</TableCell>
									<TableCell className='text-sm text-muted-foreground'>
										{new Date(user.created).toLocaleDateString('fr-FR')}
									</TableCell>
									<TableCell className='text-right'>
										<div className='flex items-center justify-end gap-2'>
											<Button
												variant='ghost'
												size='icon'
												className='h-8 w-8'
												onClick={() => handleEdit(user)}
											>
												<Pencil className='h-4 w-4' />
											</Button>
											<Button
												variant='ghost'
												size='icon'
												className='h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50'
												onClick={() => handleDelete(user)}
												disabled={user.id === currentUser?.id}
											>
												<Trash2 className='h-4 w-4' />
											</Button>
										</div>
									</TableCell>
								</TableRow>
							))}

							{users.length === 0 && (
								<TableRow>
									<TableCell colSpan={5} className='text-center py-8'>
										<p className='text-muted-foreground'>Aucun utilisateur</p>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			</div>

			{/* Dialog création/édition */}
			<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{editingUserId ? "Modifier l'utilisateur" : 'Nouvel utilisateur'}
						</DialogTitle>
						<DialogDescription>
							{editingUserId
								? "Modifier les informations de l'utilisateur"
								: 'Créer un nouveau compte utilisateur'}
						</DialogDescription>
					</DialogHeader>

					<div className='space-y-4 py-4'>
						<div className='space-y-2'>
							<Label htmlFor='name'>Nom</Label>
							<Input
								id='name'
								value={formData.name}
								onChange={(e) =>
									setFormData({ ...formData, name: e.target.value })
								}
								placeholder='Jean Dupont'
							/>
						</div>

						<div className='space-y-2'>
							<Label htmlFor='email'>Email</Label>
							<Input
								id='email'
								type='email'
								value={formData.email}
								onChange={(e) =>
									setFormData({ ...formData, email: e.target.value })
								}
								placeholder='jean@exemple.com'
							/>
						</div>

						<div className='space-y-2'>
							<Label htmlFor='password'>
								Mot de passe{' '}
								{editingUserId && '(laisser vide pour ne pas modifier)'}
							</Label>
							<Input
								id='password'
								type='password'
								value={formData.password}
								onChange={(e) =>
									setFormData({ ...formData, password: e.target.value })
								}
								placeholder='Minimum 8 caractères'
							/>
						</div>

						<div className='space-y-2'>
							<Label htmlFor='role'>Rôle</Label>
							<Select
								value={formData.role}
								onValueChange={(value: UserRole) =>
									setFormData({ ...formData, role: value })
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='admin'>Administrateur</SelectItem>
									<SelectItem value='manager'>Manager</SelectItem>
									<SelectItem value='caissier'>Caissier</SelectItem>
									<SelectItem value='user'>Utilisateur</SelectItem>
								</SelectContent>
							</Select>
							<p className='text-xs text-muted-foreground'>
								Les administrateurs ont accès à toutes les fonctionnalités
							</p>
						</div>
					</div>

					<DialogFooter>
						<Button variant='outline' onClick={() => setIsDialogOpen(false)}>
							Annuler
						</Button>
						<Button
							onClick={handleSave}
							disabled={createUser.isPending || updateUser.isPending}
						>
							{editingUserId ? 'Enregistrer' : 'Créer'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
