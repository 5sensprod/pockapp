// frontend/modules/site/lib/category-drop.test.ts

import type { SiteMenuResponse } from '@/lib/queries/site-menu'
import { describe, expect, it } from 'vitest'
import { ROOT, categoryDrop } from './menu-tree'

const entree = (
	id: string,
	patch: Partial<SiteMenuResponse> = {},
): SiteMenuResponse => ({
	id,
	title: id,
	position: 1,
	visible: true,
	link_type: 'none',
	link_url: '',
	ref_id: '',
	parent: '',
	created: '2026-09-10 10:00:00.000Z',
	updated: '2026-09-10 10:00:00.000Z',
	collectionId: 'site_menu',
	collectionName: 'site_menu',
	...patch,
})

const micros = { legacyId: 'cat_micros', name: 'Microphones', online: true }

const menu = [
	entree('sons'),
	entree('lien', { link_type: 'manual', link_url: '/contact', position: 2 }),
	entree('existant', {
		parent: 'sons',
		link_type: 'category',
		ref_id: 'cat_cables',
		position: 3,
	}),
]

describe('categoryDrop', () => {
	it('crée une entrée catégorie en fin de fratrie', () => {
		expect(categoryDrop(menu, 'sons', micros)).toEqual({
			ok: true,
			record: {
				title: 'Microphones',
				link_type: 'category',
				link_url: '',
				ref_id: 'cat_micros',
				visible: true,
				parent: 'sons',
				position: 4,
			},
		})
	})

	it('refuse la racine', () => {
		expect(categoryDrop(menu, ROOT, micros).ok).toBe(false)
	})

	it("refuse une entrée qui n'est pas un sous-menu", () => {
		const result = categoryDrop(menu, 'lien', micros)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toContain("n'est pas un sous-menu")
	})

	it('refuse une entrée inconnue', () => {
		expect(categoryDrop(menu, 'partie', micros).ok).toBe(false)
	})

	it("refuse une catégorie hors ligne : elle n'a pas de page", () => {
		const result = categoryDrop(menu, 'sons', { ...micros, online: false })
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toContain("n'est pas en ligne")
	})

	it('refuse une catégorie sans clé stable', () => {
		expect(categoryDrop(menu, 'sons', { ...micros, legacyId: '' }).ok).toBe(
			false,
		)
	})

	it('refuse une catégorie déjà présente sous le même parent', () => {
		const result = categoryDrop(menu, 'sons', {
			...micros,
			legacyId: 'cat_cables',
		})
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toContain('« existant »')
	})

	it('accepte la même catégorie sous un autre parent', () => {
		const autre = [...menu, entree('studio', { position: 3 })]
		expect(
			categoryDrop(autre, 'studio', { ...micros, legacyId: 'cat_cables' }).ok,
		).toBe(true)
	})
})
