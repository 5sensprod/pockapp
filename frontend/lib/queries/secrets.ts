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
			return await fetchWithAuth(pb, '/api/app-settings')
		},
		retry: false,
	})
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS - GESTION GÉNÉRIQUE DES SECRETS
// ═══════════════════════════════════════════════════════════════════════════
//
// Plus aucun écran n'utilise ces quatre hooks depuis le ticket 5b : la section
// « Secrets personnalisés » a été retirée, parce qu'un formulaire libre permet
// d'écraser une clé nommée par erreur. Ils sont conservés parce que les routes
// génériques correspondantes existent toujours côté Go — pas parce qu'ils
// servent. Les supprimer, eux et leurs routes, est une session de nettoyage à
// part.

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
// HOOKS - PUBLICATION DU SITE (ticket 5b)
// ═══════════════════════════════════════════════════════════════════════════
//
// Il n'existe volontairement AUCUN hook qui relit la clé de publication. Le
// front l'écrit et sait si elle est configurée, rien de plus : au ticket 6,
// c'est le Go qui la lira pour poser l'en-tête X-API-Key. Elle ne descend
// jamais dans le renderer.

/**
 * État de la configuration de publication : la clé est-elle enregistrée, et
 * vers quelle URL publie-t-on. La clé elle-même n'est jamais renvoyée.
 */
export function useSitePublishStatus() {
	const pb = usePocketBase() as any

	return useQuery<{ configured: boolean; endpoint_url: string }>({
		queryKey: ['site-publish-status'],
		queryFn: async () => {
			return await fetchWithAuth(pb, '/api/settings/site-publish/status')
		},
	})
}

/**
 * Enregistrer la clé de publication et/ou l'URL de l'endpoint.
 *
 * Les deux champs sont facultatifs indépendamment : on change la clé sans
 * retaper l'URL, et l'inverse. Au moins un des deux doit être fourni.
 */
export function useSetSitePublish() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: { apiKey?: string; endpointUrl?: string }) => {
			return await fetchWithAuth(pb, '/api/settings/site-publish', {
				method: 'POST',
				body: JSON.stringify({
					api_key: data.apiKey ?? '',
					endpoint_url: data.endpointUrl ?? '',
				}),
			})
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['site-publish-status'] })
			queryClient.invalidateQueries({ queryKey: ['settings'] })
		},
	})
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT DU CATALOGUE VERS LA BASE SQL AXEMUSIQUE
// ═══════════════════════════════════════════════════════════════════════════
//
// Réglages SÉPARÉS de ceux de la publication du menu. Ce n'est pas une
// duplication par facilité : la clé du menu écrit un fichier JSON, celle-ci
// écrit dans la BASE DE DONNÉES du catalogue. Révoquer l'une ne doit pas
// condamner l'autre — côté serveur, ce sont `api_key` et `catalog_api_key`,
// deux entrées distinctes de config.php.
//
// Comme ci-dessus : aucun hook ne relit la clé.

export function useSiteCatalogStatus() {
	const pb = usePocketBase() as any

	return useQuery<{
		configured: boolean
		endpoint_url: string
		/** URL du miroir d'images. Réglage distinct de l'export d'entités —
		 *  deux scripts, deux plafonds de corps —, MÊME clé. */
		images_url: string
	}>({
		queryKey: ['site-catalog-status'],
		queryFn: async () => {
			return await fetchWithAuth(pb, '/api/settings/site-catalog/status')
		},
	})
}

export function useSetSiteCatalog() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: {
			apiKey?: string
			endpointUrl?: string
			imagesUrl?: string
		}) => {
			return await fetchWithAuth(pb, '/api/settings/site-catalog', {
				method: 'POST',
				body: JSON.stringify({
					api_key: data.apiKey ?? '',
					endpoint_url: data.endpointUrl ?? '',
					images_url: data.imagesUrl ?? '',
				}),
			})
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['site-catalog-status'] })
			// L'inventaire distant devient lisible : l'écran « Catalogue en ligne »
			// doit le redemander plutôt que de rester sur « État du site inconnu ».
			queryClient.invalidateQueries({ queryKey: ['site-catalog'] })
			// Le miroir d'images a son propre inventaire : sans cela, l'onglet
			// « Images » reste sur « État des images inconnu » après le réglage.
			queryClient.invalidateQueries({ queryKey: ['site-images'] })
			queryClient.invalidateQueries({ queryKey: ['settings'] })
		},
	})
}

export function useDeleteSiteCatalogKey() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async () => {
			return await fetchWithAuth(pb, '/api/settings/site-catalog', {
				method: 'DELETE',
			})
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['site-catalog-status'] })
			queryClient.invalidateQueries({ queryKey: ['site-catalog'] })
			queryClient.invalidateQueries({ queryKey: ['settings'] })
		},
	})
}

/**
 * Supprimer la clé de publication. L'URL est conservée.
 */
export function useDeleteSitePublishKey() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async () => {
			return await fetchWithAuth(pb, '/api/settings/site-publish', {
				method: 'DELETE',
			})
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['site-publish-status'] })
			queryClient.invalidateQueries({ queryKey: ['settings'] })
		},
	})
}

// ═══════════════════════════════════════════════════════════════════════════
// SAUVEGARDE DE LA BASE VERS LE MINI-SAAS
// ═══════════════════════════════════════════════════════════════════════════
// Conception : docs/SAUVEGARDE.md. Ce que l'écran manipule ici, c'est la
// configuration du poste — l'URL, la clé qui l'identifie auprès du mini-SaaS,
// et la clé de chiffrement des snapshots.

export interface BackupState {
	last_success?: string
	last_snapshot_id?: string
	last_plain_size?: number
	last_failure?: string
	last_error?: string
	running: boolean
}

export interface BackupStatus {
	configured: boolean
	endpoint_url: string
	/** Une clé de chiffrement EXISTE. Sa valeur n'est jamais dans cette réponse. */
	encryption_configured: boolean
	interval_hours: number
	enabled: boolean
	state: BackupState
}

export function useBackupStatus() {
	const pb = usePocketBase() as any

	return useQuery<BackupStatus>({
		queryKey: ['backup-status'],
		queryFn: async () => {
			return await fetchWithAuth(pb, '/api/settings/backup/status')
		},
		// Une sauvegarde en cours dure quelques secondes ; sans rafraîchissement
		// l'écran resterait sur « en cours » jusqu'à ce qu'on change d'onglet.
		refetchInterval: (query) =>
			query.state.data?.state?.running ? 2000 : false,
	})
}

export function useSetBackupSettings() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: {
			endpointUrl?: string
			apiKey?: string
			encryptionKey?: string
			intervalHours?: number
			enabled?: boolean
		}) => {
			return await fetchWithAuth(pb, '/api/settings/backup', {
				method: 'POST',
				body: JSON.stringify({
					endpoint_url: data.endpointUrl,
					api_key: data.apiKey,
					encryption_key: data.encryptionKey,
					interval_hours: data.intervalHours,
					enabled: data.enabled,
				}),
			})
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['backup-status'] })
			queryClient.invalidateQueries({ queryKey: ['settings'] })
		},
	})
}

/** Supprimer la clé API. La clé de CHIFFREMENT est conservée, délibérément. */
export function useDeleteBackupKey() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async () => {
			return await fetchWithAuth(pb, '/api/settings/backup', {
				method: 'DELETE',
			})
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['backup-status'] })
		},
	})
}

/** Lancer une sauvegarde tout de suite. Répond avant qu'elle soit finie. */
export function useRunBackup() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async () => {
			return await fetchWithAuth(pb, '/api/backup/run', { method: 'POST' })
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['backup-status'] })
		},
	})
}

/**
 * Révéler la clé de chiffrement de CE poste.
 *
 * Volontairement une mutation et non une requête : on ne veut pas qu'elle
 * parte au montage de l'écran, ni qu'elle traîne dans le cache. Elle se
 * demande, une fois, par un geste explicite.
 */
export function useRevealEncryptionKey() {
	const pb = usePocketBase() as any

	return useMutation<{ encryption_key: string; warning: string }>({
		mutationFn: async () => {
			return await fetchWithAuth(pb, '/api/backup/encryption-key')
		},
	})
}
