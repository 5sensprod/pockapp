// frontend/lib/catalog/availability.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// GARDIEN — le message de disponibilité
// ═══════════════════════════════════════════════════════════════════════════
// La même règle existe en PHP (`server/lib/availability.php`,
// `server/tests/availability-test.php`) : ces cas-là y sont rejoués à
// l'identique. Retoucher la borne ou la normalisation ici sans y toucher
// là-bas, c'est laisser le serveur écrire ce que PocketApp refuse.

import { describe, expect, it } from 'vitest'
import {
	MAX_MESSAGE,
	MESSAGES_SUGGERES,
	MESSAGE_PAR_DEFAUT,
	messageNormalise,
} from './availability'

describe('messageNormalise', () => {
	it('retire les espaces de bord', () => {
		expect(messageNormalise('  Sur commande  ')).toBe('Sur commande')
	})

	it('réduit les suites d’espaces et les sauts de ligne', () => {
		expect(messageNormalise('Livraison\n  prochaine\t!')).toBe(
			'Livraison prochaine !',
		)
	})

	it('coupe au-delà de la borne, sans refuser', () => {
		expect(messageNormalise('a'.repeat(MAX_MESSAGE + 20))).toHaveLength(
			MAX_MESSAGE,
		)
	})

	it('rend une chaîne vide pour tout ce qui n’est pas un texte', () => {
		// Le champ vient d'un enregistrement PocketBase : il peut être absent.
		expect(messageNormalise(undefined)).toBe('')
		expect(messageNormalise(null)).toBe('')
		expect(messageNormalise(42)).toBe('')
		expect(messageNormalise('   ')).toBe('')
	})
})

describe('le message par défaut', () => {
	it('n’est qu’un texte d’interface', () => {
		// Il est exporté pour l'indice sous le champ de saisie. S'il se mettait à
		// voyager, le changer un jour demanderait de réécrire les fiches.
		expect(MESSAGE_PAR_DEFAUT).toBe('Réappro')
	})

	it('les suggestions tiennent toutes dans la borne', () => {
		for (const suggestion of MESSAGES_SUGGERES) {
			expect(messageNormalise(suggestion)).toBe(suggestion)
		}
	})
})
