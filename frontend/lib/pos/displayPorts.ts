// frontend/lib/pos/displayPorts.ts
// API pour gérer les ports série disponibles

/**
 * Récupère la liste des ports COM disponibles depuis le backend
 * @returns Promise avec la liste des noms de ports (ex: ['COM1', 'COM3', 'COM5'])
 */
export async function getAvailablePorts(): Promise<string[]> {
	try {
		// Appel à l'API Wails (ou votre méthode de communication backend)
		// Adapter selon votre architecture (peut être window.go.pos.CustomerDisplay.ListPorts())

		// @ts-ignore - Appel Wails
		const ports = await window.go.pos.CustomerDisplay.ListPorts()

		if (!Array.isArray(ports)) {
			throw new Error('Invalid response from backend')
		}

		return ports
	} catch (err) {
		console.error('[DisplayPorts] Erreur récupération ports:', err)
		// En cas d'erreur, retourner une liste par défaut
		return ['COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8']
	}
}
