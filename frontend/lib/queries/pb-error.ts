// frontend/lib/queries/pb-error.ts
//
// ⚠️ `error.message` d'une erreur PocketBase ne dit RIEN d'utilisable :
// « Something went wrong while processing your request. », quel que soit le
// champ en cause. Le détail est ailleurs — dans `error.response.data` (ou
// `error.data.data` selon la version du client), un objet
// `{ champ: { code, message } }`.
//
// Afficher le message générique revient à ouvrir la console à chaque refus,
// c'est-à-dire à ne rien afficher du tout. Constaté le 13 août 2026 en
// associant une marque à un fournisseur : « Enregistrement refusé : Something
// went wrong… », sans un mot sur la cause.

type PocketBaseFieldError = { code?: string; message?: string }

function fieldErrorsOf(error: unknown): Record<string, PocketBaseFieldError> {
	const candidate = error as {
		response?: { data?: unknown }
		data?: { data?: unknown }
	}
	const raw = candidate?.response?.data ?? candidate?.data?.data
	if (raw && typeof raw === 'object') {
		return raw as Record<string, PocketBaseFieldError>
	}
	return {}
}

/**
 * Un message lisible : les champs refusés et leur raison, ou à défaut le
 * message brut. Ne jette jamais — c'est du code de gestion d'erreur.
 */
export function pocketbaseErrorMessage(error: unknown): string {
	const fields = fieldErrorsOf(error)
	const details = Object.entries(fields)
		.map(([field, detail]) => `${field} — ${detail?.message ?? detail?.code}`)
		.filter(Boolean)

	if (details.length > 0) return details.join(' ; ')

	if (error instanceof Error && error.message) return error.message
	return String(error)
}
