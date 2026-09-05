// frontend/lib/labels/label-layout.ts
//
// OÙ TOMBE CHAQUE BLOC, ET COMBIEN DE ROULEAU ÇA COÛTE.
//
// Une seule fonction décide de la mise en page, et tout le reste en dépend :
// le dessin de l'aperçu, le dessin envoyé à l'imprimante, les zones cliquables
// de la preview, et la LONGUEUR DE COUPE demandée au pilote. C'est délibéré —
// deux calculs séparés, c'est une étiquette mesurée pour une longueur et
// imprimée à une autre, et sur un rouleau continu ça se voit à chaque vente.
//
// Repère commun (« coordonnées étiquette »), en millimètres :
//   X = la largeur du rouleau, FIXE (26 mm utiles sur du 29) ;
//   Y = le sens du déroulement, VARIABLE — c'est le papier consommé.

import type {
	LabelBlockId,
	LabelStyle,
	LabelTextBlockStyle,
} from './label-style'

/** Ce que le texte occupe, en millimètres. Injecté plutôt qu'importé : la
 *  mesure demande un canvas, et ce module doit rester testable sans
 *  navigateur. */
/** Tout ce dont la mesure a besoin. Un objet plutôt qu'une file de paramètres :
 *  chaque réglage typographique ajouté ici doit être vu PAR LA MESURE, sinon la
 *  longueur calculée et la longueur imprimée divergent. */
export type TextSpec = {
	sizeMm: number
	bold: boolean
	fontFamily: string
	letterSpacingMm: number
}

export type TextMeasurer = (text: string, spec: TextSpec) => number

export type LabelLayoutInput = {
	title: string
	price: string
	/** Nombre de modules du code-barres — c'est LUI qui fixe la place
	 *  incompressible du code, pas une largeur choisie. Zéro = pas de code. */
	barcodeModules: number
	style: LabelStyle
	rollWidthMm: number
	measure: TextMeasurer
}

export type LabelBlock = {
	id: LabelBlockId
	/** Rectangle en coordonnées étiquette, millimètres. */
	x: number
	y: number
	width: number
	height: number
	/** Le contenu de ce bloc est-il tourné d'un quart de tour ? */
	rotated: boolean
	/** Les lignes déjà découpées, pour le texte. */
	lines: string[]
	fontSizeMm: number
}

export type LabelLayout = {
	rollWidthMm: number
	/** La longueur de contenu — celle qu'il faut demander au pilote, marges
	 *  d'entraînement non comprises (l'appelant les ajoute, il est le seul à
	 *  les connaître). */
	lengthMm: number
	blocks: LabelBlock[]
}

/** Largeur nominale d'un module EAN-13. En deçà, la scanette hésite. */
export const MODULE_MM = 0.33
/** Interligne. */
const LINE_HEIGHT = 1.15
/** Une étiquette plus courte que ça ne sort pas droite de la QL. */
const MIN_LENGTH_MM = 12

export function computeLabelLayout(input: LabelLayoutInput): LabelLayout {
	return input.style.orientation === 'normal'
		? layoutNormal(input)
		: layoutRotated(input)
}

/**
 * Sens 1 — le texte se lit dans la largeur, les blocs s'empilent dans le sens
 * du déroulement. C'est le sens qui consomme le moins de rouleau : la longueur
 * y est la SOMME des blocs, donc chaque millimètre retiré à une police ou à la
 * hauteur des barres est un millimètre de papier économisé.
 */
function layoutNormal(input: LabelLayoutInput): LabelLayout {
	const { style, rollWidthMm } = input
	const { padding } = style
	const lineWidth = Math.max(1, rollWidthMm - padding.side * 2)

	const blocks: LabelBlock[] = []
	let y = padding.start

	for (const part of orderedParts(input)) {
		if (part.id === 'barcode') {
			blocks.push({
				id: 'barcode',
				x: padding.side,
				y,
				width: lineWidth,
				height: barcodeBlockMm(style),
				rotated: false,
				lines: [],
				fontSizeMm: 0,
			})
			y += barcodeBlockMm(style) + style.barcode.gapMm
			continue
		}

		const lines = wrapLines(
			part.text,
			part.spec,
			lineWidth,
			input.measure,
			part.maxLines,
		)
		const height = lines.length * part.spec.sizeMm * LINE_HEIGHT

		blocks.push({
			id: part.id,
			x: padding.side,
			y,
			width: lineWidth,
			height,
			rotated: false,
			lines,
			fontSizeMm: part.spec.sizeMm,
		})
		y += height + part.gapMm
	}

	// Le dernier bloc ne pose pas de gouttière : elle est retirée avant la
	// marge de fin. Sans cela, chaque étiquette emportait un espace mort en
	// queue — du rouleau perdu à chaque vente.
	const last = blocks.at(-1)
	const length = last ? last.y + last.height + padding.end : MIN_LENGTH_MM

	return {
		rollWidthMm,
		lengthMm: Math.max(MIN_LENGTH_MM, round(length)),
		blocks,
	}
}

/**
 * Sens 2 — le texte se lit le long du rouleau. Les blocs se rangent alors
 * côte à côte DANS LA LARGEUR, qui est fixe : la longueur n'est plus une somme
 * mais le maximum de ce que chaque bloc réclame.
 */
function layoutRotated(input: LabelLayoutInput): LabelLayout {
	const { style, rollWidthMm } = input
	const { padding } = style

	const measured = orderedParts(input).map((part) => {
		if (part.id === 'barcode') {
			return {
				id: 'barcode' as LabelBlockId,
				thickness: barcodeBlockMm(style),
				extent: Math.max(input.barcodeModules * MODULE_MM, 10),
				lines: [] as string[],
				fontSizeMm: 0,
				gapMm: style.barcode.gapMm,
			}
		}
		return {
			id: part.id as LabelBlockId,
			thickness: part.spec.sizeMm * LINE_HEIGHT,
			extent: input.measure(part.text, part.spec),
			lines: [part.text],
			fontSizeMm: part.spec.sizeMm,
			gapMm: part.gapMm,
		}
	})

	const contentLength = measured.length
		? Math.max(...measured.map((m) => m.extent))
		: MIN_LENGTH_MM
	const length = Math.max(
		MIN_LENGTH_MM,
		contentLength + padding.start + padding.end,
	)

	const blocks: LabelBlock[] = []
	let x = padding.side
	for (const m of measured) {
		blocks.push({
			id: m.id,
			x,
			y: padding.start,
			width: m.thickness,
			height: length - padding.start - padding.end,
			rotated: true,
			lines: m.lines,
			fontSizeMm: m.fontSizeMm,
		})
		x += m.thickness + m.gapMm
	}

	return { rollWidthMm, lengthMm: round(length), blocks }
}

type OrderedPart =
	| { id: 'barcode' }
	| {
			id: 'name' | 'price'
			text: string
			spec: TextSpec
			gapMm: number
			maxLines: number
	  }

/** L'ordre est fixe — désignation, prix, code-barres — et un bloc masqué ou
 *  vide ne prend AUCUNE place : c'est ce qui permet de descendre à une
 *  étiquette prix + code-barres de quelques millimètres. */
function orderedParts(input: LabelLayoutInput): OrderedPart[] {
	const { style } = input
	const parts: OrderedPart[] = []

	if (style.name.visible && input.title) {
		parts.push({
			id: 'name',
			text: input.title,
			spec: textSpec(style.name),
			gapMm: style.name.gapMm,
			maxLines: style.orientation === 'normal' ? 2 : 1,
		})
	}

	if (style.price.visible && input.price) {
		parts.push({
			id: 'price',
			text: input.price,
			spec: textSpec(style.price),
			gapMm: style.price.gapMm,
			maxLines: 1,
		})
	}

	if (style.barcode.visible && input.barcodeModules > 0) {
		parts.push({ id: 'barcode' })
	}

	return parts
}

export function textSpec(block: LabelTextBlockStyle): TextSpec {
	return {
		sizeMm: block.sizeMm,
		bold: block.bold,
		fontFamily: block.fontFamily,
		letterSpacingMm: block.letterSpacingMm,
	}
}

/** Barres + chiffres. La taille des chiffres est un réglage : elle pèse sur la
 *  longueur exactement comme la hauteur des barres. */
export function barcodeBlockMm(style: LabelStyle): number {
	const { heightMm, showText, textSizeMm } = style.barcode
	return heightMm + (showText ? textSizeMm * LINE_HEIGHT : 0)
}

/** Découpe aux mots, sans jamais dépasser `maxLines` : une désignation trop
 *  longue est tronquée, pas reportée — le papier, lui, ne se reporte pas. */
export function wrapLines(
	text: string,
	spec: TextSpec,
	maxWidthMm: number,
	measure: TextMeasurer,
	maxLines: number,
): string[] {
	const words = text.split(/\s+/).filter(Boolean)
	const lines: string[] = []
	let current = ''

	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word
		if (measure(candidate, spec) <= maxWidthMm || !current) {
			current = candidate
			continue
		}
		lines.push(current)
		current = word
		if (lines.length === maxLines) break
	}

	if (lines.length < maxLines && current) lines.push(current)
	return lines.length ? lines : ['']
}

const round = (mm: number) => Math.round(mm * 100) / 100
