// frontend/modules/stick/labels/services/templateApiService.js
//
// ÉTAGE SERVEUR DES TEMPLATES — NEUTRALISÉ AU PORTAGE.
//
// Dans AppPos, ce service parlait à `/api/templates` d'AppServe. PocketApp
// n'écrit jamais dans AppPos (CLAUDE.md) et aucune collection PocketBase ne
// porte encore les templates d'affiche : l'étage serveur est donc inerte, et
// `templateService` retombe intégralement sur IndexedDB (mode 'local').
//
// L'interface est conservée À L'IDENTIQUE pour que `templateService` n'ait pas
// à être réécrit. Voir la note de nettoyage : `PocketStick-docs/01-portage-affiche.md`.

const indisponible = () => {
	throw new Error(
		"Les templates d'affiche sont locaux à ce poste : aucun stockage serveur n'est branché.",
	)
}

const templateApiService = {
	async listTemplates() {
		return []
	},
	async getMyTemplates() {
		return []
	},
	async getTemplate() {
		return null
	},
	async getStats() {
		return null
	},
	async saveTemplate() {
		return indisponible()
	},
	async updateTemplate() {
		return indisponible()
	},
	async deleteTemplate() {
		return indisponible()
	},
	async duplicateTemplate() {
		return indisponible()
	},
	async syncLocalTemplate() {
		return indisponible()
	},
}

export default templateApiService
