// frontend/lib/sync/SyncAfterSaveDialog.tsx
// ═══════════════════════════════════════════════════════════════════════════
// « CE PRODUIT EST EN LIGNE » — proposer la synchro juste après l'enregistrement
// ═══════════════════════════════════════════════════════════════════════════
// **Pourquoi ici, dans `lib/sync/`, et pas dans `modules/stock/`** : ce
// dialogue ne connaît rien du formulaire produit. Il prend une fiche, regarde
// si le site la connaît, et empile un travail dans la file. La future fiche
// produit en aura besoin telle quelle ; le ranger à côté du fournisseur de
// file, c'est éviter qu'elle importe un composant du module `stock` pour poser
// une question sur le SITE.
//
// Le sens des dépendances reste celui qui est voulu : `stock` importe ce
// fichier, ce fichier importe `site`. `site` n'importe rien de `stock`.
//
// Ce que ce composant ne fait PAS, et c'est délibéré :
//
//  • Il n'envoie rien lui-même. « Synchroniser » appelle `enqueue` et rend la
//    main : c'est le toast persistant qui raconte la suite (voir
//    `SyncQueueProvider.tsx`), pas ce dialogue, qui se ferme aussitôt.
//  • Il ne balaie JAMAIS le catalogue. Calculer une empreinte d'images LIT LES
//    OCTETS — 1,503 Gio pour les 2412 produits publiés, mesuré le 20 août 2026.
//    Ici : une fiche, quelques fichiers, et le même cache persistant que
//    l'écran catalogue (`image-checksum-store.ts`).
//  • Il ne retient aucune préférence : pas de « ne plus demander », rien dans
//    `localStorage`. On veut d'abord voir si la question rassure ou agace.
// ═══════════════════════════════════════════════════════════════════════════

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import type {
	CatalogCategory,
	CatalogProduct,
} from '@/lib/queries/site-catalog'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useCatalogInventory } from '@/modules/site/hooks/use-catalog-sync'
import {
	computeEntityImageChecksum,
	toImageBearing,
	toProductImageBearing,
	useImageInventory,
} from '@/modules/site/hooks/use-image-sync'
import { type ReactNode, useCallback, useEffect, useState } from 'react'

import { useSyncQueue } from './sync-queue-context'

/** L'état du calcul d'empreinte, pour ce seul produit. `inconnu` n'est pas une
 *  erreur : c'est « on n'a pas pu mesurer », et on l'affiche tel quel plutôt
 *  que d'inventer un chiffre. */
type EtatImages =
	| 'calcul'
	| 'a-jour'
	| 'modifiees'
	| 'non-modifiees'
	| 'inconnu'

type CibleSynchro = {
	product: CatalogProduct
	imagesModified: boolean
}

type CibleSynchroCategorie = {
	category: CatalogCategory
	dataModified: boolean
	imageModified: boolean
}

/**
 * Décide s'il y a lieu de demander, et rend le dialogue le cas échéant.
 *
 * `enabled` pilote la lecture de l'inventaire distant : on n'interroge le site
 * que quand le formulaire d'édition est ouvert. C'est la requête de l'écran
 * catalogue, même clé TanStack Query (`['site-catalog', 'inventory']`) — on la
 * relit, on ne la recalcule pas.
 */
export function useSyncAfterSave(enabled: boolean): {
	/** À appeler avec la fiche TELLE QU'ENREGISTRÉE. Rend `true` si la question
	 *  a été posée. */
	proposer: (
		product: CatalogProduct,
		imagesModified?: boolean,
	) => Promise<boolean>
	dialogue: ReactNode
} {
	const inventaire = useCatalogInventory(enabled)
	const [cible, setCible] = useState<CibleSynchro | null>(null)

	const proposer = useCallback(
		async (product: CatalogProduct, imagesModified = false) => {
			let enLigne = inventaire.data?.products

			// ⚠️ « Pas encore arrivé » n'est PAS « pas en ligne ». L'inventaire ne
			// part qu'à l'ouverture du formulaire ; enregistrer vite — ou juste
			// après un démarrage — le trouvait en vol, et la question ne se posait
			// jamais. On l'attend ici, une fois, plutôt que de conclure à tort.
			if (!enLigne) {
				try {
					enLigne = (await inventaire.refetch()).data?.products
				} catch {
					// avalé : le refus se dit juste en dessous, avec sa raison
				}
			}

			// Inventaire indisponible — clé absente, site injoignable : on ne
			// prétend pas connaître l'état du site. Même posture que `CatalogSyncBar`
			// quand elle n'a pas d'inventaire : elle se tait. Mais elle le DIT en
			// console : sans cela, ce silence est indistinguable de « jamais
			// exporté », et c'est ce qui rend la panne indiagnosticable.
			if (!enLigne) {
				console.info(
					'[sync] inventaire du site indisponible : pas de proposition de synchro.',
				)
				return false
			}
			// Jamais exporté : aucune page à mettre à jour, il se publiera par la
			// voie normale. Aucune question.
			if (!(product.legacy_id in enLigne)) {
				console.info(
					`[sync] ${product.legacy_id || '(sans legacy_id)'} inconnu du site : pas de proposition de synchro.`,
				)
				return false
			}

			setCible({ product, imagesModified })
			return true
		},
		[inventaire],
	)

	return {
		proposer,
		dialogue: cible ? (
			<SyncAfterSaveDialog
				product={cible.product}
				imagesModified={cible.imagesModified}
				onClose={() => setCible(null)}
			/>
		) : null,
	}
}

/**
 * Variante catégorie du raccourci après enregistrement.
 *
 * Comme pour les produits, une création n'est jamais proposée : seule une
 * catégorie que l'inventaire distant connaît déjà a une page à rafraîchir.
 * `imageModified` distingue les données du second tuyau, celui du miroir.
 */
export function useCategorySyncAfterSave(enabled: boolean): {
	proposer: (
		category: CatalogCategory,
		changes: { dataModified: boolean; imageModified: boolean },
	) => Promise<boolean>
	dialogue: ReactNode
} {
	const inventaire = useCatalogInventory(enabled)
	const [cible, setCible] = useState<CibleSynchroCategorie | null>(null)

	const proposer = useCallback(
		async (
			category: CatalogCategory,
			changes: { dataModified: boolean; imageModified: boolean },
		) => {
			let enLigne = inventaire.data?.categories

			if (!enLigne) {
				try {
					enLigne = (await inventaire.refetch()).data?.categories
				} catch {
					// Le silence est expliqué juste en dessous, comme pour un produit.
				}
			}

			if (!enLigne) {
				console.info(
					'[sync] inventaire du site indisponible : pas de proposition de synchro de catégorie.',
				)
				return false
			}
			if (!(category.legacy_id in enLigne)) {
				console.info(
					`[sync] catégorie ${category.legacy_id || '(sans legacy_id)'} inconnue du site : pas de proposition de synchro.`,
				)
				return false
			}

			setCible({ category, ...changes })
			return true
		},
		[inventaire],
	)

	return {
		proposer,
		dialogue: cible ? (
			<CategorySyncAfterSaveDialog
				category={cible.category}
				dataModified={cible.dataModified}
				imageModified={cible.imageModified}
				onClose={() => setCible(null)}
			/>
		) : null,
	}
}

export function SyncAfterSaveDialog({
	product,
	imagesModified,
	onClose,
}: {
	product: CatalogProduct
	imagesModified: boolean
	onClose: () => void
}) {
	const pb = usePocketBase()
	const { enqueue } = useSyncQueue()
	const imageInventory = useImageInventory(imagesModified)

	const [donnees, setDonnees] = useState(true)
	const [images, setImages] = useState(false)
	const [etatImages, setEtatImages] = useState<EtatImages>('calcul')

	const nbImages = (product.image ? 1 : 0) + (product.gallery?.length ?? 0)
	const distante = imageInventory.data?.products?.[product.legacy_id]

	// ── L'EMPREINTE, POUR CE SEUL PRODUIT ────────────────────────────────────
	// La case n'est cochée que si les octets d'ici diffèrent de ceux de là-bas :
	// réenvoyer des fichiers identiques ne sert à rien et occupe le mutualisé
	// pour rien. Sans geste image pendant cette édition, elle reste désactivée :
	// enregistrer un prix ou un texte ne doit jamais renvoyer les photos.
	useEffect(() => {
		if (!imagesModified) {
			setEtatImages('non-modifiees')
			setImages(false)
			return
		}
		if (nbImages === 0) {
			setEtatImages('a-jour')
			return
		}
		// Sans l'empreinte distante on ne compare rien : on attend la réponse du
		// miroir plutôt que de conclure « modifiées » par défaut.
		if (imageInventory.isLoading) return

		let vivant = true
		void (async () => {
			try {
				const locale = await computeEntityImageChecksum(
					toProductImageBearing(pb, product),
				)
				if (!vivant) return
				const differe = locale !== distante
				setEtatImages(differe ? 'modifiees' : 'a-jour')
				setImages(differe)
			} catch {
				// Cache froid, lecture lente, fichier illisible : on le dit
				// neutrement et la case reste décochée. Un chiffre inventé serait
				// pire qu'un silence.
				if (vivant) setEtatImages('inconnu')
			}
		})()

		return () => {
			vivant = false
		}
	}, [
		pb,
		product,
		nbImages,
		distante,
		imageInventory.isLoading,
		imagesModified,
	])

	const mentionImages = (() => {
		if (nbImages === 0) return 'aucune image sur cette fiche'
		const compte = `${nbImages} image${nbImages > 1 ? 's' : ''}`
		switch (etatImages) {
			case 'calcul':
				return `${compte} — vérification…`
			case 'modifiees':
				return `${compte} — modifiées depuis le dernier envoi`
			case 'a-jour':
				return `${compte} — déjà à jour en ligne`
			case 'non-modifiees':
				return `${compte} — non modifiées pendant cette édition`
			default:
				return `${compte} — état en ligne non mesuré`
		}
	})()

	const synchroniser = () => {
		enqueue({
			label: product.name,
			productIds: [product.id],
			donnees,
			images,
		})
		// On ne raconte rien de plus : le toast de la file prend le relais, et il
		// survit à la navigation.
		onClose()
	}

	return (
		<Dialog open onOpenChange={(ouvert) => !ouvert && onClose()}>
			<DialogContent className='max-w-md'>
				<DialogHeader>
					<DialogTitle>Ce produit est en ligne.</DialogTitle>
					<DialogDescription>
						Sa page publique affiche encore la version précédente tant que rien
						n'est envoyé.
					</DialogDescription>
				</DialogHeader>

				<div className='space-y-3 py-2'>
					<div className='flex items-start gap-3 text-sm'>
						<Checkbox
							id='sync-apres-enregistrement-donnees'
							checked={donnees}
							onCheckedChange={(valeur) => setDonnees(valeur === true)}
							className='mt-0.5'
						/>
						<label
							htmlFor='sync-apres-enregistrement-donnees'
							className='cursor-pointer'
						>
							Envoyer la fiche
							<span className='block text-muted-foreground text-xs'>
								nom, prix, catégories…
							</span>
						</label>
					</div>

					<div className='flex items-start gap-3 text-sm'>
						<Checkbox
							id='sync-apres-enregistrement-images'
							checked={images}
							onCheckedChange={(valeur) => setImages(valeur === true)}
							disabled={etatImages !== 'modifiees'}
							className='mt-0.5'
						/>
						<label
							htmlFor='sync-apres-enregistrement-images'
							className='cursor-pointer'
						>
							Envoyer les images
							<span className='block text-muted-foreground text-xs'>
								{mentionImages}
							</span>
						</label>
					</div>
				</div>

				<DialogFooter>
					<Button type='button' variant='outline' onClick={onClose}>
						Plus tard
					</Button>
					<Button
						type='button'
						onClick={synchroniser}
						disabled={!donnees && !images}
					>
						Synchroniser
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function CategorySyncAfterSaveDialog({
	category,
	dataModified,
	imageModified,
	onClose,
}: {
	category: CatalogCategory
	dataModified: boolean
	imageModified: boolean
	onClose: () => void
}) {
	const pb = usePocketBase()
	const { enqueue } = useSyncQueue()
	const imageInventory = useImageInventory(imageModified)

	const [donnees, setDonnees] = useState(dataModified)
	const [images, setImages] = useState(false)
	const [etatImages, setEtatImages] = useState<EtatImages>('calcul')

	const aUneImage = Boolean(category.image)
	const distante = imageInventory.data?.categories?.[category.legacy_id]

	useEffect(() => {
		if (!imageModified) {
			setEtatImages('non-modifiees')
			setImages(false)
			return
		}
		if (imageInventory.isLoading) return

		let vivant = true
		void (async () => {
			try {
				// Une liste vide est calculée elle aussi : c'est ainsi qu'un retrait
				// d'image devient un état à envoyer, et pas une opération ignorée.
				const locale = await computeEntityImageChecksum(
					toImageBearing(pb, category),
				)
				if (!vivant) return
				const differe = locale !== distante
				setEtatImages(differe ? 'modifiees' : 'a-jour')
				setImages(differe)
			} catch {
				if (vivant) setEtatImages('inconnu')
			}
		})()

		return () => {
			vivant = false
		}
	}, [pb, category, distante, imageInventory.isLoading, imageModified])

	const mentionImages = (() => {
		if (!imageModified) return 'non modifiée pendant cette édition'
		if (etatImages === 'calcul') return 'vérification…'
		if (etatImages === 'modifiees') {
			return aUneImage
				? 'modifiée depuis le dernier envoi'
				: 'photo retirée — retrait à répercuter en ligne'
		}
		if (etatImages === 'a-jour') return 'déjà à jour en ligne'
		return 'état en ligne non mesuré'
	})()

	const synchroniser = () => {
		enqueue({
			label: category.name,
			productIds: [],
			categoryIds: [category.id],
			donnees,
			images,
		})
		onClose()
	}

	return (
		<Dialog open onOpenChange={(ouvert) => !ouvert && onClose()}>
			<DialogContent className='max-w-md'>
				<DialogHeader>
					<DialogTitle>Cette catégorie est en ligne.</DialogTitle>
					<DialogDescription>
						Son nom, sa description et sa mise en avant restent inchangés sur le
						site tant que rien n'est envoyé.
					</DialogDescription>
				</DialogHeader>

				<div className='space-y-3 py-2'>
					<div className='flex items-start gap-3 text-sm'>
						<Checkbox
							id='sync-categorie-apres-enregistrement-donnees'
							checked={donnees}
							onCheckedChange={(valeur) => setDonnees(valeur === true)}
							className='mt-0.5'
						/>
						<label
							htmlFor='sync-categorie-apres-enregistrement-donnees'
							className='cursor-pointer'
						>
							Envoyer la catégorie
							<span className='block text-muted-foreground text-xs'>
								nom, description, parent, mise en avant…
							</span>
						</label>
					</div>

					<div className='flex items-start gap-3 text-sm'>
						<Checkbox
							id='sync-categorie-apres-enregistrement-image'
							checked={images}
							onCheckedChange={(valeur) => setImages(valeur === true)}
							disabled={etatImages !== 'modifiees'}
							className='mt-0.5'
						/>
						<label
							htmlFor='sync-categorie-apres-enregistrement-image'
							className='cursor-pointer'
						>
							Envoyer la photo
							<span className='block text-muted-foreground text-xs'>
								{mentionImages}
							</span>
						</label>
					</div>
				</div>

				<DialogFooter>
					<Button type='button' variant='outline' onClick={onClose}>
						Plus tard
					</Button>
					<Button
						type='button'
						onClick={synchroniser}
						disabled={!donnees && !images}
					>
						Synchroniser
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
