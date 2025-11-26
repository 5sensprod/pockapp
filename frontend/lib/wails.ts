// frontend/lib/wails.ts
// Utilitaires pour interagir avec les bindings Go de Wails

// Wails génère automatiquement ces types dans wailsjs/
// import { GetAppVersion, OpenFileDialog, ... } from '../wailsjs/go/main/App'

// Détecte si on est dans Wails ou dans un navigateur classique
export const isWailsEnv = () => {
	return typeof (window as any).runtime !== 'undefined'
}

// Wrapper pour les appels Wails avec fallback navigateur
export const wails = {
	// Ouvre un dialogue fichier natif
	async openFile(title: string, filters?: string[]): Promise<string | null> {
		if (isWailsEnv()) {
			// Utilise le binding Go
			const { OpenFileDialog } = await import('../wailsjs/go/main/App')
			return OpenFileDialog(title, filters || [])
		}
		// Fallback: input file HTML
		return new Promise((resolve) => {
			const input = document.createElement('input')
			input.type = 'file'
			input.onchange = () => resolve(input.files?.[0]?.name || null)
			input.click()
		})
	},

	// Notification système
	async notify(title: string, message: string): Promise<void> {
		if (isWailsEnv()) {
			const { ShowNotification } = await import('../wailsjs/go/main/App')
			return ShowNotification(title, message)
		}
		// Fallback: Notification API du navigateur
		if ('Notification' in window && Notification.permission === 'granted') {
			new Notification(title, { body: message })
		}
	},

	// Version de l'app
	async getVersion(): Promise<string> {
		if (isWailsEnv()) {
			const { GetAppVersion } = await import('../wailsjs/go/main/App')
			return GetAppVersion()
		}
		return 'dev'
	},

	// Chemin des données
	async getDataPath(): Promise<string> {
		if (isWailsEnv()) {
			const { GetDataPath } = await import('../wailsjs/go/main/App')
			return GetDataPath()
		}
		return './pb_data'
	},

	// Quitter l'app
	async quit(): Promise<void> {
		if (isWailsEnv()) {
			const { Quit } = await import('../wailsjs/go/main/App')
			return Quit()
		}
		window.close()
	},

	// Minimiser
	async minimize(): Promise<void> {
		if (isWailsEnv()) {
			const { MinimizeToTray } = await import('../wailsjs/go/main/App')
			return MinimizeToTray()
		}
	},

	// Check setup (binding direct, plus rapide que HTTP)
	async checkSetup(): Promise<boolean> {
		if (isWailsEnv()) {
			const { CheckSetupStatus } = await import('../wailsjs/go/main/App')
			return CheckSetupStatus()
		}
		// Fallback HTTP classique
		const resp = await fetch('/api/setup/status')
		const data = await resp.json()
		return data.needsSetup
	},
}

// Hook React pour utiliser Wails
import { useEffect, useState } from 'react'

export function useWails() {
	const [isWails, setIsWails] = useState(false)
	const [version, setVersion] = useState('dev')

	useEffect(() => {
		setIsWails(isWailsEnv())
		wails.getVersion().then(setVersion)
	}, [])

	return {
		isWails,
		version,
		...wails,
	}
}
