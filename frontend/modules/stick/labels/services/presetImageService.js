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
// `ImageTemplates` et `UploadTemplate` n'aient pas à être réécrits.
//
// Les images des PRODUITS, elles, viennent de PocketBase en URL complète
// (`lib/produit-adapte.ts`) et traversent ce service sans transformation.
//
// Note de nettoyage : `PocketStick-docs/01-portage-affiche.md`.

const DB_NAME = 'LabelPresetImagesDB'
const DB_VERSION = 1
const STORE = 'images'

class PresetImageService {
	constructor() {
		this.db = null
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

		await new Promise((resolve, reject) => {
			const tx = db.transaction([STORE], 'readwrite')
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error)
			const store = tx.objectStore(STORE)
			for (const image of images) store.put(image)
		})

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
			const tx = db.transaction([STORE], 'readwrite')
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error)
			tx.objectStore(STORE).delete(filename)
		})
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
