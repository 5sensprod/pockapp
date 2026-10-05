// frontend/modules/stick/labels/lib/composition-generation.test.ts
//
// « Générer une image » (un texte seul) et « Composer par IA » (des éléments
// pour ingrédients) : ce qui part, les refus, et le trajet commun — ranger,
// poser ou NE PAS poser, une requête d'IA à la fois, des durées séparées.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { indexedDBFactice } from '../services/indexedDBFactice'
import presetImageService from '../services/presetImageService'
import useLabelStore from '../store/useLabelStore'
import {
	calqueCompose,
	composerPropose,
	type DemandeComposer,
	elementsSelectionnes,
	historiqueComposer,
	INGREDIENTS_MAX,
	lancerComposition,
	peutComposer,
	refusIngredient,
	srcIngredient,
} from './composer'
import {
	type Codec,
	type HistoriqueDurees,
	lancerDetourage,
	libellesDe,
	SEUIL_ENVOI_OCTETS,
	useEtatDetourage,
} from './detourage'
import { historiqueEmbellir } from './embellir'
import {
	type DemandeGenerer,
	FORMATS_NOMMES,
	formatNomme,
	formatProche,
	historiqueGenerer,
	IDEES_SUJET,
	lancerGeneration,
	peutGenerer,
} from './generer'
import { historiqueRetouche, ROUTE_RETOUCHE } from './retouche'

const etat = () => useLabelStore.getState()

const PNG = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
])

const PRODUIT = { image: { src: 'data:image/png;base64,QkJCQg==' } }

// Une affiche : photo fixe, titre, photo liée au produit, forme, dessin, code, forme verrouillée
const PAGE = [
	{ id: 'photo', type: 'image', src: 'data:image/png;base64,AAAA' },
	{ id: 'titre', type: 'text', text: 'PROMO' },
	{
		id: 'produit',
		type: 'image',
		src: '{{product_image}}',
		dataBinding: 'product_image',
	},
	{ id: 'forme', type: 'shape' },
	{ id: 'trace', type: 'dessin' },
	{ id: 'code', type: 'barcode' },
	{ id: 'cadenas', type: 'shape', locked: true },
	{ id: 'photo2', type: 'image', src: 'data:image/png;base64,CCCC' },
	{ id: 'photo3', type: 'image', src: 'data:image/png;base64,DDDD' },
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
	largeur: 800,
	hauteur: 600,
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

const rendus: { id: string; coteMax: number }[] = []
const sources: string[] = []
const deps = (pb: any, extra: Record<string, unknown> = {}) => ({
	pb,
	store: useLabelStore,
	bibliotheque: presetImageService,
	codec,
	historique: historiqueFactice(),
	source: async (el: any) => {
		sources.push(el.src)
		return new Blob(['image'], { type: 'image/png' })
	},
	rendreSeul: async (id: string, coteMax: number) => {
		rendus.push({ id, coteMax })
		return new Blob(['rendu'], { type: 'image/png' })
	},
	...extra,
})

const generer = (extra: Partial<DemandeGenerer> = {}): DemandeGenerer => ({
	consigne: 'une guitare bleue',
	qualite: 'rapide',
	format: '3x4',
	definition: 'standard',
	...extra,
})
const composer = (extra: Partial<DemandeComposer> = {}): DemandeComposer => ({
	consigne: 'ces objets sur une scène',
	qualite: 'rapide',
	format: 'page',
	definition: 'standard',
	...extra,
})
const el = (id: string) => etat().elements.find((e: any) => e.id === id)
const selectionner = (...ids: string[]) =>
	useLabelStore.setState({ selectedId: ids[0] ?? null, extraIds: ids.slice(1) })

beforeEach(() => {
	vi.stubGlobal('indexedDB', indexedDBFactice())
	;(presetImageService as any).db = null
	rendus.length = 0
	sources.length = 0
	useLabelStore.setState({
		elements: PAGE.map((e) => ({ ...e })),
		selectedId: null,
		extraIds: [],
		selectedProduct: PRODUIT,
		canvasSize: { width: 595, height: 842 },
		formatTirage: 'page',
		lockCanvasToSheetCell: false,
	} as any)
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

describe('générer : formats et refus', () => {
	it('sept formats nommés, sans « celui de la page »', () => {
		expect(FORMATS_NOMMES.map((f) => f.id)).toEqual([
			'1x1',
			'4x3',
			'3x4',
			'3x2',
			'2x3',
			'16x9',
			'9x16',
		])
	})

	it('le format proposé est le plus proche des proportions de la page', () => {
		expect(formatProche(1000, 1000)).toBe('1x1')
		expect(formatProche(1600, 900)).toBe('16x9')
		expect(formatProche(900, 1600)).toBe('9x16')
		expect(formatProche(800, 600)).toBe('4x3')
		expect(formatProche(300, 450)).toBe('2x3')
		// Une A4 en portrait (0,707) tombe entre 3:4 et 2:3
		expect(['3x4', '2x3']).toContain(formatProche(595, 842))
		expect(formatProche(0, 0)).toBe('1x1')
	})

	it('« page », nul ou inconnu : jamais envoyé, le plus proche de la page à la place', () => {
		const a4 = { width: 842, height: 595 }
		expect(formatNomme('16x9', a4)).toBe('16x9')
		for (const f of ['page', null, undefined, 'A4'])
			expect(formatNomme(f, a4)).toBe(formatProche(842, 595))
	})

	it('des idées de sujet, pas de style', () => {
		expect(IDEES_SUJET.length).toBeGreaterThanOrEqual(4)
		expect(IDEES_SUJET.length).toBeLessThanOrEqual(5)
		for (const i of IDEES_SUJET) expect(i.consigne.length).toBeGreaterThan(20)
	})

	it('refus : requête en cours, consigne absente ou trop longue', () => {
		expect(peutGenerer(false, 'un piano').ok).toBe(true)
		expect(peutGenerer(true, 'un piano').ok).toBe(false)
		expect(peutGenerer(false, '   ').ok).toBe(false)
		expect(peutGenerer(false, 'é'.repeat(501)).ok).toBe(false)
		expect(peutGenerer(false, 'é'.repeat(500)).ok).toBe(true)
		// Sans consigne : seule la requête en cours est jugée
		expect(peutGenerer(false).ok).toBe(true)
	})
})

describe('générer : le trajet commun, sans pose', () => {
	it('aucune image ne part : la tâche, la consigne, la qualité, le format, la définition', async () => {
		const pb = fauxPb(succes)
		const r = await lancerGeneration(
			generer({ consigne: '  une guitare bleue ', definition: 'haute' }),
			deps(pb),
		)
		expect(r.ok).toBe(true)
		expect(pb.send).toHaveBeenCalledTimes(1)
		const corps = pb.envois[0]
		expect(Object.fromEntries(corps.entries())).toEqual({
			tache: 'generation',
			prompt: 'une guitare bleue',
			qualite: 'rapide',
			format: '3x4',
			definition: 'haute',
		})
		expect(corps.has('image')).toBe(false)
		expect(corps.has('images[]')).toBe(false)
		expect(sources).toEqual([])
		expect(rendus).toEqual([])
	})

	it('rangée dans « Génération », PAS posée : la page et son historique ne bougent pas', async () => {
		const avant = etat().elements
		const r = await lancerGeneration(generer(), deps(fauxPb(succes)))
		expect(r.ok && r.rangee).toBe(true)
		expect(r.ok && r.pose).toBe(false)
		expect(etat().elements).toBe(avant)
		expect(etat().canUndo).toBeFalsy()
		const rangees = await presetImageService.listerGenerees()
		expect(rangees).toHaveLength(1)
		expect(rangees[0].name).toBe('Image (générée)')
		expect(useEtatDetourage.getState()).toMatchObject({
			enCours: false,
			tache: 'generation',
			erreur: null,
			info: null,
			rangees: 1,
		})
	})

	it('non rangée (espace du poste) : le vendeur est prévenu, rien n’est posé', async () => {
		const r = await lancerGeneration(
			generer(),
			deps(fauxPb(succes), {
				bibliotheque: {
					ajouterGeneree: async () => {
						throw new Error('quota')
					},
				},
			}),
		)
		vi.spyOn(console, 'error').mockImplementation(() => {})
		expect(r.ok && r.pose).toBe(false)
		expect(useEtatDetourage.getState().info?.ton).toBe('avertissement')
		expect(etat().elements).toHaveLength(PAGE.length)
	})

	it('consigne absente : rien ne part', async () => {
		const pb = fauxPb(succes)
		const r = await lancerGeneration(generer({ consigne: ' ' }), deps(pb))
		expect(r.ok).toBe(false)
		expect(pb.send).not.toHaveBeenCalled()
	})

	it.each([
		[402, 'credit_epuise', 'credit'],
		[422, 'contenu_refuse', 'contenu'],
		[504, 'delai_depasse', 'service'],
		[400, 'format_inconnu', 'demande'],
	])(
		'échec %i %s : rien de rangé, un seul envoi',
		async (status, code, famille) => {
			const pb = fauxPb(() => echec(status, code))
			const r = await lancerGeneration(generer(), deps(pb))
			expect(r.ok).toBe(false)
			expect(!r.ok && r.erreur.code).toBe(code)
			expect(!r.ok && r.erreur.famille).toBe(famille)
			expect(pb.send).toHaveBeenCalledTimes(1)
			expect(await presetImageService.listerGenerees()).toHaveLength(0)
			expect(useEtatDetourage.getState().enCours).toBe(false)
		},
	)

	it('réseau coupé : le repli parle de génération, pas de détourage ni de retouche', async () => {
		const pb = {
			send: vi.fn(async () => {
				throw { status: 0, response: {} }
			}),
		}
		const r = await lancerGeneration(generer(), deps(pb))
		expect(!r.ok && r.erreur.message).toContain('génération')
		expect(!r.ok && r.erreur.message).not.toMatch(/détourage|retouche/)
	})

	it('le solde est relu à la livraison, pas après un échec', async () => {
		const apresDecompte = vi.fn()
		await lancerGeneration(
			generer(),
			deps(
				fauxPb(() => echec(402, 'credit_epuise')),
				{ apresDecompte },
			),
		)
		expect(apresDecompte).not.toHaveBeenCalled()
		await lancerGeneration(generer(), deps(fauxPb(succes), { apresDecompte }))
		expect(apresDecompte).toHaveBeenCalledTimes(1)
	})
})

describe('composer : les ingrédients', () => {
	it('acceptés : image, photo liée résolue pour le produit, forme, dessin', () => {
		for (const id of ['photo', 'produit', 'forme', 'trace'])
			expect(refusIngredient(el(id), PRODUIT)).toBeNull()
	})

	it('une photo liée est RÉSOLUE par la résolution de l’éditeur, jamais envoyée en marqueur', () => {
		expect(srcIngredient(el('produit'), PRODUIT)).toBe(PRODUIT.image.src)
		expect(srcIngredient(el('photo'), PRODUIT)).toBe(
			'data:image/png;base64,AAAA',
		)
		// Sans produit affiché : rien à envoyer, donc refus
		expect(srcIngredient(el('produit'), null)).toBe('')
		expect(refusIngredient(el('produit'), null)).toMatch(/produit/)
	})

	it('refusés : texte, QR, code-barres, fiche, verrouillé, masqué, disparu', () => {
		expect(refusIngredient(el('titre'), PRODUIT)).toMatch(/texte/i)
		expect(refusIngredient(el('code'), PRODUIT)).toMatch(/code-barres/)
		expect(refusIngredient({ type: 'qrcode' }, PRODUIT)).toMatch(/QR/)
		expect(refusIngredient({ type: 'fiche' }, PRODUIT)).toMatch(/fiche/)
		expect(refusIngredient(el('cadenas'), PRODUIT)).toMatch(/verrouillé/)
		expect(refusIngredient({ type: 'shape', visible: false }, PRODUIT)).toMatch(
			/masqué/,
		)
		expect(refusIngredient(undefined, PRODUIT)).not.toBeNull()
	})

	it('la sélection : dans l’ordre des calques, et proposée dès deux éléments', () => {
		selectionner('forme', 'photo')
		expect(elementsSelectionnes(etat()).map((e) => e.id)).toEqual([
			'photo',
			'forme',
		])
		expect(composerPropose(etat())).toBe(true)
		selectionner('photo')
		expect(composerPropose(etat())).toBe(false)
		selectionner()
		expect(elementsSelectionnes(etat())).toEqual([])
	})

	it('de 2 à 4 : un seul ou cinq refusent, jamais de troncature', () => {
		const de = (...ids: string[]) => ids.map(el)
		expect(peutComposer(etat(), de('photo')).ok).toBe(false)
		expect(peutComposer(etat(), de('photo', 'forme')).ok).toBe(true)
		expect(
			peutComposer(etat(), de('photo', 'forme', 'trace', 'produit')).ok,
		).toBe(true)
		const cinq = peutComposer(
			etat(),
			de('photo', 'forme', 'trace', 'produit', 'photo2'),
		)
		expect(cinq.ok).toBe(false)
		expect(!cinq.ok && cinq.raison).toContain(
			`${INGREDIENTS_MAX} éléments au plus`,
		)
	})

	it('un seul élément refusé refuse toute la sélection', () => {
		const de = (...ids: string[]) => ids.map(el)
		expect(peutComposer(etat(), de('photo', 'titre', 'forme')).ok).toBe(false)
		expect(peutComposer(etat(), de('photo', 'cadenas')).ok).toBe(false)
	})

	it('jamais en planche, jamais pendant une autre requête, jamais sans consigne', () => {
		const deux = [el('photo'), el('forme')]
		expect(peutComposer(etat(), deux, true).ok).toBe(false)
		expect(peutComposer(etat(), deux, false, '  ').ok).toBe(false)
		expect(peutComposer(etat(), deux, false, 'é'.repeat(501)).ok).toBe(false)
		useLabelStore.setState({ formatTirage: 'planche' })
		expect(peutComposer(etat(), deux).ok).toBe(false)
		selectionner('photo', 'forme')
		expect(composerPropose(etat())).toBe(false)
	})
})

describe('composer : le trajet commun', () => {
	it('UNE image par élément : fichier pour une image, rendu seul pour une forme ou un dessin', async () => {
		const pb = fauxPb(succes)
		const r = await lancerComposition(
			composer(),
			['photo', 'produit', 'forme', 'trace'],
			deps(pb),
		)
		expect(r.ok).toBe(true)
		expect(pb.send).toHaveBeenCalledTimes(1)
		const corps = pb.envois[0]
		expect(corps.getAll('images[]')).toHaveLength(4)
		expect(corps.has('image')).toBe(false)
		expect(corps.get('tache')).toBe('composition')
		expect(corps.get('prompt')).toBe('ces objets sur une scène')
		expect(corps.get('qualite')).toBe('rapide')
		// La photo fixe telle quelle, la photo liée RÉSOLUE pour le produit affiché
		expect(sources).toEqual(['data:image/png;base64,AAAA', PRODUIT.image.src])
		expect(rendus.map((x) => x.id)).toEqual(['forme', 'trace'])
		// Ni modèle ni dimensions
		expect([...corps.keys()].sort()).toEqual(
			[
				'tache',
				'images[]',
				'images[]',
				'images[]',
				'images[]',
				'prompt',
				'qualite',
				'format',
				'definition',
			].sort(),
		)
	})

	it('« celui de la page » part en format NOMMÉ ; un format choisi part tel quel', async () => {
		const pb = fauxPb(succes)
		await lancerComposition(composer(), ['photo', 'forme'], deps(pb))
		expect(pb.envois[0].get('format')).toBe(formatProche(595, 842))
		await lancerComposition(
			composer({ format: '16x9', definition: 'haute' }),
			['photo', 'forme'],
			deps(pb),
		)
		expect(pb.envois[1].get('format')).toBe('16x9')
		expect(pb.envois[1].get('definition')).toBe('haute')
	})

	it('le plafond d’envoi se partage entre les images', async () => {
		const tailles: number[] = []
		const lourd: Codec = async () => ({
			largeur: 2000,
			hauteur: 2000,
			transparente: false,
			// Juste au-dessus du quart du plafond à pleine taille, dessous une fois réduite
			encoder: async (l, _h, mime) => {
				tailles.push(l)
				return new Blob(
					[new Uint8Array(l >= 1536 ? SEUIL_ENVOI_OCTETS / 4 + 1 : 16)],
					{ type: mime },
				)
			},
		})
		const pb = fauxPb(succes)
		const r = await lancerComposition(
			composer(),
			['photo', 'photo2', 'photo3', 'forme'],
			deps(pb, { codec: lourd }),
		)
		expect(r.ok).toBe(true)
		const total = (pb.envois[0].getAll('images[]') as Blob[]).reduce(
			(n, b) => n + b.size,
			0,
		)
		expect(total).toBeLessThanOrEqual(SEUIL_ENVOI_OCTETS)
		expect(Math.min(...tailles)).toBeLessThan(1536)
	})

	it('nouveau calque AU-DESSUS de tout, en un pas ; les ingrédients restent ; rangé', async () => {
		const avant = etat().elements.map((e: any) => ({ ...e }))
		const r = await lancerComposition(
			composer(),
			['photo', 'forme'],
			deps(fauxPb(succes)),
		)
		expect(r.ok && r.pose && r.rangee).toBe(true)
		const apres = etat().elements
		expect(apres).toHaveLength(avant.length + 1)
		expect(apres.slice(0, avant.length)).toEqual(avant)
		const calque = apres[apres.length - 1]
		expect(calque).toMatchObject({
			type: 'image',
			fit: 'contain',
			x: 0,
			y: 0,
			width: 595,
			height: 842,
		})
		expect(calque.src.startsWith('data:image/png;base64,')).toBe(true)
		const rangees = await presetImageService.listerGenerees()
		expect(rangees[0].name).toBe('Composition (composée)')
		// Un seul pas : Ctrl+Z retire le calque, l'image reste dans la bibliothèque
		etat().undo()
		expect(etat().elements).toHaveLength(avant.length)
		expect(await presetImageService.listerGenerees()).toHaveLength(1)
	})

	it('le calque : entier, à la taille de la page', () => {
		expect(calqueCompose('x', { width: 100, height: 200 })).toMatchObject({
			width: 100,
			height: 200,
			fit: 'contain',
		})
	})

	it('cinq éléments, un texte, un seul élément : rien ne part', async () => {
		const pb = fauxPb(succes)
		for (const ids of [
			['photo', 'forme', 'trace', 'produit', 'photo2'],
			['photo', 'titre'],
			['photo'],
			['photo', 'disparu'],
		]) {
			const r = await lancerComposition(composer(), ids, deps(pb))
			expect(r.ok).toBe(false)
		}
		expect(pb.send).not.toHaveBeenCalled()
		expect(sources).toEqual([])
		expect(etat().elements).toHaveLength(PAGE.length)
	})

	it('passée en planche pendant l’attente : pas posée, mais rangée', async () => {
		const pb = fauxPb(succes, () => {
			useLabelStore.setState({ formatTirage: 'planche' })
		})
		const r = await lancerComposition(composer(), ['photo', 'forme'], deps(pb))
		expect(r.ok && r.pose).toBe(false)
		expect(r.ok && r.rangee).toBe(true)
		expect(etat().elements).toHaveLength(PAGE.length)
	})

	it.each([
		[400, 'trop_d_images', 'demande'],
		[402, 'credit_epuise', 'credit'],
		[422, 'contenu_refuse', 'contenu'],
		[504, 'delai_depasse', 'service'],
	])(
		'échec %i %s : rien de posé ni de rangé, un seul envoi',
		async (status, code, famille) => {
			const pb = fauxPb(() => echec(status, code))
			const r = await lancerComposition(
				composer(),
				['photo', 'forme'],
				deps(pb),
			)
			expect(!r.ok && r.erreur.code).toBe(code)
			expect(!r.ok && r.erreur.famille).toBe(famille)
			expect(pb.send).toHaveBeenCalledTimes(1)
			expect(etat().elements).toHaveLength(PAGE.length)
			expect(await presetImageService.listerGenerees()).toHaveLength(0)
		},
	)
})

describe('une requête d’IA à la fois, des durées séparées', () => {
	it('pendant une génération : ni composition, ni détourage, ni seconde génération', async () => {
		let composition: any
		let detourage: any
		let seconde: any
		const pb = fauxPb(succes, async () => {
			expect(useEtatDetourage.getState()).toMatchObject({
				enCours: true,
				tache: 'generation',
			})
			composition = await lancerComposition(
				composer(),
				['photo', 'forme'],
				deps(pb),
			)
			detourage = await lancerDetourage(el('photo'), 1, deps(pb) as any)
			seconde = await lancerGeneration(generer(), deps(pb))
			// La tâche refusée ne prend pas la jauge de celle qui tourne
			expect(useEtatDetourage.getState().tache).toBe('generation')
		})
		const r = await lancerGeneration(generer(), deps(pb))
		expect(r.ok).toBe(true)
		for (const refusee of [composition, detourage, seconde])
			expect(refusee.ok).toBe(false)
		expect(pb.send).toHaveBeenCalledTimes(1)
	})

	it('pendant une composition : pas de génération', async () => {
		let generation: any
		const pb = fauxPb(succes, async () => {
			generation = await lancerGeneration(generer(), deps(pb))
		})
		const r = await lancerComposition(composer(), ['photo', 'forme'], deps(pb))
		expect(r.ok).toBe(true)
		expect(generation.ok).toBe(false)
		expect(pb.send).toHaveBeenCalledTimes(1)
	})

	it('un historique par tâche, par qualité et par définition', async () => {
		const memoire = new Map<string, string>()
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => memoire.get(k) ?? null,
			setItem: (k: string, v: string) => void memoire.set(k, v),
			removeItem: (k: string) => void memoire.delete(k),
		})
		historiqueGenerer('rapide', 'standard').ajouter(4000)
		historiqueComposer('rapide', 'standard').ajouter(9000)
		historiqueGenerer('soignee', 'haute').ajouter(20000)
		expect(historiqueGenerer('rapide', 'standard').lire()).toEqual([4000])
		expect(historiqueComposer('rapide', 'standard').lire()).toEqual([9000])
		expect(historiqueGenerer('soignee', 'haute').lire()).toEqual([20000])
		expect(historiqueGenerer('rapide', 'haute').lire()).toEqual([])
		expect(historiqueComposer('soignee', 'haute').lire()).toEqual([])
		// Ni ceux de la retouche, ni ceux de l'embellissement
		expect(historiqueRetouche('rapide').lire()).toEqual([])
		expect(historiqueEmbellir('rapide', 'standard').lire()).toEqual([])
		expect([...memoire.keys()].sort()).toEqual([
			'pocketstick.composition.durees.rapide.standard',
			'pocketstick.generation.durees.rapide.standard',
			'pocketstick.generation.durees.soignee.haute',
		])
	})

	it('la durée d’une livraison va à l’historique de SA tâche', async () => {
		const g = historiqueFactice()
		const c = historiqueFactice()
		await lancerGeneration(generer(), deps(fauxPb(succes), { historique: g }))
		expect(g.lire()).toHaveLength(1)
		expect(c.lire()).toHaveLength(0)
		await lancerComposition(
			composer(),
			['photo', 'forme'],
			deps(fauxPb(succes), { historique: c }),
		)
		expect(c.lire()).toHaveLength(1)
		expect(g.lire()).toHaveLength(1)
	})

	it('la jauge dit la tâche', () => {
		expect(libellesDe('generation').detourage).toBe('Envoi et génération')
		expect(libellesDe('composition').preparation).toBe(
			'Préparation des éléments',
		)
		expect(libellesDe('detourage').detourage).toBe('Envoi et détourage')
		expect(libellesDe(null).detourage).toBe('Envoi et détourage')
	})
})
