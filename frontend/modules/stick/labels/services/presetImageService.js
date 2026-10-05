// frontend/modules/stick/labels/services/presetImageService.js
//
// BIBLIOTHÈQUE D'IMAGES DE L'ÉDITEUR — PORTÉE EN LOCAL.
//
// Dans AppPos, elle vivait sur `/api/presets/images` d'AppServe. PocketApp
// n'écrit jamais dans AppPos, et aucune collection PocketBase ne porte encore
// ces visuels : les images déposées dans l'éditeur sont donc stockées en
// IndexedDB, sur CE poste. Elles ne suivent pas d'un poste à l'autre.
//
// L'interface est conservée À L'IDENTIQUE (uploadImages / listImages /
// getImageInfo / deleteImage / getImageUrl / normalizeProductImages) pour que
// `UploadTemplate` (onglet « Médias ») n'ait pas à être réécrit.
//
// Les images des PRODUITS, elles, viennent de PocketBase en URL complète
// (`lib/produit-adapte.ts`) et traversent ce service sans transformation.
//
// Note de nettoyage : `PocketStick-docs/01-portage-affiche.md`.

import { fabriquerVignette } from '../utils/vignetteImage'

const DB_NAME = 'LabelPresetImagesDB'
// v2 (5 octobre 2026) : un second magasin, `vignettes`, à côté de `images`.
// La montée de version ne fait QUE le créer, et seulement s'il manque : rejouable,
// et aucun enregistrement d'`images` n'est lu ni réécrit.
const DB_VERSION = 2
const STORE = 'images'
const STORE_VIGNETTES = 'vignettes'

/**
 * Marque d'origine d'une image DÉTOURÉE (`lib/detourage.ts`). Une image sans
 * marque — toutes celles stockées avant le détourage — est une image importée.
 */
export const ORIGINE_GENERATION = 'generation'
const estGeneree = (image) => image?.origine === ORIGINE_GENERATION

class PresetImageService {
	constructor() {
		this.db = null
		// Cache de la liste, SANS les octets des originales : `Map<filename, entrée>`
		// où l'entrée porte `apercu` (la vignette, ou à défaut l'originale le temps
		// du rattrapage). `null` tant que la liste n'a pas été lue. Seul ce service
		// écrit dans la bibliothèque : il tient donc le cache à jour lui-même
		// (import, suppression, image rangée) et personne ne relit IndexedDB.
		this.entrees = null
		this.chargement = null
		this.abonnes = new Set()
		this.rattrapage = null
		this.sansVignette = new Set()
		this.fabriquer = fabriquerVignette
	}

	async initDB() {
		if (this.db) return this.db
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION)
			request.onerror = () => reject(request.error)
			request.onsuccess = () => {
				this.db = request.result
				resolve(this.db)
			}
			request.onupgradeneeded = (event) => {
				const db = event.target.result
				if (!db.objectStoreNames.contains(STORE)) {
					db.createObjectStore(STORE, { keyPath: 'filename' })
				}
				if (!db.objectStoreNames.contains(STORE_VIGNETTES)) {
					db.createObjectStore(STORE_VIGNETTES, { keyPath: 'filename' })
				}
			}
		})
	}

	/** Lit un File en dataURL : c'est ce qui est stocké, et ce que Konva charge. */
	lireFichier(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => resolve(String(reader.result))
			reader.onerror = () => reject(reader.error)
			reader.readAsDataURL(file)
		})
	}

	/** 📤 Dépose une ou plusieurs images dans la bibliothèque locale. */
	async uploadImages(files) {
		const db = await this.initDB()
		const fileArray = Array.isArray(files) ? files : [files]

		const images = []
		for (const file of fileArray) {
			const src = await this.lireFichier(file)
			const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`
			images.push({
				filename,
				name: file.name,
				src,
				size: file.size,
				type: file.type,
				createdAt: new Date().toISOString(),
			})
		}

		const vignettes = await Promise.all(images.map((image) => this.fabriquer(image.src).catch(() => null)))
		await new Promise((resolve, reject) => {
			const tx = db.transaction([STORE, STORE_VIGNETTES], 'readwrite')
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error)
			tx.onabort = () => reject(tx.error)
			const store = tx.objectStore(STORE)
			const magasinVignettes = tx.objectStore(STORE_VIGNETTES)
			images.forEach((image, i) => {
				store.put(image)
				if (vignettes[i]) magasinVignettes.put(this.enregistrementVignette(image, vignettes[i]))
			})
		})
		images.forEach((image, i) => this.inscrire(image, vignettes[i]))

		return { images }
	}

	/** 📋 Liste la bibliothèque, la plus récente d'abord. */
	async listImages() {
		try {
			const db = await this.initDB()
			const images = await new Promise((resolve, reject) => {
				const request = db
					.transaction([STORE], 'readonly')
					.objectStore(STORE)
					.getAll()
				request.onsuccess = () => resolve(request.result || [])
				request.onerror = () => reject(request.error)
			})
			return images.sort((a, b) =>
				String(b.createdAt).localeCompare(String(a.createdAt)),
			)
		} catch (error) {
			console.error('❌ [PRESET-IMAGES] Erreur liste images:', error)
			return []
		}
	}

	/** 📋 Les images IMPORTÉES (« Mes images ») : tout sauf les générées. */
	async listerImportees() {
		return (await this.listImages()).filter((image) => !estGeneree(image))
	}

	/** 📋 Les images GÉNÉRÉES (sous-onglet « Génération »), la plus récente d'abord. */
	async listerGenerees() {
		return (await this.listImages()).filter(estGeneree)
	}

	/**
	 * 🪄 Range une image détourée. `src` est une data URL — même forme qu'une
	 * image importée, aucune adresse distante ne se retrouve stockée.
	 * `depuis` : le nom de l'image de départ. Rejette si l'écriture échoue
	 * (quota IndexedDB) : l'appelant décide quoi faire.
	 * @param {{ src: string, depuis?: string, size?: number, type?: string, suffixe?: string, ia?: any, departSrc?: string }} image
	 */
	async ajouterGeneree({
		src,
		depuis = '',
		size = 0,
		type = 'image/png',
		// Ce que l'IA a fait de l'image : « détourée », « modifiée », « embellie »
		suffixe = 'détourée',
		// Ce qui a produit l'image (`MemoireIA`) et, pour une retouche, l'image
		// d'AVANT : le tout reste sur le poste, dans cette base, et part dans aucun export
		ia = undefined,
		departSrc = '',
	}) {
		const db = await this.initDB()
		const base = String(depuis || 'image').replace(/\.[a-z0-9]{2,5}$/i, '')
		const image = {
			filename: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${base}-${String(suffixe)
				.normalize('NFD')
				.replace(/[^a-z]/gi, '')
				.toLowerCase()}.png`,
			name: `${base} (${suffixe})`,
			src,
			size,
			type,
			createdAt: new Date().toISOString(),
			origine: ORIGINE_GENERATION,
			depuis: String(depuis || ''),
			...(ia ? { ia } : {}),
			...(departSrc ? { departSrc } : {}),
		}
		// Le rangement d'une image ne dépend pas de sa vignette : qu'elle ne se
		// fabrique pas, l'image est rangée et la vignette viendra au rattrapage.
		const vignette = await this.fabriquer(src).catch(() => null)
		await new Promise((resolve, reject) => {
			const tx = db.transaction([STORE, STORE_VIGNETTES], 'readwrite')
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error)
			tx.onabort = () => reject(tx.error)
			tx.objectStore(STORE).put(image)
			if (vignette) tx.objectStore(STORE_VIGNETTES).put(this.enregistrementVignette(image, vignette))
		})
		this.inscrire(image, vignette)
		return image
	}

	// ── La liste pour la GRILLE : vignettes seulement, mise en cache ────────────

	/** Ce que garde le magasin `vignettes` : les métadonnées de la grille + la vignette. */
	enregistrementVignette(image, vignette) {
		return {
			filename: image.filename,
			name: image.name,
			origine: image.origine,
			createdAt: image.createdAt,
			...(image.ia ? { ia: image.ia } : {}),
			vignette,
		}
	}

	entreeDe(image, apercu) {
		return {
			filename: image.filename,
			name: image.name,
			origine: image.origine,
			createdAt: image.createdAt,
			...(image.ia ? { ia: image.ia } : {}),
			apercu,
			// Pas (encore) de vignette : l'aperçu est l'originale, à rattraper
			sansVignette: !image.vignette,
		}
	}

	/** Une image vient d'entrer : elle rejoint le cache s'il est chaud. */
	inscrire(image, vignette) {
		if (!this.entrees) return
		this.entrees.set(image.filename, this.entreeDe({ ...image, vignette }, vignette || image.src))
		this.prevenir()
		if (!vignette) this.rattraper()
	}

	prevenir() {
		for (const fn of this.abonnes) fn()
	}

	/** Un abonné est prévenu à chaque changement du cache. Rend la désinscription. */
	abonner(fn) {
		this.abonnes.add(fn)
		return () => this.abonnes.delete(fn)
	}

	/** Les entrées de l'origine demandée, la plus récente d'abord ; `null` si le cache est froid. */
	lireCache(origine) {
		if (!this.entrees) return null
		return [...this.entrees.values()]
			.filter((e) => estGeneree(e) === (origine === ORIGINE_GENERATION))
			.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
	}

	/**
	 * Lit la bibliothèque UNE fois : les vignettes d'un coup, et l'originale des
	 * seules images qui n'en ont pas encore. Les appels simultanés partagent la
	 * même lecture ; `force` relit.
	 */
	async chargerApercus({ force = false } = {}) {
		if (this.entrees && !force) return this.entrees
		if (this.chargement) return this.chargement
		this.chargement = (async () => {
			const db = await this.initDB()
			const lire = (store, methode, ...args) =>
				new Promise((resolve, reject) => {
					const request = store[methode](...args)
					request.onsuccess = () => resolve(request.result)
					request.onerror = () => reject(request.error)
				})
			const tx = db.transaction([STORE, STORE_VIGNETTES], 'readonly')
			const [cles, vignettes] = await Promise.all([
				lire(tx.objectStore(STORE), 'getAllKeys'),
				lire(tx.objectStore(STORE_VIGNETTES), 'getAll'),
			])
			const parNom = new Map(vignettes.map((v) => [v.filename, v]))
			const entrees = new Map()
			const manquantes = []
			for (const cle of cles) {
				const v = parNom.get(cle)
				if (v) entrees.set(cle, this.entreeDe(v, v.vignette))
				else manquantes.push(cle)
			}
			// Les images d'avant les vignettes : leur originale, une à une
			for (const cle of manquantes) {
				const image = await lire(db.transaction([STORE], 'readonly').objectStore(STORE), 'get', cle)
				if (image) entrees.set(cle, this.entreeDe(image, image.src))
			}
			this.entrees = entrees
			this.prevenir()
			if (manquantes.length) this.rattraper()
			return entrees
		})()
		try {
			return await this.chargement
		} finally {
			this.chargement = null
		}
	}

	/**
	 * Fabrique, en arrière-plan et une par une, les vignettes qui manquent. Ne
	 * réécrit JAMAIS une originale : seul le magasin `vignettes` reçoit. Une image
	 * qui ne se décode pas est laissée telle quelle, sans réessai pendant la session.
	 */
	rattraper() {
		if (this.rattrapage) return this.rattrapage
		this.rattrapage = (async () => {
			try {
				for (;;) {
					const suivante = [...(this.entrees?.values() ?? [])].find(
						(e) => e.sansVignette && !this.sansVignette.has(e.filename),
					)
					if (!suivante) return
					// Rend la main au navigateur entre deux images
					await new Promise((r) => setTimeout(r, 0))
					const vignette = await this.fabriquer(suivante.apercu).catch(() => null)
					if (!vignette) {
						this.sansVignette.add(suivante.filename)
						continue
					}
					// Supprimée entre-temps : rien à ranger
					if (!this.entrees?.has(suivante.filename)) continue
					const db = await this.initDB()
					await new Promise((resolve, reject) => {
						const tx = db.transaction([STORE_VIGNETTES], 'readwrite')
						tx.oncomplete = () => resolve()
						tx.onerror = () => reject(tx.error)
						tx.onabort = () => reject(tx.error)
						tx.objectStore(STORE_VIGNETTES).put(this.enregistrementVignette(suivante, vignette))
					}).catch(() => this.sansVignette.add(suivante.filename))
					const encore = this.entrees?.get(suivante.filename)
					if (encore && !this.sansVignette.has(suivante.filename)) {
						this.entrees.set(suivante.filename, { ...encore, apercu: vignette, sansVignette: false })
						this.prevenir()
					}
				}
			} finally {
				this.rattrapage = null
			}
		})()
		return this.rattrapage
	}

	/**
	 * L'image d'AVANT une retouche, gardée avec son résultat (`departSrc`), ou
	 * undefined. Lue à la demande : elle n'entre jamais dans le cache de la grille.
	 */
	async lireDepart(filename) {
		const image = await this.getImageInfo(filename)
		return image?.departSrc || undefined
	}

	async getImageInfo(filename) {
		try {
			const db = await this.initDB()
			return await new Promise((resolve, reject) => {
				const request = db
					.transaction([STORE], 'readonly')
					.objectStore(STORE)
					.get(filename)
				request.onsuccess = () => resolve(request.result || null)
				request.onerror = () => reject(request.error)
			})
		} catch (error) {
			console.error('❌ [PRESET-IMAGES] Erreur info image:', error)
			return null
		}
	}

	async deleteImage(filename) {
		const db = await this.initDB()
		await new Promise((resolve, reject) => {
			const tx = db.transaction([STORE, STORE_VIGNETTES], 'readwrite')
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error)
			tx.objectStore(STORE).delete(filename)
			tx.objectStore(STORE_VIGNETTES).delete(filename)
		})
		if (this.entrees?.delete(filename)) this.prevenir()
		this.sansVignette.delete(filename)
		return true
	}

	async cleanupOrphanImages() {
		// Rien à nettoyer : la bibliothèque est locale et sans référence serveur.
		return { removed: 0 }
	}

	/**
	 * Les sources arrivent déjà utilisables : dataURL pour la bibliothèque,
	 * URL PocketBase complète pour les images de produit. Rien à préfixer.
	 */
	getImageUrl(src) {
		return src || null
	}

	/** Les produits sont adaptés en amont : rien à normaliser ici. */
	normalizeProductImages(product) {
		return product
	}
}

export default new PresetImageService()
