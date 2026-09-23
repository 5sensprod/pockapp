// frontend/lib/sync/product-publish-auto-sync.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// LE PASSAGE À PUBLIÉ, ET LUI SEUL — cas vérifiés
// ═══════════════════════════════════════════════════════════════════════════
// `pnpm test`
//
// La règle vaut par ce qu'elle REFUSE : rester publié, rester brouillon, ou se
// dépublier ne renvoient rien — ces trois cas restent à la décision du vendeur
// (`SyncAfterSaveDialog`, ou le retrait manuel de `/site/catalogue`).
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expect, it } from 'vitest'

import { decisionPublicationProduit } from './product-publish-auto-sync-rule'

describe('decisionPublicationProduit', () => {
	it('envoie un produit qui vient de passer publié', () => {
		expect(
			decisionPublicationProduit({ avantPublie: false, apresPublie: true }),
		).toBe('publier')
	})

	it('ne renvoie rien pour une fiche déjà publiée qu’on retouche', () => {
		expect(
			decisionPublicationProduit({ avantPublie: true, apresPublie: true }),
		).toBe('rien-a-faire')
	})

	it('ne renvoie rien pour un brouillon qui reste brouillon', () => {
		expect(
			decisionPublicationProduit({ avantPublie: false, apresPublie: false }),
		).toBe('rien-a-faire')
	})

	// La dépublication reste manuelle (`retirables`, dans /site/catalogue) :
	// ce fichier ne couvre que le sens inverse.
	it('ne renvoie rien pour une dépublication', () => {
		expect(
			decisionPublicationProduit({ avantPublie: true, apresPublie: false }),
		).toBe('rien-a-faire')
	})
})
