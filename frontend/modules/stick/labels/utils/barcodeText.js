// frontend/modules/stick/labels/utils/barcodeText.js
//
// LE NUMÉRO LISIBLE SOUS LES BARRES — une règle, écrite une fois.
//
// Ce n'est PAS ce que le code-barres encode : les barres portent toujours la
// valeur brute, et un scanner lit les barres, jamais le texte. Seul l'affichage
// change, par l'option `text` de JsBarcode.
//
// D'où la règle : le groupement n'ajoute ni ne retire un seul caractère, il
// n'insère que des séparateurs. Un numéro dont la longueur ne correspond pas
// au groupement demandé est rendu tel quel plutôt que tronqué.

/** Les groupements proposés, dans l'ordre où le panneau les affiche. */
export const FORMATS_TEXTE_CODE_BARRES = [
	{ id: 'brut', label: 'Tel quel' },
	{ id: 'ean13', label: 'EAN-13 (1 · 6 · 6)' },
	{ id: 'ean8', label: 'EAN-8 (4 · 4)' },
	{ id: 'groupes3', label: 'Par 3' },
	{ id: 'groupes4', label: 'Par 4' },
	{ id: 'tirets4', label: 'Par 4, tirets' },
	{ id: 'aucun', label: 'Masquer le numéro' },
]

/** Découpe `valeur` en tranches de tailles données, séparées par `separateur`. */
const decouper = (valeur, tailles, separateur) => {
	const morceaux = []
	let index = 0
	for (const taille of tailles) {
		morceaux.push(valeur.slice(index, index + taille))
		index += taille
	}
	return morceaux.filter(Boolean).join(separateur)
}

/** Découpe en tranches régulières, la dernière pouvant être plus courte. */
const decouperRegulier = (valeur, taille, separateur) => {
	const morceaux = []
	for (let i = 0; i < valeur.length; i += taille) {
		morceaux.push(valeur.slice(i, i + taille))
	}
	return morceaux.join(separateur)
}

/**
 * Le texte à afficher sous les barres.
 * Rend `undefined` quand rien n'est à changer : JsBarcode affiche alors la
 * valeur encodée, son comportement par défaut.
 */
export const formaterTexteCodeBarres = (valeur, format) => {
	const brut = String(valeur ?? '')
	if (!brut || !format || format === 'brut' || format === 'aucun') return undefined

	switch (format) {
		case 'ean13':
			// Le groupement normalisé de l'EAN-13. Un numéro d'une autre longueur
			// n'est pas un EAN-13 : on ne lui invente pas de découpe.
			return brut.length === 13 ? decouper(brut, [1, 6, 6], ' ') : brut
		case 'ean8':
			return brut.length === 8 ? decouper(brut, [4, 4], ' ') : brut
		case 'groupes3':
			return decouperRegulier(brut, 3, ' ')
		case 'groupes4':
			return decouperRegulier(brut, 4, ' ')
		case 'tirets4':
			return decouperRegulier(brut, 4, '-')
		default:
			return undefined
	}
}
