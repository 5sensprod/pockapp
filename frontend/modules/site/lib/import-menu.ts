import type {
	SiteMenuImportRecord,
	SiteMenuRefType,
} from '@/lib/queries/site-menu'
import { CONTRACT_VERSION } from './publish-menu'

const REF_TYPES = new Set<SiteMenuRefType>([
	'category',
	'brand',
	'product',
	'page',
])

// Miroir de PocketBase v0.22.22 : 15 caractères, hors cette liste.
const INVALID_ID_CHARACTER = /[@#$&|.,'"\\/\s]/u

export type ParseMenuResult =
	| {
			ok: true
			publishedAt: string
			records: SiteMenuImportRecord[]
	  }
	| { ok: false; error: string }

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const failure = (error: string): ParseMenuResult => ({ ok: false, error })

const validPocketBaseId = (id: string): boolean =>
	Array.from(id).length === 15 && !INVALID_ID_CHARACTER.test(id)

/** Transforme un document publié en enregistrements `site_menu`, sans effet de bord. */
export function parseMenuDocument(json: string): ParseMenuResult {
	let document: unknown
	try {
		document = JSON.parse(json)
	} catch {
		return failure("Le fichier n'est pas un JSON valide.")
	}

	if (!isObject(document))
		return failure('Le document doit être un objet JSON.')
	if (document.contractVersion !== CONTRACT_VERSION) {
		return failure(
			`Version de contrat incompatible : ${String(document.contractVersion)} (attendue : ${CONTRACT_VERSION}).`,
		)
	}
	if (
		typeof document.publishedAt !== 'string' ||
		!document.publishedAt.endsWith('Z') ||
		Number.isNaN(Date.parse(document.publishedAt))
	) {
		return failure(
			'Le champ publishedAt doit être une date UTC valide terminée par Z.',
		)
	}
	if (!isObject(document.menu) || typeof document.menu.name !== 'string') {
		return failure('Le champ menu est invalide.')
	}
	if (!Array.isArray(document.menu.items)) {
		return failure('Le champ menu.items doit être un tableau.')
	}

	const records: SiteMenuImportRecord[] = []
	const createdIds = new Set<string>()
	const nextPosition = new Map<string, number>()

	for (const [index, value] of document.menu.items.entries()) {
		const label = `Entrée ${index + 1}`
		if (!isObject(value)) return failure(`${label} : objet attendu.`)
		if (typeof value.id !== 'string' || !validPocketBaseId(value.id)) {
			return failure(`${label} : identifiant PocketBase invalide.`)
		}
		if (createdIds.has(value.id)) {
			return failure(
				`${label} : identifiant ${value.id} présent plusieurs fois.`,
			)
		}
		if (typeof value.title !== 'string' || value.title.trim() === '') {
			return failure(`${label} : titre manquant.`)
		}
		if (typeof value.url !== 'string' || value.url.trim() === '') {
			return failure(`${label} : URL manquante.`)
		}
		if (value.parent !== null && typeof value.parent !== 'string') {
			return failure(`${label} : parent invalide.`)
		}
		if (typeof value.parent === 'string' && !createdIds.has(value.parent)) {
			return failure(`${label} : le parent doit apparaître avant son enfant.`)
		}

		let linkType: SiteMenuImportRecord['link_type']
		let linkUrl = ''
		let refId = ''
		if (value.ref === null) {
			if (value.url === '#') {
				linkType = 'none'
			} else {
				linkType = 'manual'
				linkUrl = value.url
			}
		} else {
			if (
				!isObject(value.ref) ||
				typeof value.ref.type !== 'string' ||
				!REF_TYPES.has(value.ref.type as SiteMenuRefType) ||
				typeof value.ref.id !== 'string' ||
				value.ref.id.trim() === ''
			) {
				return failure(`${label} : référence invalide.`)
			}
			linkType = value.ref.type as SiteMenuRefType
			refId = value.ref.id
		}

		const parent = value.parent ?? ''
		const position = (nextPosition.get(parent) ?? 0) + 1
		nextPosition.set(parent, position)
		createdIds.add(value.id)
		records.push({
			id: value.id,
			title: value.title,
			position,
			visible: true,
			link_type: linkType,
			link_url: linkUrl,
			ref_id: refId,
			parent,
		})
	}

	return { ok: true, publishedAt: document.publishedAt, records }
}
