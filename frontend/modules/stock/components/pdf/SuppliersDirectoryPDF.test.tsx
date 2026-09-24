// frontend/modules/stock/components/pdf/SuppliersDirectoryPDF.test.tsx
//
// GARDIEN — le PDF se fabrique VRAIMENT, y compris sur un gros catalogue.
//
// Une mise en page `@react-pdf/renderer` ne se vérifie pas à l'œil dans un test,
// mais elle lève une erreur quand un bloc insécable dépasse une page ou quand un
// caractère n'existe pas dans la police. Ce test rend le document en mémoire
// avec un volume proche du catalogue réel (287 marques, 43 fournisseurs) : il
// n'attrape ni un mauvais alignement ni une couleur, il attrape ce qui
// empêcherait le vendeur d'obtenir un fichier.

import type {
	CatalogBrandShape,
	CatalogSupplierShape,
} from '@/lib/queries/catalog-shapes'
import { renderToBuffer } from '@react-pdf/renderer'
import { describe, expect, it } from 'vitest'

import { construireRepertoire } from '../../lib/suppliers-directory'
import { SuppliersDirectoryPDF } from './SuppliersDirectoryPDF'

const pages = (pdf: Buffer) =>
	(pdf.toString('latin1').match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length

const marques = (n: number) =>
	Array.from(
		{ length: n },
		(_, i) =>
			({
				id: `m${i}`,
				// Des noms accentués, longs, et une lettre très fournie (« É »).
				name:
					i % 5 === 0
						? `Éclat Marque Numéro ${i}`
						: `Marque ${String.fromCharCode(65 + (i % 26))}${i}`,
			}) as unknown as CatalogBrandShape,
	)

const fournisseurs = (n: number, nbMarques: number) =>
	Array.from({ length: n }, (_, i) => {
		const rattachees = Array.from(
			{ length: 12 },
			(_, k) => `m${(i * 7 + k * 3) % nbMarques}`,
		)
		return {
			id: `f${i}`,
			name: `Fournisseur ${i} Distribution`,
			supplier_code: `F${i}`,
			contact_name: 'Anne Dupont',
			contact_email: `contact${i}@fournisseur.fr`,
			contact_phone: '01 02 03 04 05',
			brands: rattachees,
		} as unknown as CatalogSupplierShape
	})

describe('SuppliersDirectoryPDF', () => {
	it('se fabrique sur un catalogue de la taille du vrai, sur plusieurs pages', async () => {
		const repertoire = construireRepertoire(fournisseurs(43, 287), marques(287))
		const buffer = await renderToBuffer(
			<SuppliersDirectoryPDF
				repertoire={repertoire}
				entreprise='Axe Musique'
				genereLe={new Date('2026-09-24')}
			/>,
		)
		expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
		expect(buffer.length).toBeGreaterThan(5_000)
		expect(pages(buffer)).toBeGreaterThan(2)
	}, 30_000)

	it('se fabrique aussi sans aucun fournisseur ni marque', async () => {
		const buffer = await renderToBuffer(
			<SuppliersDirectoryPDF repertoire={construireRepertoire([], [])} />,
		)
		expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
	}, 30_000)
})
