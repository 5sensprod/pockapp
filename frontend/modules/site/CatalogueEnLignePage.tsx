// frontend/modules/site/CatalogueEnLignePage.tsx
// ═══════════════════════════════════════════════════════════════════════════
// CATALOGUE EN LIGNE — ce qui est destiné au site
// ═══════════════════════════════════════════════════════════════════════════
// Montre le catalogue **PocketBase** filtré par la règle de publication, et
// autrement qu'en table : un arbre pour la structure, des cards pour ce que le
// visiteur verra. Voir `lib/online-catalog.ts` pour la règle, qui est dérivée
// et non saisie.
//
// L'écran EXPORTE vers la base SQL du site (contrat : PocketSite-docs/
// 12-contrat-catalogue.md) et ÉDITE les textes que le visiteur lira.
//
// ── L'ÉDITION, ET SA CONTRAINTE ─────────────────────────────────────────────
// Révisée le 19 août 2026 (docs/DECISIONS.md) : le `name` canonique du produit
// se modifie manuellement ou avec son icône IA dédiée ; l'assistant de fiche ne
// modifie que la `description`. Ni prix, ni stock, ni statut : ils appartiennent
// à AppStock.
//
// ⚠️ CES SAISIES NE SURVIVENT PAS À `catalog-import -load`, qui purge les
// collections (backend/catalog/load/loader.go:290). Ce n'est pas un défaut à
// contourner : la campagne éditoriale réelle se fera APRÈS l'import définitif,
// et ce qui est saisi d'ici là est un essai dont la perte est acceptée d'avance.
// L'éditeur le dit à l'écran, il ne se contente pas de le savoir.
//
// La voie d'écriture est unique et nommée : `hooks/use-catalog-editorial.ts`.
// Elle ne passe pas par `useUpdateProductUniversal`.
// ═══════════════════════════════════════════════════════════════════════════

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toggle } from '@/components/ui/toggle'
import {
	type CatalogBrand,
	type CatalogCategory,
	type CatalogProduct,
	useCatalogBrands,
	useCatalogCategories,
	useProductCount,
	usePublishedProducts,
	useUnpublishedProducts,
} from '@/lib/queries/site-catalog'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useQueryClient } from '@tanstack/react-query'
import {
	AlertTriangle,
	Globe,
	Pencil,
	RefreshCw,
	Search,
	X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useSyncQueue } from '@/lib/sync/sync-queue-context'
import { CatalogSyncBar } from './components/online-catalog/CatalogSyncBar'
import {
	EditorialDialog,
	type EditorialTarget,
} from './components/online-catalog/EditorialDialog'
import {
	type ImageRow,
	ImageSyncPanel,
} from './components/online-catalog/ImageSyncPanel'
import { OnlineBrandGrid } from './components/online-catalog/OnlineBrandGrid'
import { OnlineCategoryTree } from './components/online-catalog/OnlineCategoryTree'
import { OnlineProductGrid } from './components/online-catalog/OnlineProductGrid'
import {
	useCatalogInventory,
	useProductChecksums,
	useRelationChecksums,
} from './hooks/use-catalog-sync'
import {
	toImageBearing,
	toProductImageBearing,
	useImageInventory,
	useLocalImageChecksums,
	useSendEntityImages,
} from './hooks/use-image-sync'
import { type SyncState, syncStateOf } from './lib/catalog-export'
import { exportBlocker } from './lib/export-selection'
import {
	type OnlineCategoryNode,
	buildOnlineCatalog,
	collectSubtreeProducts,
} from './lib/online-catalog'

/**
 * Tableaux vides PARTAGÉS, et non des `[]` créés à la volée.
 *
 * `data ?? []` fabrique un nouveau tableau à chaque rendu : passé en dépendance
 * d'un hook qui calcule puis pose un état, cela reboucle indéfiniment et la
 * page ne s'affiche jamais. Une constante de module a une identité stable.
 */
/**
 * L'entité est-elle dans la base SQL du site ?
 *
 * C'est la question qui précède toutes les autres pour les images : elles sont
 * un ÉTAT de la ligne, pas une entité à part, et le miroir refuse en 409 sans
 * elle. **Toutes les catégories n'y sont pas** — une catégorie ne part qu'avec
 * le premier produit qui la cite, règle écrite plus bas dans ce fichier, 464
 * en local pour 199 portant au moins un produit (mesuré le 19 août 2026).
 *
 * `undefined` quand l'inventaire d'entités n'a pas été lu : on ne sait pas, et
 * ne pas savoir n'est pas savoir que non — on laisse alors passer, et c'est le
 * serveur qui tranche.
 */
function onLigne(
	legacyId: string,
	inventory: Record<string, string> | undefined,
): boolean | undefined {
	return inventory === undefined ? undefined : legacyId in inventory
}

const NO_PRODUCTS: CatalogProduct[] = []
const NO_CATEGORIES: CatalogCategory[] = []
const NO_BRANDS: CatalogBrand[] = []

export function CatalogueEnLignePage() {
	// Les cinq lectures démarrent dès la navigation. Le contenu lourd, lui, ne
	// monte qu'après qu'un premier cadre a réellement eu le temps d'être peint.
	// Sur cache chaud, `OnlineProductGrid` peut recevoir plus de 2 400 produits :
	// sans cette frontière, React construit toutes leurs cartes avant son premier
	// commit et peut laisser l'écran précédent visible pendant ce travail.
	const products = usePublishedProducts()
	const unpublished = useUnpublishedProducts()
	const categories = useCatalogCategories()
	const brands = useCatalogBrands()
	const totalProducts = useProductCount()
	const [contentReady, setContentReady] = useState(false)

	useEffect(() => {
		let secondFrame = 0
		const firstFrame = window.requestAnimationFrame(() => {
			secondFrame = window.requestAnimationFrame(() => setContentReady(true))
		})
		return () => {
			window.cancelAnimationFrame(firstFrame)
			if (secondFrame) window.cancelAnimationFrame(secondFrame)
		}
	}, [])

	if (!contentReady) {
		return (
			<div className='container mx-auto px-6 py-8'>
				<CatalogueHeader />
				<CatalogueLoadingState />
			</div>
		)
	}

	return (
		<CatalogueEnLigneContent
			products={products}
			unpublished={unpublished}
			categories={categories}
			brands={brands}
			totalProducts={totalProducts}
		/>
	)
}

type CatalogueEnLigneContentProps = {
	products: ReturnType<typeof usePublishedProducts>
	unpublished: ReturnType<typeof useUnpublishedProducts>
	categories: ReturnType<typeof useCatalogCategories>
	brands: ReturnType<typeof useCatalogBrands>
	totalProducts: ReturnType<typeof useProductCount>
}

function CatalogueEnLigneContent({
	products,
	unpublished,
	categories,
	brands,
	totalProducts,
}: CatalogueEnLigneContentProps) {
	// `pb` ne sert qu'à résoudre les URL des images : elles sont des CHAMPS
	// FICHIER PocketBase, pas des URL, et `pb.files.getUrl` a besoin de
	// l'enregistrement entier (`catalog-image.ts`).
	const pb = usePocketBase()
	/** Les brouillons. Ils ne s'affichent nulle part sur cet écran : ils ne
	 *  servent qu'à repérer ceux qui sont ENCORE en ligne, pour pouvoir les en
	 *  retirer (21 août 2026). Voir `depubliesEnLigne` plus bas. */

	const [search, setSearch] = useState('')
	const [onlyModified, setOnlyModified] = useState(false)
	const [selectedCategory, setSelectedCategory] =
		useState<OnlineCategoryNode | null>(null)
	const [selectedBrand, setSelectedBrand] = useState<CatalogBrand | null>(null)
	const [expanded, setExpanded] = useState<Set<string>>(new Set())
	/** La fiche en cours d'édition, quel que soit son genre. `null` : dialogue
	 *  fermé. Un seul état pour les trois, l'éditeur étant le même. */
	const [editing, setEditing] = useState<EditorialTarget | null>(null)
	/**
	 * PocketBase répond par une liste vide (et non une erreur) quand la règle de
	 * lecture n'est momentanément pas satisfaite. React Query garderait alors ce
	 * faux résultat pendant cinq minutes. Si les produits prouvent que des
	 * relations existent, on accorde une seule seconde lecture aux collections.
	 */
	const relationRetryAttempted = useRef(false)
	useEffect(() => {
		if (
			relationRetryAttempted.current ||
			!products.data?.length ||
			categories.isFetching ||
			brands.isFetching
		) {
			return
		}

		const categoriesExpected = products.data.some(
			(product) => (product.categories?.length ?? 0) > 0,
		)
		const brandsExpected = products.data.some((product) =>
			Boolean(product.brand),
		)
		const categoriesMissing =
			categoriesExpected && (categories.data?.length ?? 0) === 0
		const brandsMissing = brandsExpected && (brands.data?.length ?? 0) === 0

		if (!categoriesMissing && !brandsMissing) return

		relationRetryAttempted.current = true
		const retries: Promise<unknown>[] = []
		if (categoriesMissing) retries.push(categories.refetch())
		if (brandsMissing) retries.push(brands.refetch())
		void Promise.all(retries)
	}, [
		products.data,
		categories.data,
		categories.isFetching,
		categories.refetch,
		brands.data,
		brands.isFetching,
		brands.refetch,
	])

	// La recherche filtre les produits AVANT la dérivation : l'arbre montre
	// alors les seules branches qui portent un résultat, ce qui est l'intérêt —
	// une table donnerait la liste, pas l'endroit où elle se trouve.
	const filteredProducts = useMemo(() => {
		const all = products.data ?? []
		const q = search.trim().toLowerCase()
		if (!q) return all
		return all.filter(
			(p) =>
				p.name.toLowerCase().includes(q) ||
				p.sku?.toLowerCase().includes(q) ||
				p.designation?.toLowerCase().includes(q),
		)
	}, [products.data, search])

	const brandsById = useMemo(
		() => new Map((brands.data ?? []).map((b) => [b.id, b])),
		[brands.data],
	)
	// ── Synchronisation ──────────────────────────────────────────────────────
	// L'inventaire n'est interrogé qu'une fois le catalogue lu : sans produits
	// à confronter, il n'apprendrait rien.
	const inventory = useCatalogInventory((products.data?.length ?? 0) > 0)
	// ── LA SYNCHRO N'APPARTIENT PLUS À CET ÉCRAN ────────────────────────────
	// Elle vit dans `SyncQueueProvider` (frontend/lib/sync/), monté dans
	// `main.tsx` à côté du temps réel. Cet écran la DÉCLENCHE et l'AFFICHE ; il
	// ne la porte plus, sans quoi la quitter démonte la boucle de lots et sa
	// progression (26 août 2026).
	const sync = useSyncQueue()
	const exporting = sync.etat.phase !== 'idle'

	/**
	 * ── LES DÉPUBLIÉS QUI SONT ENCORE EN LIGNE ───────────────────────────────
	 *
	 * Un produit repassé en brouillon sort de `usePublishedProducts`, donc de
	 * l'écran, donc des compteurs — pendant que sa ligne SQL garde `published`
	 * et que le site continue de le servir. C'est le trou constaté le 21 août
	 * 2026 sur une guitare Iberia C5 : « 2564 sur le site, 2563 à jour », et
	 * aucun bouton pour rattraper l'écart.
	 *
	 * On ne retient QUE ceux que l'inventaire distant connaît : les autres n'ont
	 * jamais été exportés et n'ont rien à retirer. Ce filtre borne aussi le
	 * calcul d'empreintes ci-dessous à une poignée de fiches au lieu des 436
	 * brouillons.
	 */
	const depubliesEnLigne = useMemo(() => {
		const online = inventory.data?.products
		if (!online) return NO_PRODUCTS
		return (unpublished.data ?? []).filter((p) => p.legacy_id in online)
	}, [inventory.data, unpublished.data])

	/** Les fiches dont on veut l'empreinte : les publiées, plus les dépubliées
	 *  encore en ligne — sans empreinte, on ne saurait pas dire si le retrait a
	 *  déjà été envoyé. Tableau stable, sinon `useProductChecksums` boucle. */
	const empreintables = useMemo(
		() =>
			depubliesEnLigne.length === 0
				? (products.data ?? NO_PRODUCTS)
				: [...(products.data ?? NO_PRODUCTS), ...depubliesEnLigne],
		[products.data, depubliesEnLigne],
	)

	const checksums = useProductChecksums(
		empreintables,
		categories.data ?? NO_CATEGORIES,
		brands.data ?? NO_BRANDS,
		Boolean(inventory.data),
	)

	/**
	 * Ce qu'il reste à RETIRER : dépublié ici, et pas encore dépublié là-bas.
	 *
	 * Le test est l'empreinte, pas un drapeau : `status` en fait partie, donc
	 * une fiche passée en brouillon est `modified` tant que le retrait n'est pas
	 * parti, et `synced` une fois qu'il l'est. Le compteur retombe seul à zéro,
	 * sans que rien n'ait à mémoriser l'opération.
	 *
	 * Le serveur n'EFFACE jamais la ligne : elle garde ses images, ses
	 * rattachements et son `first_seen_at`. Republier remet la fiche en ligne
	 * telle quelle.
	 */
	const retirables = useMemo(
		() =>
			depubliesEnLigne.filter(
				(p) =>
					syncStateOf(
						p.legacy_id,
						checksums.get(p.legacy_id),
						inventory.data?.products,
					) !== 'synced',
			),
		[depubliesEnLigne, checksums, inventory.data],
	)

	const syncStates = useMemo(() => {
		const map = new Map<string, SyncState>()
		if (!inventory.data) return map
		for (const product of products.data ?? []) {
			map.set(
				product.legacy_id,
				syncStateOf(
					product.legacy_id,
					checksums.get(product.legacy_id),
					inventory.data.products,
				),
			)
		}
		return map
	}, [inventory.data, products.data, checksums])

	// Le filtre « à mettre à jour » porte uniquement sur les produits déjà
	// présents sur le site dont l'empreinte a changé. Les produits jamais
	// exportés gardent leur état distinct et restent accessibles dans la vue
	// complète.
	const visibleProducts = useMemo(() => {
		if (!onlyModified || !inventory.data) return filteredProducts
		return filteredProducts.filter(
			(product) => syncStates.get(product.legacy_id) === 'modified',
		)
	}, [filteredProducts, inventory.data, onlyModified, syncStates])

	// La dérivation vient APRÈS tous les filtres produit : l'arbre et la grille
	// montrent ainsi les mêmes branches, marques et décomptes.
	const catalog = useMemo(
		() =>
			buildOnlineCatalog(
				visibleProducts,
				categories.data ?? [],
				brands.data ?? [],
			),
		[visibleProducts, categories.data, brands.data],
	)

	// Ce qui s'affiche à droite : la sélection de catégorie d'abord, celle de
	// marque ensuite, et à défaut tout ce qui part vers le site.
	const shownProducts = useMemo(() => {
		let list = selectedCategory
			? collectSubtreeProducts(selectedCategory, catalog.productsByCategory)
			: visibleProducts
		if (selectedBrand) list = list.filter((p) => p.brand === selectedBrand.id)
		return list
	}, [selectedCategory, selectedBrand, catalog, visibleProducts])

	// ── État des catégories et des marques ───────────────────────────────────
	// Décision du 13 août 2026 : l'export reste explicite, mais une retouche de
	// texte isolée doit se VOIR. Sans cela, on modifie la description d'une
	// catégorie et rien ne dit qu'elle n'est pas partie.
	const relationChecksums = useRelationChecksums(
		categories.data ?? NO_CATEGORIES,
		brands.data ?? NO_BRANDS,
		Boolean(inventory.data),
	)

	/** Les catégories et marques EN LIGNE dont l'empreinte diffère de celle du
	 *  site. Restreint à ce qui est en ligne : une catégorie que le site ne
	 *  connaît pas n'est pas « modifiée », elle est absente — et elle partira
	 *  d'elle-même avec le premier produit qui la cite. */
	const staleRelations = useMemo(() => {
		if (!inventory.data) {
			return {
				categories: [] as CatalogCategory[],
				brands: [] as CatalogBrand[],
			}
		}

		const staleCategories = (categories.data ?? []).filter(
			(category) =>
				catalog.onlineCategoryIds.has(category.id) &&
				syncStateOf(
					category.legacy_id,
					relationChecksums.categories.get(category.legacy_id),
					inventory.data?.categories,
				) === 'modified',
		)

		const onlineBrandIds = new Set(catalog.brands.map((b) => b.brand.id))
		const staleBrands = (brands.data ?? []).filter(
			(brand) =>
				onlineBrandIds.has(brand.id) &&
				syncStateOf(
					brand.legacy_id,
					relationChecksums.brands.get(brand.legacy_id),
					inventory.data?.brands,
				) === 'modified',
		)

		return { categories: staleCategories, brands: staleBrands }
	}, [inventory.data, categories.data, brands.data, catalog, relationChecksums])

	// ── Le miroir des images ────────────────────────────────────────────────
	// Marques, catégories ET produits depuis le 20 août 2026. Les deux
	// premières portent un champ `image` scalaire ; les produits apportent la
	// LISTE ORDONNÉE — `image` au rang 0, `gallery` derrière, dans son ordre —
	// et l'ÉCHELLE : 2412 fiches publiées, 4132 fichiers, 1,503 Gio.
	//
	// D'où la règle de cet écran : **les produits qui entrent ici sont ceux de
	// la SÉLECTION affichée**, filtres compris, pas les 2412. Comparer coûte de
	// lire les octets ; un geste dont on ne peut pas estimer le coût n'est pas
	// un geste, c'est un piège.
	//
	// L'inventaire d'images est DISTINCT de celui des entités : le checksum
	// d'entité ne couvre aucun champ image, un export incrémental fondé sur lui
	// ne verrait jamais un changement d'image (§4.2).
	const imageInventory = useImageInventory(
		(brands.data?.length ?? 0) > 0 || (categories.data?.length ?? 0) > 0,
	)
	const localImageChecksums = useLocalImageChecksums()
	const sendImages = useSendEntityImages()
	const queryClient = useQueryClient()
	const [sendingImages, setSendingImages] = useState<string | null>(null)
	/** Le produit dont on lit les octets, s'il y en a un. Distinct de
	 *  `sendingImages` : lire et envoyer sont deux temps, et la carte doit
	 *  montrer les deux. */
	const [checkingImages, setCheckingImages] = useState<string | null>(null)

	/** Les fiches qui PORTENT une image. Le champ `image` fait foi, pas le
	 *  répertoire de stockage : une catégorie a déjà perdu son image en laissant
	 *  son dossier derrière elle (mesuré le 19 août 2026). */
	const imageRows = useMemo<ImageRow[]>(() => {
		const rows: ImageRow[] = []

		for (const brand of brands.data ?? []) {
			if (!brand.image) continue
			const entity = toImageBearing(pb, brand)
			const checksum = localImageChecksums.lookup(entity)
			rows.push({
				kind: 'brands',
				entity,
				checksum,
				online: onLigne(brand.legacy_id, inventory.data?.brands),
				state: syncStateOf(
					brand.legacy_id,
					checksum,
					imageInventory.data?.brands,
				),
			})
		}

		for (const category of categories.data ?? []) {
			if (!category.image) continue
			const entity = toImageBearing(pb, category)
			const checksum = localImageChecksums.lookup(entity)
			rows.push({
				kind: 'categories',
				entity,
				checksum,
				online: onLigne(category.legacy_id, inventory.data?.categories),
				state: syncStateOf(
					category.legacy_id,
					checksum,
					imageInventory.data?.categories,
				),
			})
		}

		// Les produits de la SÉLECTION, et eux seuls. `shownProducts` vient de
		// `usePublishedProducts` : les 436 brouillons n'y sont jamais, ce qui
		// est la seule bonne façon de les écarter — le miroir répondrait 409
		// « Entité inconnue de la base du site », et l'utilisateur croirait à
		// une panne.
		//
		// `image` OU `gallery` : un produit sans principale mais avec une
		// galerie n'existe pas dans la base (0 sur 2999, mesuré le 20 août
		// 2026). Tester les deux ne coûte rien et ne suppose rien.
		for (const product of shownProducts) {
			if (!product.image && !(product.gallery?.length ?? 0)) continue
			const entity = toProductImageBearing(pb, product)
			const checksum = localImageChecksums.lookup(entity)
			rows.push({
				kind: 'products',
				entity,
				checksum,
				online: onLigne(product.legacy_id, inventory.data?.products),
				state: syncStateOf(
					product.legacy_id,
					checksum,
					imageInventory.data?.products,
				),
			})
		}

		return rows
	}, [
		brands.data,
		categories.data,
		shownProducts,
		imageInventory.data,
		inventory.data,
		localImageChecksums.lookup,
		pb,
	])

	const sendEntityImages = useCallback(
		(row: ImageRow) => {
			if (row.checksum === undefined) return
			const cle = `${row.kind}/${row.entity.legacy_id}`
			setSendingImages(cle)
			sendImages.mutate(
				{ kind: row.kind, entity: row.entity, imageChecksum: row.checksum },
				{
					onSuccess: (outcome) => {
						// Le ménage se DIT. C'est le seul geste du mécanisme qui
						// détruit des octets ; l'annoncer est le minimum.
						const menage = outcome.cleaned?.files
							? `, ${outcome.cleaned.files} devenue(s) inutile(s) effacée(s)`
							: ''
						toast.success(
							`${row.entity.name} : ${outcome.paths.length} image(s) en ligne${menage}`,
						)
					},
					onError: (cause) => toast.error(cause.message),
					onSettled: () => setSendingImages(null),
				},
			)
		},
		[sendImages],
	)

	// ── L'ENVOI EN LOT ──────────────────────────────────────────────────────
	// Une entité après l'autre, jamais autre chose : le mécanisme ne change pas
	// d'un pouce (§4.3, un envoi porte toutes les images d'UNE entité). Le lot
	// n'est qu'une boucle, et c'est délibéré — grouper plusieurs entités dans
	// une requête ferait sauter l'idempotence par entité et le plafond de corps.
	//
	// Trois garde-fous, et chacun répond à une panne concrète :
	//
	//  1. **un échec n'arrête pas le lot.** Une marque illisible ne doit pas
	//     empêcher les 224 autres de partir ;
	//  2. **mais trois échecs de SUITE l'arrêtent.** Une clé refusée ou un
	//     hébergeur à bout répond pareil 225 fois : insister n'apprend rien et
	//     martèle le mutualisé ;
	//  3. **l'inventaire n'est relu qu'UNE FOIS, à la fin.** Sans le drapeau
	//     `skipInvalidate`, chaque envoi réussi déclencherait une relecture de
	//     l'inventaire distant — 225 allers-retours pour rien.
	const [bulkProgress, setBulkProgress] = useState<{
		done: number
		total: number
	} | null>(null)
	const bulkStop = useRef(false)

	const cancelSendAll = useCallback(() => {
		bulkStop.current = true
	}, [])

	const sendAllImages = useCallback(
		async (rows: ImageRow[]) => {
			if (rows.length === 0) return
			bulkStop.current = false
			setBulkProgress({ done: 0, total: rows.length })

			let envoyees = 0
			let echecsDeSuite = 0
			const echecs: string[] = []

			for (const [position, row] of rows.entries()) {
				if (bulkStop.current) break
				// Ne devrait pas arriver — le panneau ne propose que du mesuré —
				// mais on n'envoie jamais une empreinte qu'on n'a pas calculée.
				if (row.checksum === undefined) continue

				setSendingImages(`${row.kind}/${row.entity.legacy_id}`)
				try {
					await sendImages.mutateAsync({
						kind: row.kind,
						entity: row.entity,
						imageChecksum: row.checksum,
						skipInvalidate: true,
					})
					envoyees++
					echecsDeSuite = 0
				} catch (cause) {
					echecsDeSuite++
					echecs.push(
						`${row.entity.name} : ${cause instanceof Error ? cause.message : String(cause)}`,
					)
					if (echecsDeSuite >= 3) {
						toast.error(
							'Trois échecs de suite : le lot s’arrête. Corrigez la cause avant de relancer.',
						)
						break
					}
				}
				setBulkProgress({ done: position + 1, total: rows.length })
			}

			setSendingImages(null)
			setBulkProgress(null)
			bulkStop.current = false

			// L'unique relecture, quoi qu'il soit arrivé : après un arrêt ou un
			// échec, l'état en ligne a quand même changé pour ce qui est parti.
			queryClient.invalidateQueries({ queryKey: ['site-images', 'inventory'] })

			if (envoyees > 0) toast.success(`${envoyees} fiche(s) envoyée(s)`)
			if (echecs.length > 0) {
				// Les trois premiers suffisent à diagnostiquer ; la liste entière
				// ne tient pas dans un toast et n'apprend rien de plus.
				toast.error(
					`${echecs.length} en échec — ${echecs.slice(0, 3).join(' ; ')}`,
				)
			}
			if (envoyees === 0 && echecs.length === 0) {
				toast.info('Lot interrompu, rien n’a été envoyé.')
			}
		},
		[sendImages, queryClient],
	)

	// ── Les photos, produit par produit, depuis la GRILLE ───────────────────
	// L'onglet « Images » mêle 2674 fiches et propose de comparer 4394 images
	// d'un coup : illisible, et hors de proportion quand on veut vérifier une
	// fiche. Ici, l'action porte sur la carte qu'on regarde — même couple
	// « vérifier / mettre à jour » que le texte a déjà.
	//
	// L'état vient de `imageRows`, qui ne porte que la sélection affichée : il
	// n'y a donc rien de plus à dériver, et surtout rien à calculer pour les
	// 2411 autres produits.
	const productImageRows = useMemo(() => {
		const map = new Map<string, ImageRow>()
		for (const row of imageRows) {
			if (row.kind === 'products') map.set(row.entity.legacy_id, row)
		}
		return map
	}, [imageRows])

	/** `undefined` = jamais mesuré. C'est un état, que la carte affiche. */
	const productImageStates = useMemo(() => {
		const map = new Map<string, SyncState | undefined>()
		for (const [legacyId, row] of productImageRows) {
			map.set(legacyId, row.checksum === undefined ? undefined : row.state)
		}
		return map
	}, [productImageRows])

	/** Premier temps : LIRE les octets de ce produit, et de lui seul. */
	const checkProductImages = useCallback(
		(product: CatalogProduct) => {
			const row = productImageRows.get(product.legacy_id)
			if (!row) return
			// Une entité. Le cache persistant fait que revérifier plus tard ne
			// relira rien tant que les images n'ont pas bougé.
			setCheckingImages(product.legacy_id)
			localImageChecksums
				.compute([row.entity])
				.finally(() => setCheckingImages(null))
		},
		[productImageRows, localImageChecksums.compute],
	)

	/** Second temps : ENVOYER. Passe par le même chemin que l'onglet Images —
	 *  il n'y a qu'une façon d'envoyer des images, et c'est celle-là. */
	const sendProductImages = useCallback(
		(product: CatalogProduct) => {
			const row = productImageRows.get(product.legacy_id)
			if (row) sendEntityImages(row)
		},
		[productImageRows, sendEntityImages],
	)

	/** Ce que la grille appelle « occupé ». Elle ne connaît que le
	 *  `legacy_id`, pas la clé `kind/legacy_id` de la mutation d'envoi — et les
	 *  deux temps, lecture et envoi, doivent l'occuper également. */
	const productImagesBusy = useMemo(
		() =>
			checkingImages ??
			(sendingImages?.startsWith('products/')
				? sendingImages.slice('products/'.length)
				: null),
		[checkingImages, sendingImages],
	)

	/** `retirable` ne sort PAS de `syncStates` : celui-ci ne parle que des
	 *  publiés. Un retrait n'est ni un ajout ni une modification de fiche, et le
	 *  compter avec les « modifiés » masquerait ce qui va se passer sur le
	 *  site — une page qui disparaît. */
	const syncCounts = useMemo(() => {
		const counts = { absent: 0, modified: 0, synced: 0, retirable: 0 }
		for (const state of syncStates.values()) counts[state]++
		counts.retirable = retirables.length
		return counts
	}, [syncStates, retirables])

	/**
	 * Exporte une sélection de produits **avec leurs dépendances** : la marque
	 * et les catégories qu'ils citent, ancêtres compris. Envoyer un produit
	 * seul laisserait le site avec un rattachement vers une catégorie qu'il ne
	 * connaît pas.
	 */
	const exportProducts = useCallback(
		(selection: CatalogProduct[], label?: string) => {
			// ⚠️ GARDE-FOU, ajouté après un export qui a écrit `brand = NULL` :
			// sans catégories ni marques chargées, les index `id → legacy_id` sont
			// vides et les produits partent sans aucun rattachement. Le détail est
			// dans `exportBlocker`, partagé avec la file.
			const blocage = exportBlocker(
				selection,
				categories.data ?? [],
				brands.data ?? [],
			)
			if (blocage) {
				toast.error(blocage)
				return
			}

			// La fermeture des dépendances (marque, catégories et leurs ancêtres)
			// est faite par la file, à partir des mêmes listes : elle la refait
			// juste avant d'envoyer, sur des données fraîches.
			sync.enqueue({
				label: label ?? `${selection.length} produit(s)`,
				productIds: selection.map((p) => p.id),
				relationImages: true,
				donnees: true,
				images: false,
			})
		},
		[categories.data, brands.data, sync],
	)

	// ── Ouverture de l'éditeur ───────────────────────────────────────────────
	// La fiche est relue dans les données FRAÎCHES au moment du clic, jamais
	// prise dans l'objet que le composant porte : `selectedCategory` est un nœud
	// d'arbre figé dans un état React, et rouvrir l'éditeur après une première
	// modification y montrerait le texte d'avant.
	const editCategory = useCallback(
		(id: string) => {
			const fresh = (categories.data ?? []).find((c) => c.id === id)
			if (!fresh) return
			setEditing({
				kind: 'category',
				id: fresh.id,
				name: fresh.name,
				description: fresh.description,
			})
		},
		[categories.data],
	)

	const editBrand = useCallback(
		(brand: CatalogBrand) => {
			const fresh = brandsById.get(brand.id) ?? brand
			setEditing({
				kind: 'brand',
				id: fresh.id,
				name: fresh.name,
				description: fresh.description,
			})
		},
		[brandsById],
	)

	const toggle = (id: string) =>
		setExpanded((prev) => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})

	const isLoading =
		products.isLoading || categories.isLoading || brands.isLoading
	const error = products.error ?? categories.error ?? brands.error

	return (
		<div className='container mx-auto px-6 py-8'>
			<CatalogueHeader />

			{error && (
				<Card className='mb-6 border-destructive'>
					<CardContent className='flex items-start gap-3 pt-6'>
						<AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-destructive' />
						<div>
							<p className='font-medium'>Lecture du catalogue impossible</p>
							<p className='text-muted-foreground text-sm'>{String(error)}</p>
						</div>
					</CardContent>
				</Card>
			)}

			{isLoading ? (
				<CatalogueLoadingState />
			) : (
				<>
					{/* ── Décomptes ──────────────────────────────────────────────── */}
					<div className='mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4'>
						<Stat
							label='Produits en ligne'
							value={products.data?.length ?? 0}
							hint={
								totalProducts.isLoading
									? 'Lecture du total…'
									: typeof totalProducts.data === 'number'
										? `sur ${totalProducts.data} au catalogue`
										: undefined
							}
						/>
						<Stat
							label='Catégories en ligne'
							value={catalog.onlineCategoryIds.size}
							hint={`sur ${categories.data?.length ?? 0}`}
						/>
						<Stat
							label='Marques en ligne'
							value={catalog.brands.length}
							hint={`sur ${brands.data?.length ?? 0}`}
						/>
						<Stat
							label='Sans catégorie'
							value={catalog.uncategorized.length}
							hint='publiés, sans point d’entrée'
							warn={catalog.uncategorized.length > 0}
						/>
					</div>

					{/* Distinguer la panne du résultat métier. « Aucune catégorie en
				    ligne » est une conclusion ; une collection vide alors que les
				    produits en citent est une PANNE DE LECTURE, et le dire évite de
				    chercher le défaut du mauvais côté. */}
					{!categories.isFetching && !categories.data?.length && (
						<Card className='mb-6 border-destructive'>
							<CardContent className='flex items-start gap-3 pt-6'>
								<AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-destructive' />
								<div>
									<p className='font-medium'>
										Les catégories n'ont pas été lues
									</p>
									<p className='text-muted-foreground text-sm'>
										{categories.error
											? String(categories.error)
											: 'La collection est revenue vide. L’arbre et les rattachements sont donc faux, et l’export est bloqué.'}
									</p>
								</div>
							</CardContent>
						</Card>
					)}

					{!brands.isFetching && !brands.data?.length && (
						<Card className='mb-6 border-destructive'>
							<CardContent className='flex items-start gap-3 pt-6'>
								<AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-destructive' />
								<div>
									<p className='font-medium'>Les marques n'ont pas été lues</p>
									<p className='text-muted-foreground text-sm'>
										{brands.error
											? String(brands.error)
											: 'La collection est revenue vide. Les produits partiraient sans marque : l’export est bloqué.'}
									</p>
								</div>
							</CardContent>
						</Card>
					)}

					{catalog.missingCategoryIds.length > 0 && (
						<Card className='mb-6 border-amber-500/50'>
							<CardContent className='flex items-start gap-3 pt-6'>
								<AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-amber-500' />
								<div className='text-sm'>
									<p className='font-medium'>
										{catalog.missingCategoryIds.length} catégorie(s) citée(s)
										par un produit mais absente(s) de la collection
									</p>
									<p className='text-muted-foreground'>
										Constat, pas correction : à remonter avant l’export.
									</p>
								</div>
							</CardContent>
						</Card>
					)}

					<CatalogSyncBar
						available={Boolean(inventory.data)}
						loading={inventory.isFetching}
						error={(inventory.error as Error | null) ?? null}
						counts={syncCounts}
						remoteCount={inventory.data?.counts.products ?? null}
						exporting={exporting}
						progress={sync.etat.donnees}
						rejected={sync.etat.rejets}
						onRefresh={() => inventory.refetch()}
						onExportAll={() =>
							// Les retraits partent avec le reste, dans les mêmes lots : le
							// serveur écrit `status` sans l'interpréter, une fiche
							// dépubliée n'est qu'une fiche de plus dans le lot.
							exportProducts([
								...(products.data ?? []).filter(
									(p) => syncStates.get(p.legacy_id) !== 'synced',
								),
								...retirables,
							])
						}
					/>

					{/* Les retouches de texte isolées : elles ne partent QUE si on le
					    demande, mais elles ne doivent pas se taire (docs/DECISIONS.md,
					    2026-08-13). Une modification qui accompagne un produit, elle,
					    part déjà toute seule avec lui. */}
					{(staleRelations.categories.length > 0 ||
						staleRelations.brands.length > 0) && (
						<Card className='mb-6 border-amber-500/50'>
							<CardContent className='flex flex-wrap items-center justify-between gap-3 pt-6'>
								<div className='text-sm'>
									<p className='font-medium'>
										{staleRelations.categories.length} catégorie(s) et{' '}
										{staleRelations.brands.length} marque(s) modifiées depuis
										leur dernier envoi
									</p>
									<p className='text-muted-foreground'>
										Leur texte a changé ici, pas encore sur le site. Les
										produits, eux, ne sont pas concernés.
									</p>
								</div>
								<Button
									variant='secondary'
									disabled={exporting}
									onClick={() =>
										sync.enqueue({
											label: 'Textes des catégories et marques',
											productIds: [],
											categoryIds: staleRelations.categories.map((c) => c.id),
											brandIds: staleRelations.brands.map((b) => b.id),
											donnees: true,
											images: false,
										})
									}
								>
									<RefreshCw className='mr-1.5 h-4 w-4' />
									Envoyer ces textes
								</Button>
							</CardContent>
						</Card>
					)}

					{sync.etat.echecs.length > 0 && (
						<Card className='mb-6 border-destructive'>
							<CardContent className='flex items-start gap-3 pt-6'>
								<AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-destructive' />
								<div>
									<p className='font-medium'>Export interrompu</p>
									<p className='text-muted-foreground text-sm'>
										{sync.etat.echecs.join(' ; ')}
									</p>
									<p className='mt-1 text-muted-foreground text-xs'>
										Les lots déjà écrits le restent. L’opération est idempotente
										: relancer la synchronisation reprend l’ensemble sans rien
										dupliquer.
									</p>
								</div>
							</CardContent>
						</Card>
					)}

					{/* ── Filtres produit ───────────────────────────────────────── */}
					<div className='mb-4 flex flex-col gap-2 sm:flex-row'>
						<div className='relative flex-1'>
							<Search className='-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground' />
							<Input
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder='Rechercher un produit en ligne (nom, référence)…'
								className='pl-9'
							/>
						</div>
						<Toggle
							variant='outline'
							pressed={onlyModified}
							onPressedChange={setOnlyModified}
							disabled={!inventory.data}
							aria-label='Afficher uniquement les produits à mettre à jour'
							title={
								inventory.data
									? 'Afficher uniquement les produits modifiés depuis leur dernier export'
									: 'L’état du site doit être disponible pour utiliser ce filtre'
							}
							className='shrink-0'
						>
							<RefreshCw className='h-4 w-4' />À mettre à jour (
							{syncCounts.modified})
						</Toggle>
					</div>

					<Tabs defaultValue='structure'>
						<TabsList>
							<TabsTrigger value='structure'>Arborescence</TabsTrigger>
							<TabsTrigger value='brands'>
								Marques ({catalog.brands.length})
							</TabsTrigger>
							{/* Les images ont leur propre onglet, leur propre inventaire et
							    leur propre empreinte : elles ne voyagent PAS dans le lot
							    d'entités, dont le plafond est 1 Mio quand une seule image de
							    catégorie en pèse 2,7 (§4.4 de la conception). */}
							<TabsTrigger value='images'>
								Images ({imageRows.length})
							</TabsTrigger>
						</TabsList>

						{/* ── Arbre + produits ─────────────────────────────────────── */}
						<TabsContent value='structure' className='mt-4'>
							<div className='grid gap-4 lg:grid-cols-[320px_1fr]'>
								<Card className='h-fit lg:sticky lg:top-4'>
									<CardContent className='max-h-[70vh] overflow-y-auto p-2'>
										<OnlineCategoryTree
											nodes={catalog.tree}
											selectedId={selectedCategory?.category.id ?? null}
											expanded={expanded}
											onSelect={(node) =>
												setSelectedCategory((prev) =>
													prev?.category.id === node.category.id ? null : node,
												)
											}
											onToggle={toggle}
										/>
									</CardContent>
								</Card>

								<div>
									<div className='mb-3 flex flex-wrap items-center gap-2'>
										<span className='font-medium text-sm'>
											{selectedCategory
												? selectedCategory.category.name
												: 'Tout le catalogue en ligne'}
										</span>
										<Badge variant='secondary'>
											{shownProducts.length} produit
											{shownProducts.length > 1 ? 's' : ''}
										</Badge>
										{selectedCategory && (
											<span className='text-muted-foreground text-xs'>
												descendance comprise
											</span>
										)}
										{/* La description d'une catégorie s'édite depuis la
										    catégorie sélectionnée, et non depuis l'arbre : une
										    rangée de crayons dans un arbre de 463 lignes ferait
										    un champ de mines pour le clic de sélection. */}
										{selectedCategory && (
											<button
												type='button'
												onClick={() =>
													editCategory(selectedCategory.category.id)
												}
												className='inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors hover:bg-accent'
												title='Modifier la description affichée sur le site'
											>
												<Pencil className='h-3 w-3' />
												Description
											</button>
										)}
										{/* Le filtre marque se pose dans l'AUTRE onglet. Sans moyen
										    visible de le retirer, il vide la grille sans dire
										    pourquoi — d'où la croix, et non un simple badge. */}
										{selectedBrand && (
											<button
												type='button'
												onClick={() => setSelectedBrand(null)}
												className='inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors hover:bg-accent'
												title='Retirer le filtre de marque'
											>
												{selectedBrand.name}
												<X className='h-3 w-3' />
											</button>
										)}
									</div>

									<OnlineProductGrid
										key={[
											search,
											onlyModified ? 'modified' : 'all',
											selectedCategory?.category.id ?? 'all-categories',
											selectedBrand?.id ?? 'all-brands',
										].join(':')}
										products={shownProducts}
										brandsById={brandsById}
										syncStates={syncStates}
										onExport={(product) =>
											exportProducts([product], product.name)
										}
										exporting={exporting}
										imageStates={productImageStates}
										onCheckImages={checkProductImages}
										onSendImages={sendProductImages}
										imagesBusy={productImagesBusy}
										emptyLabel={
											onlyModified
												? 'Aucun produit à mettre à jour avec ces filtres.'
												: selectedBrand
													? `Aucun produit de la marque ${selectedBrand.name} ici. Retirez le filtre pour voir les ${selectedCategory?.totalCount ?? ''} produits de la branche.`
													: undefined
										}
									/>
								</div>
							</div>
						</TabsContent>

						{/* ── Marques ──────────────────────────────────────────────── */}
						<TabsContent value='brands' className='mt-4'>
							<OnlineBrandGrid
								brands={catalog.brands}
								selectedId={selectedBrand?.id ?? null}
								onSelect={setSelectedBrand}
								onEdit={editBrand}
							/>
						</TabsContent>

						{/* ── Images ───────────────────────────────────────────────── */}
						<TabsContent value='images' className='mt-4'>
							{imageInventory.isFetching && !imageInventory.data ? (
								<Card>
									<CardContent className='space-y-3 pt-6'>
										<div>
											<p className='font-medium'>État des images</p>
											<p className='text-muted-foreground text-sm'>
												Lecture de l’inventaire du miroir…
											</p>
										</div>
										<SkeletonBlock className='h-2 w-full rounded-full' />
										<div className='grid gap-2 sm:grid-cols-3'>
											<SkeletonBlock className='h-16 w-full' />
											<SkeletonBlock className='h-16 w-full' />
											<SkeletonBlock className='h-16 w-full' />
										</div>
									</CardContent>
								</Card>
							) : (
								<ImageSyncPanel
									available={Boolean(imageInventory.data)}
									inventoryError={imageInventory.error as Error | null}
									rows={imageRows}
									computing={localImageChecksums.computing}
									computeProgress={localImageChecksums.progress}
									computeError={localImageChecksums.error}
									onCompute={(visibles) =>
										localImageChecksums.compute(visibles.map((r) => r.entity))
									}
									onCancel={localImageChecksums.cancel}
									onSendAll={sendAllImages}
									sendAllProgress={bulkProgress}
									onCancelSendAll={cancelSendAll}
									disk={imageInventory.data?.disk}
									onRefresh={() => imageInventory.refetch()}
									sending={sendingImages}
									sendError={sendImages.error}
									onSend={sendEntityImages}
								/>
							)}
						</TabsContent>
					</Tabs>

					{catalog.uncategorized.length > 0 && (
						<section className='mt-8'>
							<h2 className='mb-1 font-semibold text-lg'>
								Publiés sans catégorie
							</h2>
							<p className='mb-3 text-muted-foreground text-sm'>
								Ces produits partiraient vers le site sans apparaître dans la
								navigation.
							</p>
							<OnlineProductGrid
								products={catalog.uncategorized}
								brandsById={brandsById}
								syncStates={syncStates}
								onExport={(product) => exportProducts([product], product.name)}
								exporting={exporting}
								imageStates={productImageStates}
								onCheckImages={checkProductImages}
								onSendImages={sendProductImages}
								imagesBusy={productImagesBusy}
							/>
						</section>
					)}

					{/* Les produits ont rejoint leur fiche complète ; ce dialogue reste
					    l'éditeur unique des catégories et des marques. */}
					<EditorialDialog target={editing} onClose={() => setEditing(null)} />
				</>
			)}
		</div>
	)
}

function CatalogueHeader() {
	return (
		<div className='mb-6'>
			<div className='mb-2 flex items-center gap-3'>
				<div className='flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10'>
					<Globe className='h-6 w-6 text-primary' />
				</div>
				<h1 className='font-bold text-3xl'>Catalogue en ligne</h1>
			</div>
			<p className='text-muted-foreground'>
				Ce qui part vers axemusique.shop. Un produit est en ligne si son statut
				est <strong>publié</strong> ; catégories et marques suivent
				automatiquement. Les produits grisés ne sont pas encore dans la base du
				site.
			</p>
		</div>
	)
}

function SkeletonBlock({ className }: { className: string }) {
	return (
		<div
			aria-hidden='true'
			className={`animate-pulse rounded bg-muted ${className}`}
		/>
	)
}

/**
 * Le cadre de l'écran, visible avant les données. Chaque zone garde sa forme
 * finale : décomptes, état du site, filtres, onglets, arbre et cartes.
 */
function CatalogueLoadingState() {
	return (
		<div role='status' aria-live='polite' aria-label='Lecture du catalogue'>
			<div className='mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4'>
				{[
					'Produits en ligne',
					'Catégories en ligne',
					'Marques en ligne',
					'Sans catégorie',
				].map((label) => (
					<Card key={label}>
						<CardContent className='pt-6'>
							<p className='text-muted-foreground text-xs uppercase tracking-wide'>
								{label}
							</p>
							<SkeletonBlock className='mt-2 h-7 w-16' />
							<SkeletonBlock className='mt-2 h-3 w-24' />
						</CardContent>
					</Card>
				))}
			</div>

			<Card className='mb-6'>
				<CardContent className='pt-6'>
					<div className='mb-3 flex items-center justify-between gap-3 text-sm'>
						<div>
							<p className='font-medium'>Catalogue et état du site</p>
							<p className='text-muted-foreground'>
								Préparation des données du catalogue…
							</p>
						</div>
						<SkeletonBlock className='h-8 w-32' />
					</div>
					<SkeletonBlock className='h-2 w-full rounded-full' />
				</CardContent>
			</Card>

			<div className='mb-4 flex flex-col gap-2 sm:flex-row'>
				<SkeletonBlock className='h-10 flex-1' />
				<SkeletonBlock className='h-10 w-44' />
			</div>

			<Tabs defaultValue='structure'>
				<TabsList>
					<TabsTrigger value='structure' disabled>
						Arborescence
					</TabsTrigger>
					<TabsTrigger value='brands' disabled>
						Marques
					</TabsTrigger>
					<TabsTrigger value='images' disabled>
						Images
					</TabsTrigger>
				</TabsList>
				<TabsContent value='structure' className='mt-4'>
					<div className='grid gap-4 lg:grid-cols-[320px_1fr]'>
						<Card className='h-fit'>
							<CardContent className='space-y-3 p-4'>
								{Array.from({ length: 8 }, (_, index) => (
									<SkeletonBlock
										key={index}
										className={`h-5 ${index % 3 === 0 ? 'w-3/4' : 'w-full'}`}
									/>
								))}
							</CardContent>
						</Card>
						<div>
							<SkeletonBlock className='mb-3 h-6 w-52' />
							<div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'>
								{Array.from({ length: 10 }, (_, index) => (
									<SkeletonBlock key={index} className='aspect-[3/4] w-full' />
								))}
							</div>
						</div>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	)
}

function Stat({
	label,
	value,
	hint,
	warn,
}: { label: string; value: number; hint?: string; warn?: boolean }) {
	return (
		<Card>
			<CardContent className='pt-6'>
				<p className='text-muted-foreground text-xs uppercase tracking-wide'>
					{label}
				</p>
				<p
					className={`font-bold text-2xl tabular-nums ${warn ? 'text-amber-500' : ''}`}
				>
					{value}
				</p>
				{hint && <p className='text-muted-foreground text-xs'>{hint}</p>}
			</CardContent>
		</Card>
	)
}
