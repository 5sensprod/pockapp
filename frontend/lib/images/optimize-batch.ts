// frontend/lib/images/optimize-batch.ts
//
// Repasser par l'optimiseur les images DÉJÀ EN BASE d'une liste d'entités.
//
// POURQUOI CE FICHIER EXISTE, ALORS QUE `image-field.tsx:116` DIT LE CONTRAIRE.
// Ce commentaire-là refuse un bouton « tout optimiser » pour une raison chiffrée
// : 2412 produits, 1,5 Gio de ré-envoi. **La raison est l'échelle, pas le
// geste.** Les marques pèsent 19,8 Mo pour 220 images (mesuré le 25 août 2026
// dans `%LOCALAPPDATA%\PocketReact\pb_data`), dont 15,2 Mo en 152 fichiers
// non-WebP jamais passés par l'optimiseur — un logo y atteint 770 Ko. Le lot
// est donc ouvert aux MARQUES et à rien d'autre ; l'appelant fournit sa liste,
// ce fichier ne va la chercher nulle part.
//
// ⚠️ CE QUE ÇA DÉCLENCHE AILLEURS, et ce n'est pas un effet de bord discret :
// `image_checksum` est le SHA-256 des OCTETS
// (`frontend/modules/site/lib/image-checksum.ts`). Toute entité traitée ici
// repartira au prochain export du miroir vers `images-sync.php`. Et comme le
// nom distant est CALCULÉ à partir de l'extension (`CLAUDE.md`, point 7), la
// conversion `.jpg → .webp` change le nom du fichier en ligne : le serveur fait
// le ménage dans le dossier de l'entité et l'ancien rang disparaît. C'est voulu,
// c'est irréversible côté site, et l'écran doit le dire AVANT de lancer.
//
// ── TROIS RÈGLES, et elles viennent toutes d'un risque réel ────────────────
//
//  1. **séquentiel.** Cent `fetch` + cent encodages canvas en parallèle figent
//     l'onglet et n'accélèrent rien : l'encodage WebP est sur le thread
//     principal. Une image à la fois, l'interface reste vivante.
//  2. **un échec n'arrête pas le lot.** Une image manquante sur disque ne doit
//     pas priver les 219 autres de leur optimisation. On compte, on continue,
//     on rend la liste des échecs — un lot qui s'interrompt au 12e sans dire
//     lesquels sont passés est pire qu'un lot qui échoue partout.
//  3. **annulable, et l'annulation est PROPRE.** On vérifie le signal AVANT
//     chaque entité, jamais au milieu d'un enregistrement : couper entre
//     l'envoi et la réponse laisserait un doute sur ce qui a été écrit.
//
// Le composant qui s'en sert : `frontend/modules/stock/components/
// BrandImageOptimizer.tsx`. Aucune dépendance à React ni à PocketBase ici —
// c'est ce qui rend la boucle testable sans navigateur.

/** Une entité à traiter : de quoi la nommer à l'écran et retrouver ses octets. */
export interface BatchImageItem {
	id: string
	/** Affiché dans la progression et dans la liste des échecs. */
	label: string
	/** L'URL servie par PocketBase pour l'image actuelle. */
	url: string
}

/** Ce qu'il advient d'une entité. */
export type BatchOutcome =
	/** Les octets ont été réécrits. */
	| { kind: 'optimise'; item: BatchImageItem; before: number; after: number }
	/** L'optimiseur a rendu l'original : déjà optimale, ou plus lourde en WebP. */
	| { kind: 'inchange'; item: BatchImageItem }
	/** Téléchargement ou enregistrement en échec. Le lot continue (règle 2). */
	| { kind: 'echec'; item: BatchImageItem; raison: string }

export interface BatchReport {
	outcomes: BatchOutcome[]
	/** Octets avant / après, sur les seules entités RÉÉCRITES. */
	octetsAvant: number
	octetsApres: number
	/** Vrai si le signal a coupé le lot avant la fin. */
	interrompu: boolean
}

export interface BatchDeps {
	/** Télécharge les octets actuels. Rend le fichier tel qu'il est en base. */
	fetchFile: (item: BatchImageItem) => Promise<File>
	/** L'optimiseur. Rend `optimized: false` s'il n'y a rien à gagner. */
	optimize: (
		file: File,
	) => Promise<{
		file: File
		optimized: boolean
		originalBytes: number
		bytes: number
	}>
	/** Écrit le fichier optimisé. N'est appelé QUE si `optimized` est vrai. */
	save: (item: BatchImageItem, file: File) => Promise<void>
	/** Après chaque entité, pour la barre de progression. */
	onProgress?: (fait: number, total: number, item: BatchImageItem) => void
	/** Annulation coopérative, vérifiée entre deux entités (règle 3). */
	signal?: { aborted: boolean }
}

export async function optimiserLotImages(
	items: BatchImageItem[],
	deps: BatchDeps,
): Promise<BatchReport> {
	const outcomes: BatchOutcome[] = []
	let octetsAvant = 0
	let octetsApres = 0
	let interrompu = false

	for (const [index, item] of items.entries()) {
		// Règle 3 : on regarde le signal AVANT de commencer l'entité, jamais
		// pendant son enregistrement.
		if (deps.signal?.aborted) {
			interrompu = true
			break
		}

		try {
			const actuel = await deps.fetchFile(item)
			const res = await deps.optimize(actuel)

			if (res.optimized) {
				await deps.save(item, res.file)
				octetsAvant += res.originalBytes
				octetsApres += res.bytes
				outcomes.push({
					kind: 'optimise',
					item,
					before: res.originalBytes,
					after: res.bytes,
				})
			} else {
				// Rien à gagner : on n'écrit PAS. Écrire quand même changerait
				// `image_checksum` pour rien et enverrait l'entité au miroir sans
				// qu'un seul octet ait été économisé.
				outcomes.push({ kind: 'inchange', item })
			}
		} catch (erreur) {
			// Règle 2.
			outcomes.push({
				kind: 'echec',
				item,
				raison: erreur instanceof Error ? erreur.message : String(erreur),
			})
		}

		deps.onProgress?.(index + 1, items.length, item)
	}

	return { outcomes, octetsAvant, octetsApres, interrompu }
}

/** Formate un nombre d'octets pour l'écran. Même barème que `image-field`. */
export function formaterOctets(octets: number): string {
	if (octets < 1024) return `${octets} o`
	if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`
	return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}
