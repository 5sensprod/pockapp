// frontend/modules/stick/labels/lib/photos.test.ts
//
// Le mini-chat « Photos » : le format de la page devient une orientation
// NOMMÉE, ce qui part à la route, une requête d'IA à la fois, un échec dit
// sans alarme, et le rangement d'une photo dans SA liste — pas dans « Mes
// images », jamais sur la page.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { indexedDBFactice } from '../services/indexedDBFactice'
import presetImageService, {
	ORIGINE_PHOTO,
} from '../services/presetImageService'
import useLabelStore from '../store/useLabelStore'
import { FORMATS_PAGE } from '../utils/formatsPage'
import { useEtatDetourage } from './detourage'
import {
	chargerMiniature,
	DEMANDE_MAX,
	effacerConversationPhotos,
	envoyerDemande,
	garderPhoto,
	HISTORIQUE_MAX,
	historiqueEnvoye,
	nomDeFichier,
	orientationDeLaPage,
	pageEnvoyee,
	peutDemander,
	type Photo,
	proportionsDuCadre,
	afficherPlus,
	ROUTE_PHOTOS_CHAT,
	ROUTE_PHOTOS_FICHIER,
	ROUTE_PHOTOS_SUITE,
	telechargerPhoto,
	traduireErreurPhotos,
	useConversationPhotos,
	viderMiniatures,
} from './photos'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
const A4_PAYSAGE = { width: 842, height: 595 }

const photo = (id: string): Photo => ({
	id,
	miniature: `mini-${id}.sig`,
	image: `image-${id}.sig`,
	largeur: 2400,
	hauteur: 1600,
	description: `photo ${id}`,
})
const QUATRE = ['a', 'b', 'c', 'd'].map(photo)

/** Un faux PocketBase : `chat` répond aux demandes, `fichier` rend des octets. */
const fauxPb = (
	chat: (body: any) => any = () => ({
		texte: 'Voici quatre photos.',
		resultats: QUATRE,
		recherche: { requete: 'frozen lake', orientation: 'paysage', page: 1 },
		suite: true,
	}),
	fichier: () => Response = () =>
		new Response(JPEG, {
			status: 200,
			headers: { 'Content-Type': 'image/jpeg' },
		}),
) => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => fichier()),
	)
	const envois: { chemin: string; body: any }[] = []
	return {
		envois,
		send: vi.fn(async (chemin: string, options: any) => {
			envois.push({ chemin, body: options.body })
			if (chemin === ROUTE_PHOTOS_CHAT) return chat(options.body)
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
const refuse = (status: number, code: string, error = 'Message du serveur') => {
	throw { status, response: { code, error } }
}

const conversation = () => useConversationPhotos.getState()

beforeEach(() => {
	vi.stubGlobal('indexedDB', indexedDBFactice())
	presetImageService.db = null
	presetImageService.entrees = null
	effacerConversationPhotos()
	viderMiniatures()
	useEtatDetourage.setState({ enCours: false, tache: null, erreur: null })
	useLabelStore.setState({ elements: [] })
})
afterEach(() => {
	vi.unstubAllGlobals()
	presetImageService.db = null
})

describe('le format de la page → une orientation', () => {
	it.each([
		['a4-portrait', 'portrait'],
		['a4-landscape', 'paysage'],
		['a5-portrait', 'portrait'],
		['a5-landscape', 'paysage'],
		['square-small', 'carre'],
		['instagram-post', 'carre'],
		['instagram-story', 'portrait'],
		['facebook-post', 'paysage'],
		['twitter-post', 'paysage'],
		['flyer', 'portrait'],
		['banner', 'paysage'],
	])('%s → %s', (id, attendu) => {
		const format = FORMATS_PAGE.find((f) => f.id === id)
		expect(format).toBeTruthy()
		expect(orientationDeLaPage(format)).toBe(attendu)
	})

	it('tous les formats de la liste ont une orientation', () => {
		for (const f of FORMATS_PAGE) expect(orientationDeLaPage(f)).not.toBeNull()
	})

	it('une page presque carrée est carrée, une taille libre suit ses côtés', () => {
		expect(orientationDeLaPage({ width: 500, height: 540 })).toBe('carre')
		expect(orientationDeLaPage({ width: 500, height: 560 })).toBe('portrait')
		expect(orientationDeLaPage({ width: 560, height: 500 })).toBe('paysage')
	})

	it('sans taille lisible : aucune orientation, et rien ne part', () => {
		for (const t of [null, undefined, {}, { width: 0, height: 100 }]) {
			expect(orientationDeLaPage(t as any)).toBeNull()
			expect(pageEnvoyee(t as any)).toEqual({})
		}
	})

	it('la page part en orientation nommée et en MILLIMÈTRES, jamais en points', () => {
		expect(pageEnvoyee(A4_PAYSAGE)).toEqual({
			orientation: 'paysage',
			largeur_mm: 297,
			hauteur_mm: 210,
		})
	})

	it('le cadre d’un résultat a les proportions de la page, bornées', () => {
		expect(proportionsDuCadre(A4_PAYSAGE)).toBeCloseTo(842 / 595)
		expect(proportionsDuCadre({ width: 1200, height: 400 })).toBe(2)
		expect(proportionsDuCadre({ width: 1080, height: 1920 })).toBe(0.6)
		expect(proportionsDuCadre(null)).toBe(1)
	})
})

describe('peutDemander', () => {
	it('refuse une demande vide, trop longue, ou pendant une autre requête', () => {
		expect(peutDemander('  \n ').ok).toBe(false)
		expect(peutDemander('é'.repeat(DEMANDE_MAX + 1)).ok).toBe(false)
		expect(peutDemander('é'.repeat(DEMANDE_MAX)).ok).toBe(true)
		expect(peutDemander('un lac', true).ok).toBe(false)
	})
})

describe('envoyerDemande', () => {
	it('envoie la demande, la page et rien d’autre ; range la réponse dans la conversation', async () => {
		const pb = fauxPb()
		const ok = await envoyerDemande('  une forêt   avec un lac gelé ', {
			pb,
			taille: A4_PAYSAGE,
		})
		expect(ok).toBe(true)
		expect(pb.envois).toHaveLength(1)
		expect(pb.envois[0].chemin).toBe(ROUTE_PHOTOS_CHAT)
		expect(pb.envois[0].body).toEqual({
			message: 'une forêt avec un lac gelé',
			historique: [],
			page: { orientation: 'paysage', largeur_mm: 297, hauteur_mm: 210 },
		})
		const { messages, derniere } = conversation()
		expect(messages.map((m) => m.role)).toEqual(['user', 'model'])
		expect(messages[1]).toMatchObject({
			texte: 'Voici quatre photos.',
			suite: true,
		})
		expect((messages[1] as any).resultats).toHaveLength(4)
		expect(derniere).toEqual({
			requete: 'frozen lake',
			orientation: 'paysage',
			page: 1,
		})
		expect(useEtatDetourage.getState().enCours).toBe(false)
	})

	it('le tour suivant emporte l’historique et la dernière recherche', async () => {
		const pb = fauxPb()
		await envoyerDemande('un lac gelé', { pb, taille: A4_PAYSAGE })
		await envoyerDemande('4 autres', { pb, taille: A4_PAYSAGE })
		expect(pb.envois[1].body.historique).toEqual([
			{ role: 'user', texte: 'un lac gelé' },
			{ role: 'model', texte: 'Voici quatre photos.' },
		])
		expect(pb.envois[1].body.derniere).toEqual({
			requete: 'frozen lake',
			orientation: 'paysage',
			page: 1,
		})
	})

	it('rien n’est posé sur la page, rien n’est rangé, rien n’est écrit sur le poste', async () => {
		const poser = vi.fn()
		vi.stubGlobal('localStorage', { getItem: () => null, setItem: poser })
		await envoyerDemande('un lac', { pb: fauxPb(), taille: A4_PAYSAGE })
		expect(useLabelStore.getState().elements).toEqual([])
		await presetImageService.chargerApercus()
		expect(presetImageService.lireCache('photo')).toEqual([])
		expect(poser).not.toHaveBeenCalled()
	})

	it('une seule requête d’IA à la fois : la tâche est « photos » pendant l’appel, et une autre en cours bloque', async () => {
		let pendant: any = null
		const pb = fauxPb(() => {
			pendant = { ...useEtatDetourage.getState() }
			return { texte: 'ok', resultats: [], suite: false }
		})
		await envoyerDemande('un lac', { pb, taille: A4_PAYSAGE })
		expect(pendant).toMatchObject({
			enCours: true,
			tache: 'photos',
			etape: null,
		})

		useEtatDetourage.setState({ enCours: true, tache: 'detourage' })
		const avant = conversation().messages.length
		expect(await envoyerDemande('un autre', { pb, taille: A4_PAYSAGE })).toBe(
			false,
		)
		expect(pb.envois).toHaveLength(1)
		expect(conversation().messages).toHaveLength(avant)
		// La tâche en cours garde son état
		expect(useEtatDetourage.getState()).toMatchObject({
			enCours: true,
			tache: 'detourage',
		})
	})

	it.each([
		[429, 'quota_atteint', false],
		[502, 'fournisseur_en_echec', true],
		[404, 'aucun_resultat', false],
		[503, 'gemini_absent', false],
	])(
		'un échec %i %s devient un message de l’assistant',
		async (status, code, reessayable) => {
			const pb = fauxPb(() => refuse(status, code))
			expect(await envoyerDemande('un lac', { pb, taille: A4_PAYSAGE })).toBe(
				false,
			)
			const dernier = conversation().messages.at(-1) as any
			expect(dernier.role).toBe('model')
			expect(dernier.texte).toBe('Message du serveur')
			expect(dernier.erreur.code).toBe(code)
			expect(dernier.erreur.reessayable).toBe(reessayable)
			expect(dernier.resultats).toEqual([])
			expect(conversation().derniere).toBeNull()
			expect(useEtatDetourage.getState().enCours).toBe(false)
			// L'erreur du chat ne s'affiche pas sous le bouton d'une autre tâche
			expect(useEtatDetourage.getState().erreur).toBeNull()
		},
	)

	it('une réponse d’erreur ne repart pas dans l’historique', async () => {
		const pb = fauxPb(() => refuse(502, 'fournisseur_en_echec'))
		await envoyerDemande('un lac', { pb, taille: A4_PAYSAGE })
		expect(historiqueEnvoye(conversation().messages)).toEqual([
			{ role: 'user', texte: 'un lac' },
		])
	})

	it('l’historique envoyé est borné', () => {
		const messages = Array.from({ length: 40 }, (_, i) => ({
			id: i,
			role: 'user' as const,
			texte: `m${i}`,
		}))
		const envoye = historiqueEnvoye(messages)
		expect(envoye).toHaveLength(HISTORIQUE_MAX)
		expect(envoye.at(-1)).toEqual({ role: 'user', texte: 'm39' })
	})

	it('un résultat mal formé est écarté, pas affiché', async () => {
		const pb = fauxPb(() => ({
			texte: 'x',
			resultats: [QUATRE[0], { id: 'sans-ref' }, null],
			recherche: { requete: 'q', orientation: '', page: 2 },
			suite: true,
		}))
		await envoyerDemande('un lac', { pb, taille: A4_PAYSAGE })
		expect((conversation().messages[1] as any).resultats).toEqual([QUATRE[0]])
	})
})

describe('« Afficher plus »', () => {
	const suivantes = ['e', 'f', 'g', 'h'].map(photo)
	/** Un faux PocketBase qui sépare le chat (payant) de la suite (gratuite). */
	const pbAvecSuite = (suite: (body: any) => any) => {
		const envois: { chemin: string; body: any }[] = []
		return {
			envois,
			send: vi.fn(async (chemin: string, options: any) => {
				envois.push({ chemin, body: options.body })
				if (chemin === ROUTE_PHOTOS_SUITE) return suite(options.body)
				return {
					texte: 'Voici quatre photos.',
					resultats: QUATRE,
					recherche: {
						requete: 'frozen lake',
						orientation: 'paysage',
						page: 1,
					},
					suite: true,
				}
			}),
		}
	}

	it('demande la page suivante à la route GRATUITE, jamais au chat, sans ajouter de demande', async () => {
		let pendant: any = null
		const pb = pbAvecSuite(() => {
			pendant = {
				ia: useEtatDetourage.getState().enCours,
				plus: conversation().plus,
			}
			return { resultats: suivantes, suite: false }
		})
		await envoyerDemande('un lac gelé', { pb, taille: A4_PAYSAGE })
		expect(await afficherPlus({ pb })).toBe(true)
		expect(pb.envois.map((e) => e.chemin)).toEqual([
			ROUTE_PHOTOS_CHAT,
			ROUTE_PHOTOS_SUITE,
		])
		expect(pb.envois[1].body).toEqual({
			requete: 'frozen lake',
			orientation: 'paysage',
			page: 2,
		})
		// Pas une requête d'IA : l'état partagé n'est pas pris
		expect(pendant).toEqual({ ia: false, plus: true })
		const { messages, derniere, plus } = conversation()
		expect(messages.map((m) => m.role)).toEqual(['user', 'model', 'model'])
		expect((messages[2] as any).resultats).toEqual(suivantes)
		expect((messages[2] as any).suite).toBe(false)
		expect(derniere?.page).toBe(2)
		expect(plus).toBe(false)
		// Le message sans texte ne repart pas dans l'historique
		expect(historiqueEnvoye(messages)).toHaveLength(2)
	})

	it('une seconde fois : la page d’après', async () => {
		const pb = pbAvecSuite(() => ({ resultats: suivantes, suite: true }))
		await envoyerDemande('un lac gelé', { pb, taille: A4_PAYSAGE })
		await afficherPlus({ pb })
		await afficherPlus({ pb })
		expect(pb.envois.at(-1)?.body.page).toBe(3)
	})

	it('sans recherche, ou pendant une requête d’IA : rien ne part', async () => {
		const pb = pbAvecSuite(() => ({ resultats: suivantes, suite: true }))
		expect(await afficherPlus({ pb })).toBe(false)
		await envoyerDemande('un lac gelé', { pb, taille: A4_PAYSAGE })
		useEtatDetourage.setState({ enCours: true, tache: 'retouche' })
		expect(await afficherPlus({ pb })).toBe(false)
		expect(pb.envois).toHaveLength(1)
	})

	it('plus rien à montrer se dit simplement, et la page ne bouge pas', async () => {
		const pb = pbAvecSuite(() => refuse(404, 'aucun_resultat'))
		await envoyerDemande('un lac gelé', { pb, taille: A4_PAYSAGE })
		expect(await afficherPlus({ pb })).toBe(false)
		const dernier = conversation().messages.at(-1) as any
		expect(dernier.texte).toMatch(/pas d'autres photos/)
		expect(dernier.erreur.code).toBe('aucun_resultat')
		expect(conversation().derniere?.page).toBe(1)
	})
})

describe('traduireErreurPhotos', () => {
	it('sans code : le statut décide, et le réseau coupé est un service injoignable', () => {
		expect(traduireErreurPhotos({ status: 403 }).code).toBe('session_expiree')
		expect(traduireErreurPhotos({ status: 429 }).code).toBe('quota_atteint')
		expect(traduireErreurPhotos({ status: 504 }).code).toBe('delai_depasse')
		const coupe = traduireErreurPhotos(new Error('Failed to fetch'))
		expect(coupe.code).toBe('service_indisponible')
		expect(coupe.reessayable).toBe(true)
		expect(coupe.message).toMatch(/injoignable/)
	})
})

describe('les octets d’une photo', () => {
	it('la miniature se demande par sa RÉFÉRENCE à la route, une seule fois', async () => {
		const pb = fauxPb()
		const [a, b] = await Promise.all([
			chargerMiniature(pb, QUATRE[0]),
			chargerMiniature(pb, QUATRE[0]),
		])
		expect(a).toBe(b)
		expect(a.startsWith('data:image/jpeg;base64,')).toBe(true)
		expect(pb.envois).toEqual([
			{ chemin: ROUTE_PHOTOS_FICHIER, body: { ref: 'mini-a.sig' } },
		])
	})

	it('une miniature en échec n’est pas gardée : l’affichage suivant réessaie', async () => {
		let panne = true
		const pb = fauxPb(undefined, () =>
			panne
				? new Response(JSON.stringify({ code: 'fournisseur_en_echec' }), {
						status: 502,
					})
				: new Response(JPEG, { headers: { 'Content-Type': 'image/jpeg' } }),
		)
		await expect(chargerMiniature(pb, QUATRE[0])).rejects.toMatchObject({
			code: 'fournisseur_en_echec',
		})
		panne = false
		await expect(chargerMiniature(pb, QUATRE[0])).resolves.toMatch(/^data:/)
	})

	it('une réponse qui n’est pas une image est refusée', async () => {
		const pb = fauxPb(
			undefined,
			() =>
				new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
		)
		await expect(chargerMiniature(pb, QUATRE[1])).rejects.toMatchObject({
			code: 'reponse_invalide',
		})
	})

	it('« Ajouter à mes images » range la photo dans SA liste, en data URL, sans la poser', async () => {
		const pb = fauxPb()
		await presetImageService.chargerApercus()
		await garderPhoto(QUATRE[2], { pb, bibliotheque: presetImageService })
		expect(pb.envois).toEqual([
			{ chemin: ROUTE_PHOTOS_FICHIER, body: { ref: 'image-c.sig' } },
		])
		const gardees = presetImageService.lireCache('photo') ?? []
		expect(gardees).toHaveLength(1)
		expect(gardees[0]).toMatchObject({
			origine: ORIGINE_PHOTO,
			name: 'photo c',
		})
		expect(gardees[0].filename).toMatch(/-photo-c\.jpg$/)
		// Ni dans « Mes images », ni dans « Génération »
		expect(presetImageService.lireCache('import')).toEqual([])
		expect(presetImageService.lireCache('generation')).toEqual([])
		expect(await presetImageService.listerImportees()).toEqual([])
		// L'originale : une data URL, aucune adresse distante
		const originale = await presetImageService.getImageInfo(gardees[0].filename)
		expect(originale.src.startsWith('data:image/jpeg;base64,')).toBe(true)
		expect(originale.type).toBe('image/jpeg')
		expect(useLabelStore.getState().elements).toEqual([])
	})

	it('un poste plein le dit, sans rien casser', async () => {
		const pb = fauxPb()
		await expect(
			garderPhoto(QUATRE[0], {
				pb,
				bibliotheque: {
					ajouterPhoto: async () => {
						throw new Error('QuotaExceededError')
					},
				},
			}),
		).rejects.toMatchObject({ code: 'stockage_plein' })
	})

	it('« Télécharger » enregistre le fichier sous un nom propre, sans toucher à la bibliothèque', async () => {
		const pb = fauxPb()
		const enregistres: { taille: number; nom: string }[] = []
		const nom = await telechargerPhoto(
			{ ...QUATRE[3], id: '../d?x' },
			{
				pb,
				enregistrer: (blob, n) =>
					enregistres.push({ taille: blob.size, nom: n }),
			},
		)
		expect(nom).toBe('photo-dx.jpg')
		expect(enregistres).toEqual([{ taille: JPEG.length, nom: 'photo-dx.jpg' }])
		await presetImageService.chargerApercus()
		expect(presetImageService.lireCache('photo')).toEqual([])
		expect(nomDeFichier(QUATRE[0], 'image/webp')).toBe('photo-a.webp')
	})
})
