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
// Premier livrable (19 août 2026) : les MARQUES et les CATÉGORIES. Elles
// portent un champ `image` scalaire — pas de galerie, donc pas de liste
// ordonnée à tenir.
//
// Les PRODUITS s'y ajoutent le 20 août 2026, et c'est bien un cas de plus, pas
// un mécanisme de plus : le calcul était déjà celui d'une liste
// (`imageChecksumOf` prend un tableau), l'envoi numérotait déjà les rangs. Ce
// qu'ils apportent est la LISTE ORDONNÉE — rang 0 = `image`, rangs suivants =
// `gallery` DANS SON ORDRE — et l'ÉCHELLE : 2412 produits publiés, 4132
// fichiers, 1,503 Gio (mesuré le 20 août 2026). C'est l'échelle qui a imposé
// le cache persistant ci-dessous.
// ═══════════════════════════════════════════════════════════════════════════

import type {
	CatalogBrand,
	CatalogCategory,
	CatalogProduct,
} from '@/lib/queries/site-catalog'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'

import { catalogImageUrl } from '../lib/catalog-image'
import {
	EMPTY_IMAGE_CHECKSUM,
	type ImageKind,
	imageChecksumOfDigests,
	imageDigest,
	orderedImageNames,
} from '../lib/image-checksum'
import {
	type CacheEmpreintes,
	MAX_ENTITES_PAR_CALCUL,
	ecrireCache,
	empreinteConnue,
	lireCache,
	retenir,
} from '../lib/image-checksum-store'

// ---------------------------------------------------------------------------
// INVENTAIRE D'IMAGES
// ---------------------------------------------------------------------------

/** legacy_id → image_checksum, tel que renvoyé par le miroir. */
export type ImageChecksumIndex = Record<string, string>

export type ImageInventory = {
	ok: true
	counts: { brands: number; categories: number; products: number }
	brands: ImageChecksumIndex
	categories: ImageChecksumIndex
	products: ImageChecksumIndex
	/** Préfixe d'URL publique des octets, tel que configuré côté serveur. Rendu
	 *  pour l'affichage : ce que `catalog.php` rendra au bundle reste à
	 *  trancher (§6.5 de la conception). */
	mediaBaseUrl: string | null
	/** L'espace du mutualisé, rendu par le miroir depuis le 20 août 2026. Le
	 *  §6.4 de la conception le déclarait inconnu ; il l'est resté tant que
	 *  seuls 57 Mio partaient. Les produits en pèsent 1,503 Gio.
	 *
	 *  `null` si l'hébergeur a désactivé `disk_free_space`, ce qui arrive sur
	 *  les mutualisés. C'est une lecture : elle ne bloque aucun envoi. */
	disk?: { freeBytes: number | null; totalBytes: number | null }
	readAt: string
}

async function callRelay<T>(
	token: string,
	path: string,
	init?: RequestInit,
): Promise<T> {
	const response = await fetch(path, {
		...init,
		// Le relais Go ne retransmet pas le `no-store` du PHP : une relecture de
		// l'inventaire d'images ne doit jamais reprendre une réponse HTTP périmée.
		cache: 'no-store',
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
		...imageInventoryQueryOptions(pb),
		enabled,
	})
}

/** Même lecture hors composant. La file la prend avant l'export des données
 * pour repérer les logos/photos absents qui doivent suivre les relations. */
export function imageInventoryQueryOptions(pb: {
	authStore: { token: string }
}) {
	return {
		queryKey: ['site-images', 'inventory'],
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
	}
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
 * l'ouverture de l'écran, **et jamais sur tout le catalogue d'un geste**.
 *
 * Ce n'est pas la même prudence que pour les empreintes d'entités, qui ne
 * coûtent que du calcul : ici chaque empreinte suppose de LIRE les octets.
 * 57 Mio pour les 261 marques et catégories ; **1,503 Gio pour les 2412
 * produits publiés** (mesuré le 20 août 2026). Trois garde-fous, et ils sont
 * tous nécessaires :
 *
 *  1. **le cache persistant** (`image-checksum-store.ts`) — la liste ordonnée
 *     des noms locaux est la clé, et elle change dès qu'une image change,
 *     qu'on promeut ou qu'on réordonne. Le second passage est donc gratuit ;
 *  2. **le plafond** `MAX_ENTITES_PAR_CALCUL` — ce qui reste à lire après le
 *     cache est borné, et ce qui déborde est DIT, pas tronqué en silence ;
 *  3. **l'annulation** — un calcul long doit pouvoir s'arrêter. Sans elle, la
 *     seule sortie est de fermer l'écran, ce qui perd aussi ce qui a été
 *     calculé.
 *
 * Le calcul suit la SÉLECTION affichée : c'est l'appelant qui passe la liste,
 * filtres compris — et il peut n'en passer QU'UNE. C'est ce que fait la grille
 * du catalogue depuis le 20 août 2026 : vérifier les photos d'un produit ne lit
 * que les octets de ce produit, quelques centaines de kilo-octets, sans rien
 * dire des 2411 autres.
 */
export function useLocalImageChecksums() {
	const digestOf = useDigestCache()
	const [progress, setProgress] = useState({ done: 0, total: 0 })
	const [computing, setComputing] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const stockage = typeof localStorage === 'undefined' ? null : localStorage

	// ── Le cache EST l'index ────────────────────────────────────────────────
	// Il l'est devenu le 20 août 2026, et pas par élégance : un index qui
	// n'aurait que `legacy_id → empreinte` porte DEUX défauts, dont le second
	// est une panne silencieuse.
	//
	//  1. il se remplaçait à chaque calcul. Mesurer un seul produit effaçait
	//     l'état de tous les autres — insupportable dès qu'on veut vérifier
	//     une fiche à la fois, ce que la grille demande maintenant ;
	//  2. surtout, **il pouvait mentir**. Une empreinte mesurée hier reste
	//     valide dans un tel index même si la galerie a changé depuis : la
	//     carte dirait « à jour » pour des images qui ne le sont pas, sans
	//     jamais lever.
	//
	// Le cache, lui, retient l'empreinte AVEC la liste de noms qui l'a
	// produite. Toute lecture passe donc par `empreinteConnue`, qui compare la
	// clé : si la galerie a bougé, la réponse est « non mesurée », jamais une
	// valeur périmée. Le second défaut devient impossible par construction.
	const [cache, setCache] = useState<CacheEmpreintes>(() => lireCache(stockage))

	// `true` demande l'arrêt. Un ref et pas un état : il est lu DANS la boucle,
	// qui ne verrait jamais une valeur d'état figée à son premier tour.
	const arret = useRef(false)

	const cancel = useCallback(() => {
		arret.current = true
	}, [])

	/**
	 * L'empreinte de cette entité SI elle a été mesurée **dans son état
	 * actuel**. `undefined` veut dire « pas mesurée », et c'est un état à
	 * afficher, pas un manque à combler en silence.
	 */
	const lookup = useCallback(
		(entity: ImageBearing): string | undefined =>
			empreinteConnue(cache, entity.legacy_id, imageCacheKey(entity)),
		[cache],
	)

	const compute = useCallback(
		async (entities: ImageBearing[]) => {
			// Copie : muter l'état en place ne redessinerait rien.
			const memoire = new Map(cache)
			arret.current = false
			setComputing(true)
			setError(null)

			// ── 1. Ce que le cache sait déjà, sans lire un octet ──────────────
			const aLire = entities.filter(
				(entity) =>
					empreinteConnue(memoire, entity.legacy_id, imageCacheKey(entity)) ===
					undefined,
			)

			// ── 2. Ce qu'il reste à lire, borné ───────────────────────────────
			// Tronquer en silence donnerait un écran qui dit « à jour » pour des
			// fiches jamais mesurées. On tronque, et on le DIT.
			const debordement = aLire.length > MAX_ENTITES_PAR_CALCUL
			const lot = debordement ? aLire.slice(0, MAX_ENTITES_PAR_CALCUL) : aLire

			setProgress({ done: 0, total: lot.length })

			try {
				// EN SÉRIE, délibérément : des centaines de requêtes simultanées
				// vers PocketBase local ne vont pas plus vite et rendent la
				// progression illisible.
				for (const [position, entity] of lot.entries()) {
					if (arret.current) {
						setError(
							`Calcul interrompu : ${position} fiche(s) sur ${lot.length} mesurée(s).`,
						)
						break
					}

					const digests: string[] = []
					for (const image of entity.images) {
						digests.push(await digestOf(image))
					}

					retenir(
						memoire,
						entity.legacy_id,
						imageCacheKey(entity),
						await imageChecksumOfDigests(digests),
					)
					setProgress({ done: position + 1, total: lot.length })
				}

				if (!arret.current && debordement) {
					setError(
						`${aLire.length} fiches à mesurer, ${MAX_ENTITES_PAR_CALCUL} traitées. Affinez les filtres, ou relancez : ce qui vient d’être mesuré ne sera pas relu.`,
					)
				}
			} catch (cause) {
				// Un échec de lecture ne doit pas faire perdre ce qui a été
				// mesuré avant lui : on garde, et on dit.
				setError(cause instanceof Error ? cause.message : String(cause))
			} finally {
				// Gardé et écrit même après une interruption ou un échec : chaque
				// empreinte retenue est un octet qu'on ne relira pas.
				setCache(memoire)
				ecrireCache(stockage, memoire)
				arret.current = false
				setComputing(false)
			}
		},
		[cache, digestOf, stockage],
	)

	return { lookup, compute, cancel, computing, progress, error }
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

/**
 * Ce qu'un PRODUIT envoie : son image principale au rang 0, puis sa galerie
 * DANS SON ORDRE.
 *
 * L'ordre du tableau `gallery` EST l'ordre des vignettes (CLAUDE.md) ; il
 * devient ici l'ordre des rangs distants, et donc une partie de l'empreinte.
 * Promouvoir (`POST /api/catalog/products/:id/promote-image`) échange `image`
 * et une entrée de `gallery` : la liste change de forme, l'empreinte change.
 * Réordonner la galerie ne change que l'ordre — et l'empreinte change quand
 * même, parce que `imageChecksumOfDigests` hache la liste ORDONNÉE. C'est
 * exactement le risque 2 de la conception, et c'est réglé sans rien ajouter.
 *
 * Un produit sans image principale mais avec une galerie n'existe pas dans la
 * base (mesuré le 20 août 2026 : 0 sur 2999). S'il en apparaissait un, sa
 * galerie remonterait d'un rang plutôt que de laisser un trou au rang 0 : le
 * serveur s'arrête au premier trou de numérotation (`images-sync.php:309`) et
 * n'enverrait alors AUCUNE image, en silence.
 */
export function toProductImageBearing(
	pb: unknown,
	product: CatalogProduct,
): ImageBearing {
	const files = pb as {
		files: { getUrl: (record: unknown, file: string) => string }
	}

	// Le champ fait foi, pas le répertoire de stockage — même règle que pour
	// les marques et les catégories. La règle d'ordre est pure et gardée à
	// part : `image-checksum.ts`, `orderedImageNames`.
	const noms = orderedImageNames(product.image, product.gallery)

	return {
		legacy_id: product.legacy_id,
		name: product.name,
		images: noms.map((filename) => ({
			url: files.files.getUrl(product, filename),
			filename,
		})),
	}
}

/**
 * La CLÉ DE CACHE d'une entité : la liste ordonnée des noms de fichiers
 * locaux.
 *
 * Elle repose sur une propriété de PocketBase déjà exploitée juste au-dessus
 * (`useDigestCache`) : le nom stocké porte un jeton suffixé
 * (`…_PiDxAYvQfC.jpg`) qui CHANGE dès que le fichier change. Deux listes de
 * noms identiques désignent donc les mêmes octets, dans le même ordre — et
 * l'empreinte est la même sans avoir à relire 1,5 Gio.
 *
 * Ce n'est PAS une empreinte de substitution : ce qui part au serveur reste le
 * SHA-1 des SHA-256 des octets. Cette clé décide seulement s'il faut les
 * relire. Un ratage coûte du temps, jamais une valeur fausse.
 */
export function imageCacheKey(entity: ImageBearing): string {
	return entity.images.map((image) => image.filename).join('\n')
}

/**
 * L'empreinte d'UNE entité, **hors React** — pour la file de synchronisation
 * (`frontend/lib/sync/SyncQueueProvider.tsx`), dont la boucle est asynchrone et
 * ne peut donc pas lire un état de composant : `useLocalImageChecksums.lookup`
 * y rendrait toujours la valeur du tour précédent.
 *
 * Même cache persistant, même clé, même calcul : ce n'est pas une seconde
 * implémentation, c'est le même chemin sans l'enrobage d'état. Le cache est
 * relu et réécrit à chaque appel — une entité à la fois, quelques entrées, et
 * c'est ce qui permet à deux appelants concurrents de ne pas s'écraser.
 *
 * Conséquence assumée : un écran déjà monté ne verra cette empreinte qu'au
 * prochain montage, son cache étant chargé une fois. Il en coûte un « non
 * mesurée » affiché, jamais une valeur fausse.
 */
export async function computeEntityImageChecksum(
	entity: ImageBearing,
): Promise<string> {
	const stockage = typeof localStorage === 'undefined' ? null : localStorage
	const cache = lireCache(stockage)
	const cle = imageCacheKey(entity)

	const connue = empreinteConnue(cache, entity.legacy_id, cle)
	if (connue !== undefined) return connue

	const digests: string[] = []
	for (const image of entity.images) {
		const response = await fetch(image.url)
		if (!response.ok) {
			throw new Error(
				`Image illisible (${response.status}) : ${image.filename}`,
			)
		}
		digests.push(await imageDigest(await response.arrayBuffer()))
	}

	const empreinte = await imageChecksumOfDigests(digests)
	retenir(cache, entity.legacy_id, cle, empreinte)
	ecrireCache(stockage, cache)
	return empreinte
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
	/**
	 * Ne pas relire l'inventaire distant après cet envoi.
	 *
	 * Pour UN envoi, l'invalidation est ce qu'on veut : les pastilles suivent.
	 * Pour un LOT — 225 marques d'un geste —, elle déclenche 225 relectures de
	 * l'inventaire du mutualisé, une par entité, sérialisées avec les envois.
	 * Le lot invalide donc UNE FOIS, à la fin, et pose ce drapeau entre-temps.
	 */
	skipInvalidate?: boolean
}

export type SendImagesOutcome = {
	kind: string
	legacy_id: string
	image_checksum: string
	paths: string[]
	/** Ce que le ménage distant a repris — les rangs que la nouvelle liste ne
	 *  désigne plus. Absent des réponses d'un miroir antérieur au 20 août 2026,
	 *  d'où l'optionnel : l'écran ne doit pas afficher « 0 fichier effacé »
	 *  quand la vérité est « ce serveur ne fait pas le ménage ». */
	cleaned?: { files: number; bytes: number }
	mediaBaseUrl: string | null
}

/**
 * Envoie **toutes les images d'une entité, entières** (§4.3). Jamais une image
 * seule : c'est ce qui rend le retrait possible — on ne supprime pas une
 * entité, on réécrit son état.
 *
 * Depuis le 20 août 2026, le serveur fait ensuite le MÉNAGE dans le dossier de
 * l'entité : les rangs que la nouvelle liste ne désigne plus sont effacés. Une
 * galerie qu'on raccourcit ne laisse donc plus de photo inutile derrière elle.
 * C'est le seul geste destructeur du mécanisme, il vient en dernier, et il est
 * rendu dans la réponse (`cleaned`) — un effacement ne se fait pas en silence.
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
		onSuccess: (_outcome, { skipInvalidate }) => {
			// L'inventaire vient de changer : les pastilles doivent suivre. Sauf
			// en lot, où l'appelant invalide une fois à la fin (voir le champ).
			if (skipInvalidate) return
			queryClient.invalidateQueries({ queryKey: ['site-images', 'inventory'] })
		},
	})
}

export { EMPTY_IMAGE_CHECKSUM }
