// frontend/modules/cash/creation-rapide-brouillon.test.ts
//
// GARDIEN — un produit né en caisse naît EN BROUILLON, et la caisse le retrouve.
//
// Les deux moitiés vont ensemble, et c'est pourquoi elles sont gardées ici :
// créer en brouillon sans que la caisse cherche les brouillons rendrait le
// produit introuvable au scan suivant (doublons à la clé) ; chercher les
// brouillons sans créer en brouillon ne protégerait plus le site d'une fiche
// publiée sans image ni catégorie.
//
// Le test lit les fichiers, comme `stock/single-source.test.ts` : ni le
// compilateur ni l'écran ne voient ce couplage.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const racine = join(__dirname, '..', '..')
const lire = (chemin: string) => readFileSync(join(racine, chemin), 'utf-8')
const sansCommentaires = (source: string) =>
	source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('la création rapide en caisse', () => {
	it('crée en brouillon — jamais publié, faute d’image et de catégorie', () => {
		const code = sansCommentaires(lire('modules/cash/CreateProductDialog.tsx'))
		expect(code).toMatch(/status:\s*'draft'/)
		expect(code).not.toMatch(/status:\s*'published'/)
	})

	it('la caisse cherche aussi les brouillons, sinon le produit disparaît', () => {
		const code = sansCommentaires(lire('modules/cash/CashTerminalPage.tsx'))
		expect(code).toMatch(/inclureBrouillons:\s*true/)
	})

	it('factures, devis et commandes ne cherchent QUE les produits publiés', () => {
		for (const fichier of [
			'modules/connect/pages/invoices/InvoiceCreatePage.tsx',
			'modules/connect/pages/invoices/InvoiceEditPage.tsx',
			'modules/connect/pages/quotes/QuoteCreatePage.tsx',
			'modules/connect/pages/quotes/QuoteEditPage.tsx',
			'modules/connect/pages/orders/OrderCreatePage.tsx',
			'modules/connect/pages/orders/OrderDetailPage.tsx',
			'modules/connect/features/orders/OrderCreateInline.tsx',
		]) {
			expect(lire(fichier), fichier).not.toMatch(/inclureBrouillons/)
		}
	})
})
