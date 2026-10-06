// « Proposer un texte » pour la publication Facebook (`post-facebook.ts`).
// Ce que garde ce fichier : seuls des IDENTIFIANTS de produits partent — jamais
// un prix ni une description du renderer — ; les produits sont ceux que la page
// PRÉSENTE, épinglés compris ; rien en planche ; une requête d'IA à la fois ;
// la proposition est bornée et n'est écrite nulle part par la fonction.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MESSAGE_MAX } from '@/lib/facebook/client'
import { useEtatDetourage } from './detourage'
import { useBrouillonFacebook } from './facebook'
import {
	CONSIGNE_POST_MAX,
	PRODUITS_MAX,
	ROUTE_POST_FACEBOOK,
	TEXTES_MAX,
	idsProduitsDeLaPage,
	peutRediger,
	proposerTexte,
	propositionBornee,
	textesDeLaPage,
	traduireErreurPost,
	useReglagesPost,
} from './post-facebook'

const A = { _id: 'a', name: 'Guitare', price: 349, sale_price: 299 }
const B = { _id: 'b', name: 'Ampli', price: 149 }

const page = (extra: Record<string, unknown> = {}) => ({
	formatTirage: 'page',
	lockCanvasToSheetCell: false,
	selectedProduct: A,
	produitsParId: { a: A, b: B },
	elements: [
		{ id: 't0', type: 'text', text: '  PACK   RENTRÉE ' },
		{ id: 't1', type: 'text', text: '', dataBinding: 'name' },
		{ id: 't2', type: 'text', text: '', dataBinding: 'sale_price' },
		{ id: 't3', type: 'text', text: '', dataBinding: 'name', produitId: 'b' },
		{ id: 'i1', type: 'image', src: '', dataBinding: 'product_image', produitId: 'b' },
		{ id: 's1', type: 'shape', shape: 'rectangle' },
	],
	...extra,
})

const store = (etat: any) => ({ getState: () => etat })

beforeEach(() => {
	useEtatDetourage.setState({ enCours: false, tache: null, erreur: null })
	useReglagesPost.setState({ ton: 'chaleureux', consigne: '' })
	useBrouillonFacebook.setState({ message: '' })
})

describe('ce que la page présente', () => {
	it('le produit de la page et le produit épinglé, sans doublon', () => {
		expect(idsProduitsDeLaPage(page())).toEqual(['a', 'b'])
	})

	it('un produit au tirage dont la page ne montre rien ne part pas', () => {
		const sansLien = page({
			elements: [{ id: 't0', type: 'text', text: 'PROMO' }],
		})
		expect(idsProduitsDeLaPage(sansLien)).toEqual([])
	})

	it('un élément masqué ne compte pas, un produit épinglé introuvable non plus', () => {
		const etat = page({
			elements: [
				{ id: 't1', type: 'text', text: '', dataBinding: 'name', visible: false },
				{ id: 't3', type: 'text', text: '', dataBinding: 'name', produitId: 'z' },
			],
		})
		expect(idsProduitsDeLaPage(etat)).toEqual([])
	})

	it('les textes tels qu’ils s’affichent, chacun pour SON produit', () => {
		expect(textesDeLaPage(page())).toEqual([
			'PACK RENTRÉE',
			'Guitare',
			'299 €',
			'Ampli',
		])
	})

	it('textes bornés en nombre, vides et doublons retirés', () => {
		const elements = Array.from({ length: 20 }, (_, i) => ({
			id: `t${i}`,
			type: 'text',
			text: i % 2 ? `Ligne ${i}` : `Ligne ${i - (i ? 0 : 0)}`,
		}))
		elements.push({ id: 'vide', type: 'text', text: '   ' })
		elements.push({ id: 'double', type: 'text', text: 'Ligne 1' })
		const textes = textesDeLaPage(page({ elements }))
		expect(textes).toHaveLength(TEXTES_MAX)
		expect(new Set(textes).size).toBe(textes.length)
	})
})

describe('peut-on proposer un texte ?', () => {
	it('oui pour une page qui présente un produit', () => {
		expect(peutRediger(page())).toEqual({ ok: true })
	})

	it('jamais en planche', () => {
		expect(peutRediger(page({ formatTirage: 'planche' })).ok).toBe(false)
		expect(peutRediger(page({ lockCanvasToSheetCell: true })).ok).toBe(false)
	})

	it('pas sans produit, pas pendant une autre requête d’IA', () => {
		expect(peutRediger(page({ elements: [] })).ok).toBe(false)
		expect(peutRediger(page(), true).ok).toBe(false)
	})

	it('trop de produits : refusé, jamais tronqué', () => {
		const produitsParId: Record<string, unknown> = {}
		const elements = Array.from({ length: PRODUITS_MAX + 1 }, (_, i) => {
			produitsParId[`p${i}`] = { _id: `p${i}`, name: `P${i}` }
			return { id: `e${i}`, type: 'text', text: '', dataBinding: 'name', produitId: `p${i}` }
		})
		const refus = peutRediger(page({ elements, produitsParId, selectedProduct: null }))
		expect(refus.ok).toBe(false)
	})

	it('consigne trop longue : refusée', () => {
		expect(peutRediger(page(), false, 'é'.repeat(CONSIGNE_POST_MAX)).ok).toBe(true)
		expect(peutRediger(page(), false, 'é'.repeat(CONSIGNE_POST_MAX + 1)).ok).toBe(false)
	})
})

describe('la demande', () => {
	it('des identifiants, les textes, le ton, la consigne — et RIEN d’autre', async () => {
		const send = vi.fn(async () => ({ texte: ' Un texte.\r\nDeux lignes. ', model: 'x' }))
		useReglagesPost.setState({ ton: 'sobre', consigne: '  insiste   sur le pack ' })
		const rendu = await proposerTexte({ pb: { send } as any, store: store(page()) })

		expect(send).toHaveBeenCalledOnce()
		const [route, options] = send.mock.calls[0] as unknown as [string, any]
		expect(route).toBe(ROUTE_POST_FACEBOOK)
		expect(options.method).toBe('POST')
		expect(options.body).toEqual({
			produits: ['a', 'b'],
			textes: ['PACK RENTRÉE', 'Guitare', '299 €', 'Ampli'],
			ton: 'sobre',
			consigne: 'insiste sur le pack',
		})
		// Ni prix, ni description, ni nom de produit en champ : le Go relit les fiches
		expect(Object.keys(options.body).sort()).toEqual(['consigne', 'produits', 'textes', 'ton'])
		expect(rendu).toEqual({ ok: true, texte: 'Un texte.\nDeux lignes.', prixAVerifier: false })
	})

	it('la fonction n’écrit PAS le brouillon : le vendeur décide', async () => {
		useBrouillonFacebook.setState({ message: 'Mon texte à moi' })
		const send = vi.fn(async () => ({ texte: 'Proposition' }))
		await proposerTexte({ pb: { send } as any, store: store(page()) })
		expect(useBrouillonFacebook.getState().message).toBe('Mon texte à moi')
	})

	it('l’alerte de prix est transmise', async () => {
		const send = vi.fn(async () => ({ texte: 'À 1 € !', alerte: 'prix_a_verifier' }))
		const rendu = await proposerTexte({ pb: { send } as any, store: store(page()) })
		expect(rendu).toMatchObject({ ok: true, prixAVerifier: true })
	})

	it('une seule requête d’IA à la fois, et l’état est rendu', async () => {
		let pendant: any = null
		const send = vi.fn(async () => {
			pendant = { ...useEtatDetourage.getState() }
			return { texte: 'ok' }
		})
		await proposerTexte({ pb: { send } as any, store: store(page()) })
		expect(pendant.enCours).toBe(true)
		expect(pendant.tache).toBe('post')
		expect(useEtatDetourage.getState().enCours).toBe(false)

		useEtatDetourage.setState({ enCours: true, tache: 'detourage' })
		const refuse = await proposerTexte({ pb: { send } as any, store: store(page()) })
		expect(refuse.ok).toBe(false)
		expect(send).toHaveBeenCalledOnce()
		// … sans prendre l'état de la tâche en cours
		expect(useEtatDetourage.getState().tache).toBe('detourage')
		expect(useEtatDetourage.getState().enCours).toBe(true)
	})

	it('rien ne part en planche ni sans produit', async () => {
		const send = vi.fn()
		expect((await proposerTexte({ pb: { send } as any, store: store(page({ formatTirage: 'planche' })) })).ok).toBe(false)
		expect((await proposerTexte({ pb: { send } as any, store: store(page({ elements: [] })) })).ok).toBe(false)
		expect(send).not.toHaveBeenCalled()
	})

	it('un échec rend l’erreur de la route et libère l’état', async () => {
		const send = vi.fn(async () => {
			throw { status: 429, response: { code: 'gemini_quota', error: 'Quota Gemini atteint.' } }
		})
		const rendu = await proposerTexte({ pb: { send } as any, store: store(page()) })
		expect(rendu.ok).toBe(false)
		if (!rendu.ok) {
			expect(rendu.erreur.code).toBe('gemini_quota')
			expect(rendu.erreur.message).toBe('Quota Gemini atteint.')
		}
		expect(useEtatDetourage.getState().enCours).toBe(false)
	})

	it('une réponse sans texte est un échec, pas un champ vidé', async () => {
		const send = vi.fn(async () => ({ texte: '   ' }))
		const rendu = await proposerTexte({ pb: { send } as any, store: store(page()) })
		expect(rendu.ok).toBe(false)
	})
})

describe('bornes et erreurs', () => {
	it('la proposition ne dépasse jamais le plafond du message', () => {
		expect([...propositionBornee('é'.repeat(MESSAGE_MAX + 50))]).toHaveLength(MESSAGE_MAX)
		expect(propositionBornee('  court  ')).toBe('court')
	})

	it('session expirée, panne', () => {
		expect(traduireErreurPost({ status: 403 }).code).toBe('session_expiree')
		expect(traduireErreurPost({ status: 0 }).code).toBe('service_indisponible')
		expect(traduireErreurPost({ status: 404, response: { code: 'produit_inconnu', error: 'x' } }).code).toBe('produit_inconnu')
	})
})
