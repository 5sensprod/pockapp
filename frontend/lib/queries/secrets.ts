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
	/**
	 * Une clé super-admin est présente sur CE poste. C'est elle qui fait
	 * apparaître l'inventaire distant — et, sur le poste d'un client, ce qu'il
	 * faut penser à effacer en repartant.
	 */
	super_configured: boolean
	admin_url: string
	interval_hours: number
	enabled: boolean
	state: BackupState
}

/** Une ligne de l'inventaire distant, telle que le mini-SaaS la rend. */
export interface SnapshotDistant {
	client_id: string
	client_name: string
	snapshot_id: string
	status: string
	plain_size: number
	plain_sha256: string
	chunk_count: number
	app_version: string
	origin: string
	created_at: string
	uploaded_at: string
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
			superKey?: string
			adminUrl?: string
			intervalHours?: number
			enabled?: boolean
		}) => {
			return await fetchWithAuth(pb, '/api/settings/backup', {
				method: 'POST',
				body: JSON.stringify({
					endpoint_url: data.endpointUrl,
					api_key: data.apiKey,
					encryption_key: data.encryptionKey,
					super_key: data.superKey,
					admin_url: data.adminUrl,
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

/**
 * Effacer la clé super-admin de CE poste.
 *
 * Le geste de fin d'intervention. Il a sa propre mutation, et pas un champ
 * vidé dans le formulaire, parce qu'il doit être atteignable en un clic : une
 * clé oubliée sur le poste d'un magasin ouvre les sauvegardes de tous les
 * autres clients.
 */
export function useDeleteSuperKey() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async () => {
			return await fetchWithAuth(pb, '/api/backup/super-key', {
				method: 'DELETE',
			})
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['backup-status'] })
			queryClient.removeQueries({ queryKey: ['backup-remote'] })
		},
	})
}

/**
 * L'inventaire des snapshots que le serveur détient.
 *
 * `enabled` conditionné à la présence de la clé : sans elle la route répond
 * 412, et on ne veut pas d'un message d'erreur permanent sur un écran dont
 * c'est le fonctionnement normal.
 */
export function useRemoteSnapshots(actif: boolean) {
	const pb = usePocketBase() as any

	return useQuery<{ snapshots: SnapshotDistant[] }>({
		queryKey: ['backup-remote'],
		queryFn: async () => {
			return await fetchWithAuth(pb, '/api/backup/remote')
		},
		enabled: actif,
		// L'inventaire traverse le réseau jusqu'au mutualisé : inutile de le
		// redemander à chaque montage d'écran.
		staleTime: 60_000,
	})
}

/** Supprimer un snapshot distant. Sans retour possible. */
export function useDeleteRemoteSnapshot() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: { clientId: string; snapshotId: string }) => {
			return await fetchWithAuth(pb, '/api/backup/remote/delete', {
				method: 'POST',
				body: JSON.stringify({
					client_id: data.clientId,
					snapshot_id: data.snapshotId,
					// Redemandée ici ET par le serveur : deux gardes, pour qu'un
					// appel programmatique n'efface pas une sauvegarde par accident.
					confirm: data.snapshotId,
				}),
			})
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['backup-remote'] })
		},
	})
}

// ═══════════════════════════════════════════════════════════════════════════
// RESTAURATION — EN DEUX TEMPS
// ═══════════════════════════════════════════════════════════════════════════
// Ce que l'écran appelle « restaurer » ne remplace RIEN tout de suite : le
// serveur télécharge, déchiffre, vérifie l'empreinte et dépose la base à côté.
// L'échange a lieu au démarrage suivant, avant que PocketBase n'ouvre le
// fichier — sous Windows, un fichier ouvert ne se remplace pas.
//
// D'où le `pending` : entre les deux, il y a un état à afficher, et une
// possibilité de changer d'avis.

export interface RestaurationEnAttente {
	snapshot_id: string
	client_id: string
	client_name: string
	origin: string
	plain_sha256: string
	plain_size: number
	created_at: string
	prepared_at: string
}

export function useRestoreStatus() {
	const pb = usePocketBase() as any

	return useQuery<{ pending: RestaurationEnAttente | null }>({
		queryKey: ['backup-restore-status'],
		queryFn: async () => {
			return await fetchWithAuth(pb, '/api/backup/restore/status')
		},
	})
}

/** Prépare une restauration. Ne remplace rien : arme le démarrage suivant. */
export function usePrepareRestore() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (snap: SnapshotDistant) => {
			return await fetchWithAuth(pb, '/api/backup/restore', {
				method: 'POST',
				body: JSON.stringify({
					client_id: snap.client_id,
					client_name: snap.client_name,
					snapshot_id: snap.snapshot_id,
					origin: snap.origin,
					created_at: snap.created_at,
					// Retapé par l'utilisateur, revérifié par le serveur : ce geste
					// remplace la base d'un magasin, il n'a pas de raccourci.
					confirm: snap.snapshot_id,
				}),
			})
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['backup-restore-status'] })
		},
	})
}

/** Désarme une restauration préparée mais pas encore appliquée. */
export function useCancelRestore() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async () => {
			return await fetchWithAuth(pb, '/api/backup/restore', {
				method: 'DELETE',
			})
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['backup-restore-status'] })
		},
	})
}

// ═══════════════════════════════════════════════════════════════════════════
// MIROIR DES IMAGES
// ═══════════════════════════════════════════════════════════════════════════
// Le snapshot de la base ne contient aucun octet d'image. Le miroir comble ce
// trou en ne transportant QUE ce que l'éditeur n'a pas déjà — d'où la notion
// de « socle » : la liste des fichiers qu'il détient, déclarée une fois.

export interface StorageLocal {
	count: number
	bytes: number
}

export function useStorageLocal() {
	const pb = usePocketBase() as any

	return useQuery<StorageLocal>({
		queryKey: ['backup-storage-local'],
		queryFn: async () => {
			return await fetchWithAuth(pb, '/api/backup/storage')
		},
		// Un parcours de 9400 fichiers : inutile de le refaire à chaque montage.
		staleTime: 5 * 60_000,
	})
}

/**
 * Déclarer le storage de CE poste comme socle pour un client.
 *
 * N'envoie aucun octet : seulement des chemins. C'est ce qui évite de
 * transporter 1,6 Gio, et ça doit être fait AVANT la première synchronisation
 * du poste concerné.
 */
export function useDeclareBaseline() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation<
		{ inventory: number; declared: number; message: string },
		Error,
		{ clientId: string }
	>({
		mutationFn: async ({ clientId }) => {
			return await fetchWithAuth(pb, '/api/backup/storage/baseline', {
				method: 'POST',
				body: JSON.stringify({ client_id: clientId }),
			})
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['backup-storage-local'] })
			// Et l'ÉTAT DU MIROIR : sans ça, l'écran continue d'afficher
			// « socle NON déclaré » après une déclaration réussie, et invite à
			// refaire un geste qui vient d'être fait.
			queryClient.invalidateQueries({ queryKey: ['backup-mirror'] })
		},
	})
}

/** Rapatrier les images du miroir dans le storage de ce poste. */
export function usePullStorage() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation<
		{
			result: {
				Distants: number
				Ecrits: number
				DejaLa: number
				Echecs: number
				Octets: number
			}
		},
		Error,
		{ clientId: string }
	>({
		mutationFn: async ({ clientId }) => {
			return await fetchWithAuth(pb, '/api/backup/storage/pull', {
				method: 'POST',
				body: JSON.stringify({ client_id: clientId }),
			})
		},
		onSuccess: () => {
			// Le poste détient de nouveaux fichiers : son inventaire local a
			// changé, et l'écran l'affiche.
			queryClient.invalidateQueries({ queryKey: ['backup-storage-local'] })
		},
	})
}

/** Ce que le serveur détient du storage d'un client. */
export interface StatsMiroir {
	/** Fichiers dont le serveur a réellement les octets. */
	with_bytes: number
	/** Fichiers déclarés au socle : connus, mais détenus par l'éditeur. */
	baseline: number
	bytes: number
}

/**
 * L'état du miroir, par client.
 *
 * Sans cette lecture, rien à l'écran ne distingue « socle déclaré » de « socle
 * jamais déclaré » — et c'est exactement la confusion qui coûte un
 * téléversement de 1,6 Gio.
 */
export function useMirrorStats(clientId: string, actif: boolean) {
	const pb = usePocketBase() as any

	return useQuery<StatsMiroir>({
		queryKey: ['backup-mirror', clientId],
		queryFn: async () => {
			return await fetchWithAuth(
				pb,
				`/api/backup/storage/mirror?client_id=${encodeURIComponent(clientId)}`,
			)
		},
		enabled: actif && !!clientId,
		staleTime: 60_000,
	})
}
