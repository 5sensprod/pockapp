// frontend/lib/queries/profile.ts
import { usePocketBase } from '@/lib/use-pocketbase'
import { useAuth } from '@/modules/auth/AuthProvider'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface ProfileDto {
	name?: string
	username?: string
	email?: string
}

export interface PasswordChangeDto {
	oldPassword: string
	password: string
	passwordConfirm: string
}

// 👤 Récupérer le profil de l'utilisateur connecté
export function useProfile() {
	const pb = usePocketBase()
	const { user } = useAuth()

	return useQuery({
		queryKey: ['profile', user?.id],
		queryFn: async () => {
			if (!user?.id) throw new Error('Non authentifié')
			return await pb.collection('users').getOne(user.id)
		},
		enabled: !!user?.id,
	})
}

// ✏️ Modifier le profil (avec support avatar)
export function useUpdateProfile() {
	const pb = usePocketBase()
	const { user } = useAuth()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (
			data: Partial<ProfileDto> & {
				avatar?: File | null
				removeAvatar?: boolean
			},
		) => {
			if (!user?.id) throw new Error('Non authentifié')

			const formData = new FormData()
			const { avatar, removeAvatar, ...rest } = data

			// Champs texte
			for (const [key, value] of Object.entries(rest)) {
				if (value !== undefined && value !== null) {
					formData.append(key, value === '' ? '' : String(value))
				}
			}

			// Gestion de l'avatar
			if (removeAvatar) {
				// String vide = suppression du fichier dans PocketBase
				formData.append('avatar', '')
			} else if (avatar instanceof File) {
				formData.append('avatar', avatar)
			}

			// Debug
			console.log('🧪 [updateProfile] FormData :')
			for (const [key, value] of formData.entries()) {
				if (value instanceof File) {
					console.log(`  ${key}: File(${value.name}, ${value.type})`)
				} else {
					console.log(`  ${key}: ${value}`)
				}
			}

			const updated = await pb.collection('users').update(user.id, formData)

			// Mettre à jour l'auth store avec les nouvelles données
			if (pb.authStore.model) {
				pb.authStore.save(pb.authStore.token || '', updated)
			}

			return updated
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['profile'] })
		},
	})
}

// 🔑 Changer le mot de passe
export function useChangePassword() {
	const pb = usePocketBase()
	const { user } = useAuth()

	return useMutation({
		mutationFn: async (data: PasswordChangeDto) => {
			if (!user?.id) throw new Error('Non authentifié')

			// Mise à jour du mot de passe via l'API PocketBase
			return await pb.collection('users').update(user.id, {
				oldPassword: data.oldPassword,
				password: data.password,
				passwordConfirm: data.passwordConfirm,
			})
		},
	})
}

// 🖼️ Helper pour obtenir l'URL de l'avatar
export function getAvatarUrl(
	pb: ReturnType<typeof usePocketBase>,
	user: { id: string; collectionId: string; avatar?: string } | null,
): string | null {
	if (!user?.avatar) return null
	return pb.files.getUrl(user, user.avatar)
}
