import type {
	SiteMenuImportRecord,
	SiteMenuResponse,
} from '@/lib/queries/site-menu'
import { describe, expect, it } from 'vitest'
import { parseMenuDocument } from './import-menu'
import { composeMenuDocument } from './publish-menu'

const entry = (
	data: Pick<SiteMenuResponse, 'id' | 'title' | 'position' | 'link_type'> &
		Partial<SiteMenuResponse>,
): SiteMenuResponse => ({
	visible: true,
	link_url: '',
	ref_id: '',
	parent: '',
	created: '2026-01-01 00:00:00Z',
	updated: '',
	collectionId: 'site_menu',
	collectionName: 'site_menu',
	...data,
})

const comparable = (record: SiteMenuImportRecord) => ({
	id: record.id,
	title: record.title,
	position: record.position,
	link_type: record.link_type,
	link_url: record.link_url,
	ref_id: record.ref_id,
	parent: record.parent,
})

describe('parseMenuDocument', () => {
	it('inverse composeMenuDocument en conservant titres, cibles, parents et ordre', () => {
		const entries = [
			entry({
				id: 'aaaaaaaaaaaaaaa',
				title: 'Instruments',
				position: 1,
				link_type: 'none',
			}),
			entry({
				id: 'bbbbbbbbbbbbbbb',
				title: 'Promotions',
				position: 1,
				link_type: 'manual',
				link_url: '/bons-plans',
				parent: 'aaaaaaaaaaaaaaa',
			}),
			entry({
				id: 'ccccccccccccccc',
				title: 'Guitares',
				position: 2,
				link_type: 'category',
				ref_id: 'cat1',
				parent: 'aaaaaaaaaaaaaaa',
			}),
			entry({
				id: 'ddddddddddddddd',
				title: 'Produit vedette',
				position: 2,
				link_type: 'product',
				ref_id: 'prod1',
			}),
		]
		const composed = composeMenuDocument(
			entries,
			{
				urlFor: (type, id) =>
					type === 'category' && id === 'cat1'
						? '/categorie-produit/guitares'
						: type === 'product' && id === 'prod1'
							? '/produit/vedette/'
							: null,
			},
			new Date('2026-09-10T10:00:00Z'),
		)
		if (!composed.ok) throw new Error('composition attendue valide')

		const parsed = parseMenuDocument(JSON.stringify(composed.document))
		expect(parsed.ok).toBe(true)
		if (!parsed.ok) return
		expect(parsed.records.map(comparable)).toEqual(entries.map(comparable))
	})

	it('refuse une version de contrat incompatible', () => {
		const parsed = parseMenuDocument(
			JSON.stringify({
				contractVersion: 2,
				publishedAt: '2026-09-10T10:00:00Z',
				menu: { name: 'Menu Principal', items: [] },
			}),
		)
		expect(parsed).toEqual({
			ok: false,
			error: 'Version de contrat incompatible : 2 (attendue : 1).',
		})
	})

	it('refuse un identifiant que PocketBase ne peut pas conserver', () => {
		const parsed = parseMenuDocument(
			JSON.stringify({
				contractVersion: 1,
				publishedAt: '2026-09-10T10:00:00Z',
				menu: {
					name: 'Menu Principal',
					items: [
						{
							id: 'trop-court',
							title: 'Accueil',
							url: '/',
							parent: null,
							ref: null,
						},
					],
				},
			}),
		)
		expect(parsed).toEqual({
			ok: false,
			error: 'Entrée 1 : identifiant PocketBase invalide.',
		})
	})
})
