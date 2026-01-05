// frontend/lib/queries/secrets.ts
// ═══════════════════════════════════════════════════════════════════════════
// HOOKS REACT QUERY - GESTION DES SECRETS ET SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SecretStatus {
	key: string
	configured: boolean
}

export interface AppSetting {
	id: string
	key: string
	value: string // Masqué si encrypted
	encrypted: boolean
	description?: string
	category?: string
	created: string
	updated: string
}

export interface SetSecretDto {
	key: string
	value: string
	description?: string
	category?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER - FETCH AVEC AUTH
// ═══════════════════════════════════════════════════════════════════════════

async function fetchWithAuth(
	pb: any,
	url: string,
	options: RequestInit = {},
): Promise<any> {
	const token = pb.authStore.token

	if (!token) {
		throw new Error('Non authentifié - token manquant')
	}

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Authorization: token,
		...((options.headers as Record<string, string>) || {}),
	}

	const response = await fetch(url, {
		...options,
		headers,
	})

	if (!response.ok) {
		const errorText = await response.text()
		let errorMessage = `Erreur ${response.status}`
		try {
			const errorJson = JSON.parse(errorText)
			errorMessage = errorJson.error || errorJson.message || errorMessage
		} catch {
			errorMessage = errorText || errorMessage
		}
		throw new Error(errorMessage)
	}

	return response.json()
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS - LISTE DES SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Liste tous les settings (valeurs masquées pour les secrets)
 */
export function useSettings() {
	const pb = usePocketBase() as any

	return useQuery<AppSetting[]>({
		queryKey: ['settings'],
		queryFn: async () => {
			return await fetchWithAuth(pb, '/api/settings')
		},
		retry: false,
	})
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS - GESTION GÉNÉRIQUE DES SECRETS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Vérifie si un secret est configuré
 */
export function useSecretStatus(key: string) {
	const pb = usePocketBase() as any

	return useQuery<SecretStatus>({
		queryKey: ['secret-status', key],
		queryFn: async () => {
			return await fetchWithAuth(pb, `/api/settings/secret/${key}/status`)
		},
		enabled: !!key,
	})
}

/**
 * Créer ou mettre à jour un secret
 */
export function useSetSecret() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: SetSecretDto) => {
			return await fetchWithAuth(pb, '/api/settings/secret', {
				method: 'POST',
				body: JSON.stringify(data),
			})
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ['settings'] })
			queryClient.invalidateQueries({
				queryKey: ['secret-status', variables.key],
			})
		},
	})
}

/**
 * Supprimer un secret
 */
export function useDeleteSecret() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (key: string) => {
			return await fetchWithAuth(pb, `/api/settings/secret/${key}`, {
				method: 'DELETE',
			})
		},
		onSuccess: (_, key) => {
			queryClient.invalidateQueries({ queryKey: ['settings'] })
			queryClient.invalidateQueries({ queryKey: ['secret-status', key] })
		},
	})
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS - CLÉ API NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Vérifie si la clé API notifications est configurée
 */
export function useNotificationKeyStatus() {
	const pb = usePocketBase() as any

	return useQuery<{ configured: boolean }>({
		queryKey: ['notification-key-status'],
		queryFn: async () => {
			return await fetchWithAuth(pb, '/api/settings/notification-key/status')
		},
	})
}

/**
 * Sauvegarder la clé API notifications
 */
export function useSetNotificationKey() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (apiKey: string) => {
			return await fetchWithAuth(pb, '/api/settings/notification-key', {
				method: 'POST',
				body: JSON.stringify({ api_key: apiKey }),
			})
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['notification-key-status'] })
			queryClient.invalidateQueries({ queryKey: ['settings'] })
		},
	})
}

/**
 * Supprimer la clé API notifications
 */
export function useDeleteNotificationKey() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async () => {
			return await fetchWithAuth(pb, '/api/settings/notification-key', {
				method: 'DELETE',
			})
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['notification-key-status'] })
			queryClient.invalidateQueries({ queryKey: ['settings'] })
		},
	})
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS - WEBHOOK SECRET
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Vérifie si le webhook secret est configuré
 */
export function useWebhookSecretStatus() {
	const pb = usePocketBase() as any

	return useQuery<{ configured: boolean }>({
		queryKey: ['webhook-secret-status'],
		queryFn: async () => {
			return await fetchWithAuth(pb, '/api/settings/webhook-secret/status')
		},
	})
}

/**
 * Sauvegarder ou générer le webhook secret
 */
export function useSetWebhookSecret() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (secret?: string) => {
			return await fetchWithAuth(pb, '/api/settings/webhook-secret', {
				method: 'POST',
				body: JSON.stringify({ secret: secret || '' }),
			})
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['webhook-secret-status'] })
			queryClient.invalidateQueries({ queryKey: ['settings'] })
		},
	})
}
