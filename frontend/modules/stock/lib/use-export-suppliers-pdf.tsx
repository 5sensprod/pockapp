// frontend/modules/stock/lib/use-export-suppliers-pdf.ts
// ═══════════════════════════════════════════════════════════════════════════
// L'EXPORT PDF « FOURNISSEURS ET MARQUES »
// ═══════════════════════════════════════════════════════════════════════════
// Ce que le hook fait, et rien de plus : construire le répertoire, le passer au
// composant PDF, poser le fichier. Même geste que `use-export-pdf.tsx` du rapport
// de stock.
//
// `@react-pdf/renderer` et le composant sont chargés À LA DEMANDE : la
// bibliothèque pèse lourd, et la page fournisseurs sert d'abord à gérer, pas à
// imprimer. Aucun écran ne paie ce coût tant que personne ne clique.

import type {
	CatalogBrandShape,
	CatalogSupplierShape,
} from '@/lib/queries/catalog-shapes'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { construireRepertoire } from './suppliers-directory'

export function nomDuFichier(jour = new Date()): string {
	return `fournisseurs-et-marques-${jour.toISOString().slice(0, 10)}.pdf`
}

function telecharger(blob: Blob, nom: string) {
	const url = URL.createObjectURL(blob)
	const lien = document.createElement('a')
	lien.href = url
	lien.download = nom
	document.body.appendChild(lien)
	lien.click()
	document.body.removeChild(lien)
	URL.revokeObjectURL(url)
}

export function useExportSuppliersPdf() {
	const [enCours, setEnCours] = useState(false)

	const exporter = useCallback(
		async (
			fournisseurs: readonly CatalogSupplierShape[],
			marques: readonly CatalogBrandShape[],
			entreprise?: string,
		) => {
			if (fournisseurs.length === 0) {
				toast.error('Aucun fournisseur à exporter')
				return
			}

			setEnCours(true)
			try {
				const [{ pdf }, { SuppliersDirectoryPDF }] = await Promise.all([
					import('@react-pdf/renderer'),
					import('../components/pdf/SuppliersDirectoryPDF'),
				])
				const blob = await pdf(
					<SuppliersDirectoryPDF
						repertoire={construireRepertoire(fournisseurs, marques)}
						entreprise={entreprise}
					/>,
				).toBlob()

				telecharger(blob, nomDuFichier())
				toast.success('PDF enregistré')
			} catch (erreur) {
				console.error('Export PDF fournisseurs et marques :', erreur)
				toast.error("Le PDF n'a pas pu être produit")
			} finally {
				setEnCours(false)
			}
		},
		[],
	)

	return { exporter, enCours }
}
