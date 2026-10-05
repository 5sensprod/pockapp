// frontend/modules/stick/labels/lib/retouche.test.ts
//
// La retouche par consigne : ses refus, son appel, et le trajet COMMUN avec le
// détourage (`lancerTraitement`) — ranger avant de poser, un pas d'historique,
// une seule requête d'IA à la fois, un historique de durées par qualité.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { indexedDBFactice } from '../services/indexedDBFactice'
import presetImageService from '../services/presetImageService'
import useLabelStore from '../store/useLabelStore'
import { visibleCrop } from '../utils/crop'
import {
	type Codec,
	type HistoriqueDurees,
	LIBELLES_ETAPE,
	lancerDetourage,
	libellesDe,
	messageJauge,
	peutDetourer,
	useEtatDetourage,
} from './detourage'
import {
	CONSIGNE_MAX,
	COTE_MAX_RETOUCHE,
	appelerRetouche,
	historiqueRetouche,
	IDEES_CONSIGNE,
	lancerRetouche,
	peutRetoucher,
	QUALITES,
	ROUTE_RETOUCHE,
	useReglagesRetouche,
} from './retouche'

const etat = () => useLabelStore.getState()

const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQ'
const PNG = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
])
const photo = (extra = {}) => ({
	id: 'e1',
	type: 'image',
	src: DATA_URL,
	filename: 'guitare.jpg',
	locked: false,
	...extra,
})

/** Le faux SDK de `detourage.test.ts`, qui garde en plus ce qui est envoyé. */
const fauxPb = (
	reponse: () => Response | Promise<Response>,
	pendant?: () => void | Promise<void>,
) => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => reponse()),
	)
	const envois: { chemin: string; corps: FormData }[] = []
	return {
		envois,
		send: vi.fn(async (chemin: string, options: any) => {
			envois.push({ chemin, corps: options.body })
			await pendant?.()
			const r: Response = await options.fetch(chemin, {})
			let data: any = {}
			try {
				data = await r.json()
			} catch {}
			if (r.status >= 400) throw { status: r.status, response: data }
			return data
		}),
	}
}

const succes = () =>
	new Response(PNG, { status: 200, headers: { 'Content-Type': 'image/png' } })
const echec = (status: number, code: string, error = 'Message du serveur') =>
	new Response(JSON.stringify({ error, code }), {
		status,
		headers: { 'Content-Type': 'application/json' },
	})

const codecFactice = (largeur: number, hauteur: number) => {
	const appels: { l: number; h: number }[] = []
	const codec: Codec = async () => ({
		largeur,
		hauteur,
		transparente: false,
		encoder: async (l, h, mime) => {
			appels.push({ l, h })
			return new Blob([new Uint8Array(16)], { type: mime })
		},
	})
	return { codec, appels }
}

const historiqueFactice = (durees: number[] = []): HistoriqueDurees => ({
	lire: () => [...durees],
	ajouter: (ms) => {
		durees.push(ms)
	},
})

const deps = (pb: any, extra: Record<string, unknown> = {}) => ({
	pb,
	store: useLabelStore,
	bibliotheque: presetImageService,
	codec: codecFactice(800, 600).codec,
	source: async () => new Blob(['source'], { type: 'image/jpeg' }),
	historique: historiqueFactice(),
	...extra,
})

const demande = {
	consigne: 'un fond blanc uni',
	qualite: 'equilibree' as const,
}

beforeEach(() => {
	vi.stubGlobal('indexedDB', indexedDBFactice())
	;(presetImageService as any).db = null
	useLabelStore.setState({
		elements: [photo()],
		selectedId: 'e1',
		extraIds: [],
	})
	etat().updateElement('e1', { opacity: 1 })
	etat().resetHistory()
	useEtatDetourage.setState({
		enCours: false,
		tache: null,
		erreur: null,
		info: null,
		rangees: 0,
		etape: null,
		debutEtape: 0,
		habituelMs: null,
	})
	useReglagesRetouche.setState({ consigne: '', qualite: 'rapide' })
	vi.spyOn(console, 'debug').mockImplementation(() => {})
})

describe('peutRetoucher', () => {
	it('accepte une image fixe avec une consigne', () => {
		expect(peutRetoucher(photo(), 1, false, 'un fond bleu')).toEqual({
			ok: true,
		})
	})

	it('refuse dans les mêmes cas que le détourage, avec ses propres mots', () => {
		const cas: [any, number][] = [
			[photo({ dataBinding: 'product_image' }), 1],
			[photo({ locked: true }), 1],
			[photo(), 2],
			[{ id: 't', type: 'text' }, 1],
			[photo({ src: '' }), 1],
		]
		for (const [el, nombre] of cas) {
			expect(peutDetourer(el, nombre).ok).toBe(false)
			const r = peutRetoucher(el, nombre, false, 'x')
			expect(r.ok).toBe(false)
			if (!r.ok) expect(r.raison).not.toMatch(/détour/i)
		}
	})

	it('refuse sans consigne, ou avec une consigne trop longue', () => {
		expect(peutRetoucher(photo(), 1, false, '   ').ok).toBe(false)
		expect(
			peutRetoucher(photo(), 1, false, 'é'.repeat(CONSIGNE_MAX + 1)).ok,
		).toBe(false)
		expect(peutRetoucher(photo(), 1, false, 'é'.repeat(CONSIGNE_MAX)).ok).toBe(
			true,
		)
		// Sans consigne passée : seul l'élément est jugé (le champ reste ouvert)
		expect(peutRetoucher(photo(), 1).ok).toBe(true)
	})

	it('refuse pendant une requête en cours, quelle qu’elle soit', () => {
		expect(peutRetoucher(photo(), 1, true, 'x').ok).toBe(false)
	})
})

describe('appelerRetouche', () => {
	it('envoie l’image, la consigne et la QUALITÉ — ni modèle ni dimensions', async () => {
		const pb = fauxPb(succes)
		await appelerRetouche(pb, new Blob(['x']), '  un fond bleu  ', 'soignee')
		const { chemin, corps } = pb.envois[0]
		expect(chemin).toBe(ROUTE_RETOUCHE)
		expect([...corps.keys()].sort()).toEqual(['image', 'prompt', 'qualite'])
		expect(corps.get('prompt')).toBe('un fond bleu')
		expect(corps.get('qualite')).toBe('soignee')
	})

	it('les identifiants de qualité sont ceux du mini-SaaS, sans nom de modèle', () => {
		expect(QUALITES.map((q) => q.id)).toEqual([
			'rapide',
			'equilibree',
			'soignee',
		])
		expect(JSON.stringify(QUALITES)).not.toMatch(/runware|google|flux|€|\$/i)
	})

	it('les idées de consigne tiennent sous le plafond', () => {
		for (const idee of IDEES_CONSIGNE)
			expect(idee.consigne.length).toBeLessThanOrEqual(CONSIGNE_MAX)
	})
})

describe('lancerRetouche — le trajet commun', () => {
	it('range dans « Génération » puis pose, en UN pas d’historique, en n’écrivant que `src`', async () => {
		useLabelStore.setState({
			elements: [
				photo({
					width: 200,
					height: 100,
					fit: 'cover',
					cropX: 0.1,
					cropY: 0.2,
					cropWidth: 0.5,
					cropHeight: 0.5,
				}),
			],
		})
		etat().resetHistory()
		const avant = etat().elements[0]
		const pb = fauxPb(succes)
		const r = await lancerRetouche(photo(), 1, demande, deps(pb))
		expect(r.ok && r.pose && r.rangee).toBe(true)
		const apres = etat().elements[0]
		expect(apres.src).toMatch(/^data:image\/png;base64,/)
		// Cadre, recadrage et ajustement intacts
		expect({ ...apres, src: avant.src }).toEqual(avant)
		const generees = await presetImageService.listerGenerees()
		expect(generees).toHaveLength(1)
		expect(generees[0].src).toBe(apres.src)
		etat().undo()
		expect(etat().elements[0].src).toBe(DATA_URL)
		// Ctrl+Z ne retire pas l'image payée de la bibliothèque
		expect(await presetImageService.listerGenerees()).toHaveLength(1)
		expect(pb.envois[0].corps.get('qualite')).toBe('equilibree')
	})

	it('un résultat aux proportions différentes ne déforme rien (Remplir : la partie affichée suit le cadre)', () => {
		const el = {
			type: 'image',
			width: 200,
			height: 100,
			cropX: 0,
			cropY: 0,
			cropWidth: 1,
			cropHeight: 1,
		}
		for (const naturel of [
			{ width: 1024, height: 768 },
			{ width: 1200, height: 896 },
			{ width: 848, height: 1264 },
		]) {
			const c = visibleCrop(el, naturel)
			const ratio =
				(c.cropWidth * naturel.width) / (c.cropHeight * naturel.height)
			expect(ratio).toBeCloseTo(el.width / el.height, 3)
		}
	})

	it('envoie une image réduite à 2048 px, pas à 4096', async () => {
		const { codec, appels } = codecFactice(4000, 3000)
		await lancerRetouche(photo(), 1, demande, deps(fauxPb(succes), { codec }))
		expect(appels[0]).toEqual({ l: COTE_MAX_RETOUCHE, h: 1536 })
	})

	it('élément changé pendant l’attente : rien n’est écrasé, l’image attend dans « Génération »', async () => {
		const pb = fauxPb(succes, () =>
			etat().updateElement('e1', { src: 'data:image/png;base64,AUTRE' }),
		)
		const r = await lancerRetouche(photo(), 1, demande, deps(pb))
		expect(r.ok && !r.pose && r.rangee).toBe(true)
		expect(etat().elements[0].src).toBe('data:image/png;base64,AUTRE')
		expect(useEtatDetourage.getState().info?.message).toMatch(/retouche/)
		expect(await presetImageService.listerGenerees()).toHaveLength(1)
	})

	it('UNE seule requête d’IA à la fois : ni retouche ni détourage pendant une retouche', async () => {
		let second: any
		let troisieme: any
		const pb = fauxPb(succes, async () => {
			if (second) return
			second = await lancerRetouche(photo(), 1, demande, deps(pb))
			troisieme = await lancerDetourage(photo(), 1, deps(pb))
			// La tâche en cours garde sa jauge
			expect(useEtatDetourage.getState().tache).toBe('retouche')
			expect(useEtatDetourage.getState().enCours).toBe(true)
		})
		const r = await lancerRetouche(photo(), 1, demande, deps(pb))
		expect(second.ok).toBe(false)
		expect(troisieme.ok).toBe(false)
		expect(pb.send).toHaveBeenCalledTimes(1)
		expect(r.ok).toBe(true)
	})

	it('et pas de retouche pendant un détourage', async () => {
		let pendant: any
		const pb = fauxPb(succes, async () => {
			pendant = await lancerRetouche(photo(), 1, demande, deps(pb))
		})
		await lancerDetourage(photo(), 1, deps(pb))
		expect(pendant.ok).toBe(false)
		expect(pb.send).toHaveBeenCalledTimes(1)
	})

	it('sans consigne : refusée sans rien envoyer', async () => {
		const pb = fauxPb(succes)
		const r = await lancerRetouche(
			photo(),
			1,
			{ consigne: ' ', qualite: 'rapide' },
			deps(pb),
		)
		expect(r.ok).toBe(false)
		expect(pb.send).not.toHaveBeenCalled()
		expect(useEtatDetourage.getState().tache).toBe('retouche')
	})

	it('contenu refusé : le message du serveur, non réessayable, et la consigne reste', async () => {
		useReglagesRetouche.setState({ consigne: demande.consigne })
		const pb = fauxPb(() =>
			echec(422, 'contenu_refuse', 'Refusée : changez la consigne.'),
		)
		const r = await lancerRetouche(photo(), 1, demande, deps(pb))
		expect(r.ok).toBe(false)
		if (r.ok) return
		expect(r.erreur.code).toBe('contenu_refuse')
		expect(r.erreur.message).toBe('Refusée : changez la consigne.')
		expect(r.erreur.reessayable).toBe(false)
		expect(pb.send).toHaveBeenCalledTimes(1)
		expect(useReglagesRetouche.getState().consigne).toBe(demande.consigne)
		expect(etat().elements[0].src).toBe(DATA_URL)
		expect(await presetImageService.listerGenerees()).toEqual([])
	})

	it.each([
		['prompt_absent', 400],
		['prompt_trop_long', 400],
		['qualite_inconnue', 400],
		['credit_epuise', 402],
	])('%s : non réessayable, un seul appel', async (code, status) => {
		const pb = fauxPb(() => echec(status, code))
		const r = await lancerRetouche(photo(), 1, demande, deps(pb))
		expect(r.ok).toBe(false)
		if (r.ok) return
		expect(r.erreur.code).toBe(code)
		expect(r.erreur.reessayable).toBe(false)
		expect(pb.send).toHaveBeenCalledTimes(1)
	})

	it('réseau coupé : le message de repli parle de retouche, pas de détourage', async () => {
		const pb = {
			send: vi.fn(async () => {
				throw { status: 0, response: {} }
			}),
		}
		const r = await lancerRetouche(photo(), 1, demande, deps(pb))
		expect(r.ok).toBe(false)
		if (r.ok) return
		expect(r.erreur.message).toMatch(/retouche/)
		expect(r.erreur.message).not.toMatch(/détourage/)
		expect(r.erreur.reessayable).toBe(true)
	})

	it('le solde est relu une fois à la livraison, jamais après un échec', async () => {
		const apresDecompte = vi.fn()
		await lancerRetouche(
			photo(),
			1,
			demande,
			deps(
				fauxPb(() => echec(502, 'fournisseur_en_echec')),
				{ apresDecompte },
			),
		)
		expect(apresDecompte).not.toHaveBeenCalled()
		await lancerRetouche(
			photo(),
			1,
			demande,
			deps(fauxPb(succes), { apresDecompte }),
		)
		expect(apresDecompte).toHaveBeenCalledTimes(1)
	})
})

describe('durées et jauge', () => {
	it('un historique par qualité, distinct de celui du détourage', async () => {
		const stock = new Map<string, string>()
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => stock.get(k) ?? null,
			setItem: (k: string, v: string) => void stock.set(k, v),
		})
		stock.set('pocketstick.detourage.durees', '[5000]')
		// Sans `historique` injecté : celui de la tâche, par qualité
		const { historique: _h, ...sansHistorique } = deps(fauxPb(succes))
		await lancerRetouche(
			photo(),
			1,
			{ consigne: 'x', qualite: 'soignee' },
			sansHistorique,
		)
		expect(useEtatDetourage.getState().habituelMs).toBeNull()
		expect(historiqueRetouche('soignee').lire()).toHaveLength(1)
		expect(historiqueRetouche('rapide').lire()).toEqual([])
		expect(stock.get('pocketstick.detourage.durees')).toBe('[5000]')
	})

	it('la durée habituelle lue au lancement est celle de la qualité demandée', async () => {
		let habituel: number | null = null
		const pb = fauxPb(succes, () => {
			habituel = useEtatDetourage.getState().habituelMs
		})
		await lancerRetouche(
			photo(),
			1,
			demande,
			deps(pb, { historique: historiqueFactice([20000]) }),
		)
		expect(habituel).toBe(20000)
	})

	it('un échec n’entre pas dans l’historique', async () => {
		const durees: number[] = []
		await lancerRetouche(
			photo(),
			1,
			demande,
			deps(
				fauxPb(() => echec(504, 'delai_depasse')),
				{ historique: historiqueFactice(durees) },
			),
		)
		expect(durees).toEqual([])
	})

	it('la jauge dit « retouche » pour la retouche, et rien ne change pour le détourage', () => {
		expect(
			messageJauge('detourage', null, 0, libellesDe('retouche')).etape,
		).toBe('Envoi et retouche')
		expect(libellesDe('detourage')).toBe(LIBELLES_ETAPE)
		expect(libellesDe(null)).toBe(LIBELLES_ETAPE)
		expect(messageJauge('detourage', null, 0).etape).toBe('Envoi et détourage')
	})

	it('la tâche en cours est connue pendant l’attente, et l’état revient au repos', async () => {
		let vue: string | null = null
		const pb = fauxPb(succes, () => {
			vue = useEtatDetourage.getState().tache
		})
		await lancerRetouche(photo(), 1, demande, deps(pb))
		expect(vue).toBe('retouche')
		expect(useEtatDetourage.getState().enCours).toBe(false)
		expect(useEtatDetourage.getState().etape).toBeNull()
	})
})
