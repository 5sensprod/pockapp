// Le DÉTOURAGE IA, de bout en bout contre le vrai store de l'éditeur et le vrai
// service d'images (IndexedDB factice), avec un faux `pb.send` qui se comporte
// comme celui du SDK : il lit la réponse en JSON et lève sur un statut ≥ 400.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import presetImageService from '../services/presetImageService'
import { indexedDBFactice } from '../services/indexedDBFactice'
import useLabelStore from '../store/useLabelStore'
import {
	COTE_MAX,
	type Codec,
	SEUIL_ENVOI_OCTETS,
	appelerDetourage,
	dataURLEnBlob,
	lancerDetourage,
	peutDetourer,
	preparerImage,
	sourceAEnvoyer,
	traduireErreur,
	useEtatDetourage,
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

const succes = () =>
	new Response(PNG, { status: 200, headers: { 'Content-Type': 'image/png' } })
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

const deps = (pb: any, extra: Record<string, unknown> = {}) => ({
	pb,
	store: useLabelStore,
	bibliotheque: presetImageService,
	codec: codecFactice(800, 600).codec,
	source: sourceFactice,
	...extra,
})

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
	})
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => succes()),
	)
})

afterEach(() => {
	vi.unstubAllGlobals()
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
		const pb = fauxPb(succes)
		const sortie = await appelerDetourage(
			pb,
			new Blob(['x'], { type: 'image/jpeg' }),
		)
		expect(sortie.type).toBe('image/png')
		expect(new Uint8Array(await sortie.arrayBuffer())).toEqual(PNG)
		const [chemin, options] = pb.send.mock.calls[0]
		expect(chemin).toBe('/api/ai/remove-background')
		expect(options.method).toBe('POST')
		expect((options.body as FormData).get('image')).toBeInstanceOf(Blob)
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
		const r = await lancerDetourage(photo(), 1, deps(fauxPb(succes)))
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
		await lancerDetourage(photo(), 1, deps(fauxPb(succes)))
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
		const pb = fauxPb(succes, () =>
			useLabelStore.setState({ selectedId: 'e2' }),
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
			const r = await lancerDetourage(photo(), 1, deps(fauxPb(succes, change)))
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
		const r = await lancerDetourage(photo(), 1, deps(fauxPb(succes)))
		expect(r).toMatchObject({ ok: true, pose: true, rangee: false })
		expect(etat().elements[0].src).toMatch(/^data:image\/png;base64,/)
		const info = useEtatDetourage.getState().info
		expect(info?.ton).toBe('avertissement')
		expect(info?.message).toMatch(/pas pu être rangée/)
	})
})
