// frontend/lib/sync/relation-auto-sync.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// QUI PART TOUT SEUL — cas vérifiés
// ═══════════════════════════════════════════════════════════════════════════
// `pnpm test`
//
// La règle vaut par ce qu'elle REFUSE : une marque neuve n'a aucune page à
// écrire, et un inventaire illisible n'est pas un « pas en ligne ». Le reste —
// le toast, l'ordre des deux étapes — appartient à la file.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expect, it } from 'vitest'

import { decisionPublication } from './relation-auto-sync-rule'

const modifie = { dataModified: true, imageModified: false }

describe('decisionPublication', () => {
	it('envoie une catégorie que le site connaît déjà', () => {
		expect(
			decisionPublication('categories', {
				connueDuSite: true,
				changements: modifie,
			}),
		).toBe('publier')
	})

	it('envoie une image seule, sans autre changement', () => {
		expect(
			decisionPublication('brands', {
				connueDuSite: true,
				changements: { dataModified: false, imageModified: true },
			}),
		).toBe('publier')
	})

	it('ne bouge pas quand rien n’a changé', () => {
		expect(
			decisionPublication('categories', {
				connueDuSite: true,
				changements: { dataModified: false, imageModified: false },
			}),
		).toBe('rien-de-modifie')
	})

	// ⚠️ `null` n'est pas `false` : conclure « pas en ligne » sur un inventaire
	// illisible enverrait une entité inconnue, ou tairait une entité en ligne.
	it('ne conclut rien quand l’inventaire est illisible', () => {
		expect(
			decisionPublication('categories', {
				connueDuSite: null,
				changements: modifie,
			}),
		).toBe('inventaire-indisponible')
	})

	it('laisse une catégorie ordinaire attendre qu’un produit la cite', () => {
		expect(
			decisionPublication('categories', {
				connueDuSite: false,
				isFeatured: false,
				changements: modifie,
			}),
		).toBe('inconnue-du-site')
	})

	// `catalog.php?action=featured-categories` ne joint aucun produit : cette
	// catégorie-là s'affiche seule, elle doit donc exister côté SQL.
	it('envoie une catégorie mise en avant même inconnue du site', () => {
		expect(
			decisionPublication('categories', {
				connueDuSite: false,
				isFeatured: true,
				changements: modifie,
			}),
		).toBe('publier')
	})

	// `catalog.php?action=brands` joint les produits publiés : une marque sans
	// produit n'apparaît nulle part. L'exporter écrirait une ligne morte.
	it('n’envoie jamais une marque inconnue du site', () => {
		expect(
			decisionPublication('brands', {
				connueDuSite: false,
				isFeatured: true,
				changements: modifie,
			}),
		).toBe('inconnue-du-site')
	})
})
