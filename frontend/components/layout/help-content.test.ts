import { describe, expect, it } from 'vitest'
import {
	RUBRIQUES_AIDE,
	THEMES_AIDE,
	nouveautesRecentes,
	triParDate,
} from './help-content'

describe('contenu de l’aide', () => {
	it('chaque rubrique a un thème existant', () => {
		const themes = new Set(THEMES_AIDE.map((t) => t.id))
		for (const r of RUBRIQUES_AIDE) expect(themes.has(r.theme), r.id).toBe(true)
	})

	it('chaque rubrique a une date valide', () => {
		for (const r of RUBRIQUES_AIDE) {
			expect(r.date, r.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
			const d = new Date(`${r.date}T00:00:00Z`)
			expect(Number.isNaN(d.getTime()), r.id).toBe(false)
			expect(d.toISOString().slice(0, 10), r.id).toBe(r.date)
		}
	})

	it('les identifiants sont uniques', () => {
		const ids = RUBRIQUES_AIDE.map((r) => r.id)
		expect(new Set(ids).size).toBe(ids.length)
		const themes = THEMES_AIDE.map((t) => t.id)
		expect(new Set(themes).size).toBe(themes.length)
	})

	it('le tri des nouveautés est décroissant', () => {
		const n = nouveautesRecentes(RUBRIQUES_AIDE, '2026-11-25')
		expect(n.length).toBeGreaterThan(0)
		for (let i = 1; i < n.length; i++)
			expect(n[i - 1].date >= n[i].date).toBe(true)
		const t = triParDate(RUBRIQUES_AIDE)
		for (let i = 1; i < t.length; i++)
			expect(t[i - 1].date >= t[i].date).toBe(true)
	})

	it('le bloc Nouveautés ne dépasse jamais 6 rubriques', () => {
		expect(nouveautesRecentes(RUBRIQUES_AIDE, '2030-01-01')).toHaveLength(6)
		expect(nouveautesRecentes(RUBRIQUES_AIDE, '2026-11-25')).toHaveLength(6)
	})
})
