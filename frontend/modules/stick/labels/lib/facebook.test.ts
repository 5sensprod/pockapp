// frontend/modules/stick/labels/lib/facebook.test.ts
//
// « Publier sur Facebook » : ce qui autorise une publication, ce qui part à la
// route, UN envoi par publication préparée, et ce qu'on dit après un échec —
// « rien n'est parti » seulement quand on le sait.

import {
	ErreurFacebook,
	type EtatFacebook,
	MESSAGE_MAX,
	ROUTE_FACEBOOK_CHOISIR,
	ROUTE_FACEBOOK_CONNECTER,
	ROUTE_FACEBOOK_DECONNECTER,
	ROUTE_FACEBOOK_ETAT,
	ROUTE_FACEBOOK_PUBLIER,
	choisirPageFacebook,
	connecterFacebook,
	deconnecterFacebook,
	lireEtatFacebook,
	lireEtatRendu,
	messageNet,
	nouvelEnvoi,
	oublierEnvois,
	publierSurFacebook,
	traduireErreurFacebook,
} from '@/lib/facebook/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SEUIL_ENVOI_OCTETS } from './detourage'
import {
	COTE_PUBLICATION,
	peutPublier,
	preparerAffiche,
	publicationProposee,
	texteDeConfirmation,
} from './facebook'

const CONNECTE: EtatFacebook = {
	configure: true,
	connecte: true,
	page: { id: '1001', nom: 'Axe Musique' },
	depuis: '2026-10-06T10:00:00Z',
	aChoisir: [],
}
const PAGE = { elements: [{ id: 'a', visible: true }], formatTirage: 'page' }
const PNG = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])], {
	type: 'image/png',
})

/** Un faux PocketBase : note chaque appel, répond ou lève. */
const fauxPb = (repondre: (chemin: string, options: any) => unknown) => {
	const appels: { chemin: string; options: any }[] = []
	return {
		appels,
		send: async (chemin: string, options: any) => {
			appels.push({ chemin, options })
			return repondre(chemin, options)
		},
	}
}
const echec = (status: number, code?: string, error?: string) => {
	throw { status, response: code ? { code, error } : {} }
}

beforeEach(() => oublierEnvois())

describe('peut-on publier cette page', () => {
	it('refuse en planche, et le bouton ne se propose pas', () => {
		for (const etat of [
			{ ...PAGE, formatTirage: 'planche' },
			{ ...PAGE, lockCanvasToSheetCell: true },
		]) {
			expect(publicationProposee(etat)).toBe(false)
			expect(peutPublier(etat, CONNECTE).ok).toBe(false)
		}
		expect(publicationProposee(PAGE)).toBe(true)
	})

	it('refuse une page vide ou dont tout est masqué', () => {
		expect(peutPublier({ elements: [] }, CONNECTE).ok).toBe(false)
		expect(
			peutPublier({ elements: [{ id: 'a', visible: false }] }, CONNECTE).ok,
		).toBe(false)
	})

	it("refuse tant que l'état n'est pas lu, ou sans Page connectée", () => {
		expect(peutPublier(PAGE, null).ok).toBe(false)
		const sans = peutPublier(PAGE, { ...CONNECTE, connecte: false, page: null })
		expect(sans.ok).toBe(false)
		expect(!sans.ok && sans.raison).toContain('administrateur')
	})

	it('accepte un message vide, refuse un message trop long sans le tronquer', () => {
		expect(peutPublier(PAGE, CONNECTE, '').ok).toBe(true)
		expect(peutPublier(PAGE, CONNECTE, 'é'.repeat(MESSAGE_MAX)).ok).toBe(true)
		expect(peutPublier(PAGE, CONNECTE, 'é'.repeat(MESSAGE_MAX + 1)).ok).toBe(
			false,
		)
		// Les bords ne comptent pas
		expect(
			peutPublier(PAGE, CONNECTE, `  ${'é'.repeat(MESSAGE_MAX)}\n\n`).ok,
		).toBe(true)
	})
})

describe('le message et la confirmation', () => {
	it('garde les sauts de ligne, rogne les bords', () => {
		expect(messageNet('  Promo\r\nJusque samedi \r ')).toBe(
			'Promo\nJusque samedi',
		)
	})

	it('la confirmation nomme la Page, dit que la publication est publique, et cite le message', () => {
		const texte = texteDeConfirmation('Axe Musique', ' Promo de Noël ')
		expect(texte).toContain('« Axe Musique »')
		expect(texte).toContain('visible de tous')
		expect(texte).toContain('ni modifiée ni retirée')
		expect(texte).toContain('Message :\nPromo de Noël')
		expect(texteDeConfirmation('Axe Musique', '  ')).toContain('Sans message.')
	})
})

describe("l'image qui part", () => {
	it('le rendu de la page part tel quel, au côté demandé', async () => {
		const rendre = vi.fn(async () => PNG)
		expect(await preparerAffiche(rendre)).toBe(PNG)
		expect(rendre).toHaveBeenCalledWith(COTE_PUBLICATION)
	})

	it('un rendu trop lourd est réencodé sous le plafond', async () => {
		const lourd = new Blob([new Uint8Array(SEUIL_ENVOI_OCTETS + 1)], {
			type: 'image/png',
		})
		const leger = new Blob([new Uint8Array(10)], { type: 'image/jpeg' })
		const codec = vi.fn(async () => ({
			largeur: 2048,
			hauteur: 1448,
			transparente: false,
			encoder: async () => leger,
		}))
		expect(await preparerAffiche(async () => lourd, codec)).toBe(leger)
		expect(codec).toHaveBeenCalledWith(lourd)
	})
})

describe("l'état de la connexion", () => {
	it('relit champ par champ : un jeton rendu par erreur ne passe pas', () => {
		const etat = lireEtatRendu({
			configure: true,
			connecte: true,
			page: { id: '1001', nom: 'Axe Musique', access_token: 'FUITE' },
			depuis: '2026-10-06T10:00:00Z',
			a_choisir: [
				{ id: '1002', nom: 'Atelier', token_enc: 'FUITE' },
				{ id: 'pas-un-id', nom: 'x' },
				{ id: '1003' },
			],
			jeton: 'FUITE',
		})
		expect(JSON.stringify(etat)).not.toContain('FUITE')
		expect(etat.aChoisir).toEqual([
			{ id: '1002', nom: 'Atelier' },
			{ id: '1003', nom: 'Page 1003' },
		])
		expect(etat.connecte).toBe(true)
	})

	it('« connecté » sans Page lisible ne vaut pas connexion', () => {
		expect(lireEtatRendu({ connecte: true, page: null }).connecte).toBe(false)
		expect(lireEtatRendu(null)).toEqual({
			configure: false,
			connecte: false,
			page: null,
			depuis: null,
			aChoisir: [],
		})
	})

	it('chaque action appelle sa route ; le jeton part dans le corps, rogné', async () => {
		const pb = fauxPb(() => ({ configure: true }))
		await lireEtatFacebook(pb)
		await connecterFacebook(pb, '  EAAGjeton  ')
		await choisirPageFacebook(pb, '1001')
		await deconnecterFacebook(pb)
		expect(pb.appels.map((a) => [a.chemin, a.options.method])).toEqual([
			[ROUTE_FACEBOOK_ETAT, 'GET'],
			[ROUTE_FACEBOOK_CONNECTER, 'POST'],
			[ROUTE_FACEBOOK_CHOISIR, 'POST'],
			[ROUTE_FACEBOOK_DECONNECTER, 'POST'],
		])
		expect(pb.appels[1].options.body).toEqual({ jeton: 'EAAGjeton' })
		expect(pb.appels[2].options.body).toEqual({ page_id: '1001' })
		// Rien dans une adresse
		expect(pb.appels.every((a) => !a.chemin.includes('?'))).toBe(true)
	})

	it('un refus de la route garde son code et son message', async () => {
		const pb = fauxPb(() =>
			echec(400, 'jeton_refuse', 'Facebook refuse ce jeton.'),
		)
		const e = await connecterFacebook(pb, 'x').catch((err) => err)
		expect(e).toBeInstanceOf(ErreurFacebook)
		expect(e.code).toBe('jeton_refuse')
		expect(e.message).toBe('Facebook refuse ce jeton.')
	})
})

describe('la publication', () => {
	const publication = () => ({
		image: PNG,
		message: '  Promo de Noël\r\nJusque samedi ',
		envoi: nouvelEnvoi(),
	})

	it("un identifiant d'envoi neuf à chaque fois, à la forme attendue", () => {
		const a = nouvelEnvoi()
		expect(a).toMatch(/^[A-Za-z0-9_-]{16,64}$/)
		expect(nouvelEnvoi()).not.toBe(a)
	})

	it("envoie l'image, le message net et l'envoi ; rend le lien et la Page", async () => {
		const pb = fauxPb(() => ({
			lien: 'https://www.facebook.com/1001_999',
			page: { id: '1001', nom: 'Axe Musique', access_token: 'FUITE' },
		}))
		const p = publication()
		const rendu = await publierSurFacebook(pb, p)
		expect(rendu).toEqual({
			lien: 'https://www.facebook.com/1001_999',
			page: { id: '1001', nom: 'Axe Musique' },
		})
		const { chemin, options } = pb.appels[0]
		expect(chemin).toBe(ROUTE_FACEBOOK_PUBLIER)
		expect(options.method).toBe('POST')
		const corps = options.body as FormData
		expect([...corps.keys()].sort()).toEqual(['envoi', 'image', 'message'])
		expect(corps.get('message')).toBe('Promo de Noël\nJusque samedi')
		expect(corps.get('envoi')).toBe(p.envoi)
		expect((corps.get('image') as Blob).size).toBe(PNG.size)
	})

	it('le même envoi ne part pas deux fois (double clic)', async () => {
		const pb = fauxPb(() => ({ lien: 'https://www.facebook.com/1001_999' }))
		const p = publication()
		await publierSurFacebook(pb, p)
		const e = await publierSurFacebook(pb, p).catch((err) => err)
		expect(e.code).toBe('deja_envoye')
		expect(e.incertain).toBe(true)
		expect(pb.appels).toHaveLength(1)
	})

	it('après un refus NET, la même publication peut repartir', async () => {
		let refuser = true
		const pb = fauxPb(() =>
			refuser
				? echec(
						409,
						'jeton_expire',
						"La connexion à Facebook a expiré. Rien n'a été publié.",
					)
				: { lien: 'https://www.facebook.com/1001_999' },
		)
		const p = publication()
		const e = await publierSurFacebook(pb, p).catch((err) => err)
		expect(e.code).toBe('jeton_expire')
		expect(e.incertain).toBe(false)
		expect(e.aReconnecter).toBe(true)
		expect(e.message).toContain("Rien n'a été publié")
		refuser = false
		expect((await publierSurFacebook(pb, p)).lien).toContain('1001_999')
	})

	it('après un échec INCERTAIN, la même publication ne repart jamais', async () => {
		for (const lever of [
			() => echec(504, 'publication_incertaine'),
			() => echec(0),
			() => {
				throw new TypeError('Failed to fetch')
			},
		]) {
			oublierEnvois()
			const pb = fauxPb(lever)
			const p = publication()
			const e = await publierSurFacebook(pb, p).catch((err) => err)
			expect(e.code).toBe('publication_incertaine')
			expect(e.incertain).toBe(true)
			expect(e.message).toContain('Vérifiez la Page')
			const second = await publierSurFacebook(pb, p).catch((err) => err)
			expect(second.code).toBe('deja_envoye')
			expect(pb.appels).toHaveLength(1)
		}
	})

	it('un 200 sans lien de facebook.com : publié, mais on ne propose pas de renvoyer', async () => {
		for (const lien of [
			undefined,
			'https://exemple.test/1001_999',
			'javascript:alert(1)',
			'https://www.facebook.com/1001_999" onclick="x',
		]) {
			oublierEnvois()
			const pb = fauxPb(() => ({ lien }))
			const e = await publierSurFacebook(pb, publication()).catch((err) => err)
			expect(e.code).toBe('publication_incertaine')
		}
	})

	it('traduit ce que la route ne nomme pas', () => {
		expect(traduireErreurFacebook({ status: 401 }).code).toBe('session_expiree')
		expect(traduireErreurFacebook({ status: 403 }).code).toBe('reserve_admin')
		expect(traduireErreurFacebook({ status: 413 }, true).code).toBe(
			'image_trop_lourde',
		)
		// Refus net sans code : rien n'est parti, même en publication
		expect(traduireErreurFacebook({ status: 400 }, true).incertain).toBe(false)
		// Hors publication, une coupure est une panne ordinaire
		expect(traduireErreurFacebook({ status: 0 }).code).toBe(
			'service_indisponible',
		)
	})
})
