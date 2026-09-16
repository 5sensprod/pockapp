// frontend/lib/catalog/featured.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// GARDIEN — le libellé de pastille, et ce qui part vers le site
// ═══════════════════════════════════════════════════════════════════════════
// La même règle existe en PHP (`server/lib/featured.php`,
// `server/tests/featured-test.php`) : ces cas-là y sont rejoués à l'identique.
// Retoucher la borne ou la normalisation ici sans y toucher là-bas, c'est
// laisser le serveur écrire ce que PocketApp refuse.

import { describe, expect, it } from 'vitest'
import {
	LIBELLE_PAR_DEFAUT,
	MAX_LIBELLE,
	libelleNormalise,
	miseEnAvant,
} from './featured'

describe('libelleNormalise', () => {
	it('retire les espaces de bord', () => {
		expect(libelleNormalise('  Coup de cœur  ')).toBe('Coup de cœur')
	})

	it('réduit les suites d’espaces', () => {
		// Un libellé collé depuis un tableur : la pastille les rendrait tels quels.
		expect(libelleNormalise('Spécial   rentrée\t2026')).toBe(
			'Spécial rentrée 2026',
		)
	})

	it('coupe au-delà de la borne, sans refuser', () => {
		const long = 'a'.repeat(MAX_LIBELLE + 20)
		expect(libelleNormalise(long)).toHaveLength(MAX_LIBELLE)
	})

	it('rend une chaîne vide pour tout ce qui n’est pas un texte', () => {
		// Le champ vient d'un enregistrement PocketBase : il peut être absent.
		expect(libelleNormalise(undefined)).toBe('')
		expect(libelleNormalise(null)).toBe('')
		expect(libelleNormalise(42)).toBe('')
	})
})

describe('miseEnAvant', () => {
	it('rend null quand la fiche n’est pas mise en avant', () => {
		expect(miseEnAvant({})).toBeNull()
		expect(
			miseEnAvant({ featured: false, featured_label: 'Notre choix' }),
		).toBeNull()
	})

	it('conserve un libellé vide : il veut dire « le défaut du site »', () => {
		// Le défaut ne s'écrit NI en base NI dans l'export — il se décide au
		// seul endroit qui l'affiche. Recopier `LIBELLE_PAR_DEFAUT` ici ferait
		// 3000 fiches portant un texte que personne n'a choisi.
		expect(miseEnAvant({ featured: true })).toEqual({ label: '' })
		expect(miseEnAvant({ featured: true, featured_label: '   ' })).toEqual({
			label: '',
		})
	})

	it('rend le libellé normalisé', () => {
		expect(
			miseEnAvant({ featured: true, featured_label: ' À  découvrir ' }),
		).toEqual({ label: 'À découvrir' })
	})

	it('le défaut d’interface n’est qu’un texte d’interface', () => {
		// Il est exporté pour l'indice sous le champ de saisie. S'il se mettait
		// à voyager, le changer un jour demanderait de réécrire les fiches.
		expect(LIBELLE_PAR_DEFAUT).toBe('Coup de cœur')
		expect(miseEnAvant({ featured: true })?.label).not.toBe(LIBELLE_PAR_DEFAUT)
	})
})
