// frontend/lib/format/date-utc.test.ts

import { describe, expect, it } from 'vitest'

import { formatDateUTC } from './date-utc'

describe('formatDateUTC', () => {
	// C'est le cas qui motivait le correctif : le DATETIME MySQL n'annonce
	// pas son fuseau alors qu'il EST en UTC. Affiché brut, il montrait
	// 08:12 pour une sauvegarde faite à 10:12 au magasin.
	it('lit un DATETIME MySQL sans fuseau comme de l’UTC, et le rend à Paris', () => {
		expect(formatDateUTC('2026-09-15 08:12:03')).toBe('15/09/2026 10:12')
	})

	it('respecte l’heure d’hiver', () => {
		expect(formatDateUTC('2026-01-15 08:12:03')).toBe('15/01/2026 09:12')
	})

	it('accepte aussi le RFC 3339 que produit le Go', () => {
		expect(formatDateUTC('2026-09-15T08:12:03Z')).toBe('15/09/2026 10:12')
	})

	it('respecte un décalage déjà annoncé, sans le rejouer', () => {
		expect(formatDateUTC('2026-09-15T10:12:03+02:00')).toBe('15/09/2026 10:12')
	})

	// Le format réel rendu par backup-admin.php n'est pas lisible depuis ce
	// dépôt : une chaîne inattendue doit rester affichable, pas devenir
	// « Invalid Date ».
	it('rend la chaîne telle quelle si elle ne se lit pas', () => {
		expect(formatDateUTC('pas une date')).toBe('pas une date')
		expect(formatDateUTC('')).toBe('')
	})
})
