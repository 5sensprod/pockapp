// frontend/modules/stick/labels/lib/embellir.test.ts
//
// Embellir la page : ce que l'IA voit selon le mode, où revient le calque, le
// refus en planche, et le trajet commun (ranger, poser en un pas, une requête
// d'IA à la fois).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { indexedDBFactice } from '../services/indexedDBFactice'
import presetImageService from '../services/presetImageService'
import useLabelStore from '../store/useLabelStore'
import {
	type Codec,
	type HistoriqueDurees,
	lancerDetourage,
	libellesDe,
	useEtatDetourage,
} from './detourage'
import {
	calqueGenere,
	type DemandeEmbellir,
	DEFINITIONS,
	estVivant,
	FORMATS,
	formatEffectif,
	historiqueEmbellir,
	idsMasques,
	lancerEmbellissement,
	peutEmbellir,
	rangDePose,
} from './embellir'
import { ROUTE_RETOUCHE } from './retouche'

const etat = () => useLabelStore.getState()

const PNG = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
])

// Une affiche : fond, photo fixe, titre, photo liée au produit, forme, prix, code
const PAGE = [
	{ id: 'fond', type: 'shape', role: 'fond', locked: true },
	{ id: 'photo', type: 'image', src: 'data:image/png;base64,AAAA' },
	{ id: 'titre', type: 'text', text: 'PROMO' },
	{
		id: 'produit',
		type: 'image',
		src: '{{product_image}}',
		dataBinding: 'product_image',
	},
	{ id: 'forme', type: 'shape' },
	{ id: 'prix', type: 'text', dataBinding: 'price' },
	{ id: 'code', type: 'barcode' },
]

const fauxPb = (
	reponse: () => Response,
	pendant?: () => void | Promise<void>,
) => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => reponse()),
	)
	const envois: FormData[] = []
	return {
		envois,
		send: vi.fn(async (chemin: string, options: any) => {
			expect(chemin).toBe(ROUTE_RETOUCHE)
			envois.push(options.body)
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
const echec = (status: number, code: string) =>
	new Response(JSON.stringify({ error: 'Message du serveur', code }), {
		status,
		headers: { 'Content-Type': 'application/json' },
	})

const codec: Codec = async () => ({
	largeur: 1448,
	hauteur: 2048,
	transparente: false,
	encoder: async (_l, _h, mime) =>
		new Blob([new Uint8Array(16)], { type: mime }),
})
const historiqueFactice = (durees: number[] = []): HistoriqueDurees => ({
	lire: () => [...durees],
	ajouter: (ms) => {
		durees.push(ms)
	},
})

const rendus: { masques: string[]; coteMax: number }[] = []
const deps = (pb: any, extra: Record<string, unknown> = {}) => ({
	pb,
	store: useLabelStore,
	bibliotheque: presetImageService,
	codec,
	historique: historiqueFactice(),
	rendre: async (masques: string[], coteMax: number) => {
		rendus.push({ masques, coteMax })
		return new Blob(['page'], { type: 'image/png' })
	},
	...extra,
})

const demande = (extra: Partial<DemandeEmbellir> = {}): DemandeEmbellir => ({
	consigne: 'ambiance de Noël',
	qualite: 'rapide',
	mode: 'decor',
	format: 'page',
	definition: 'standard',
	...extra,
})

beforeEach(() => {
	vi.stubGlobal('indexedDB', indexedDBFactice())
	;(presetImageService as any).db = null
	rendus.length = 0
	useLabelStore.setState({
		elements: PAGE.map((e) => ({ ...e })),
		selectedId: null,
		extraIds: [],
		canvasSize: { width: 595, height: 842 },
		formatTirage: 'page',
		lockCanvasToSheetCell: false,
	})
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
	vi.spyOn(console, 'debug').mockImplementation(() => {})
})

describe('ce que l’IA voit, et où revient le calque', () => {
	it('vivant : textes, codes, fiche et tout ce qui suit le produit', () => {
		expect(PAGE.filter(estVivant).map((e) => e.id)).toEqual([
			'titre',
			'produit',
			'prix',
			'code',
		])
		expect(estVivant({ type: 'fiche' })).toBe(true)
		expect(estVivant({ type: 'qrcode' })).toBe(true)
		expect(estVivant({ type: 'dessin' })).toBe(false)
		expect(estVivant(null)).toBe(false)
	})

	it('décor : les vivants sont cachés ; page entière : rien n’est caché', () => {
		expect(idsMasques(PAGE, 'decor')).toEqual([
			'titre',
			'produit',
			'prix',
			'code',
		])
		expect(idsMasques(PAGE, 'entiere')).toEqual([])
	})

	it('décor : sous le premier vivant ; page entière : au-dessus de tout', () => {
		expect(rangDePose(PAGE, 'decor')).toBe(2)
		expect(rangDePose(PAGE, 'entiere')).toBe(PAGE.length)
		// Sans aucun texte : au-dessus du décor qu'il remplace
		expect(rangDePose(PAGE.slice(0, 2), 'decor')).toBe(2)
		expect(rangDePose([], 'decor')).toBe(0)
	})

	it('décor : toujours au format de la page ; page entière : le format choisi', () => {
		expect(formatEffectif('decor', '1x1')).toBe('page')
		expect(formatEffectif('entiere', '1x1')).toBe('1x1')
	})

	it('le calque couvre la page (décor) ou s’y montre entier (page entière)', () => {
		const canvas = { width: 595, height: 842 }
		expect(calqueGenere('data:x', 'decor', canvas)).toMatchObject({
			type: 'image',
			x: 0,
			y: 0,
			width: 595,
			height: 842,
			fit: 'cover',
		})
		expect(calqueGenere('data:x', 'entiere', canvas).fit).toBe('contain')
	})

	it('formats et définitions : des identifiants, jamais des pixels ni un modèle', () => {
		expect(FORMATS.map((f) => f.id)).toEqual([
			'page',
			'1x1',
			'4x3',
			'3x4',
			'3x2',
			'2x3',
			'16x9',
			'9x16',
		])
		expect(DEFINITIONS.map((d) => d.id)).toEqual(['standard', 'haute'])
	})
})

describe('peutEmbellir', () => {
	it('accepte une page en format « page » avec une consigne', () => {
		expect(peutEmbellir(etat(), false, 'x')).toEqual({ ok: true })
	})

	it('refuse en planche, par le format du tirage ou par la page verrouillée sur la case', () => {
		useLabelStore.setState({ formatTirage: 'planche' })
		expect(peutEmbellir(etat(), false, 'x').ok).toBe(false)
		useLabelStore.setState({
			formatTirage: 'page',
			lockCanvasToSheetCell: true,
		})
		expect(peutEmbellir(etat(), false, 'x').ok).toBe(false)
	})

	it('refuse une page vide, une requête en cours, une consigne absente', () => {
		expect(peutEmbellir({ ...etat(), elements: [] }, false, 'x').ok).toBe(false)
		expect(peutEmbellir(etat(), true, 'x').ok).toBe(false)
		expect(peutEmbellir(etat(), false, '  ').ok).toBe(false)
		expect(peutEmbellir(etat(), false).ok).toBe(true)
	})
})

describe('lancerEmbellissement', () => {
	it('décor : la page part sans ses vivants, au format de la page, et le calque revient SOUS le titre, en un pas', async () => {
		const pb = fauxPb(succes)
		const r = await lancerEmbellissement(
			demande({ format: '1x1', definition: 'haute' }),
			deps(pb),
		)
		expect(r.ok && r.pose && r.rangee).toBe(true)
		expect(rendus).toEqual([
			{ masques: ['titre', 'produit', 'prix', 'code'], coteMax: 2048 },
		])
		const corps = pb.envois[0]
		expect(corps.get('format')).toBe('page')
		expect(corps.get('definition')).toBe('haute')
		expect(corps.get('qualite')).toBe('rapide')
		expect(corps.get('prompt')).toBe('ambiance de Noël')
		expect([...corps.keys()].sort()).toEqual([
			'definition',
			'format',
			'image',
			'prompt',
			'qualite',
		])
		const ids = etat().elements.map((e: any) => e.id)
		expect(ids).toHaveLength(PAGE.length + 1)
		expect(ids.slice(0, 2)).toEqual(['fond', 'photo'])
		expect(ids.slice(3)).toEqual(['titre', 'produit', 'forme', 'prix', 'code'])
		const calque = etat().elements[2]
		expect(calque).toMatchObject({
			type: 'image',
			name: 'Décor IA',
			fit: 'cover',
		})
		expect(calque.src).toMatch(/^data:image\/png;base64,/)
		// Rien de la page n'a été modifié
		expect(etat().elements.filter((e: any) => e.id !== calque.id)).toEqual(
			PAGE.map((e) => expect.objectContaining(e)),
		)
		// Un seul pas : Ctrl+Z retire le calque, l'image reste dans « Génération »
		etat().undo()
		expect(etat().elements.map((e: any) => e.id)).toEqual(PAGE.map((e) => e.id))
		const generees = await presetImageService.listerGenerees()
		expect(generees).toHaveLength(1)
		expect(generees[0].name).toBe('page (décor)')
	})

	it('page entière : rien n’est caché, le format choisi part, le calque revient au-dessus de tout', async () => {
		const pb = fauxPb(succes)
		const r = await lancerEmbellissement(
			demande({ mode: 'entiere', format: '1x1' }),
			deps(pb),
		)
		expect(r.ok && r.pose).toBe(true)
		expect(rendus[0].masques).toEqual([])
		expect(pb.envois[0].get('format')).toBe('1x1')
		expect(pb.envois[0].get('definition')).toBe('standard')
		const dernier = etat().elements.at(-1)
		expect(dernier).toMatchObject({ name: 'Page embellie', fit: 'contain' })
		expect((await presetImageService.listerGenerees())[0].name).toBe(
			'page (embellie)',
		)
	})

	it('en planche : refusé sans rendu ni envoi', async () => {
		useLabelStore.setState({ formatTirage: 'planche' })
		const pb = fauxPb(succes)
		const r = await lancerEmbellissement(demande(), deps(pb))
		expect(r.ok).toBe(false)
		expect(rendus).toEqual([])
		expect(pb.send).not.toHaveBeenCalled()
	})

	it('passée en planche pendant l’attente : rien n’est posé, l’image attend dans « Génération »', async () => {
		const pb = fauxPb(succes, () =>
			useLabelStore.setState({ formatTirage: 'planche' }),
		)
		const r = await lancerEmbellissement(demande(), deps(pb))
		expect(r.ok && !r.pose && r.rangee).toBe(true)
		expect(etat().elements).toHaveLength(PAGE.length)
		expect(useEtatDetourage.getState().info?.message).toMatch(/Génération/)
	})

	it('le rang est calculé à l’arrivée : un texte ajouté dessous pendant l’attente reste dessus', async () => {
		const pb = fauxPb(succes, () =>
			useLabelStore.setState({
				elements: [{ id: 'nouveau', type: 'text' }, ...etat().elements],
			}),
		)
		await lancerEmbellissement(demande(), deps(pb))
		expect(etat().elements[0].name).toBe('Décor IA')
		expect(etat().elements[1].id).toBe('nouveau')
	})

	it('UNE requête d’IA à la fois : pas de détourage pendant un embellissement, et inversement', async () => {
		let pendant: any
		const pb = fauxPb(succes, async () => {
			if (pendant) return
			pendant = await lancerDetourage(
				{ id: 'photo', type: 'image', src: 'data:image/png;base64,AAAA' },
				1,
				deps(pb, { source: async () => new Blob(['x']) }),
			)
			expect(useEtatDetourage.getState().tache).toBe('embellir')
		})
		const r = await lancerEmbellissement(demande(), deps(pb))
		expect(pendant.ok).toBe(false)
		expect(r.ok).toBe(true)
		expect(pb.send).toHaveBeenCalledTimes(1)
	})

	it('échec : rien n’est posé ni rangé, un seul appel', async () => {
		const pb = fauxPb(() => echec(400, 'format_inconnu'))
		const r = await lancerEmbellissement(demande(), deps(pb))
		expect(r.ok).toBe(false)
		if (r.ok) return
		expect(r.erreur.code).toBe('format_inconnu')
		expect(r.erreur.reessayable).toBe(false)
		expect(etat().elements).toHaveLength(PAGE.length)
		expect(await presetImageService.listerGenerees()).toEqual([])
		expect(pb.send).toHaveBeenCalledTimes(1)
	})

	it('un rendu impossible sort en erreur, sans rien envoyer', async () => {
		const pb = fauxPb(succes)
		const r = await lancerEmbellissement(
			demande(),
			deps(pb, {
				rendre: async () => {
					throw new Error("La page n'est pas disponible.")
				},
			}),
		)
		expect(r.ok).toBe(false)
		expect(pb.send).not.toHaveBeenCalled()
		expect(useEtatDetourage.getState().enCours).toBe(false)
	})

	it('durées par qualité et par définition, et jauge à ses propres mots', async () => {
		const stock = new Map<string, string>()
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => stock.get(k) ?? null,
			setItem: (k: string, v: string) => void stock.set(k, v),
		})
		const { historique: _h, ...sans } = deps(fauxPb(succes))
		await lancerEmbellissement(demande({ definition: 'haute' }), sans)
		expect(historiqueEmbellir('rapide', 'haute').lire()).toHaveLength(1)
		expect(historiqueEmbellir('rapide', 'standard').lire()).toEqual([])
		expect([...stock.keys()]).toEqual([
			'pocketstick.embellir.durees.rapide.haute',
		])
		expect(libellesDe('embellir').detourage).toBe('Envoi et embellissement')
		expect(libellesDe('embellir').preparation).toBe('Rendu de la page')
	})
})
