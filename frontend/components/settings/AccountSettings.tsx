// frontend/components/settings/AccountSettings.tsx
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
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
	getAvatarUrl,
	useChangePassword,
	useProfile,
	useUpdateProfile,
} from '@/lib/queries/profile'
import { usePocketBase } from '@/lib/use-pocketbase'
// import { useAuth } from '@/modules/auth/AuthProvider'
import { Camera, Key, Loader2, Save, Trash2, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

export default function AccountSettings() {
	const pb = usePocketBase()
	// const { user } = useAuth()
	const fileInputRef = useRef<HTMLInputElement>(null)

	// Queries
	const { data: profile, isLoading } = useProfile()
	const updateProfile = useUpdateProfile()
	const changePassword = useChangePassword()

	// État du formulaire profil
	const [formData, setFormData] = useState({
		name: '',
		username: '',
		email: '',
	})

	// État pour l'avatar
	const [avatarFile, setAvatarFile] = useState<File | null>(null)
	const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
	const [removeAvatar, setRemoveAvatar] = useState(false)

	// État pour le dialog de mot de passe
	const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false)
	const [passwordForm, setPasswordForm] = useState({
		oldPassword: '',
		password: '',
		passwordConfirm: '',
	})

	// Charger les données du profil
	useEffect(() => {
		if (profile) {
			setFormData({
				name: profile.name || '',
				username: profile.username || '',
				email: profile.email || '',
			})
			// Réinitialiser l'avatar preview
			setAvatarFile(null)
			setAvatarPreview(null)
			setRemoveAvatar(false)
		}
	}, [profile])

	// Gérer le changement d'avatar
	const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return

		// Validation du type
		if (
			!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(
				file.type,
			)
		) {
			toast.error('Format non supporté. Utilisez JPG, PNG, WebP ou GIF.')
			return
		}

		// Validation de la taille (5MB max)
		if (file.size > 5 * 1024 * 1024) {
			toast.error('Image trop volumineuse (max 5MB)')
			return
		}

		setAvatarFile(file)
		setRemoveAvatar(false)

		// Créer une preview
		const reader = new FileReader()
		reader.onloadend = () => {
			setAvatarPreview(reader.result as string)
		}
		reader.readAsDataURL(file)
	}

	// Supprimer l'avatar
	const handleRemoveAvatar = () => {
		setAvatarFile(null)
		setAvatarPreview(null)
		setRemoveAvatar(true)
		if (fileInputRef.current) {
			fileInputRef.current.value = ''
		}
	}

	// Obtenir l'URL de l'avatar à afficher
	const getDisplayAvatarUrl = (): string | null => {
		if (removeAvatar) return null
		if (avatarPreview) return avatarPreview
		if (profile) return getAvatarUrl(pb, profile)
		return null
	}

	// Sauvegarder le profil
	const handleSaveProfile = async () => {
		try {
			// Validation
			if (!formData.username.trim()) {
				toast.error("Le nom d'utilisateur est obligatoire")
				return
			}

			if (formData.username.length < 3) {
				toast.error("Le nom d'utilisateur doit contenir au moins 3 caractères")
				return
			}

			// Vérifier que le username ne contient que des caractères valides
			if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
				toast.error(
					"Le nom d'utilisateur ne peut contenir que des lettres, chiffres et underscores",
				)
				return
			}

			await updateProfile.mutateAsync({
				name: formData.name,
				username: formData.username,
				email: formData.email,
				avatar: avatarFile,
				removeAvatar,
			})

			toast.success('Profil mis à jour avec succès')

			// Réinitialiser les états d'avatar après succès
			setAvatarFile(null)
			setAvatarPreview(null)
			setRemoveAvatar(false)
		} catch (error: any) {
			console.error('Error updating profile:', error)

			// Messages d'erreur spécifiques
			if (error.message?.includes('username')) {
				toast.error("Ce nom d'utilisateur est déjà pris")
			} else if (error.message?.includes('email')) {
				toast.error('Cet email est déjà utilisé')
			} else {
				toast.error(error.message || 'Erreur lors de la mise à jour du profil')
			}
		}
	}

	// Changer le mot de passe
	const handleChangePassword = async () => {
		try {
			// Validation
			if (!passwordForm.oldPassword) {
				toast.error('Veuillez entrer votre mot de passe actuel')
				return
			}

			if (!passwordForm.password) {
				toast.error('Veuillez entrer un nouveau mot de passe')
				return
			}

			if (passwordForm.password.length < 8) {
				toast.error(
					'Le nouveau mot de passe doit contenir au moins 8 caractères',
				)
				return
			}

			if (passwordForm.password !== passwordForm.passwordConfirm) {
				toast.error('Les mots de passe ne correspondent pas')
				return
			}

			await changePassword.mutateAsync(passwordForm)

			toast.success('Mot de passe modifié avec succès')
			setIsPasswordDialogOpen(false)
			setPasswordForm({
				oldPassword: '',
				password: '',
				passwordConfirm: '',
			})
		} catch (error: any) {
			console.error('Error changing password:', error)

			if (error.message?.includes('oldPassword')) {
				toast.error('Mot de passe actuel incorrect')
			} else {
				toast.error(
					error.message || 'Erreur lors du changement de mot de passe',
				)
			}
		}
	}

	if (isLoading) {
		return (
			<div className='flex items-center justify-center p-8'>
				<Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
			</div>
		)
	}

	const displayAvatarUrl = getDisplayAvatarUrl()
	const userRole = (profile as any)?.role || 'user'

	return (
		<div className='max-w-2xl space-y-6'>
			{/* Carte Profil */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<User className='h-5 w-5' />
						Mon profil
					</CardTitle>
					<CardDescription>
						Gérez vos informations personnelles et votre photo de profil
					</CardDescription>
				</CardHeader>
				<CardContent className='space-y-6'>
					{/* Section Avatar */}
					<div className='flex items-center gap-6'>
						<div className='relative'>
							{displayAvatarUrl ? (
								<img
									src={displayAvatarUrl}
									alt='Avatar'
									className='h-24 w-24 rounded-full object-cover border-2 border-muted'
								/>
							) : (
								<div className='h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center border-2 border-muted'>
									<User className='h-10 w-10 text-primary/60' />
								</div>
							)}

							{/* Bouton upload overlay */}
							<button
								type='button'
								onClick={() => fileInputRef.current?.click()}
								className='absolute bottom-0 right-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors'
							>
								<Camera className='h-4 w-4' />
							</button>
						</div>

						<div className='flex-1 space-y-2'>
							<div className='flex items-center gap-2'>
								<Button
									type='button'
									variant='outline'
									size='sm'
									onClick={() => fileInputRef.current?.click()}
								>
									<Camera className='h-4 w-4 mr-2' />
									Changer la photo
								</Button>

								{(profile?.avatar || avatarFile) && !removeAvatar && (
									<Button
										type='button'
										variant='ghost'
										size='sm'
										className='text-red-600 hover:text-red-700 hover:bg-red-50'
										onClick={handleRemoveAvatar}
									>
										<Trash2 className='h-4 w-4 mr-2' />
										Supprimer
									</Button>
								)}
							</div>
							<p className='text-xs text-muted-foreground'>
								JPG, PNG, WebP ou GIF. Max 5MB.
							</p>
						</div>

						<input
							ref={fileInputRef}
							type='file'
							accept='image/jpeg,image/png,image/webp,image/gif'
							onChange={handleAvatarChange}
							className='hidden'
						/>
					</div>

					<Separator />

					{/* Formulaire */}
					<div className='grid gap-4'>
						<div className='grid gap-2'>
							<Label htmlFor='username'>Nom d'utilisateur *</Label>
							<Input
								id='username'
								value={formData.username}
								onChange={(e) =>
									setFormData({ ...formData, username: e.target.value })
								}
								placeholder='johndoe'
							/>
							<p className='text-xs text-muted-foreground'>
								Lettres, chiffres et underscores uniquement
							</p>
						</div>

						<div className='grid gap-2'>
							<Label htmlFor='name'>Nom complet</Label>
							<Input
								id='name'
								value={formData.name}
								onChange={(e) =>
									setFormData({ ...formData, name: e.target.value })
								}
								placeholder='Jean Dupont'
							/>
						</div>

						<div className='grid gap-2'>
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

						{/* Affichage du rôle (lecture seule) */}
						<div className='grid gap-2'>
							<Label>Rôle</Label>
							<div className='flex items-center gap-2'>
								<RoleBadge role={userRole} />
								<span className='text-xs text-muted-foreground'>
									(non modifiable)
								</span>
							</div>
						</div>
					</div>

					{/* Actions */}
					<div className='flex justify-end'>
						<Button
							onClick={handleSaveProfile}
							disabled={updateProfile.isPending}
						>
							{updateProfile.isPending ? (
								<Loader2 className='h-4 w-4 mr-2 animate-spin' />
							) : (
								<Save className='h-4 w-4 mr-2' />
							)}
							Enregistrer
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Carte Sécurité */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Key className='h-5 w-5' />
						Sécurité
					</CardTitle>
					<CardDescription>
						Gérez votre mot de passe et la sécurité de votre compte
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className='flex items-center justify-between'>
						<div>
							<p className='font-medium'>Mot de passe</p>
							<p className='text-sm text-muted-foreground'>
								Modifiez votre mot de passe régulièrement pour plus de sécurité
							</p>
						</div>
						<Button
							variant='outline'
							onClick={() => setIsPasswordDialogOpen(true)}
						>
							<Key className='h-4 w-4 mr-2' />
							Modifier
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Dialog changement de mot de passe */}
			<Dialog
				open={isPasswordDialogOpen}
				onOpenChange={setIsPasswordDialogOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Changer le mot de passe</DialogTitle>
						<DialogDescription>
							Entrez votre mot de passe actuel puis choisissez un nouveau mot de
							passe
						</DialogDescription>
					</DialogHeader>

					<div className='space-y-4 py-4'>
						<div className='space-y-2'>
							<Label htmlFor='oldPassword'>Mot de passe actuel</Label>
							<Input
								id='oldPassword'
								type='password'
								value={passwordForm.oldPassword}
								onChange={(e) =>
									setPasswordForm({
										...passwordForm,
										oldPassword: e.target.value,
									})
								}
								placeholder='••••••••'
							/>
						</div>

						<Separator />

						<div className='space-y-2'>
							<Label htmlFor='newPassword'>Nouveau mot de passe</Label>
							<Input
								id='newPassword'
								type='password'
								value={passwordForm.password}
								onChange={(e) =>
									setPasswordForm({
										...passwordForm,
										password: e.target.value,
									})
								}
								placeholder='Minimum 8 caractères'
							/>
						</div>

						<div className='space-y-2'>
							<Label htmlFor='confirmPassword'>Confirmer le mot de passe</Label>
							<Input
								id='confirmPassword'
								type='password'
								value={passwordForm.passwordConfirm}
								onChange={(e) =>
									setPasswordForm({
										...passwordForm,
										passwordConfirm: e.target.value,
									})
								}
								placeholder='Retapez le nouveau mot de passe'
							/>
						</div>
					</div>

					<DialogFooter>
						<Button
							variant='outline'
							onClick={() => {
								setIsPasswordDialogOpen(false)
								setPasswordForm({
									oldPassword: '',
									password: '',
									passwordConfirm: '',
								})
							}}
						>
							Annuler
						</Button>
						<Button
							onClick={handleChangePassword}
							disabled={changePassword.isPending}
						>
							{changePassword.isPending ? (
								<Loader2 className='h-4 w-4 mr-2 animate-spin' />
							) : (
								<Key className='h-4 w-4 mr-2' />
							)}
							Changer le mot de passe
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}

// Composant pour afficher le badge de rôle
function RoleBadge({ role }: { role: string }) {
	const roleConfig: Record<string, { label: string; className: string }> = {
		admin: {
			label: 'Administrateur',
			className: 'bg-red-100 text-red-800 border-red-200',
		},
		manager: {
			label: 'Manager',
			className: 'bg-blue-100 text-blue-800 border-blue-200',
		},
		caissier: {
			label: 'Caissier',
			className: 'bg-green-100 text-green-800 border-green-200',
		},
		user: {
			label: 'Utilisateur',
			className: 'bg-gray-100 text-gray-800 border-gray-200',
		},
	}

	const config = roleConfig[role] || roleConfig.user

	return (
		<span
			className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}
		>
			{config.label}
		</span>
	)
}
