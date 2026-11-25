// frontend/lib/release-notes.ts
//
// Lecture tolérante du corps d'une release GitHub (`UpdateInfo.releaseNotes`,
// updater.go) pour la notification de mise à jour. Aucune règle métier : on
// range des lignes de texte en trois groupes et on retire le bruit technique.
//
// Formats reconnus, mélangeables :
//   - conventional commits : `feat: …`, `fix(caisse): …`, `chore!: …`
//   - puces markdown `- ` / `* ` / `1. `, avec ou sans préfixe
//   - titres `## Features`, `### Bug Fixes`, `## Nouveautés`, `## Corrections`
//   - notes auto-générées GitHub (`by @user in https://…`, « Full Changelog »)
// Rien de reconnu : les lignes sont rendues telles quelles dans « Autres », et
// `reconnu` vaut false pour que l'écran puisse le dire.

export interface ChangementVersion {
	texte: string
	/** Périmètre du commit (`feat(caisse):` → `caisse`), s'il y en a un. */
	portee?: string
}

export interface NotesVersion {
	nouveautes: ChangementVersion[]
	corrections: ChangementVersion[]
	autres: ChangementVersion[]
	/** Au moins une ligne a été rangée par un préfixe ou un titre. */
	reconnu: boolean
}

type Groupe = 'nouveautes' | 'corrections' | 'autres'

const PREFIXE_COMMIT =
	/^(feat|feature|fix|perf|refactor|docs?|style|test|tests|build|ci|chore|revert)(?:\(([^)]*)\))?(!)?\s*:\s*(.+)$/i

const GROUPE_PAR_TYPE: Record<string, Groupe> = {
	feat: 'nouveautes',
	feature: 'nouveautes',
	fix: 'corrections',
}

/** Un titre markdown décide du groupe des lignes qui le suivent. */
function groupeDuTitre(titre: string): Groupe | null | 'ignore' {
	const t = titre
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/[^a-z\s']/g, ' ')
		.trim()
	if (/\b(feature|features|nouveaute|nouveautes|new|added|ajout|ajouts)\b/.test(t))
		return 'nouveautes'
	if (
		/\b(fix|fixes|bug|bugs|correction|corrections|corrige|corriges)\b/.test(t)
	)
		return 'corrections'
	if (
		/\b(other|others|autre|autres|chore|chores|maintenance|refactor|docs|documentation|perf|performance|changed|changes|modifications?|ameliorations?)\b/.test(
			t,
		)
	)
		return 'autres'
	// « What's Changed », « Changelog », « v2.5.2 » : simple intitulé.
	return 'ignore'
}

function nettoyer(texte: string): string {
	let t = texte
		// « by @user in https://github.com/…/pull/12 » (notes générées par GitHub)
		.replace(/\s+by\s+@[\w-]+(\s+in\s+\S+)?\s*$/i, '')
		// « (#123) » ou « (abc1234) » en fin de ligne
		.replace(/\s*\((#\d+|[0-9a-f]{7,40})\)\s*$/i, '')
		// hash de commit en tête : « abc1234 feat: … » ou « abc1234: … »
		.replace(/^(?=[0-9a-f]*\d)[0-9a-f]{7,40}\s*:?\s+/i, '')
		// gras / code markdown autour du préfixe
		.replace(/\*\*/g, '')
		.trim()
	// Lien markdown [texte](url) → texte
	t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
	return t
}

function majuscule(t: string): string {
	return t ? t.charAt(0).toLocaleUpperCase('fr-FR') + t.slice(1) : t
}

export function parseReleaseNotes(corps: string | null | undefined): NotesVersion {
	const notes: NotesVersion = {
		nouveautes: [],
		corrections: [],
		autres: [],
		reconnu: false,
	}
	if (!corps) return notes

	const vus = new Set<string>()
	let groupeCourant: Groupe | null = null

	for (const brute of corps.replace(/\r\n?/g, '\n').split('\n')) {
		const ligne = brute.trim()
		if (!ligne) continue
		// Séparateurs et lien « Full Changelog »
		if (/^(-{3,}|_{3,}|\*{3,})$/.test(ligne)) continue
		if (/full changelog/i.test(ligne)) continue

		const titre = /^#{1,6}\s+(.*)$/.exec(ligne)
		if (titre) {
			const g = groupeDuTitre(titre[1])
			if (g === 'ignore') groupeCourant = null
			else {
				groupeCourant = g
				notes.reconnu = true
			}
			continue
		}

		const sansPuce = ligne.replace(/^(?:[-*+•]|\d+[.)])\s+/, '')
		const contenu = nettoyer(sansPuce)
		if (!contenu) continue

		let groupe: Groupe = groupeCourant ?? 'autres'
		let texte = contenu
		let portee: string | undefined

		const commit = PREFIXE_COMMIT.exec(contenu)
		if (commit) {
			const type = commit[1].toLowerCase()
			groupe = GROUPE_PAR_TYPE[type] ?? 'autres'
			portee = commit[2]?.trim() || undefined
			texte = commit[4].trim()
			notes.reconnu = true
		}

		texte = majuscule(texte)
		if (!texte) continue
		const cle = `${groupe}|${texte.toLowerCase()}`
		if (vus.has(cle)) continue
		vus.add(cle)
		notes[groupe].push(portee ? { texte, portee } : { texte })
	}

	return notes
}

export function notesVides(n: NotesVersion): boolean {
	return !n.nouveautes.length && !n.corrections.length && !n.autres.length
}
