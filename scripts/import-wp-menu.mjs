// scripts/import-wp-menu.mjs
// ═══════════════════════════════════════════════════════════════════════════
// IMPORT UNIQUE DU MENU WORDPRESS DANS site_menu
// ═══════════════════════════════════════════════════════════════════════════
// Lit le menu de navigation d'axemusique.shop et en crée les entrées dans la
// collection `site_menu` de PocketBase local. **À jouer une fois**, pour ne pas
// ressaisir 26 entrées à la main dans l'éditeur.
//
// ─── Ce script ne fait PAS partie de l'application ─────────────────────────
// Il n'est ni importé, ni compilé, ni appelé par PocketApp. C'est un outil
// lancé à la main. C'est délibéré : lire WordPress depuis l'application serait
// une cinquième sortie réseau, permanente, pour un besoin qui n'existe qu'une
// fois. Les points d'entrée réseau de PocketApp restent ceux de CLAUDE.md.
//
// ─── Usage ─────────────────────────────────────────────────────────────────
//   node scripts/import-wp-menu.mjs              # aperçu, n'écrit rien
//   node scripts/import-wp-menu.mjs --write      # écrit dans PocketBase
//   node scripts/import-wp-menu.mjs --write --force   # remplace l'existant
//   node scripts/import-wp-menu.mjs --menu=principe   # un autre menu
//
// Identifiants PocketBase : `PB_TYPEGEN_URL`, `PB_TYPEGEN_EMAIL` et
// `PB_TYPEGEN_PASSWORD` du `.env` — les mêmes que `pnpm typegen`, ce sont les
// identifiants admin. Aucun secret n'est écrit ici.
//
// PocketBase doit être démarré (l'application lancée suffit).
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------------

const WP_MENUS_URL = 'https://axemusique.shop/wp-json/wp/v2/menus'

// L'hébergement filtre certains agents utilisateurs avant Apache — voir
// server/README.md. On en pose un explicite plutôt que de découvrir un 503
// avec une page HTML à la place du JSON.
const USER_AGENT = 'PocketApp/1.0 (import menu, ponctuel)'

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const FORCE = args.includes('--force')
const MENU_SLUG = (args.find((a) => a.startsWith('--menu=')) ?? '--menu=main').slice(7)

/** Lecture minimale du `.env` : pas de dépendance pour trois valeurs. */
function readEnv() {
	const env = { ...process.env }
	try {
		const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
		for (const line of raw.split('\n')) {
			const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
			if (match && !env[match[1]]) env[match[1]] = match[2].trim()
		}
	} catch {
		// Pas de .env : on se contente des variables d'environnement.
	}
	return env
}

const env = readEnv()
const PB_URL = env.PB_TYPEGEN_URL || 'http://127.0.0.1:8090'
const PB_EMAIL = env.PB_TYPEGEN_EMAIL
const PB_PASSWORD = env.PB_TYPEGEN_PASSWORD

// ---------------------------------------------------------------------------
// TRANSFORMATION
// ---------------------------------------------------------------------------

/** WordPress échappe les entités HTML dans les titres. */
function decodeEntities(text) {
	return String(text ?? '')
		.replace(/&amp;/g, '&')
		.replace(/&#0?39;|&apos;|&rsquo;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.trim()
}

/**
 * Décide de la destination d'une entrée importée.
 *
 * **Tout arrive en lien manuel, jamais en référence typée**, et c'est un choix
 * assumé : la résolution `ref` → `url` lit le slug de la cible dans AppPos, où
 * 433 catégories sur 463 n'en ont pas. Importer en `category` produirait un
 * menu majoritairement impubliable — la publication est tout ou rien.
 *
 * Le lien manuel publie l'URL telle que WordPress la sert aujourd'hui : ce que
 * les visiteurs suivent déjà. On perd la référence typée, donc la détection des
 * destinations orphelines. C'est récupérable entrée par entrée dans l'éditeur,
 * le jour où les slugs d'AppPos seront remplis.
 */
function destinationOf(wpItem) {
	const url = String(wpItem.url ?? '').trim()

	// Entrée qui ne sert qu'à porter un sous-menu.
	if (url === '' || url === '#') {
		return { link_type: 'none', link_url: '' }
	}

	// URL absolue du site → chemin relatif. Le domaine n'a pas à être figé dans
	// le document publié, et le contrat accepte les deux formes (§2.3).
	try {
		const parsed = new URL(url)
		if (parsed.hostname.endsWith('axemusique.shop')) {
			return {
				link_type: 'manual',
				link_url: parsed.pathname + parsed.search + parsed.hash,
			}
		}
		// Domaine externe : on garde l'URL entière.
		return { link_type: 'manual', link_url: url }
	} catch {
		// Ancre (`#reparation`) ou chemin déjà relatif : tel quel.
		return { link_type: 'manual', link_url: url }
	}
}

/**
 * Met les entrées WordPress à plat dans l'ordre d'affichage, en calculant la
 * position **par fratrie** — convention de `menu-tree.ts`, entiers consécutifs
 * à partir de 1. L'ordre d'apparition dans la réponse WordPress fait foi.
 */
function prepare(wpItems) {
	const positionByParent = new Map()

	return wpItems.map((item) => {
		const wpParent = String(item.parent ?? '0')
		const next = (positionByParent.get(wpParent) ?? 0) + 1
		positionByParent.set(wpParent, next)

		return {
			wpId: String(item.id),
			wpParent,
			title: decodeEntities(item.title) || '(sans titre)',
			position: next,
			visible: true,
			...destinationOf(item),
		}
	})
}

// ---------------------------------------------------------------------------
// POCKETBASE
// ---------------------------------------------------------------------------

async function pbFetch(token, path, options = {}) {
	const response = await fetch(`${PB_URL}${path}`, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: token } : {}),
			...(options.headers ?? {}),
		},
	})

	const text = await response.text()
	if (!response.ok) {
		throw new Error(`PocketBase ${response.status} sur ${path} : ${text.slice(0, 300)}`)
	}
	return text ? JSON.parse(text) : null
}

async function authenticate() {
	if (!PB_EMAIL || !PB_PASSWORD) {
		throw new Error(
			'PB_TYPEGEN_EMAIL et PB_TYPEGEN_PASSWORD doivent être renseignés dans .env — ce sont les identifiants admin de PocketBase.',
		)
	}

	// PocketBase 0.22 : l'authentification admin est sur /api/admins.
	const auth = await pbFetch(null, '/api/admins/auth-with-password', {
		method: 'POST',
		body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASSWORD }),
	})
	return auth.token
}

// ---------------------------------------------------------------------------
// DÉROULÉ
// ---------------------------------------------------------------------------

async function main() {
	// ── 1. Lire le menu WordPress ─────────────────────────────────────────
	console.log(`Lecture de ${WP_MENUS_URL} …`)
	const response = await fetch(WP_MENUS_URL, {
		headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
	})
	if (!response.ok) {
		throw new Error(`WordPress a répondu ${response.status}`)
	}

	const menus = await response.json()
	const menu = menus[MENU_SLUG]
	if (!menu) {
		throw new Error(
			`Menu « ${MENU_SLUG} » absent. Disponibles : ${Object.keys(menus).join(', ')}`,
		)
	}

	const entries = prepare(menu.items ?? [])
	console.log(`Menu « ${menu.name} » : ${entries.length} entrées.\n`)

	// ── 2. Aperçu, toujours affiché ───────────────────────────────────────
	const byParent = new Map()
	for (const e of entries) {
		byParent.set(e.wpParent, [...(byParent.get(e.wpParent) ?? []), e])
	}
	const show = (parent, depth) => {
		for (const e of byParent.get(parent) ?? []) {
			const dest = e.link_type === 'none' ? '(sous-menu)' : e.link_url
			console.log(`${'  '.repeat(depth)}${e.position}. ${e.title}  →  ${dest}`)
			show(e.wpId, depth + 1)
		}
	}
	show('0', 0)

	const typed = entries.filter((e) => e.link_type === 'manual').length
	console.log(
		`\n${typed} lien(s) manuel(s), ${entries.length - typed} porte-sous-menu.`,
	)
	console.log(
		'Aucune référence typée : voir le commentaire de destinationOf() dans ce fichier.',
	)

	if (!WRITE) {
		console.log('\nAperçu seulement. Relancer avec --write pour écrire.')
		return
	}

	// ── 3. Écrire dans PocketBase ─────────────────────────────────────────
	console.log(`\nConnexion à ${PB_URL} …`)
	const token = await authenticate()

	const existing = await pbFetch(
		token,
		'/api/collections/site_menu/records?perPage=200&fields=id',
	)
	if (existing.totalItems > 0) {
		if (!FORCE) {
			throw new Error(
				`site_menu contient déjà ${existing.totalItems} entrée(s). Relancer avec --force pour les remplacer, ou vider la collection à la main.`,
			)
		}
		console.log(`Suppression de ${existing.totalItems} entrée(s) existante(s) …`)
		// La suppression est en cascade sur `parent` : supprimer un parent
		// emporte ses enfants, et le DELETE suivant renverra 404. On ignore.
		for (const record of existing.items) {
			try {
				await pbFetch(token, `/api/collections/site_menu/records/${record.id}`, {
					method: 'DELETE',
				})
			} catch {
				/* déjà partie avec son parent */
			}
		}
	}

	// Deux passes : les identifiants PocketBase n'existent qu'après création,
	// donc on crée tout à plat, puis on rattache les parents.
	const idMap = new Map()

	for (const entry of entries) {
		const created = await pbFetch(token, '/api/collections/site_menu/records', {
			method: 'POST',
			body: JSON.stringify({
				title: entry.title,
				position: entry.position,
				visible: entry.visible,
				link_type: entry.link_type,
				link_url: entry.link_url,
				ref_id: '',
			}),
		})
		idMap.set(entry.wpId, created.id)
	}
	console.log(`${entries.length} entrée(s) créée(s).`)

	let rattachees = 0
	for (const entry of entries) {
		if (entry.wpParent === '0') continue
		const parentId = idMap.get(entry.wpParent)
		if (!parentId) {
			console.warn(
				`  ! « ${entry.title} » : parent WordPress ${entry.wpParent} introuvable, laissée à la racine.`,
			)
			continue
		}
		await pbFetch(token, `/api/collections/site_menu/records/${idMap.get(entry.wpId)}`, {
			method: 'PATCH',
			body: JSON.stringify({ parent: parentId }),
		})
		rattachees += 1
	}

	console.log(`${rattachees} entrée(s) rattachée(s) à leur parent.`)
	console.log('\nTerminé. Vérifier dans l\'éditeur avant de publier.')
}

main().catch((error) => {
	console.error(`\nÉchec : ${error.message}`)
	process.exit(1)
})
