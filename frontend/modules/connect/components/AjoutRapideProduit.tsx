// frontend/modules/connect/components/AjoutRapideProduit.tsx
// ═══════════════════════════════════════════════════════════════════════════
// CRÉER UN PRODUIT SANS QUITTER LE DOCUMENT — COMME EN CAISSE
// ═══════════════════════════════════════════════════════════════════════════
// Écrit le 24 septembre 2026. Dans le sélecteur de produit d'une facture, d'un
// devis ou d'un bon de commande, un article absent du catalogue obligeait à
// quitter le document, créer la fiche, puis revenir. La caisse le fait depuis
// toujours : ce composant lui emprunte SON dialogue (`CreateProductDialog`),
// donc ses règles — pas une seconde saisie à tenir d'accord avec la première.
//
// Mêmes règles, donc :
//   • le produit naît EN BROUILLON, sans image ni catégorie, et se complète
//     ensuite sur sa fiche (`lib/catalog/publication-requirements.ts`) ;
//   • la désignation tapée dans la recherche est reprise, et un code de 8
//     chiffres ou plus est pris pour un code-barres — même heuristique que
//     `CashTerminalPage.handleCreateProductClick` ;
//   • les doublons avertissent, ils ne bloquent pas
//     (`ProductDuplicateGuard`, dans le dialogue).
//
// À la création, le produit est ajouté à la ligne du document par l'appelant
// (`onCree`), comme la caisse l'ajoute au panier. Il faut donc que les
// sélecteurs de documents CHERCHENT aussi les brouillons (`inclureBrouillons`) :
// sans cela le produit disparaîtrait de la recherche dès le document suivant, et
// serait recréé — les doublons entreraient par la porte que cette fonction ouvre.
//
// Le composant garde son propre état d'ouverture : les sept sélecteurs n'ont
// pas la même forme, et aucun n'a à porter celui d'un dialogue de plus.

import { Button } from '@/components/ui/button'
import type { CatalogProductShape } from '@/lib/queries/catalog-products'
import { CreateProductDialog } from '@/modules/cash/CreateProductDialog'
import { PackagePlus } from 'lucide-react'
import { useState } from 'react'

/** Huit chiffres ou plus : un code-barres, pas un nom. Même règle que la caisse. */
const ressembleAUnCodeBarres = (terme: string) => /^\d{8,}$/.test(terme)

export function AjoutRapideProduit({
	terme,
	onCree,
	disabled = false,
}: {
	/** Ce qui est tapé dans la recherche : repris comme désignation ou code. */
	terme: string
	/** Le produit tout juste créé, à poser sur la ligne du document. */
	onCree: (produit: CatalogProductShape) => void
	disabled?: boolean
}) {
	const [ouvert, setOuvert] = useState(false)
	const saisi = terme.trim()
	const estCodeBarres = ressembleAUnCodeBarres(saisi)

	return (
		<>
			<Button
				type='button'
				variant='outline'
				className='w-full justify-start'
				disabled={disabled}
				onClick={() => setOuvert(true)}
			>
				<PackagePlus className='mr-2 h-4 w-4 shrink-0' />
				<span className='truncate'>
					{saisi ? `Créer « ${saisi} »` : 'Créer un produit'}
				</span>
			</Button>

			<CreateProductDialog
				open={ouvert}
				onOpenChange={setOuvert}
				initialBarcode={estCodeBarres ? saisi : ''}
				initialName={estCodeBarres ? '' : saisi}
				onProductCreated={(produit) => {
					// Fermé AVANT d'appeler le document : l'appelant referme son
					// sélecteur, qui porte ce composant — un dialogue démonté encore
					// ouvert laisserait la page sous un voile.
					setOuvert(false)
					onCree(produit as CatalogProductShape)
				}}
			/>
		</>
	)
}
