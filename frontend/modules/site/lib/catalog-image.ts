// frontend/modules/site/lib/catalog-image.ts
//
// Les images du catalogue sont des CHAMPS FICHIER PocketBase, pas des URL —
// décision du 2026-08-11 : `image.src` de NeDB est un chemin que seul AppServe
// sait servir, et s'affranchir d'AppServe est l'objet de la migration. Les
// 4665 fichiers ont donc été copiés dans le stockage PocketBase.
//
// D'où ce passage obligé par `pb.files.getUrl`, qui a besoin de l'enregistrement
// entier — `collectionId`, `collectionName` et `id` — et pas seulement du nom
// de fichier. C'est pourquoi les requêtes de site-catalog.ts les demandent
// explicitement dans `fields`.

type FileRecord = {
	id: string
	collectionId: string
	collectionName: string
}

type FilesApi = {
	files: { getUrl: (record: unknown, file: string, opts?: unknown) => string }
}

/**
 * URL d'une image de catalogue, ou `null` si l'enregistrement n'en porte pas.
 *
 * `thumb` demande une vignette à PocketBase : afficher 2000 images pleine
 * résolution dans une grille ferait passer des centaines de Mo pour des
 * vignettes de 64 pixels.
 */
export function catalogImageUrl(
	pb: FilesApi,
	record: (FileRecord & { image?: string }) | null | undefined,
	thumb?: string,
): string | null {
	if (!record?.image) return null
	return pb.files.getUrl(record, record.image, thumb ? { thumb } : undefined)
}
