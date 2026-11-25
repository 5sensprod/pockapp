import { describe, expect, it } from 'vitest'
import { notesVides, parseReleaseNotes } from './release-notes'

describe('parseReleaseNotes', () => {
	it('range des commits conventionnels et retire les préfixes', () => {
		const n = parseReleaseNotes(
			[
				'feat(caisse): CA et détail par vendeur (X, journal)',
				'fix(réseau): n’annoncer que des adresses privées',
				'chore: bump version to 2.5.1',
				'perf: accélère le catalogue',
				'feat!: nouvelle clôture',
			].join('\n'),
		)
		expect(n.reconnu).toBe(true)
		expect(n.nouveautes).toEqual([
			{ texte: 'CA et détail par vendeur (X, journal)', portee: 'caisse' },
			{ texte: 'Nouvelle clôture' },
		])
		expect(n.corrections).toEqual([
			{ texte: 'N’annoncer que des adresses privées', portee: 'réseau' },
		])
		expect(n.autres.map((a) => a.texte)).toEqual([
			'Bump version to 2.5.1',
			'Accélère le catalogue',
		])
	})

	it('lit des puces avec titres Features / Bug Fixes', () => {
		const n = parseReleaseNotes(
			[
				"## What's Changed",
				'## ✨ Features',
				'- Mon CA dans l’en-tête',
				'* Thèmes contrastés',
				'## Bug Fixes',
				'- La clôture se bloquait',
				'## Other',
				'- Mise à jour des dépendances',
			].join('\n'),
		)
		expect(n.nouveautes.map((a) => a.texte)).toEqual([
			'Mon CA dans l’en-tête',
			'Thèmes contrastés',
		])
		expect(n.corrections.map((a) => a.texte)).toEqual([
			'La clôture se bloquait',
		])
		expect(n.autres.map((a) => a.texte)).toEqual([
			'Mise à jour des dépendances',
		])
	})

	it('comprend les titres français', () => {
		const n = parseReleaseNotes('### Nouveautés\n- A\n### Corrections\n- B')
		expect(n.nouveautes).toHaveLength(1)
		expect(n.corrections).toHaveLength(1)
	})

	it('nettoie les notes générées par GitHub', () => {
		const n = parseReleaseNotes(
			[
				"## What's Changed",
				'* fix: corrige le Z by @chris in https://github.com/5sensprod/pockapp/pull/12',
				'* feat: ajout du QR (#34)',
				'',
				'**Full Changelog**: https://github.com/5sensprod/pockapp/compare/v2.5.0...v2.5.1',
			].join('\n'),
		)
		expect(n.corrections).toEqual([{ texte: 'Corrige le Z' }])
		expect(n.nouveautes).toEqual([{ texte: 'Ajout du QR' }])
		expect(n.autres).toEqual([])
	})

	it('retire le hash de commit et dédoublonne', () => {
		const n = parseReleaseNotes(
			'- 2926a85 fix: clôture non contournable\n- fix: clôture non contournable',
		)
		expect(n.corrections).toEqual([{ texte: 'Clôture non contournable' }])
	})

	it('dégrade en liste brute quand rien n’est reconnu', () => {
		const n = parseReleaseNotes('Petites améliorations.\nCorrections diverses.')
		expect(n.reconnu).toBe(false)
		expect(n.autres.map((a) => a.texte)).toEqual([
			'Petites améliorations.',
			'Corrections diverses.',
		])
	})

	it('tolère le vide et les fins de ligne Windows', () => {
		expect(notesVides(parseReleaseNotes(''))).toBe(true)
		expect(notesVides(parseReleaseNotes(undefined))).toBe(true)
		const n = parseReleaseNotes('feat: a\r\nfix: b\r\n')
		expect(n.nouveautes).toHaveLength(1)
		expect(n.corrections).toHaveLength(1)
	})
})
