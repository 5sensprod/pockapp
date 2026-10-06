// Le DÉTOURAGE IA, de bout en bout contre le vrai store de l'éditeur et le vrai
// service d'images (IndexedDB factice), avec un faux `pb.send` qui se comporte
// comme celui du SDK : il lit la réponse en JSON et lève sur un statut ≥ 400.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import presetImageService from '../services/presetImageService'
import { indexedDBFactice } from '../services/indexedDBFactice'
import useLabelStore from '../store/useLabelStore'
import {
	ATTENTE_LONGUE_MS,
	COTE_MAX,
	type Codec,
	type EtapeDetourage,
	HISTORIQUE_MAX,
	type HistoriqueDurees,
	QUALITES_DETOURAGE,
	QUALITE_DETOURAGE_DEFAUT,
	SEUIL_ENVOI_OCTETS,
	appelerDetourage,
	dataURLEnBlob,
	dureeHabituelle,
	estimerRestant,
	choisirQualiteDetourage,
	estQualiteDetourage,
	historiqueDetourage,
	lancerDetourage,
	messageJauge,
	peutDetourer,
	preparerImage,
	sourceAEnvoyer,
	traduireErreur,
	useEtatDetourage,
	useReglagesDetourage,
} from './detourage'

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

/** `fetch` rend ce que `reponse()` fabrique ; `pb.send` en fait ce que fait le SDK. */
const fauxPb = (
	reponse: () => Response | Promise<Response>,
	pendant?: () => void,
) => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => reponse()),
	)
	return {
		send: vi.fn(async (_chemin: string, options: any) => {
			pendant?.()
			let r: Response
			try {
				r = await options.fetch('/api/ai/remove-background', {})
			} catch (e) {
				throw { status: 0, response: {}, originalError: e }
			}
			let data: any = {}
			try {
				data = await r.json()
			} catch {}
			if (r.status >= 400) throw { status: r.status, response: data }
			return data
		}),
	}
}

const succes = (entetes: Record<string, string> = {}) =>
	new Response(PNG, {
		status: 200,
		headers: { 'Content-Type': 'image/png', ...entetes },
	})
const echec = (status: number, code: string, error = 'Message du serveur') =>
	new Response(JSON.stringify({ error, code }), {
		status,
		headers: { 'Content-Type': 'application/json' },
	})

/** Un codec sans canvas : le poids d'une image = ses pixels × `octetsParPixel`. */
const codecFactice = (
	largeur: number,
	hauteur: number,
	transparente = false,
	octetsParPixel = 0.25,
) => {
	const appels: { l: number; h: number; mime: string }[] = []
	const codec: Codec = async () => ({
		largeur,
		hauteur,
		transparente,
		encoder: async (l, h, mime) => {
			appels.push({ l, h, mime })
			const size = Math.floor(l * h * octetsParPixel)
			// Un vrai Blob quand il est petit (il part dans un FormData) ; au-delà,
			// pas d'allocation : seuls `size` et `type` sont lus
			return size <= 1e6
				? new Blob([new Uint8Array(size)], { type: mime })
				: ({ size, type: mime } as Blob)
		},
	})
	return { codec, appels }
}

const sourceFactice = async () => new Blob(['source'], { type: 'image/jpeg' })

/** Un historique en mémoire : aucun test ne dépend du `localStorage` du poste. */
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
	source: sourceFactice,
	historique: historiqueFactice(),
	...extra,
})

/** Les étapes par lesquelles la jauge est passée, dans l'ordre, sans répétition. */
const suivreEtapes = () => {
	const vues: (EtapeDetourage | null)[] = []
	const arreter = useEtatDetourage.subscribe((s) => {
		if (vues[vues.length - 1] !== s.etape) vues.push(s.etape)
	})
	return { vues, arreter }
}

beforeEach(() => {
	vi.stubGlobal('indexedDB', indexedDBFactice())
	;(presetImageService as any).db = null
	useLabelStore.setState({
		elements: [photo()],
		selectedId: 'e1',
		extraIds: [],
	})
	// Le store regroupe deux écritures des mêmes champs à moins de 600 ms (un
	// curseur tenu) : on termine le geste du test précédent avant de commencer
	etat().updateElement('e1', { opacity: 1 })
	etat().resetHistory()
	useEtatDetourage.setState({
		enCours: false,
		erreur: null,
		info: null,
		rangees: 0,
		etape: null,
		debutEtape: 0,
		habituelMs: null,
	})
	vi.spyOn(console, 'debug').mockImplementation(() => {})
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => succes()),
	)
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe('peutDetourer', () => {
	it('accepte une image libre, seule, au repos', () => {
		expect(peutDetourer(photo(), 1)).toEqual({ ok: true })
	})

	it('refuse un élément verrouillé, avec la raison', () => {
		const r = peutDetourer(photo({ locked: true }), 1)
		expect(r.ok).toBe(false)
		expect(!r.ok && r.raison).toMatch(/verrouill/)
	})

	it('refuse une photo liée au produit', () => {
		const r = peutDetourer(
			photo({ src: '{{product_image}}', dataBinding: 'image' }),
			1,
		)
		expect(r.ok).toBe(false)
		expect(!r.ok && r.raison).toMatch(/produit/)
	})

	it('refuse une sélection multiple', () => {
		const r = peutDetourer(photo(), 2)
		expect(r.ok).toBe(false)
		expect(!r.ok && r.raison).toMatch(/une seule/)
	})

	it('refuse pendant une requête', () => {
		const r = peutDetourer(photo(), 1, true)
		expect(r.ok).toBe(false)
		expect(!r.ok && r.raison).toMatch(/en cours/)
	})

	it('refuse ce qui n’est pas une image ou n’a pas de source', () => {
		expect(peutDetourer({ id: 't', type: 'text' }, 1).ok).toBe(false)
		expect(peutDetourer(photo({ src: '' }), 1).ok).toBe(false)
	})
})

describe('la source à envoyer', () => {
	it('une data URL part telle quelle, sans réseau', async () => {
		const blob = await sourceAEnvoyer(
			photo({ src: 'data:image/png;base64,iVBORw0K' }),
		)
		expect(blob.type).toBe('image/png')
		expect(blob.size).toBe(6)
		expect(fetch).not.toHaveBeenCalled()
	})

	it('une adresse de fichier PocketBase est téléchargée par le renderer', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
			),
		)
		const blob = await sourceAEnvoyer(
			photo({ src: 'http://127.0.0.1:8090/api/files/brands/b1/logo.png' }),
		)
		expect(blob.size).toBe(3)
		expect(fetch).toHaveBeenCalledWith(
			'http://127.0.0.1:8090/api/files/brands/b1/logo.png',
		)
	})

	it('un marqueur de liaison produit n’est jamais envoyé', async () => {
		await expect(
			sourceAEnvoyer(photo({ src: '{{product_image}}' })),
		).rejects.toThrow()
	})

	it('dataURLEnBlob décode le base64', async () => {
		expect(
			new Uint8Array(
				await dataURLEnBlob('data:image/png;base64,AQID').arrayBuffer(),
			),
		).toEqual(new Uint8Array([1, 2, 3]))
	})
})

describe('la préparation', () => {
	it('une image de 4096 px sort sous le seuil, et sans dépasser 4096 px', async () => {
		// 0,5 octet par pixel : 8 Mio à 4096 px, au-dessus du seuil
		const { codec, appels } = codecFactice(4096, 4096, false, 0.5)
		const sortie = await preparerImage(new Blob(['x']), codec)
		expect(sortie.blob.size).toBeLessThanOrEqual(SEUIL_ENVOI_OCTETS)
		expect(Math.max(sortie.largeur, sortie.hauteur)).toBeLessThan(4096) // il a fallu réduire
		expect(appels.length).toBeGreaterThan(1)
		expect(appels.every((a) => Math.max(a.l, a.h) <= COTE_MAX)).toBe(true)
	})

	it('une image plus grande que 4096 px est d’abord ramenée à 4096 px', async () => {
		const { codec, appels } = codecFactice(8000, 4000, false, 0.0001)
		const sortie = await preparerImage(new Blob(['x']), codec)
		expect(appels[0]).toMatchObject({ l: 4096, h: 2048 })
		expect(sortie.largeur).toBe(4096)
	})

	it('une image légère part d’un seul coup, en JPEG', async () => {
		const { codec, appels } = codecFactice(800, 600)
		await preparerImage(new Blob(['x']), codec)
		expect(appels).toEqual([{ l: 800, h: 600, mime: 'image/jpeg' }])
	})

	it('une source transparente n’est pas envoyée en JPEG', async () => {
		const { codec, appels } = codecFactice(800, 600, true)
		await preparerImage(new Blob(['x']), codec)
		expect(appels.every((a) => a.mime === 'image/webp')).toBe(true)
	})

	it('une image qui reste lourde même minuscule est refusée localement', async () => {
		const { codec } = codecFactice(4096, 4096, false, 1e6)
		await expect(preparerImage(new Blob(['x']), codec)).rejects.toMatchObject({
			code: 'image_trop_lourde',
		})
	})
})

describe('les familles d’erreur', () => {
	const cas: [number, string, string][] = [
		[402, 'credit_epuise', 'credit'],
		[413, 'image_trop_lourde', 'taille'],
		[415, 'type_refuse', 'format'],
		[502, 'fournisseur_en_echec', 'service'],
		[504, 'delai_depasse', 'service'],
		[502, 'service_indisponible', 'service'],
		[502, 'reponse_invalide', 'service'],
		[503, 'cle_absente', 'configuration'],
		[503, 'cle_invalide', 'configuration'],
		[503, 'adresse_non_securisee', 'configuration'],
	]
	it.each(cas)('%i %s → famille %s', async (status, code, famille) => {
		const pb = fauxPb(() => echec(status, code))
		await expect(appelerDetourage(pb, new Blob(['x']))).rejects.toMatchObject({
			code,
			famille,
		})
	})

	it('reprend le message du serveur, lisible tel quel', () => {
		const e = traduireErreur({
			status: 402,
			response: { code: 'credit_epuise', error: 'Plus de crédits ce mois-ci.' },
		})
		expect(e.message).toBe('Plus de crédits ce mois-ci.')
	})

	it('« trop lourde » dit trop grande, sans proposer de réessayer à l’identique', () => {
		const e = traduireErreur({
			status: 413,
			response: {
				code: 'image_trop_lourde',
				error: 'L’image est trop lourde.',
			},
		})
		expect(e.message).toMatch(/trop grande/)
		expect(e.message).not.toMatch(/réessay/i)
		expect(e.reessayable).toBe(false)
	})

	it('une panne passagère se réessaie, un crédit épuisé non', () => {
		expect(
			traduireErreur({
				status: 502,
				response: { code: 'fournisseur_en_echec' },
			}).reessayable,
		).toBe(true)
		expect(
			traduireErreur({ status: 402, response: { code: 'credit_epuise' } })
				.reessayable,
		).toBe(false)
	})

	it('un délai dépassé n’est pas une panne : son message, repris du serveur, dit que rien n’a été décompté', () => {
		const e = traduireErreur({
			status: 504,
			response: {
				code: 'delai_depasse',
				error:
					"Le service de détourage n'a pas répondu à temps. Réessaie : rien n'a été décompté.",
			},
		})
		expect(e.code).toBe('delai_depasse')
		expect(e.message).toMatch(/pas répondu à temps/)
		expect(e.message).toMatch(/rien n'a été décompté/)
		expect(e.message).not.toMatch(/en panne/)
		expect(e.reessayable).toBe(true)
	})

	it('un 504 sans code est un délai dépassé, sans promesse sur le décompte', () => {
		const e = traduireErreur({ status: 504, response: {} })
		expect(e.code).toBe('delai_depasse')
		expect(e.message).toMatch(/pas répondu à temps/)
		expect(e.message).not.toMatch(/décompté/)
	})

	it('un serveur pas encore à jour rend la panne générique, comme avant', () => {
		const e = traduireErreur({
			status: 502,
			response: { code: 'fournisseur_en_echec', error: 'En panne.' },
		})
		expect(e.code).toBe('fournisseur_en_echec')
	})

	it('un réseau coupé ou une session expirée ont leur famille', async () => {
		const coupe = fauxPb(() => Promise.reject(new Error('réseau')))
		await expect(
			appelerDetourage(coupe, new Blob(['x'])),
		).rejects.toMatchObject({ famille: 'service' })
		expect(
			traduireErreur({ status: 403, response: { message: 'Non authentifié' } })
				.famille,
		).toBe('session')
	})

	it('une réponse 200 qui n’est pas un PNG est refusée', async () => {
		const pb = fauxPb(() => new Response('pas un png', { status: 200 }))
		await expect(appelerDetourage(pb, new Blob(['x']))).rejects.toMatchObject({
			code: 'reponse_invalide',
		})
	})

	it('l’appel lit les octets du PNG et envoie le champ « image »', async () => {
		const pb = fauxPb(() => succes())
		const { png: sortie, serveurMs } = await appelerDetourage(
			pb,
			new Blob(['x'], { type: 'image/jpeg' }),
		)
		expect(serveurMs).toBeNull() // un serveur qui ne rend pas encore la durée
		expect(sortie.type).toBe('image/png')
		expect(new Uint8Array(await sortie.arrayBuffer())).toEqual(PNG)
		const [chemin, options] = pb.send.mock.calls[0]
		expect(chemin).toBe('/api/ai/remove-background')
		expect(options.method).toBe('POST')
		expect((options.body as FormData).get('image')).toBeInstanceOf(Blob)
	})
})

describe('la qualité du détourage', () => {
	const champs = (pb: any) => [...(pb.send.mock.calls[0][1].body as FormData).keys()]
	const coffre = new Map<string, string>()

	beforeEach(() => {
		coffre.clear()
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => coffre.get(k) ?? null,
			setItem: (k: string, v: string) => void coffre.set(k, v),
		})
		useReglagesDetourage.setState({ qualite: QUALITE_DETOURAGE_DEFAUT })
	})

	it('deux qualités, identifiants du mini-SaaS, « rapide » par défaut', () => {
		expect(QUALITES_DETOURAGE.map((q) => q.id)).toEqual(['rapide', 'precis'])
		expect(QUALITE_DETOURAGE_DEFAUT).toBe('rapide')
		expect(estQualiteDetourage('precis')).toBe(true)
		expect(estQualiteDetourage('soignee')).toBe(false)
		expect(estQualiteDetourage(undefined)).toBe(false)
	})

	it.each(['rapide', 'precis'] as const)(
		'« %s » part comme identifiant, sans modèle ni dimensions',
		async (q) => {
			const pb = fauxPb(() => succes())
			await appelerDetourage(pb, new Blob(['x']), undefined, q)
			const corps = pb.send.mock.calls[0][1].body as FormData
			expect(corps.get('qualite')).toBe(q)
			expect(champs(pb).sort()).toEqual(['image', 'qualite'])
		},
	)

	it('sans qualité précisée, c’est le défaut qui part', async () => {
		const pb = fauxPb(() => succes())
		await appelerDetourage(pb, new Blob(['x']))
		expect((pb.send.mock.calls[0][1].body as FormData).get('qualite')).toBe(
			'rapide',
		)
	})

	it('lancerDetourage envoie la qualité demandée', async () => {
		const pb = fauxPb(() => succes())
		await lancerDetourage(photo(), 1, deps(pb), 'precis')
		expect((pb.send.mock.calls[0][1].body as FormData).get('qualite')).toBe(
			'precis',
		)
	})

	it('sans qualité, lancerDetourage emploie celle qui est choisie (« Détourer ensuite »)', async () => {
		choisirQualiteDetourage('precis')
		const pb = fauxPb(() => succes())
		await lancerDetourage(photo(), 1, deps(pb))
		expect((pb.send.mock.calls[0][1].body as FormData).get('qualite')).toBe(
			'precis',
		)
	})

	it('une valeur inconnue retombe sur le défaut, jamais envoyée telle quelle', async () => {
		const pb = fauxPb(() => succes())
		await lancerDetourage(photo(), 1, deps(pb), 'ultra' as any)
		expect((pb.send.mock.calls[0][1].body as FormData).get('qualite')).toBe(
			'rapide',
		)
	})

	it('le choix est mémorisé sur le poste, et relu d’une session à l’autre', () => {
		choisirQualiteDetourage('precis')
		expect(useReglagesDetourage.getState().qualite).toBe('precis')
		expect(coffre.get('pocketstick.detourage.qualite')).toBe('precis')
	})

	it('un choix inconnu n’est ni gardé ni écrit', () => {
		choisirQualiteDetourage('ultra' as any)
		expect(useReglagesDetourage.getState().qualite).toBe('rapide')
		expect(coffre.size).toBe(0)
	})

	it('sans stockage, le choix tient pour la session et rien ne lève', () => {
		vi.stubGlobal('localStorage', undefined)
		expect(() => choisirQualiteDetourage('precis')).not.toThrow()
		expect(useReglagesDetourage.getState().qualite).toBe('precis')
	})

	it('un historique de durées PAR qualité, sans reprendre l’ancienne clé', async () => {
		coffre.set('pocketstick.detourage.durees', '[60000]') // d'avant les qualités
		const { historique: _h, ...sans } = deps(fauxPb(() => succes()))
		await lancerDetourage(photo(), 1, sans, 'precis')
		expect(useEtatDetourage.getState().habituelMs).toBeNull()
		expect(historiqueDetourage('precis').lire()).toHaveLength(1)
		expect(historiqueDetourage('rapide').lire()).toEqual([])
		expect(coffre.get('pocketstick.detourage.durees')).toBe('[60000]')
	})

	it('la durée habituelle lue au lancement est celle de la qualité demandée', async () => {
		historiqueDetourage('rapide').ajouter(5000)
		historiqueDetourage('precis').ajouter(40000)
		let habituel: number | null = null
		const pb = fauxPb(
			() => succes(),
			() => {
				habituel = useEtatDetourage.getState().habituelMs
			},
		)
		const { historique: _h, ...sans } = deps(pb)
		await lancerDetourage(photo(), 1, sans, 'precis')
		expect(habituel).toBe(40000)
	})

	it('une qualité inconnue du serveur : message de détourage, famille « demande »', () => {
		const e = traduireErreur({
			status: 400,
			response: {
				code: 'qualite_inconnue',
				error: "Cette qualité de détourage n'existe pas.",
			},
		})
		expect(e).toMatchObject({ code: 'qualite_inconnue', famille: 'demande' })
		expect(e.message).toMatch(/détourage/)
	})

	it('le texte du bouton ne parle jamais d’argent', () => {
		for (const q of QUALITES_DETOURAGE)
			expect(`${q.label} ${q.titre}`).not.toMatch(/€|\$|crédit|centime|prix/i)
	})
})

describe('la durée rendue par le serveur', () => {
	it('est lue dans l’en-tête X-Detourage-Ms', async () => {
		const pb = fauxPb(() => succes({ 'X-Detourage-Ms': '5123' }))
		expect((await appelerDetourage(pb, new Blob(['x']))).serveurMs).toBe(5123)
	})

	it('un en-tête illisible vaut « inconnue », pas une erreur', async () => {
		const pb = fauxPb(() => succes({ 'X-Detourage-Ms': 'abc' }))
		expect((await appelerDetourage(pb, new Blob(['x']))).serveurMs).toBeNull()
	})

	it('prévient que la réponse arrive avant de lire ses octets', async () => {
		const recue = vi.fn()
		await appelerDetourage(
			fauxPb(() => succes()),
			new Blob(['x']),
			recue,
		)
		expect(recue).toHaveBeenCalledTimes(1)
	})
})

describe('le temps restant estimé', () => {
	it('la durée habituelle est la médiane : un démarrage à froid isolé ne la déplace pas', () => {
		expect(dureeHabituelle([])).toBeNull()
		expect(dureeHabituelle([6000])).toBe(6000)
		expect(dureeHabituelle([5000, 6000, 62000])).toBe(6000)
		expect(dureeHabituelle([4000, 6000])).toBe(5000)
		expect(dureeHabituelle([0, -3, Number.NaN])).toBeNull()
	})

	it('sans historique : pas de durée, seulement l’étape', () => {
		expect(estimerRestant(null, 0)).toEqual({ sorte: 'inconnue' })
		expect(estimerRestant(null, 9000)).toEqual({ sorte: 'inconnue' })
		const m = messageJauge('detourage', null, 3000)
		expect(m).toEqual({
			etape: 'Envoi et détourage',
			detail: null,
			prolongee: false,
		})
	})

	it('sans historique, une attente qui dure est annoncée sans durée inventée', () => {
		expect(estimerRestant(null, ATTENTE_LONGUE_MS)).toEqual({ sorte: 'longue' })
		const m = messageJauge('detourage', null, 30000)
		expect(m.prolongee).toBe(true)
		expect(m.detail).toMatch(/jusqu'à une minute/)
		expect(m.detail).not.toMatch(/d'habitude/)
		expect(m.detail).not.toMatch(/\d/)
	})

	it('avec historique : « environ N s », par pas de 5 s', () => {
		expect(estimerRestant(12000, 0)).toEqual({ sorte: 'estimee', secondes: 15 })
		expect(estimerRestant(12000, 2500)).toEqual({
			sorte: 'estimee',
			secondes: 10,
		})
		expect(estimerRestant(12000, 11000)).toEqual({
			sorte: 'estimee',
			secondes: 5,
		})
		expect(messageJauge('detourage', 12000, 2500).detail).toBe('environ 10 s')
	})

	it('durée habituelle juste passée : « encore quelques secondes »', () => {
		expect(estimerRestant(12000, 12000)).toEqual({ sorte: 'bientot' })
		expect(estimerRestant(12000, 18000)).toEqual({ sorte: 'bientot' })
		// une marge de 5 s au moins
		expect(estimerRestant(4000, 9000)).toEqual({ sorte: 'bientot' })
	})

	it('dépassée : jamais de compte à rebours négatif, un message rassurant', () => {
		expect(estimerRestant(12000, 18001)).toEqual({ sorte: 'depassee' })
		const m = messageJauge('detourage', 6000, 45000)
		expect(m.prolongee).toBe(true)
		expect(m.detail).toMatch(/plus de temps que d'habitude/)
		expect(m.detail).toMatch(/jusqu'à une minute/)
		expect(m.detail).toMatch(/continuer à travailler/)
		expect(m.detail).not.toMatch(/-\s?\d|environ/)
		expect(m.detail).not.toMatch(/panne|erreur|échec/i)
	})

	it('aucun prix, et une durée seulement pendant l’étape « détourage »', () => {
		const etapes: EtapeDetourage[] = [
			'preparation',
			'detourage',
			'reception',
			'rangement',
		]
		for (const e of etapes) {
			const m = messageJauge(e, 6000, 1000)
			expect(`${m.etape} ${m.detail ?? ''}`).not.toMatch(/€|\$|crédit|centime/i)
			if (e !== 'detourage') expect(m.detail).toBeNull()
		}
		expect(messageJauge('preparation', 6000, 1000).etape).toMatch(/Préparation/)
		expect(messageJauge('reception', 6000, 1000).etape).toMatch(/Réception/)
		expect(messageJauge('rangement', 6000, 1000).etape).toMatch(/Rangement/)
	})

	it('l’historique du poste garde les dernières durées, et ne lève jamais', () => {
		// Sans `localStorage` : rien, sans erreur
		vi.stubGlobal('localStorage', undefined)
		expect(historiqueDetourage('rapide').lire()).toEqual([])
		expect(() => historiqueDetourage('rapide').ajouter(5000)).not.toThrow()
		// Avec : les HISTORIQUE_MAX dernières
		const coffre = new Map<string, string>()
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => coffre.get(k) ?? null,
			setItem: (k: string, v: string) => void coffre.set(k, v),
		})
		for (let i = 1; i <= HISTORIQUE_MAX + 3; i++)
			historiqueDetourage('rapide').ajouter(i * 1000)
		const lues = historiqueDetourage('rapide').lire()
		expect(lues).toHaveLength(HISTORIQUE_MAX)
		expect(lues[lues.length - 1]).toBe((HISTORIQUE_MAX + 3) * 1000)
		// Un contenu abîmé ne casse rien
		coffre.set([...coffre.keys()][0], '{pas du json')
		expect(historiqueDetourage('rapide').lire()).toEqual([])
	})
})

describe('lancerDetourage — la jauge', () => {
	it('passe par les étapes dans l’ordre, puis revient au repos', async () => {
		const { vues, arreter } = suivreEtapes()
		await lancerDetourage(photo(), 1, deps(fauxPb(() => succes())))
		arreter()
		expect(vues).toEqual([
			'preparation',
			'detourage',
			'reception',
			'rangement',
			null,
		])
		expect(useEtatDetourage.getState().enCours).toBe(false)
	})

	it('un échec ramène la jauge au repos, sans passer par « réception »', async () => {
		const { vues, arreter } = suivreEtapes()
		await lancerDetourage(
			photo(),
			1,
			deps(fauxPb(() => echec(504, 'delai_depasse'))),
		)
		arreter()
		expect(vues).toEqual(['preparation', 'detourage', null])
		expect(useEtatDetourage.getState().erreur?.code).toBe('delai_depasse')
	})

	it('la durée habituelle est lue au lancement, dans l’historique du poste', async () => {
		let habituel: number | null | undefined
		const pb = fauxPb(
			() => succes(),
			() => {
				habituel = useEtatDetourage.getState().habituelMs
			},
		)
		await lancerDetourage(
			photo(),
			1,
			deps(pb, { historique: historiqueFactice([5000, 7000, 60000]) }),
		)
		expect(habituel).toBe(7000)
	})

	it('chronomètre les phases, et ajoute l’aller-retour RÉEL à l’historique', async () => {
		// Une horloge qui avance de 100 ms à chaque lecture
		let t = 0
		const maintenant = () => {
			t += 100
			return t
		}
		const durees: number[] = []
		const r = await lancerDetourage(
			photo(),
			1,
			deps(
				fauxPb(() => succes({ 'X-Detourage-Ms': '4321' })),
				{ maintenant, historique: historiqueFactice(durees) },
			),
		)
		expect(r.ok).toBe(true)
		if (!r.ok) return
		const c = r.chrono
		expect(c.serveur).toBe(4321)
		for (const phase of [
			c.source,
			c.preparation,
			c.allerRetour,
			c.reception,
			c.rangement,
			c.pose,
		])
			expect(phase).toBeGreaterThan(0)
		expect(c.total).toBeGreaterThanOrEqual(
			c.source +
				c.preparation +
				c.allerRetour +
				c.reception +
				c.rangement +
				c.pose,
		)
		expect(c.octetsRecus).toBe(PNG.length)
		expect(c.cote).toBe('800×600')
		expect(durees).toEqual([c.allerRetour])
		expect(console.debug).toHaveBeenCalledWith(
			expect.stringContaining('DETOURAGE'),
			c,
		)
	})

	it('un échec n’entre pas dans l’historique : ce n’est pas une durée de détourage', async () => {
		const durees: number[] = []
		await lancerDetourage(
			photo(),
			1,
			deps(
				fauxPb(() => echec(502, 'fournisseur_en_echec')),
				{ historique: historiqueFactice(durees) },
			),
		)
		expect(durees).toEqual([])
	})

	it('le solde est rafraîchi une fois, à la livraison, et jamais après un échec', async () => {
		const apresDecompte = vi.fn()
		await lancerDetourage(
			photo(),
			1,
			deps(
				fauxPb(() => echec(402, 'credit_epuise')),
				{ apresDecompte },
			),
		)
		expect(apresDecompte).not.toHaveBeenCalled()
		await lancerDetourage(
			photo(),
			1,
			deps(
				fauxPb(() => succes()),
				{ apresDecompte },
			),
		)
		expect(apresDecompte).toHaveBeenCalledTimes(1)
	})

	it('un rafraîchissement du solde qui échoue ne perd pas l’image', async () => {
		const r = await lancerDetourage(
			photo(),
			1,
			deps(
				fauxPb(() => succes()),
				{
					apresDecompte: () => {
						throw new Error('solde injoignable')
					},
				},
			),
		)
		expect(r).toMatchObject({ ok: true, pose: true, rangee: true })
	})

	it('on peut travailler pendant l’attente : une autre modification reste, et la pose n’est qu’UN pas de plus', async () => {
		useLabelStore.setState({
			elements: [photo(), { id: 't1', type: 'text', text: 'Promo', x: 0 }],
		})
		etat().resetHistory()
		const pb = fauxPb(
			() => succes(),
			() => {
				useLabelStore.setState({ selectedId: 't1' })
				etat().updateElement('t1', { text: 'Soldes' })
			},
		)
		const r = await lancerDetourage(photo(), 1, deps(pb))
		expect(r).toMatchObject({ ok: true, pose: true })
		expect(etat().elements.find((e: any) => e.id === 't1').text).toBe('Soldes')
		expect(etat().elements[0].src).toMatch(/^data:image\/png;base64,/)
		expect(etat().historyPast).toHaveLength(2)
	})
})

describe('lancerDetourage — une erreur ne touche à rien', () => {
	it('l’élément garde sa photo, rien n’est rangé, l’erreur est dans l’état du panneau', async () => {
		const r = await lancerDetourage(
			photo(),
			1,
			deps(fauxPb(() => echec(402, 'credit_epuise'))),
		)
		expect(r.ok).toBe(false)
		expect(etat().elements[0].src).toBe(DATA_URL)
		expect(await presetImageService.listerGenerees()).toEqual([])
		expect(useEtatDetourage.getState().erreur?.famille).toBe('credit')
		expect(useEtatDetourage.getState().enCours).toBe(false)
	})

	it('l’état « en cours » dure la requête, et empêche un second départ', async () => {
		let relacher: () => void = () => {}
		const attente = new Promise<void>((r) => (relacher = r))
		const pb = fauxPb(async () => {
			await attente
			return succes()
		})
		const premier = lancerDetourage(photo(), 1, deps(pb))
		await vi.waitFor(() => expect(pb.send).toHaveBeenCalled())
		expect(useEtatDetourage.getState().enCours).toBe(true)
		const second = await lancerDetourage(photo(), 1, deps(pb))
		expect(second.ok).toBe(false)
		expect(pb.send).toHaveBeenCalledTimes(1)
		relacher()
		expect((await premier).ok).toBe(true)
		expect(useEtatDetourage.getState().enCours).toBe(false)
	})
})

describe('lancerDetourage — la pose et le rangement', () => {
	it('un succès pose l’image en UN pas d’historique et la range dans la bibliothèque', async () => {
		const r = await lancerDetourage(photo(), 1, deps(fauxPb(() => succes())))
		expect(r).toMatchObject({ ok: true, pose: true, rangee: true })
		expect(etat().elements[0].src).toMatch(/^data:image\/png;base64,/)
		expect(etat().historyPast).toHaveLength(1)
		const generees = await presetImageService.listerGenerees()
		expect(generees).toHaveLength(1)
		expect(generees[0].src).toBe(etat().elements[0].src)
		expect(generees[0].depuis).toBe('guitare.jpg')
		expect(useEtatDetourage.getState().info).toBeNull()
	})

	it('Ctrl+Z rend la photo d’origine, et l’image détourée reste dans la bibliothèque', async () => {
		await lancerDetourage(photo(), 1, deps(fauxPb(() => succes())))
		etat().undo()
		expect(etat().elements[0].src).toBe(DATA_URL)
		expect(await presetImageService.listerGenerees()).toHaveLength(1)
	})

	it('la pose écrit sur l’id capturé, pas sur la sélection courante', async () => {
		useLabelStore.setState({
			elements: [
				photo(),
				photo({ id: 'e2', src: 'data:image/png;base64,AAAA' }),
			],
		})
		const pb = fauxPb(
			() => succes(),
			() => useLabelStore.setState({ selectedId: 'e2' }),
		)
		await lancerDetourage(photo(), 1, deps(pb))
		const [e1, e2] = etat().elements
		expect(e1.src).toMatch(/^data:image\/png;base64,/)
		expect(e1.src).not.toBe(DATA_URL)
		expect(e2.src).toBe('data:image/png;base64,AAAA')
	})

	it.each([
		[
			'sa photo a été remplacée',
			() => etat().updateElement('e1', { src: 'data:image/png;base64,ZZZZ' }),
			'data:image/png;base64,ZZZZ',
		],
		[
			'il a été verrouillé',
			() => etat().updateElement('e1', { locked: true }),
			DATA_URL,
		],
		['il a été supprimé', () => etat().deleteElement('e1'), undefined],
	])(
		'quand %s pendant l’attente : rien n’est écrasé, l’image attend dans « Génération »',
		async (_nom, change, srcAttendue) => {
			const r = await lancerDetourage(
				photo(),
				1,
				deps(fauxPb(() => succes(), change)),
			)
			expect(r).toMatchObject({ ok: true, pose: false, rangee: true })
			expect(etat().elements.find((e: any) => e.id === 'e1')?.src).toBe(
				srcAttendue,
			)
			expect(await presetImageService.listerGenerees()).toHaveLength(1)
			expect(useEtatDetourage.getState().info?.message).toMatch(/Génération/)
		},
	)

	it('si le rangement échoue (quota), l’élément reçoit quand même l’image, et le vendeur est prévenu', async () => {
		vi.stubGlobal('indexedDB', indexedDBFactice({ echecEcriture: true }))
		;(presetImageService as any).db = null
		vi.spyOn(console, 'error').mockImplementation(() => {})
		const r = await lancerDetourage(photo(), 1, deps(fauxPb(() => succes())))
		expect(r).toMatchObject({ ok: true, pose: true, rangee: false })
		expect(etat().elements[0].src).toMatch(/^data:image\/png;base64,/)
		const info = useEtatDetourage.getState().info
		expect(info?.ton).toBe('avertissement')
		expect(info?.message).toMatch(/pas pu être rangée/)
	})
})
