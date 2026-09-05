// frontend/lib/labels/label-style.ts
//
// LES RÉGLAGES DE L'ÉTIQUETTE, ET RIEN D'AUTRE.
//
// Le rouleau est CONTINU : sa largeur est imposée par le média (26 mm utiles
// sur du 29), sa longueur ne l'est pas. Tout ce qui suit ne sert donc qu'à une
// chose — que la longueur consommée à chaque impression soit la plus petite
// que le contenu autorise. Il n'y a pas de champ « longueur de coupe » : la
// longueur est un RÉSULTAT, jamais une saisie.
//
// Trois blocs, dans cet ordre, et rien de plus : la désignation, le prix TTC,
// le code-barres.

export type LabelBlockId = 'name' | 'price' | 'barcode'

/** `normal` : le texte se lit dans le sens de la largeur du rouleau, les blocs
 *  s'empilent dans le sens du déroulement. `rotated` : le texte se lit le long
 *  du rouleau, les blocs se rangent côte à côte dans la largeur. */
export type LabelOrientation = 'normal' | 'rotated'

/** Le choix de police est volontairement famélique : ces quatre-là sont
 *  présentes sur tout poste Windows, donc l'aperçu et l'étiquette sortent
 *  pareils. Une police absente serait remplacée en silence par le navigateur —
 *  et l'aperçu mentirait. */
export const LABEL_FONTS = [
	'Arial',
	'Verdana',
	'Georgia',
	'Courier New',
] as const

export type LabelFont = (typeof LABEL_FONTS)[number]

export type LabelTextBlockStyle = {
	visible: boolean
	/** Taille de police, en millimètres de hauteur de cadratin. */
	sizeMm: number
	bold: boolean
	fontFamily: LabelFont
	/** Interlettrage, en millimètres. Négatif = on resserre — c'est ainsi qu'un
	 *  nom un peu long tient sur une ligne sans réduire la police. */
	letterSpacingMm: number
	/** L'espace APRÈS ce bloc. Le dernier bloc n'en pose pas. */
	gapMm: number
}

export type LabelBarcodeStyle = {
	visible: boolean
	/** Hauteur des barres seules. Les chiffres s'ajoutent en dessous. */
	heightMm: number
	showText: boolean
	/** Taille des chiffres sous les barres. Ils comptent dans la longueur au
	 *  même titre que les barres : les réduire, c'est du rouleau gagné. */
	textSizeMm: number
	gapMm: number
}

export type LabelStyle = {
	orientation: LabelOrientation
	/** Marges, en millimètres. `start` et `end` sont prises DANS LE SENS DU
	 *  DÉROULEMENT — ce sont elles qui décident du papier perdu avant et après
	 *  le contenu. `side` est prise dans la largeur, qui, elle, est fixe. */
	padding: { start: number; end: number; side: number }
	name: LabelTextBlockStyle
	price: LabelTextBlockStyle
	barcode: LabelBarcodeStyle
}

export const DEFAULT_LABEL_STYLE: LabelStyle = {
	orientation: 'normal',
	padding: { start: 1, end: 1, side: 1 },
	name: {
		visible: true,
		sizeMm: 3,
		bold: true,
		fontFamily: 'Arial',
		letterSpacingMm: 0,
		gapMm: 1,
	},
	price: {
		visible: true,
		sizeMm: 6,
		bold: true,
		fontFamily: 'Arial',
		letterSpacingMm: 0,
		gapMm: 1,
	},
	barcode: {
		visible: true,
		heightMm: 7,
		showText: true,
		textSizeMm: 2.6,
		gapMm: 0,
	},
}

/** Bornes de saisie. Elles bornent, elles ne conseillent pas : des barres de
 *  2 mm se scannent mal en pratique, mais sur une étiquette de bijou ou de
 *  médiator c'est parfois le seul choix — c'est à l'utilisateur de juger, il a
 *  la scanette sous la main. */
export const LABEL_LIMITS = {
	fontMm: { min: 1.2, max: 14 },
	barcodeHeightMm: { min: 2, max: 20 },
	barcodeTextMm: { min: 1.5, max: 6 },
	gapMm: { min: 0, max: 8 },
	letterSpacingMm: { min: -1, max: 3 },
	paddingMm: { min: 0, max: 10 },
}

const STORAGE_KEY = 'label_style_v1'

export function clamp(
	value: number,
	{ min, max }: { min: number; max: number },
) {
	if (Number.isNaN(value)) return min
	return Math.min(max, Math.max(min, value))
}

/** Le style est un réglage de POSTE, comme le choix de l'imprimante : il vit
 *  dans le navigateur, pas dans la base. Une lecture ratée rend les valeurs
 *  par défaut plutôt que de casser l'écran. */
export function loadLabelStyle(): LabelStyle {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return DEFAULT_LABEL_STYLE
		const parsed = JSON.parse(raw) as Partial<LabelStyle>
		return {
			...DEFAULT_LABEL_STYLE,
			...parsed,
			padding: { ...DEFAULT_LABEL_STYLE.padding, ...parsed.padding },
			name: { ...DEFAULT_LABEL_STYLE.name, ...parsed.name },
			price: { ...DEFAULT_LABEL_STYLE.price, ...parsed.price },
			barcode: { ...DEFAULT_LABEL_STYLE.barcode, ...parsed.barcode },
		}
	} catch {
		return DEFAULT_LABEL_STYLE
	}
}

export function saveLabelStyle(style: LabelStyle) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(style))
	} catch {
		/* navigation privée : le réglage vaut pour la session */
	}
}
