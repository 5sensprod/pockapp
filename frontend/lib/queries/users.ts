// frontend/lib/queries/users.ts - VERSION CORRIGÉE
import type { UsersResponse } from '@/lib/pocketbase-types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export type UserRole = 'admin' | 'manager' | 'caissier' | 'user'

export interface UserDto {
	name: string
	email: string
	password?: string
	role: UserRole
}

// ✅ Helper pour faire des requêtes avec le bon header Authorization
async function fetchWithAuth(pb: any, url: string, options: RequestInit = {}) {
	const token = pb.authStore.token

	if (!token) {
		throw new Error('Non authentifié - token manquant')
	}

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Authorization: token, // ✅ PocketBase utilise directement le token (pas "Bearer")
		...((options.headers as Record<string, string>) || {}),
	}

	console.log('📤 Request headers:', Object.keys(headers))

	const response = await fetch(url, {
		...options,
		headers,
	})

	console.log('📥 Response status:', response.status)

	if (!response.ok) {
		const errorText = await response.text()
		console.error('❌ Error response:', errorText)

		let errorMessage = `Erreur ${response.status}`
		try {
			const errorJson = JSON.parse(errorText)
			errorMessage = errorJson.error || errorJson.message || errorMessage
		} catch {
			errorMessage = errorText || errorMessage
		}

		throw new Error(errorMessage)
	}

	const data = await response.json()
	console.log('✅ Response data:', data)
	return data
}

// 📋 Liste tous les utilisateurs (admin only)
export function useUsers() {
	const pb = usePocketBase() as any

	return useQuery<UsersResponse[]>({
		queryKey: ['users'],
		queryFn: async () => {
			console.log('📋 Fetching users list...')
			console.log('🔑 Auth store:', {
				isValid: pb.authStore.isValid,
				token: pb.authStore.token ? 'present' : 'missing',
				model: pb.authStore.model?.email,
			})

			const data = await fetchWithAuth(pb, '/api/users', {
				method: 'GET',
			})

			return data as UsersResponse[]
		},
		retry: false,
		refetchOnMount: 'always',
		staleTime: 0,
	})
}

// 👤 Détails d'un utilisateur
export function useUser(userId?: string) {
	const pb = usePocketBase() as any

	return useQuery<UsersResponse>({
		queryKey: ['users', userId],
		queryFn: async () => {
			if (!userId) throw new Error('userId is required')

			// Utiliser l'API PocketBase standard pour récupérer un utilisateur
			const result = await pb.collection('users').getOne(userId)
			return result as UsersResponse
		},
		enabled: !!userId,
	})
}

// ➕ Créer un utilisateur (admin only)
export function useCreateUser() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: UserDto) => {
			console.log('➕ Creating user:', data.email)

			const response = await fetchWithAuth(pb, '/api/users', {
				method: 'POST',
				body: JSON.stringify(data),
			})

			return response as UsersResponse
		},
		onSuccess: () => {
			console.log('✅ User created, invalidating cache')
			queryClient.invalidateQueries({ queryKey: ['users'] })
		},
		onError: (error: any) => {
			console.error('❌ Create user error:', error)
		},
	})
}

// ✏️ Modifier un utilisateur (admin only)
export function useUpdateUser() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			data,
		}: {
			id: string
			data: Partial<UserDto>
		}) => {
			console.log('✏️ Updating user:', id)

			const response = await fetchWithAuth(pb, `/api/users/${id}`, {
				method: 'PATCH',
				body: JSON.stringify(data),
			})

			return response as UsersResponse
		},
		onSuccess: (_, variables) => {
			console.log('✅ User updated, invalidating cache')
			queryClient.invalidateQueries({ queryKey: ['users'] })
			queryClient.invalidateQueries({ queryKey: ['users', variables.id] })
		},
		onError: (error: any) => {
			console.error('❌ Update user error:', error)
		},
	})
}

// 🗑️ Supprimer un utilisateur (admin only)
export function useDeleteUser() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (userId: string) => {
			console.log('🗑️ Deleting user:', userId)

			return await fetchWithAuth(pb, `/api/users/${userId}`, {
				method: 'DELETE',
			})
		},
		onSuccess: () => {
			console.log('✅ User deleted, invalidating cache')
			queryClient.invalidateQueries({ queryKey: ['users'] })
		},
		onError: (error: any) => {
			console.error('❌ Delete user error:', error)
		},
	})
}
