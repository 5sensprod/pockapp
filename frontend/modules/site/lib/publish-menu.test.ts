// frontend/modules/site/lib/publish-menu.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// COMPOSITION DU DOCUMENT PUBLIÉ — cas vérifiés  (ticket 6)
// ═══════════════════════════════════════════════════════════════════════════
// `pnpm test`
//
// Ce fichier garde les règles du contrat qui n'ont AUCUN autre gardien côté
// PocketApp : l'endpoint PHP les vérifie aussi, mais il est distant, et
// découvrir une régression par un refus en production coûte un aller-retour.
//
// L'index des destinations est injecté : aucun appel à AppPos, aucun réseau,
// aucune horloge — `composeMenuDocument` accepte la date en paramètre pour que
// `publishedAt` soit vérifiable.
//
// Ce qui n'est PAS testé ici, et volontairement : la lecture des slugs dans
// AppPos (c'est `use-menu-destinations`, qui parle au réseau) et la validation
// du contrat (c'est le PHP, seul gardien — voir `server/api/publish-menu.php`).
// ═══════════════════════════════════════════════════════════════════════════

import type { SiteMenuResponse } from '@/lib/queries/site-menu'
import { describe, expect, it } from 'vitest'
import { composeMenuDocument, resolveEntryUrl } from './publish-menu'

/** Une entrée de `site_menu` réduite à ce que la composition regarde. */
const entry = (
	o: Partial<SiteMenuResponse> & { id: string },
): SiteMenuResponse =>
	({
		title: o.id,
		position: 1,
		visible: true,
		link_type: 'none',
		link_url: '',
		ref_id: '',
		parent: '',
		created: '2026-01-01 00:00:00Z',
		updated: '',
		collectionId: 'c',
		collectionName: 'site_menu',
		...o,
	}) as SiteMenuResponse

/** Catalogue figé : trois cibles résolubles, tout le reste sans URL — ce qui
 *  est le cas courant en vrai (433 catégories sur 463 n'ont pas de slug). */
const index = {
	urlFor: (type: string, id: string): string | null => {
		if (type === 'category' && id === '142')
			return '/categorie-produit/guitares'
		if (type === 'brand' && id === '1302') return '/marque/neutrik/'
		if (type === 'product' && id === '25111858')
			return '/produit/potentiometre-alpha-25k-audio-alp-25a/'
		return null
	},
}

const NOW = new Date('2026-08-08T14:32:11.456Z')

describe('composeMenuDocument', () => {
	it("reproduit l'exemple du contrat (§2)", () => {
		const result = composeMenuDocument(
			[
				entry({
					id: 'a',
					title: 'Accueil',
					link_type: 'manual',
					link_url: '/',
				}),
				entry({ id: 'b', title: 'Instruments', position: 2 }),
				entry({
					id: 'c',
					title: 'Guitares',
					link_type: 'category',
					ref_id: '142',
					parent: 'b',
				}),
			],
			index,
			NOW,
		)

		expect(result.ok).toBe(true)
		if (!result.ok) return

		expect(result.document.contractVersion).toBe(1)
		expect(result.document.menu.name).toBe('Menu Principal')
		expect(result.document.menu.items[0].parent).toBeNull()
		expect(result.document.menu.items[1].url).toBe('#')
		expect(result.document.menu.items[2]).toMatchObject({
			url: '/categorie-produit/guitares',
			parent: 'b',
			ref: { type: 'category', id: '142' },
		})
	})

	it('publishedAt est en UTC à la seconde, suffixe Z (§2.1)', () => {
		const result = composeMenuDocument(
			[entry({ id: 'a', link_type: 'manual', link_url: '/' })],
			index,
			NOW,
		)
		if (!result.ok) throw new Error('composition attendue valide')

		// Les millisecondes de toISOString() sont retirées : l'endpoint les
		// accepte, mais elles n'ont aucun sens pour un instant de publication.
		expect(result.document.publishedAt).toBe('2026-08-08T14:32:11Z')
	})

	it("l'ordre des frères suit position, sans champ order (§2.3)", () => {
		const result = composeMenuDocument(
			[
				entry({ id: 'x', link_type: 'manual', link_url: '/x', position: 3 }),
				entry({ id: 'y', link_type: 'manual', link_url: '/y', position: 1 }),
				entry({ id: 'w', link_type: 'manual', link_url: '/w', position: 2 }),
			],
			index,
			NOW,
		)
		if (!result.ok) throw new Error('composition attendue valide')

		expect(result.document.menu.items.map((i) => i.id)).toEqual(['y', 'w', 'x'])
	})

	it('masquer une entrée masque sa descendance (§4)', () => {
		const result = composeMenuDocument(
			[
				entry({ id: 'p', title: 'Parent', visible: false }),
				entry({
					id: 'k',
					title: 'Enfant',
					parent: 'p',
					link_type: 'manual',
					link_url: '/x',
				}),
				entry({
					id: 'z',
					title: 'Autre',
					link_type: 'manual',
					link_url: '/z',
					position: 2,
				}),
			],
			index,
			NOW,
		)
		if (!result.ok) throw new Error('composition attendue valide')

		// L'enfant part avec son parent : publié seul, il serait orphelin, donc
		// refusé par l'endpoint et jamais affiché par le site.
		expect(result.document.menu.items.map((i) => i.id)).toEqual(['z'])
	})

	it('aucun parent publié ne peut manquer du document (§4)', () => {
		const result = composeMenuDocument(
			[
				entry({ id: 'p', visible: false }),
				entry({ id: 'k', parent: 'p', link_type: 'manual', link_url: '/x' }),
				entry({ id: 'q', link_type: 'manual', link_url: '/q', position: 2 }),
			],
			index,
			NOW,
		)
		if (!result.ok) throw new Error('composition attendue valide')

		const ids = new Set(result.document.menu.items.map((i) => i.id))
		for (const item of result.document.menu.items) {
			if (item.parent !== null) expect(ids.has(item.parent)).toBe(true)
		}
	})

	it('une seule entrée non résolue annule toute la publication', () => {
		const result = composeMenuDocument(
			[
				entry({ id: 'ok', title: 'OK', link_type: 'manual', link_url: '/ok' }),
				entry({
					id: 'ko',
					title: 'Sans slug',
					link_type: 'category',
					ref_id: '9999',
					position: 2,
				}),
			],
			index,
			NOW,
		)

		// Tout ou rien : publier le menu amputé ferait disparaître une rubrique
		// sans que personne ne l'ait décidé.
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.unresolved).toHaveLength(1)
		expect(result.unresolved[0].title).toBe('Sans slug')
	})
})

describe('resolveEntryUrl', () => {
	it('résout les trois types du catalogue', () => {
		expect(
			resolveEntryUrl(
				entry({ id: '1', link_type: 'brand', ref_id: '1302' }),
				index,
			),
		).toEqual({ url: '/marque/neutrik/' })

		expect(
			resolveEntryUrl(
				entry({ id: '2', link_type: 'product', ref_id: '25111858' }),
				index,
			),
		).toEqual({ url: '/produit/potentiometre-alpha-25k-audio-alp-25a/' })

		expect(
			resolveEntryUrl(
				entry({ id: '3', link_type: 'category', ref_id: '142' }),
				index,
			),
		).toEqual({ url: '/categorie-produit/guitares' })
	})

	it("traite le ref_id d'une page comme un chemin saisi à la main (§3)", () => {
		expect(
			resolveEntryUrl(
				entry({ id: '4', link_type: 'page', ref_id: 'contact' }),
				index,
			),
		).toEqual({ url: '/contact' })

		expect(
			resolveEntryUrl(
				entry({ id: '5', link_type: 'page', ref_id: '/deja-absolu' }),
				index,
			),
		).toEqual({ url: '/deja-absolu' })
	})

	it('refuse plutôt que de fabriquer une URL', () => {
		// Un slug approché n'est pas un moindre mal : CategoryPage.jsx:88-102 du
		// site retombe sur un includes() partiel et mènerait à une AUTRE
		// catégorie, sans erreur.
		const missing = resolveEntryUrl(
			entry({ id: '6', link_type: 'category', ref_id: '9999' }),
			index,
		)
		expect('reason' in missing).toBe(true)

		const emptyManual = resolveEntryUrl(
			entry({ id: '7', link_type: 'manual', link_url: '   ' }),
			index,
		)
		expect('reason' in emptyManual).toBe(true)
	})
})
