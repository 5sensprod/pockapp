// frontend/modules/stick/labels/lib/reprise-retouche.test.ts
//
// La REPRISE de la retouche (`PocketStick-docs/14-reprise-retouche.md`) : la
// mémoire de la consigne (élément + « Génération »), « Refaire », « Modifier par
// IA » d'une forme seule, et « Détourer ensuite ». Même trajet que les autres
// tâches d'IA (`lancerTraitement`) : ces tests ne vérifient que ce qui s'y ajoute.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { indexedDBFactice } from '../services/indexedDBFactice'
import presetImageService from '../services/presetImageService'
import useLabelStore from '../store/useLabelStore'
import { lancerComposition } from './composer'
import {
	type Codec,
	type HistoriqueDurees,
	lancerDetourage,
	useEtatDetourage,
} from './detourage'
import { lancerGeneration } from './generer'
import {
	aUneMemoire,
	lancerRefaire,
	peutRefaire,
	reprendreConsigne,
} from './refaire'
import {
	DEPART_MAX_CARACTERES,
	lancerRetoucheSuivie,
	useReglagesRetouche,
} from './retouche'
import {
	lancerRetoucheSeul,
	peutRetoucherSeul,
	retoucheSeulPropose,
} from './retouche-seul'

const PNG = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
])
const DEPART = 'data:image/png;base64,QUFBQQ=='

const PAGE = [
	{ id: 'forme', type: 'shape', x: 10, y: 20, width: 100, height: 50 },
	{ id: 'dessus', type: 'text', text: 'PROMO' },
	{ id: 'photo', type: 'image', src: DEPART },
	{ id: 'trace', type: 'dessin', x: 0, y: 0, width: 30, height: 30 },
	{ id: 'cadenas', type: 'shape', locked: true },
]

/** Un faux PocketBase qui accepte n'importe quelle route d'IA et garde ce qui part. */
const fauxPb = () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(
			async () =>
				new Response(PNG, {
					status: 200,
					headers: { 'Content-Type': 'image/png' },
				}),
		),
	)
	const envois: { chemin: string; corps: FormData }[] = []
	return {
		envois,
		send: vi.fn(async (chemin: string, options: any) => {
			envois.push({ chemin, corps: options.body })
			const r: Response = await options.fetch(chemin, {})
			if (r.status >= 400) throw { status: r.status, response: {} }
			return {}
		}),
	}
}

const codec: Codec = async () => ({
	largeur: 800,
	hauteur: 600,
	transparente: false,
	encoder: async (_l, _h, mime) =>
		new Blob([new Uint8Array(16)], { type: mime }),
})
const historiqueFactice = (): HistoriqueDurees => ({
	lire: () => [],
	ajouter: () => {},
})

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
	rendreSeul: async (
		_id: string,
		_cote: number,
		surZone?: (z: any) => void,
	) => {
		surZone?.({ x: 8, y: 18, width: 104, height: 54 })
		return new Blob(['rendu'], { type: 'image/png' })
	},
	lireDepart: (nom: string) => presetImageService.lireDepart(nom),
	...extra,
})

const etat = () => useLabelStore.getState()
const el = (id: string) => etat().elements.find((e: any) => e.id === id) as any
const demande = {
	consigne: '  fond blanc uni  ',
	qualite: 'equilibree' as const,
}

beforeEach(() => {
	vi.stubGlobal('indexedDB', indexedDBFactice())
	;(presetImageService as any).db = null
	sources.length = 0
	useLabelStore.setState({
		elements: PAGE.map((e) => ({ ...e })),
		selectedId: null,
		extraIds: [],
		selectedProduct: null,
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
	useReglagesRetouche.setState({
		consigne: '',
		qualite: 'rapide',
		detourerEnsuite: false,
	})
	vi.spyOn(console, 'debug').mockImplementation(() => {})
})

describe('la mémoire de la consigne', () => {
	it("une retouche écrit sur l'élément ce qui l'a produite, avec le nom de l'image rangée", async () => {
		const pb = fauxPb()
		const r = await lancerRetoucheSuivie(el('photo'), 1, demande, deps(pb))
		expect(r.ok && r.pose).toBe(true)
		const [rangee] = await presetImageService.listerGenerees()
		expect(el('photo').ia).toEqual({
			tache: 'retouche',
			consigne: 'fond blanc uni',
			qualite: 'equilibree',
			rangee: rangee.filename,
		})
		// La bibliothèque porte la même mémoire, et l'image d'AVANT
		expect(rangee.ia).toMatchObject({
			tache: 'retouche',
			consigne: 'fond blanc uni',
		})
		expect(rangee.departSrc).toBe(DEPART)
	})

	it("la grille ne reçoit que la consigne : jamais l'image de départ", async () => {
		await lancerRetoucheSuivie(el('photo'), 1, demande, deps(fauxPb()))
		const entrees = await presetImageService.chargerApercus({ force: true })
		const [entree] = [...entrees.values()]
		expect(entree.ia.consigne).toBe('fond blanc uni')
		expect(JSON.stringify(entree)).not.toContain('departSrc')
	})

	it("un détourage n'écrit aucune mémoire", async () => {
		await lancerDetourage(el('photo'), 1, deps(fauxPb()))
		expect(el('photo').ia).toBeUndefined()
		const [rangee] = await presetImageService.listerGenerees()
		expect(rangee.ia).toBeUndefined()
		expect(rangee.departSrc).toBeUndefined()
	})

	it('une image trop lourde ne garde pas son départ, et le résultat est quand même posé', async () => {
		etat().updateElements({
			photo: {
				src: `data:image/png;base64,${'A'.repeat(DEPART_MAX_CARACTERES)}`,
			},
		})
		const r = await lancerRetoucheSuivie(
			el('photo'),
			1,
			demande,
			deps(fauxPb()),
		)
		expect(r.ok && r.pose).toBe(true)
		const [rangee] = await presetImageService.listerGenerees()
		expect(rangee.departSrc).toBeUndefined()
		expect(peutRefaire(el('photo'), false, false).ok).toBe(false)
	})

	it('une composition pose un calque qui porte sa mémoire, format compris', async () => {
		const r = await lancerComposition(
			{
				consigne: 'une scène',
				qualite: 'rapide',
				format: '16x9',
				definition: 'haute',
			},
			['photo', 'forme'],
			deps(fauxPb()),
		)
		expect(r.ok && r.pose).toBe(true)
		const calque = etat().elements.at(-1) as any
		expect(calque.ia).toMatchObject({
			tache: 'composition',
			consigne: 'une scène',
			format: '16x9',
			definition: 'haute',
		})
	})

	it("une génération range sa mémoire dans « Génération » (pas d'élément posé)", async () => {
		await lancerGeneration(
			{
				consigne: 'une guitare',
				qualite: 'rapide',
				format: '3x4',
				definition: 'standard',
			},
			deps(fauxPb()),
		)
		const [rangee] = await presetImageService.listerGenerees()
		expect(rangee.ia).toMatchObject({
			tache: 'generation',
			consigne: 'une guitare',
			format: '3x4',
		})
		expect(etat().elements).toHaveLength(PAGE.length)
	})

	it('reprendre la consigne remplit les champs, et une qualité inconnue revient au défaut', () => {
		reprendreConsigne({
			tache: 'retouche',
			consigne: 'fond bleu',
			qualite: 'soignee',
		})
		expect(useReglagesRetouche.getState()).toMatchObject({
			consigne: 'fond bleu',
			qualite: 'soignee',
		})
		reprendreConsigne({ tache: 'retouche', consigne: 'x', qualite: 'inconnue' })
		expect(useReglagesRetouche.getState().qualite).toBe('rapide')
	})

	it("une mémoire malformée (JSON importé) n'est pas une mémoire", () => {
		expect(aUneMemoire({ ia: { consigne: 3, tache: 'retouche' } })).toBe(false)
		expect(aUneMemoire({})).toBe(false)
		expect(aUneMemoire({ ia: { consigne: 'a', tache: 'retouche' } })).toBe(true)
	})
})

describe('refaire', () => {
	it("repart de l'image de DÉPART, pas du résultat, et remplace la src", async () => {
		await lancerRetoucheSuivie(el('photo'), 1, demande, deps(fauxPb()))
		const premier = el('photo').src
		sources.length = 0
		const pb = fauxPb()
		const r = await lancerRefaire(el('photo'), deps(pb))
		expect(r.ok && r.pose).toBe(true)
		expect(sources).toEqual([DEPART])
		expect(pb.envois).toHaveLength(1)
		expect(pb.envois[0].corps.get('prompt')).toBe('fond blanc uni')
		expect(pb.envois[0].corps.get('qualite')).toBe('equilibree')
		// Deux tirages rangés ; l'élément pointe sur le nouveau, avec le même départ
		const rangees = await presetImageService.listerGenerees()
		expect(rangees).toHaveLength(2)
		expect(rangees.every((x: any) => x.departSrc === DEPART)).toBe(true)
		expect(el('photo').ia.rangee).not.toBe(undefined)
		expect(typeof premier).toBe('string')
	})

	it('sans départ gardé : refusé et dit, aucune requête ne part', async () => {
		const sans = {
			...el('photo'),
			ia: {
				tache: 'retouche',
				consigne: 'a',
				qualite: 'rapide',
				rangee: 'absente.png',
			},
		}
		const pb = fauxPb()
		const r = await lancerRefaire(sans, deps(pb))
		expect(r.ok).toBe(false)
		expect(pb.envois).toHaveLength(0)
		expect(useEtatDetourage.getState().erreur?.message).toMatch(/départ/)
	})

	it('ne se refait pas : composition, verrou, photo liée, requête en cours', () => {
		const base = {
			type: 'image',
			ia: { tache: 'retouche', consigne: 'a', qualite: 'rapide' },
		}
		expect(
			peutRefaire({ ...base, ia: { ...base.ia, tache: 'composition' } }).ok,
		).toBe(false)
		expect(peutRefaire({ ...base, locked: true }).ok).toBe(false)
		expect(peutRefaire({ ...base, dataBinding: 'product_image' }).ok).toBe(
			false,
		)
		expect(peutRefaire(base, true).ok).toBe(false)
		expect(peutRefaire({ type: 'image' }).ok).toBe(false)
		expect(peutRefaire(base).ok).toBe(true)
	})

	it("une génération se refait sans image envoyée, et remplace l'image de l'élément", async () => {
		const img = {
			id: 'generee',
			type: 'image',
			src: 'data:image/png;base64,R0VO',
			ia: {
				tache: 'generation',
				consigne: 'une guitare',
				qualite: 'rapide',
				format: '3x4',
				definition: 'standard',
			},
		}
		useLabelStore.setState({ elements: [img] } as any)
		const pb = fauxPb()
		const r = await lancerRefaire(el('generee'), deps(pb))
		expect(r.ok && r.pose).toBe(true)
		expect(pb.envois[0].corps.get('tache')).toBe('generation')
		expect(pb.envois[0].corps.getAll('images[]')).toHaveLength(0)
		expect(pb.envois[0].corps.get('format')).toBe('3x4')
		expect(el('generee').src).not.toBe('data:image/png;base64,R0VO')
	})

	it('un format ou une définition inconnus (JSON importé) retombent sur des valeurs connues', async () => {
		const img = {
			id: 'generee',
			type: 'image',
			src: 'data:image/png;base64,R0VO',
			ia: {
				tache: 'generation',
				consigne: 'x',
				qualite: 'rapide',
				format: 'rien',
				definition: 'rien',
			},
		}
		useLabelStore.setState({ elements: [img] } as any)
		const pb = fauxPb()
		await lancerRefaire(el('generee'), deps(pb))
		expect(['1x1', '4x3', '3x4', '3x2', '2x3', '16x9', '9x16']).toContain(
			pb.envois[0].corps.get('format'),
		)
		expect(['standard', 'haute']).toContain(
			pb.envois[0].corps.get('definition'),
		)
	})
})

describe('modifier par IA une forme ou un dessin seul', () => {
	it('ne propose que forme et dessin', () => {
		expect(retoucheSeulPropose(el('forme'))).toBe(true)
		expect(retoucheSeulPropose(el('trace'))).toBe(true)
		expect(retoucheSeulPropose(el('dessus'))).toBe(false)
		expect(retoucheSeulPropose(el('photo'))).toBe(false)
	})

	it('refuse : verrou, masqué, sélection multiple, planche, requête en cours, consigne vide', () => {
		const e = etat()
		expect(peutRetoucherSeul(el('cadenas'), 1, e).ok).toBe(false)
		expect(peutRetoucherSeul({ ...el('forme'), visible: false }, 1, e).ok).toBe(
			false,
		)
		expect(peutRetoucherSeul(el('forme'), 2, e).ok).toBe(false)
		expect(
			peutRetoucherSeul(el('forme'), 1, { ...e, formatTirage: 'planche' }).ok,
		).toBe(false)
		expect(peutRetoucherSeul(el('forme'), 1, e, true).ok).toBe(false)
		expect(peutRetoucherSeul(el('forme'), 1, e, false, '  ').ok).toBe(false)
		expect(
			peutRetoucherSeul(el('forme'), 1, e, false, 'é'.repeat(501)).ok,
		).toBe(false)
		expect(peutRetoucherSeul(el('forme'), 1, e, false, 'or brossé').ok).toBe(
			true,
		)
	})

	it("le résultat est un NOUVEAU calque juste au-dessus de l'élément, au cadre rendu ; l'élément ne bouge pas", async () => {
		const avant = { ...el('forme') }
		const pb = fauxPb()
		const r = await lancerRetoucheSeul(
			el('forme'),
			{ consigne: 'or brossé', qualite: 'rapide' },
			deps(pb) as any,
		)
		expect(r.ok && r.pose).toBe(true)
		expect(el('forme')).toEqual(avant)
		const ids = etat().elements.map((e: any) => e.id)
		expect(ids.indexOf('forme') + 1).toBe(
			ids.findIndex((i: string) => i.startsWith('el-ia-')),
		)
		const calque = etat().elements.find((e: any) =>
			String(e.id).startsWith('el-ia-'),
		) as any
		expect(calque).toMatchObject({
			type: 'image',
			x: 8,
			y: 18,
			width: 104,
			height: 54,
			fit: 'contain',
		})
		expect(calque.ia).toMatchObject({
			tache: 'retouche',
			consigne: 'or brossé',
		})
		// La route reçoit le rendu, la consigne et la qualité : ni modèle ni dimensions
		const corps = pb.envois[0].corps
		expect(corps.get('prompt')).toBe('or brossé')
		expect(corps.get('qualite')).toBe('rapide')
		expect(corps.get('model')).toBeNull()
		expect(corps.get('width')).toBeNull()
		// Un seul pas d'historique : un Ctrl+Z retire le calque
		etat().undo()
		expect(etat().elements.map((e: any) => e.id)).toEqual(
			ids.filter((i: string) => !i.startsWith('el-ia-')),
		)
	})

	it("une page passée en planche pendant l'attente : rien n'est posé, le résultat reste rangé", async () => {
		const pb = fauxPb()
		const d = deps(pb, {
			rendreSeul: async (_i: string, _c: number, surZone: any) => {
				surZone({ x: 0, y: 0, width: 10, height: 10 })
				useLabelStore.setState({ formatTirage: 'planche' } as any)
				return new Blob(['rendu'], { type: 'image/png' })
			},
		})
		const r = await lancerRetoucheSeul(
			el('forme'),
			{ consigne: 'x', qualite: 'rapide' },
			d as any,
		)
		expect(r.ok && r.pose).toBe(false)
		expect(await presetImageService.listerGenerees()).toHaveLength(1)
	})
})

describe('« Détourer ensuite »', () => {
	it('coché : un détourage part sur le résultat posé — deux requêtes', async () => {
		const pb = fauxPb()
		await lancerRetoucheSuivie(
			el('photo'),
			1,
			{ ...demande, detourerEnsuite: true },
			deps(pb),
		)
		expect(pb.envois.map((e) => e.chemin)).toEqual([
			'/api/ai/image-to-image',
			'/api/ai/remove-background',
		])
		expect(await presetImageService.listerGenerees()).toHaveLength(2)
		expect(useEtatDetourage.getState().tache).toBe('detourage')
	})

	it('décoché : une seule requête', async () => {
		const pb = fauxPb()
		await lancerRetoucheSuivie(el('photo'), 1, demande, deps(pb))
		expect(pb.envois).toHaveLength(1)
	})

	it('la retouche a échoué : le détourage ne part pas', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response('{}', {
						status: 500,
						headers: { 'Content-Type': 'application/json' },
					}),
			),
		)
		const envois: string[] = []
		const pb = {
			send: vi.fn(async (chemin: string, options: any) => {
				envois.push(chemin)
				const r: Response = await options.fetch(chemin, {})
				throw { status: r.status, response: {} }
			}),
		}
		const r = await lancerRetoucheSuivie(
			el('photo'),
			1,
			{ ...demande, detourerEnsuite: true },
			deps(pb),
		)
		expect(r.ok).toBe(false)
		expect(envois).toEqual(['/api/ai/image-to-image'])
	})

	it("l'élément a changé pendant la retouche (rien posé) : le détourage ne part pas", async () => {
		const pb = fauxPb()
		const d = deps(pb, {
			source: async () => {
				useLabelStore
					.getState()
					.updateElements({ photo: { src: 'data:image/png;base64,Wlla' } })
				return new Blob(['image'], { type: 'image/png' })
			},
		})
		await lancerRetoucheSuivie(
			el('photo'),
			1,
			{ ...demande, detourerEnsuite: true },
			d,
		)
		expect(pb.envois).toHaveLength(1)
	})

	it('une forme seule : le détourage part sur le calque posé', async () => {
		const pb = fauxPb()
		await lancerRetoucheSeul(
			el('forme'),
			{ consigne: 'or', qualite: 'rapide', detourerEnsuite: true },
			deps(pb) as any,
		)
		expect(pb.envois.map((e) => e.chemin)).toEqual([
			'/api/ai/image-to-image',
			'/api/ai/remove-background',
		])
	})
})
