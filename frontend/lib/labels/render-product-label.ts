// frontend/lib/labels/render-product-label.ts
//
// L'ÉTIQUETTE PRODUIT, DESSINÉE DANS UN CANVAS.
//
// Ce fichier ne décide de RIEN : il exécute la mise en page calculée par
// `label-layout.ts`, dans le repère étiquette (X = largeur du rouleau, Y = sens
// du déroulement). L'aperçu et l'impression appellent le même dessin, à deux
// échelles près — ce que montre la preview est ce qui sort du rouleau.
//
// Trois informations, et pas une de plus : la désignation, le prix TTC, le
// code-barres. AppPos avait cinquante réglages de style et deux moteurs
// graphiques pour la même chose.

import JsBarcode from 'jsbarcode'

import {
	type LabelLayout,
	type TextMeasurer,
	type TextSpec,
	computeLabelLayout,
	textSpec,
} from './label-layout'
import type { LabelStyle } from './label-style'

/** La résolution native d'une QL-600. Rendre au-dessus ne gagne rien : le
 *  pilote rééchantillonnerait vers le bas. */
export const PRINT_DPI = 300

const euros = new Intl.NumberFormat('fr-FR', {
	style: 'currency',
	currency: 'EUR',
})

export type LabelProduct = {
	designation?: string
	sku?: string
	barcode?: string
	price_ttc?: number
}

/** Le nom imprimé, et il n'y en a qu'un : `designation`, le nom du comptoir,
 *  celui qui part déjà sur le ticket de caisse (`catalog-products.ts:94`).
 *  JAMAIS `name` : c'est le titre de la page du site, écrit pour le
 *  référencement, souvent long et jamais pensé pour 26 mm de papier. Un
 *  produit sans désignation s'imprime SANS nom — l'étiquette le montre, et
 *  c'est la fiche produit qu'il faut corriger, pas l'étiquette. */
export function labelTitle(product: LabelProduct): string {
	return product.designation?.trim() ?? ''
}

export function labelPrice(product: LabelProduct): string {
	return typeof product.price_ttc === 'number'
		? euros.format(product.price_ttc)
		: ''
}

export function labelCode(product: LabelProduct): string {
	return (product.barcode || product.sku || '').trim()
}

/** Pose la police ET l'interlettrage sur le contexte. `letterSpacing` est une
 *  propriété du contexte, pas de la chaîne `font`, et Chromium la réinitialise
 *  quand on réaffecte `font` : elle se pose donc APRÈS. Le mesureur et le
 *  dessin passent tous deux par ici — c'est ce qui garantit qu'on imprime la
 *  longueur qu'on a calculée. */
function applyFont(
	ctx: CanvasRenderingContext2D,
	spec: TextSpec,
	pxPerMm: number,
) {
	ctx.font = `${spec.bold ? 'bold ' : ''}${spec.sizeMm * pxPerMm}px "${spec.fontFamily}", sans-serif`
	ctx.letterSpacing = `${spec.letterSpacingMm * pxPerMm}px`
}

/** Le mesureur de texte, adossé à un canvas hors écran. C'est la seule pièce
 *  du calcul qui exige un navigateur ; `label-layout.ts` la reçoit en
 *  paramètre pour rester testable sans lui. */
export function createTextMeasurer(): TextMeasurer {
	const ctx = document.createElement('canvas').getContext('2d')
	if (!ctx) return (text, spec) => text.length * spec.sizeMm * 0.6

	return (text, spec) => {
		applyFont(ctx, spec, 10)
		return ctx.measureText(text).width / 10
	}
}

export function layoutFor(
	product: LabelProduct,
	style: LabelStyle,
	rollWidthMm: number,
): LabelLayout {
	const code = labelCode(product)
	return computeLabelLayout({
		title: labelTitle(product),
		price: labelPrice(product),
		barcodeModules: code ? barcodeModules(code) : 0,
		style,
		rollWidthMm,
		measure: createTextMeasurer(),
	})
}

/**
 * Dessine l'étiquette dans un canvas neuf et rend le PNG en data-URL.
 *
 * `pxPerMm` est la seule différence entre l'aperçu et l'impression : à 300 dpi
 * on obtient l'image envoyée au pilote, à une douzaine de pixels par
 * millimètre on obtient la preview. Même code, donc même résultat.
 */
export function renderLabel(
	product: LabelProduct,
	style: LabelStyle,
	layout: LabelLayout,
	pxPerMm = PRINT_DPI / 25.4,
): string {
	const canvas = document.createElement('canvas')
	canvas.width = Math.round(layout.rollWidthMm * pxPerMm)
	canvas.height = Math.round(layout.lengthMm * pxPerMm)

	const ctx = canvas.getContext('2d')
	if (!ctx) throw new Error('Canvas indisponible')

	ctx.fillStyle = '#ffffff'
	ctx.fillRect(0, 0, canvas.width, canvas.height)
	ctx.fillStyle = '#000000'

	const code = labelCode(product)

	for (const block of layout.blocks) {
		const x = block.x * pxPerMm
		const y = block.y * pxPerMm
		const w = block.width * pxPerMm
		const h = block.height * pxPerMm

		ctx.save()
		if (block.rotated) {
			// Le contenu se lit du bas vers le haut : quart de tour anti-horaire
			// autour du centre du bloc, puis on dessine comme si de rien n'était.
			ctx.translate(x + w / 2, y + h / 2)
			ctx.rotate(-Math.PI / 2)
			ctx.translate(-h / 2, -w / 2)
		} else {
			ctx.translate(x, y)
		}

		// Après rotation, le bloc fait `h × w` ; avant, `w × h`.
		const boxW = block.rotated ? h : w
		const boxH = block.rotated ? w : h

		if (block.id === 'barcode') {
			drawBarcode(ctx, code, style, boxW, boxH, pxPerMm)
		} else {
			drawText(ctx, block, style, boxW, pxPerMm)
		}
		ctx.restore()
	}

	return canvas.toDataURL('image/png')
}

function drawText(
	ctx: CanvasRenderingContext2D,
	block: {
		id: 'name' | 'price' | 'barcode'
		lines: string[]
		fontSizeMm: number
	},
	style: LabelStyle,
	boxW: number,
	pxPerMm: number,
) {
	const text = block.id === 'price' ? style.price : style.name
	applyFont(ctx, textSpec(text), pxPerMm)
	ctx.textAlign = 'center'
	ctx.textBaseline = 'top'

	const lineHeight = block.fontSizeMm * 1.15 * pxPerMm
	block.lines.forEach((line, index) => {
		ctx.fillText(line, boxW / 2, index * lineHeight)
	})
}

/** Le code-barres occupe TOUTE la largeur du bloc. JsBarcode dimensionne son
 *  canvas au nombre de barres — 285 px pour un EAN-13 à `width: 3` —, et le
 *  poser tel quel au milieu laissait les grands blancs latéraux constatés à
 *  l'impression. On mesure donc d'abord, on en déduit la largeur de module qui
 *  remplit la place, et on re-rend : les barres remplissent, les chiffres
 *  gardent leurs proportions. */
function drawBarcode(
	ctx: CanvasRenderingContext2D,
	code: string,
	style: LabelStyle,
	boxW: number,
	boxH: number,
	pxPerMm: number,
) {
	if (!code) return

	const image = renderBarcode(
		code,
		boxW,
		style.barcode.heightMm * pxPerMm,
		style.barcode.showText,
		style.barcode.textSizeMm * pxPerMm,
		pxPerMm,
	)
	if (!image) return

	ctx.drawImage(image, 0, 0, boxW, Math.min(boxH, image.height))
}

function barcodeOptions(
	value: string,
	barHeight: number,
	showText: boolean,
	textSize: number,
	pxPerMm: number,
) {
	return {
		format: /^\d{13}$/.test(value) ? ('EAN13' as const) : ('CODE128' as const),
		height: Math.max(1, Math.round(barHeight)),
		margin: 0,
		displayValue: showText,
		fontSize: Math.max(1, Math.round(textSize)),
		font: 'Arial, sans-serif',
		textMargin: Math.round(0.3 * pxPerMm),
	}
}

/** Le nombre de modules du code, mesuré en rendant à `width: 1` : un module y
 *  vaut un pixel. C'est ce nombre, et non une largeur choisie, qui dit combien
 *  de millimètres le code-barres réclame au minimum. */
export function barcodeModules(value: string): number {
	const probe = document.createElement('canvas')
	try {
		JsBarcode(probe, value, {
			...barcodeOptions(value, 10, false, 10, 4),
			width: 1,
		})
	} catch {
		return 0
	}
	return probe.width
}

function renderBarcode(
	value: string,
	targetWidth: number,
	barHeight: number,
	showText: boolean,
	textSize: number,
	pxPerMm: number,
): HTMLCanvasElement | null {
	const options = barcodeOptions(value, barHeight, showText, textSize, pxPerMm)

	const probe = document.createElement('canvas')
	try {
		JsBarcode(probe, value, { ...options, width: 1 })
	} catch {
		// Un code que JsBarcode refuse ne fait pas échouer l'étiquette : on
		// imprime le reste. Le prix et le nom restent utiles au comptoir.
		return null
	}
	if (probe.width === 0) return null

	const canvas = document.createElement('canvas')
	try {
		JsBarcode(canvas, value, { ...options, width: targetWidth / probe.width })
	} catch {
		return probe
	}
	return canvas
}
