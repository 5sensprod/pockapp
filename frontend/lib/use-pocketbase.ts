import PocketBase from 'pocketbase'
import type { TypedPocketBase } from './pocketbase-types'
import { isWailsEnv } from './wails'

function createPocketBaseClient(): TypedPocketBase {
	// ⚠️ ADAPTE CETTE URL à ton setup réel
	// → c'est l'URL à laquelle tu accèdes à l'admin PocketBase dans ton navigateur
	//    (souvent http://127.0.0.1:8090 ou http://localhost:8090)
	const pocketbaseUrlInWails = 'http://127.0.0.1:8090'

	const baseUrl = isWailsEnv()
		? pocketbaseUrlInWails // 👉 dans l'app Wails : parler directement à PocketBase
		: document.location.origin // 👉 en dev navigateur : Vite + proxy /api

	console.log('[PocketBase] baseUrl utilisé :', baseUrl)

	return new PocketBase(baseUrl) as TypedPocketBase
}

const pb = createPocketBaseClient()

export function usePocketBase() {
	return pb
}
