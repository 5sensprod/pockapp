// frontend/modules/site/lib/sheet-blocks.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// LA DESCRIPTION, VUE COMME UNE SUITE DE BLOCS
// ═══════════════════════════════════════════════════════════════════════════
// La description d'un produit est UNE chaîne HTML, en base comme au contrat
// d'export (`catalog-export.ts`) : le site en reçoit une, et une seule. Rien de
// ce fichier ne change cela — il découpe cette chaîne pour l'ÉDITION, puis la
// recompose à l'identique.
//
// ⚠️ **C'est un choix de vitesse, assumé le 4 septembre 2026.** Des champs
// séparés en base seraient plus durables (et plus faciles à faire évoluer vers
// des tables), mais coûteraient une migration PocketBase, une évolution du
// contrat d'export, `products-sync.php`, `catalog.php` et le rendu du site.
// On y viendra après la release ; d'ici là, le découpage vit ICI et nulle part
// ailleurs, pour qu'il n'y ait qu'un endroit à retirer.
//
// ── LA STRUCTURE EST CONNUE, PAS DEVINÉE ─────────────────────────────────
// Le HTML généré vient de `renderProductSheetDescription`
// (`backend/routes/gemini_routes.go:961`) et a toujours cette forme :
//
//   <p>intro</p><p>details</p>
//   <h2>Points forts</h2><ul>…</ul>
//   <h2>Caractéristiques techniques</h2><table><tbody>…</tbody></table>
//   <h2>Conseils d’utilisation</h2><p>…</p>
//
// Un `<h2>` ouvre donc une section et la précédente s'arrête là. Ce qui vient
// AVANT le premier `<h2>` est l'introduction : elle n'a pas de titre, et lui en
// inventer un changerait la page publique.
//
// On travaille à la découpe TEXTUELLE plutôt qu'au DOM : ces chaînes viennent
// de notre propre générateur ou du `contentEditable` de la fiche, la forme est
// stable, et une fonction pure se teste sans navigateur. Le prix à payer est
// nommé : un `<h2>` imbriqué dans une table ou un attribut couperait au mauvais
// endroit. Aucun de nos deux producteurs n'en écrit.

/** Un bloc éditable. `titre` vaut `null` pour l'introduction, qui n'en a pas. */
export type BlocFiche = {
	/** Stable tant que le bloc vit : sert de clé de rendu et de cible d'édition. */
	id: string
	/** Le texte du `<h2>`, ou `null` pour le bloc d'introduction. */
	titre: string | null
	/** Le contenu du bloc, SANS son `<h2>`. */
	html: string
}

const H2 = /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi

/** Le texte d'un titre : le `<h2>` peut contenir du balisage, le champ non. */
function texteDe(html: string): string {
	return html
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.trim()
}

/** Échappe ce qui repart dans un `<h2>` : un titre saisi à la main peut porter
 *  un `&` ou un chevron, et il ne doit pas devenir du balisage. */
function echapper(valeur: string): string {
	return valeur
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
}

let compteur = 0

/** Une identité qui ne se répète pas d'un découpage à l'autre : deux blocs de
 *  même titre — ou renommés — ne doivent jamais partager une clé de rendu. */
function nouvelId(): string {
	compteur += 1
	return `bloc-${compteur}`
}

/**
 * Découper une description en blocs éditables.
 *
 * Un bloc d'introduction n'est produit que s'il y a vraiment quelque chose
 * avant le premier `<h2>` : une description qui commence par un titre ne doit
 * pas ouvrir sur un bloc vide que l'utilisateur croirait devoir remplir.
 */
export function decouperEnBlocs(description: string): BlocFiche[] {
	const source = description ?? ''
	const blocs: BlocFiche[] = []

	H2.lastIndex = 0
	let precedent: { titre: string; debut: number } | null = null
	let curseur = 0

	for (
		let trouve = H2.exec(source);
		trouve !== null;
		trouve = H2.exec(source)
	) {
		const contenu = source.slice(curseur, trouve.index)
		if (precedent === null) {
			if (contenu.trim() !== '') {
				blocs.push({ id: nouvelId(), titre: null, html: contenu.trim() })
			}
		} else {
			blocs.push({
				id: nouvelId(),
				titre: precedent.titre,
				html: contenu.trim(),
			})
		}
		precedent = { titre: texteDe(trouve[1]), debut: trouve.index }
		curseur = H2.lastIndex
	}

	const reste = source.slice(curseur)
	if (precedent === null) {
		if (reste.trim() !== '') {
			blocs.push({ id: nouvelId(), titre: null, html: reste.trim() })
		}
	} else {
		blocs.push({ id: nouvelId(), titre: precedent.titre, html: reste.trim() })
	}

	return blocs
}

/**
 * Recomposer la description.
 *
 * ⚠️ **Un bloc vide de tout — titre ET contenu — disparaît.** C'est ainsi qu'on
 * supprime une section : il n'y a pas d'autre geste, et une section vide
 * laisserait un titre orphelin sur la page publique.
 */
export function recomposerBlocs(blocs: BlocFiche[]): string {
	return blocs
		.map((bloc) => {
			const titre = (bloc.titre ?? '').trim()
			const html = bloc.html.trim()
			if (titre === '' && html === '') return ''
			if (titre === '') return html
			return `<h2>${echapper(titre)}</h2>${html}`
		})
		.filter((morceau) => morceau !== '')
		.join('')
}

/**
 * Le bloc d'une description générée qui correspond à un bloc existant.
 *
 * Sert à la RÉGÉNÉRATION D'UNE SEULE SECTION : le serveur ne sait produire
 * qu'une fiche entière (`/api/ai/product-sheet`), on lui en demande une et on
 * n'en retient que la section visée. La correspondance se fait sur le titre,
 * comparé à la casse et aux accents près — le modèle écrit « Caractéristiques
 * techniques » mais parfois « CARACTÉRISTIQUES TECHNIQUES ».
 *
 * Rend `null` quand la génération ne porte pas cette section : l'appelant
 * garde alors le texte en place plutôt que de l'effacer.
 */
export function blocCorrespondant(
	description: string,
	titre: string | null,
): BlocFiche | null {
	const blocs = decouperEnBlocs(description)
	if (titre === null) {
		return blocs.find((bloc) => bloc.titre === null) ?? null
	}
	const cible = normaliser(titre)
	return blocs.find((bloc) => normaliser(bloc.titre ?? '') === cible) ?? null
}

function normaliser(valeur: string): string {
	return valeur
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
}
