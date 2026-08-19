// frontend/modules/site/hooks/use-image-sync.ts
// ═══════════════════════════════════════════════════════════════════════════
// MIROIR DES IMAGES — inventaire, empreintes locales, envoi
// ═══════════════════════════════════════════════════════════════════════════
// Parle à la couche Go (backend/routes/site_images_routes.go), qui ajoute la
// clé X-API-Key et relaie vers server/api/images-sync.php. **La clé ne passe
// pas par ici**, comme pour l'export du catalogue.
//
// Mécanisme : PocketSite-docs/16-conception-images.md, §4.
//
// Premier livrable : les MARQUES et les CATÉGORIES. Elles portent un champ
// `image` scalaire — pas de galerie, donc pas de liste ordonnée à tenir. Le
// calcul, lui, est déjà celui d'une liste (`imageChecksumOf` prend un
// tableau) : les produits n'auront rien à réécrire ici, seulement à fournir
// leur galerie derrière leur principale.
// ═══════════════════════════════════════════════════════════════════════════

import type { CatalogBrand, CatalogCategory } from '@/lib/queries/site-catalog'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'

import { catalogImageUrl } from '../lib/catalog-image'
import {
	EMPTY_IMAGE_CHECKSUM,
	type ImageKind,
	imageChecksumOfDigests,
	imageDigest,
} from '../lib/image-checksum'

// ---------------------------------------------------------------------------
// INVENTAIRE D'IMAGES
// ---------------------------------------------------------------------------

/** legacy_id → image_checksum, tel que renvoyé par le miroir. */
export type ImageChecksumIndex = Record<string, string>

export type ImageInventory = {
	ok: true
	counts: { brands: number; categories: number }
	brands: ImageChecksumIndex
	categories: ImageChecksumIndex
	/** Préfixe d'URL publique des octets, tel que configuré côté serveur. Rendu
	 *  pour l'affichage : ce que `catalog.php` rendra au bundle reste à
	 *  trancher (§6.5 de la conception). */
	mediaBaseUrl: string | null
	readAt: string
}

async function callRelay<T>(
	token: string,
	path: string,
	init?: RequestInit,
): Promise<T> {
	const response = await fetch(path, {
		...init,
		headers: { Authorization: token, ...(init?.headers ?? {}) },
	})

	const raw = await response.text()
	let payload: unknown
	try {
		payload = JSON.parse(raw)
	} catch {
		throw new Error(raw?.slice(0, 300) || `Erreur ${response.status}`)
	}

	if (!response.ok) {
		// La couche Go joint `status` et `body` quand le distant répond autre
		// chose que du JSON — couche anti-bot, erreur Apache. C'est le cas
		// indiagnosticable sans voir le corps.
		const detail = payload as { error?: string; status?: number; body?: string }
		const suffix = detail?.body
			? ` — le serveur a répondu ${detail.status ?? '?'} : ${detail.body.slice(0, 200)}`
			: ''
		throw new Error((detail?.error ?? `Erreur ${response.status}`) + suffix)
	}

	return payload as T
}

/**
 * Ce que le miroir contient déjà. Comme l'inventaire d'entités : **ne
 * s'exécute pas tout seul**, tant que l'URL et la clé ne sont pas réglées la
 * route répond 412.
 */
export function useImageInventory(enabled: boolean) {
	const pb = usePocketBase() as { authStore: { token: string } }

	return useQuery<ImageInventory>({
		queryKey: ['site-images', 'inventory'],
		enabled,
		retry: false,
		staleTime: 30_000,
		queryFn: async () => {
			const token = pb.authStore.token
			if (!token) throw new Error('Non authentifié')
			return await callRelay<ImageInventory>(
				token,
				'/api/site/images/inventory',
			)
		},
	})
}

// ---------------------------------------------------------------------------
// EMPREINTES LOCALES
// ---------------------------------------------------------------------------

/** Une image locale, telle qu'elle sera envoyée : son rang est sa position. */
export type LocalImage = { url: string; filename: string }

/** Une entité et ses images, dans l'ordre des rangs. */
export type ImageBearing = {
	legacy_id: string
	name: string
	images: LocalImage[]
}

/**
 * Les octets d'une image de marque ou de catégorie ne se lisent pas dans la
 * base : PocketBase les sert par HTTP. **Ils sont donc téléchargés pour être
 * hachés** — en local, mais 57 Mio tout de même pour les 261 fiches
 * concernées.
 *
 * D'où ce cache, à la vie du montage : la clé est l'URL, et une URL PocketBase
 * porte le nom suffixé du fichier (`…_PiDxAYvQfC.jpg`), qui CHANGE dès que
 * l'image change. Une entrée de cache ne peut donc pas devenir fausse — elle
 * peut seulement devenir inutile.
 */
function useDigestCache() {
	const cache = useRef(new Map<string, string>()).current

	return useCallback(
		async (image: LocalImage): Promise<string> => {
			const known = cache.get(image.url)
			if (known) return known

			const response = await fetch(image.url)
			if (!response.ok) {
				throw new Error(
					`Image illisible (${response.status}) : ${image.filename}`,
				)
			}
			const digest = await imageDigest(await response.arrayBuffer())
			cache.set(image.url, digest)
			return digest
		},
		[cache],
	)
}

/**
 * Calcule l'empreinte d'images de chaque entité — **à la demande**, jamais à
 * l'ouverture de l'écran.
 *
 * Ce n'est pas la même prudence que pour les empreintes d'entités, qui ne
 * coûtent que du calcul : ici chaque empreinte suppose de LIRE les octets. Les
 * déclencher à l'affichage ferait passer 57 Mio sur la boucle locale à chaque
 * visite, pour une information dont on n'a besoin qu'au moment d'envoyer.
 */
export function useLocalImageChecksums() {
	const digestOf = useDigestCache()
	const [index, setIndex] = useState<Map<string, string>>(new Map())
	const [progress, setProgress] = useState({ done: 0, total: 0 })
	const [computing, setComputing] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const compute = useCallback(
		async (entities: ImageBearing[]) => {
			setComputing(true)
			setError(null)
			setProgress({ done: 0, total: entities.length })

			const next = new Map<string, string>()
			try {
				// EN SÉRIE, délibérément : 261 requêtes simultanées vers PocketBase
				// local ne vont pas plus vite et rendent la progression illisible.
				for (const [position, entity] of entities.entries()) {
					const digests: string[] = []
					for (const image of entity.images) {
						digests.push(await digestOf(image))
					}
					next.set(entity.legacy_id, await imageChecksumOfDigests(digests))
					setProgress({ done: position + 1, total: entities.length })
				}
				setIndex(next)
			} catch (cause) {
				// Un échec de lecture ne doit pas laisser un index à moitié rempli
				// passer pour complet : on garde ce qui a été calculé et on le dit.
				setIndex(next)
				setError(cause instanceof Error ? cause.message : String(cause))
			} finally {
				setComputing(false)
			}
		},
		[digestOf],
	)

	return { index, compute, computing, progress, error }
}

/** Ce qu'une marque ou une catégorie envoie : son `image`, seule, au rang 0. */
export function toImageBearing(
	pb: unknown,
	entity: CatalogBrand | CatalogCategory,
): ImageBearing {
	const url = catalogImageUrl(pb as never, entity)
	return {
		legacy_id: entity.legacy_id,
		name: entity.name,
		// **Le champ `image` fait foi, pas le `ls`** : une catégorie a déjà perdu
		// son image en laissant son dossier de stockage derrière elle (mesuré le
		// 19 août 2026). Sans image, la liste est vide — et l'empreinte dit
		// « aucune image », ce qui est un état, pas un manque.
		images: url && entity.image ? [{ url, filename: entity.image }] : [],
	}
}

// ---------------------------------------------------------------------------
// ENVOI
// ---------------------------------------------------------------------------

export type SendImagesInput = {
	kind: ImageKind
	entity: ImageBearing
	/** L'empreinte déjà calculée. Elle n'est PAS recalculée à l'envoi : c'est
	 *  la même valeur qui sert à décider d'envoyer et qui est stockée en face,
	 *  sans quoi les deux pourraient diverger. */
	imageChecksum: string
}

export type SendImagesOutcome = {
	kind: string
	legacy_id: string
	image_checksum: string
	paths: string[]
	mediaBaseUrl: string | null
}

/**
 * Envoie **toutes les images d'une entité, entières** (§4.3). Jamais une image
 * seule : c'est ce qui rend le retrait possible sans jamais rien supprimer —
 * on ne supprime pas une entité, on réécrit son état.
 *
 * Idempotent : rejouer donne le même état. Deux postes qui envoient la même
 * entité écrivent la même chose ou, s'ils divergent, le dernier gagne, et
 * l'inventaire dit ensuite lequel (§4.3, risque 5).
 */
export function useSendEntityImages() {
	const pb = usePocketBase() as { authStore: { token: string } }
	const queryClient = useQueryClient()

	return useMutation<SendImagesOutcome, Error, SendImagesInput>({
		mutationFn: async ({ kind, entity, imageChecksum }) => {
			const token = pb.authStore.token
			if (!token) throw new Error('Non authentifié')

			const form = new FormData()
			form.set('kind', kind)
			form.set('legacy_id', entity.legacy_id)
			form.set('image_checksum', imageChecksum)

			// Les rangs sont NUMÉROTÉS, et le serveur s'arrête au premier trou :
			// un trou décalerait silencieusement la galerie.
			for (const [rank, image] of entity.images.entries()) {
				const response = await fetch(image.url)
				if (!response.ok) {
					throw new Error(
						`Image illisible (${response.status}) : ${image.filename}`,
					)
				}
				form.append(`image_${rank}`, await response.blob(), image.filename)
			}

			// Pas de Content-Type posé à la main : le navigateur ajoute la
			// frontière du multipart, et c'est elle qui permet au PHP de découper.
			return await callRelay<SendImagesOutcome>(
				token,
				'/api/site/images/entity',
				{ method: 'POST', body: form },
			)
		},
		onSuccess: () => {
			// L'inventaire vient de changer : les pastilles doivent suivre.
			queryClient.invalidateQueries({ queryKey: ['site-images', 'inventory'] })
		},
	})
}

export { EMPTY_IMAGE_CHECKSUM }
