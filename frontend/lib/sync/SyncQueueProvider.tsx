// frontend/lib/sync/SyncQueueProvider.tsx
// ═══════════════════════════════════════════════════════════════════════════
// LA FILE DE SYNCHRONISATION DU CATALOGUE
// ═══════════════════════════════════════════════════════════════════════════
// Écrite le 26 août 2026, pour une raison mesurée : la progression de l'export
// vivait dans un `useState` de `useExportCatalog`, monté une seule fois, dans
// `CatalogueEnLignePage.tsx` — 1227 lignes. Quitter l'écran démontait le
// composant : la boucle de lots continuait en l'air, mais plus personne
// n'affichait ni sa progression ni ses refus. **La synchronisation n'existait
// que tant qu'on regardait la page.**
//
// Trois règles, et aucune n'est cosmétique :
//
//  1. **La file est en mémoire seule.** Pas de `localStorage` : ce sont des
//     données commerciales sur un poste partagé, et la liste `CLES_PERSISTEES`
//     de `main.tsx` est délibérément courte (voir le commentaire là-bas).
//     Fermer l'application perd la file — c'est le prix, et il est assumé :
//     l'opération est idempotente, on relance (§6 du contrat).
//  2. **La file est sérielle.** Un envoi à la fois, comme la boucle de lots
//     qu'elle enveloppe. Deux envois concurrents vers le mutualisé n'apportent
//     rien et rendent la progression illisible.
//  3. **Les deux étapes restent deux étapes.** Les données partent en lots
//     vers `/api/site/catalog/export` (plafond 1 Mio) ; les images entité par
//     entité vers le miroir (multipart, 24 Mio). Deux tuyaux, deux empreintes
//     — le checksum d'entité ne couvre AUCUN champ image, exprès (§4.2). On ne
//     les fond pas.
//
// Et une règle d'écriture : ce fichier n'implémente RIEN de l'export. Il
// appelle `useExportCatalog` et `useSendEntityImages`. Ni le découpage en lots,
// ni le multipart, ni le calcul d'empreinte ne sont réécrits ici.
// ═══════════════════════════════════════════════════════════════════════════

import type {
	CatalogBrand,
	CatalogCategory,
	CatalogProduct,
} from '@/lib/queries/site-catalog'
import {
	catalogBrandsQueryOptions,
	catalogCategoriesQueryOptions,
	catalogProductsQueryOptions,
} from '@/lib/queries/site-catalog'
import { router } from '@/lib/router'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useExportCatalog } from '@/modules/site/hooks/use-catalog-sync'
import {
	computeEntityImageChecksum,
	toImageBearing,
	toProductImageBearing,
	useSendEntityImages,
} from '@/modules/site/hooks/use-image-sync'
import { collectExportInput } from '@/modules/site/lib/export-selection'
import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { SyncQueueContext } from './sync-queue-context'
import {
	ETAT_INITIAL,
	type SyncJob,
	type SyncQueueState,
} from './sync-queue.types'

/** Un seul toast, et il ne change jamais d'identité : c'est ce qui lui permet
 *  d'être mis à jour au fil de l'eau plutôt que de s'empiler. */
const TOAST_ID = 'sync-catalogue'

/** Trois échecs de SUITE arrêtent la phase images — même garde-fou que le lot
 *  de l'écran : une clé refusée ou un hébergeur à bout répond pareil 2412
 *  fois, insister n'apprend rien et martèle le mutualisé. */
const ECHECS_DE_SUITE_MAX = 3

export function SyncQueueProvider({ children }: { children: ReactNode }) {
	const pb = usePocketBase()
	const queryClient = useQueryClient()
	const exportCatalog = useExportCatalog()
	const sendImages = useSendEntityImages()

	const [etat, setEtat] = useState<SyncQueueState>(ETAT_INITIAL)

	// La file et les drapeaux sont des refs, jamais des états : ils sont lus
	// DANS la boucle asynchrone, qui ne verrait qu'une valeur figée à son
	// premier tour. Même raison que `bulkStop` dans l'écran d'origine.
	const file = useRef<SyncJob[]>([])
	const enCours = useRef(false)
	const arret = useRef(false)

	// Les mutations sont recréées à chaque rendu ; la boucle, elle, ne l'est
	// pas. Elle lit donc toujours la dernière version par ces refs.
	const exportRef = useRef(exportCatalog)
	exportRef.current = exportCatalog
	const imagesRef = useRef(sendImages)
	imagesRef.current = sendImages

	const annuler = useCallback(() => {
		arret.current = true
	}, [])

	// ── LE TOAST ──────────────────────────────────────────────────────────────
	// Rendu depuis l'état, pas depuis la boucle : un seul endroit décide de ce
	// qui s'affiche, et il suit la progression des lots
	// (`exportCatalog.progress` est un état du hook, il change pendant la phase
	// `donnees`).
	//
	// `duration: Infinity` tant que la file tourne : il ne doit pas se fermer
	// seul, et il SURVIT À LA NAVIGATION — c'est tout l'objet de ce fichier.
	const donneesProgress = exportCatalog.progress
	useEffect(() => {
		if (etat.phase === 'idle') return

		const reste = etat.enAttente > 0 ? ` (+${etat.enAttente} en attente)` : ''
		const message =
			etat.phase === 'donnees'
				? `Synchronisation — données ${donneesProgress.done}/${donneesProgress.total} lots${reste}`
				: `Synchronisation — images ${etat.images.done}/${etat.images.total}${
						etat.courant ? ` (${etat.courant})` : ''
					}${reste}`

		toast.loading(message, { id: TOAST_ID, duration: Number.POSITIVE_INFINITY })
	}, [etat.phase, etat.images, etat.courant, etat.enAttente, donneesProgress])

	// ── LA BOUCLE ─────────────────────────────────────────────────────────────
	const executer = useCallback(async () => {
		if (enCours.current) return
		enCours.current = true
		arret.current = false

		const bilan = {
			produits: 0,
			categories: 0,
			marques: 0,
			images: 0,
			fichesImages: 0,
			rejets: [] as SyncQueueState['rejets'],
			echecs: [] as string[],
		}

		try {
			while (file.current.length > 0 && !arret.current) {
				const job = file.current.shift()
				if (!job) break

				// Le catalogue vient du MÊME cache que les écrans
				// (`catalog*QueryOptions`) : ouvert, il est déjà là ; fermé, la file
				// le charge elle-même. `fetchQuery` est indispensable ici :
				// `ensureQueryData` rend toute donnée déjà en cache, même invalidée,
				// et `revalidateIfStale` ne ferait qu'une relecture en arrière-plan sans
				// changer l'instantané rendu à cet export. `fetchQuery`, lui, sert le
				// cache frais mais attend la relecture s'il est périmé ou invalidé :
				// sinon les cinq minutes de `staleTime` envoyaient la fiche D'AVANT
				// l'enregistrement (constaté le 26 août 2026).
				//
				// Les deux listes de produits sont nécessaires parce qu'un retrait est
				// un produit dépublié qu'on exporte en `draft` — il n'est jamais dans
				// les publiés (CLAUDE.md, 21 août 2026).
				const [publies, brouillons, categories, marques] = await Promise.all([
					queryClient.fetchQuery(catalogProductsQueryOptions(pb, 'published')),
					queryClient.fetchQuery(
						catalogProductsQueryOptions(pb, 'unpublished'),
					),
					queryClient.fetchQuery(catalogCategoriesQueryOptions(pb)),
					queryClient.fetchQuery(catalogBrandsQueryOptions(pb)),
				])

				const parId = new Map<string, CatalogProduct>()
				for (const p of [...publies, ...brouillons]) parId.set(p.id, p)
				const selection = job.productIds
					.map((id) => parId.get(id))
					.filter((p): p is CatalogProduct => Boolean(p))
				const categoriesSelectionnees = (job.categoryIds ?? [])
					.map((id) =>
						(categories as CatalogCategory[]).find(
							(category) => category.id === id,
						),
					)
					.filter((category): category is CatalogCategory => Boolean(category))

				// ⚠️ UN PRODUIT DEMANDÉ QUI NE SE RÉSOUT PAS EST UNE PANNE, PAS UN
				// CAS NORMAL. Sans cette garde, une sélection vide traversait toute
				// la boucle sans envoyer un octet et finissait sur `toast.dismiss` :
				// la synchronisation semblait avoir eu lieu, et la pastille restait
				// « modifié » sans explication (constaté le 26 août 2026).
				if (selection.length < job.productIds.length) {
					const manquants = job.productIds.length - selection.length
					bilan.echecs.push(
						`${job.label} : ${manquants} produit(s) introuvable(s) dans le catalogue du site — rien envoyé pour eux.`,
					)
				}
				if (categoriesSelectionnees.length < (job.categoryIds?.length ?? 0)) {
					const manquantes =
						(job.categoryIds?.length ?? 0) - categoriesSelectionnees.length
					bilan.echecs.push(
						`${job.label} : ${manquantes} catégorie(s) introuvable(s) dans le catalogue du site — rien envoyé pour elles.`,
					)
				}

				console.info(
					`[sync] « ${job.label} » — ${selection.length}/${job.productIds.length} produit(s) résolu(s), données=${job.donnees}, images=${job.images}`,
				)

				setEtat((e) => ({ ...e, enAttente: file.current.length }))

				// ── Étape 1 : les DONNÉES, en lots ──────────────────────────────
				if (job.donnees) {
					const input = collectExportInput(
						selection,
						categories as CatalogCategory[],
						marques as CatalogBrand[],
					)

					// Les textes demandés POUR EUX-MÊMES s'ajoutent à ceux que les
					// produits ont obligés. Indexés par id, donc jamais en double.
					const parIdCategorie = new Map(input.categories.map((c) => [c.id, c]))
					for (const id of job.categoryIds ?? []) {
						let courant: string | undefined = id
						const visites = new Set<string>()
						while (courant && !visites.has(courant)) {
							visites.add(courant)
							const c = (categories as CatalogCategory[]).find(
								(x) => x.id === courant,
							)
							if (!c) break
							parIdCategorie.set(c.id, c)
							courant = c.parent || undefined
						}
					}
					const parIdMarque = new Map(input.brands.map((b) => [b.id, b]))
					for (const id of job.brandIds ?? []) {
						const b = (marques as CatalogBrand[]).find((x) => x.id === id)
						if (b) parIdMarque.set(b.id, b)
					}

					const aEnvoyer = {
						products: input.products,
						categories: [...parIdCategorie.values()],
						brands: [...parIdMarque.values()],
					}

					if (
						aEnvoyer.products.length > 0 ||
						aEnvoyer.categories.length > 0 ||
						aEnvoyer.brands.length > 0
					) {
						setEtat((e) => ({ ...e, phase: 'donnees', courant: job.label }))
						try {
							const outcome = await exportRef.current.mutateAsync(aEnvoyer)
							bilan.produits += outcome.written.products
							bilan.categories += outcome.written.categories
							bilan.marques += outcome.written.brands
							bilan.rejets.push(...outcome.rejected)
							console.info(
								`[sync] « ${job.label} » — ${outcome.batches} lot(s) envoyé(s), écrits : ${outcome.written.products} produit(s), ${outcome.written.categories} catégorie(s), ${outcome.written.brands} marque(s), ${outcome.rejected.length} refus.`,
							)
						} catch (cause) {
							// Un lot qui échoue interrompt la SUITE et laisse les
							// précédents écrits (§6). On le dit, on passe au travail
							// suivant : c'est la file qu'on ne veut pas perdre.
							bilan.echecs.push(
								`${job.label} : ${cause instanceof Error ? cause.message : String(cause)}`,
							)
						}
					}
				}

				// ── Étape 2 : les IMAGES, entité par entité ─────────────────────
				if (job.images && !arret.current) {
					// Une entité SANS fichier doit elle aussi partir : sa liste vide dit au
					// miroir de retirer l'ancienne image. L'écarter transformerait une
					// suppression locale en photo fantôme sur le site.
					const porteuses = [
						...selection.map((product) => ({
							kind: 'products' as const,
							entity: toProductImageBearing(pb, product),
						})),
						...categoriesSelectionnees.map((category) => ({
							kind: 'categories' as const,
							entity: toImageBearing(pb, category),
						})),
					]

					setEtat((e) => ({
						...e,
						phase: 'images',
						images: { done: 0, total: porteuses.length },
					}))

					let echecsDeSuite = 0
					for (const [position, porteuse] of porteuses.entries()) {
						if (arret.current) break
						const { entity, kind } = porteuse
						setEtat((e) => ({ ...e, courant: entity.name }))

						try {
							// L'empreinte sert à décider ET voyage : la même valeur des
							// deux côtés, sans quoi elles pourraient diverger.
							const checksum = await computeEntityImageChecksum(entity)
							const outcome = await imagesRef.current.mutateAsync({
								kind,
								entity,
								imageChecksum: checksum,
								// Sans ce drapeau, chaque envoi réussi relirait
								// l'inventaire distant : un aller-retour par produit. Une
								// seule relecture, à la fin.
								skipInvalidate: true,
							})
							bilan.images += outcome.paths.length
							bilan.fichesImages++
							echecsDeSuite = 0
						} catch (cause) {
							echecsDeSuite++
							bilan.echecs.push(
								`${entity.name} : ${cause instanceof Error ? cause.message : String(cause)}`,
							)
							if (echecsDeSuite >= ECHECS_DE_SUITE_MAX) {
								bilan.echecs.push(
									'Trois échecs de suite : l’envoi s’arrête. Corrigez la cause avant de relancer.',
								)
								arret.current = true
								break
							}
						}

						setEtat((e) => ({
							...e,
							images: { done: position + 1, total: porteuses.length },
						}))
					}

					// L'unique relecture, quoi qu'il soit arrivé : après un arrêt ou
					// un échec, l'état en ligne a quand même changé pour ce qui est
					// parti.
					queryClient.invalidateQueries({
						queryKey: ['site-images', 'inventory'],
					})
				}
			}
		} catch (cause) {
			// Ce qui casse ICI n'est pas un envoi mais la préparation : lecture du
			// catalogue, résolution de la sélection. Sans ce `catch`, l'erreur
			// s'échappait en promesse non gérée pendant que le bilan concluait
			// comme si tout s'était bien passé (constaté le 26 août 2026 avec
			// l'auto-annulation du SDK PocketBase).
			bilan.echecs.push(
				`Préparation interrompue : ${cause instanceof Error ? cause.message : String(cause)}`,
			)
		} finally {
			const interrompu = arret.current
			// Ce qui reste après un arrêt est abandonné : on ne garde pas une file
			// dont l'utilisateur vient de dire qu'il n'en veut plus.
			if (interrompu) file.current = []

			enCours.current = false
			arret.current = false
			setEtat({ ...ETAT_INITIAL, rejets: bilan.rejets, echecs: bilan.echecs })

			// ── LE BILAN ───────────────────────────────────────────────────────
			// Jamais en silence : un refus ou un échec finit en avertissement, avec
			// de quoi aller voir le détail.
			const resume = [
				bilan.produits > 0 ? `${bilan.produits} produit(s) en ligne` : null,
				bilan.categories > 0
					? `${bilan.categories} catégorie(s) en ligne`
					: null,
				bilan.marques > 0 ? `${bilan.marques} marque(s) en ligne` : null,
				bilan.images > 0 ? `${bilan.images} image(s) envoyée(s)` : null,
				bilan.fichesImages > 0 && bilan.images === 0
					? `${bilan.fichesImages} retrait(s) d’image synchronisé(s)`
					: null,
			]
				.filter(Boolean)
				.join(' · ')

			const action = {
				label: 'Voir',
				onClick: () => router.navigate({ to: '/site/catalogue' }),
			}

			if (bilan.echecs.length > 0 || bilan.rejets.length > 0) {
				const refus =
					bilan.rejets.length > 0 ? `${bilan.rejets.length} refus` : null
				// Les trois premiers échecs suffisent à diagnostiquer ; la liste
				// entière ne tient pas dans un toast et n'apprend rien de plus.
				const echecs =
					bilan.echecs.length > 0 ? bilan.echecs.slice(0, 3).join(' ; ') : null

				toast.warning(
					[resume || 'Synchronisation interrompue', refus, echecs]
						.filter(Boolean)
						.join(' — '),
					{ id: TOAST_ID, duration: 12_000, action },
				)
			} else if (interrompu) {
				toast.info(resume ? `Arrêté — ${resume}` : 'Synchronisation arrêtée.', {
					id: TOAST_ID,
					duration: 6_000,
					action,
				})
			} else if (resume) {
				toast.success(resume, { id: TOAST_ID, duration: 6_000, action })
			} else {
				// Ni écriture, ni refus, ni échec : il ne s'est RIEN passé. Se taire
				// ici — ce que faisait `toast.dismiss` — laisse croire que l'envoi a
				// eu lieu. On le dit, parce qu'un travail empilé qui n'envoie rien
				// est toujours anormal.
				toast.info('Rien n’a été envoyé — il n’y avait rien à mettre à jour.', {
					id: TOAST_ID,
					duration: 6_000,
					action,
				})
			}
		}
	}, [pb, queryClient])

	const enqueue = useCallback(
		(job: SyncJob) => {
			file.current.push(job)
			setEtat((e) => ({ ...e, enAttente: file.current.length }))
			// `void` délibéré : `executer` traite ses erreurs et ne rejette pas.
			void executer()
		},
		[executer],
	)

	// La progression des LOTS reste tenue par `useExportCatalog`, qui la connaît
	// seul. On ne la recopie pas dans l'état de la file — deux sources pour la
	// même valeur finissent par diverger — on la joint à la lecture.
	const etatExpose = { ...etat, donnees: donneesProgress }

	return (
		<SyncQueueContext.Provider
			value={{
				etat: etatExpose,
				actif: etat.phase !== 'idle',
				enqueue,
				annuler,
			}}
		>
			{children}
		</SyncQueueContext.Provider>
	)
}
