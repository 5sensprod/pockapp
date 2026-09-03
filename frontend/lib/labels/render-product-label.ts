// frontend/lib/labels/render-product-label.ts
//
// L'ÉTIQUETTE PRODUIT, DESSINÉE DANS UN CANVAS.
//
// Trois informations, et pas une de plus : le nom, le prix TTC, le code-barres.
// AppPos avait cinquante réglages de style et deux moteurs graphiques
// (Fabric et Konva) pour la même chose ; ici le dessin est du code, pas une
// configuration — un changement de mise en page est une modification de ce
// fichier, relue et versionnée.
//
// Le format n'est PAS écrit ici : il vient du pilote de l'étiqueteuse
// (`GET /api/labels/page-size`). Changer le rouleau dans le pilote change
// l'aperçu sans toucher au code.

import JsBarcode from 'jsbarcode'

/** La résolution native d'une QL-600. Rendre au-dessus ne gagne rien : le
 *  pilote rééchantillonnerait vers le bas. */
const DPI = 300

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

export type LabelPageSize = {
	widthMm: number
	heightMm: number
}

/** Le sens de lecture, choisi par l'utilisateur — pas déduit du média.
 *  `horizontal` : le texte court le long du média (le cas normal sur un
 *  rouleau continu). `vertical` : il court en travers, pour coller une
 *  étiquette sur une tranche ou un manche. */
export type LabelOrientation = 'horizontal' | 'vertical'

const mmToPx = (mm: number) => Math.round((mm / 25.4) * DPI)
const pxToMm = (px: number) => (px / DPI) * 25.4

/** Les seules cotes de la mise en page, partagées par le DESSIN et par le
 *  MESURAGE. Deux jeux de valeurs, c'est une étiquette calculée pour une
 *  longueur et dessinée pour une autre. */
const PAD_MM = 1
const NAME_MAX_MM = 5.5
const NAME_MIN_MM = 2.4
/** Le prix est ce qu'un client lit à un mètre. Dans la LONGUEUR, le nom tient
 *  sur une ligne et lui rend de la hauteur : il peut monter à 13 mm. En
 *  TRAVERS la mise en page convient telle quelle — on n'y touche pas. */
const PRICE_MAX_MM = { horizontal: 13, vertical: 8 } as const
/** Largeur nominale d'un module EAN-13. En dessous, la scanette commence à
 *  hésiter ; c'est cette cote qui fixe la longueur minimale d'une étiquette
 *  horizontale. */
const MODULE_MM = 0.33
/** Ce que le bloc code-barres prend en hauteur, barres + chiffres. */
const BARCODE_BLOCK_MM = 12
/** Plancher : en deçà, l'étiquette n'a plus la place de dire son prix. */
const MIN_CONTENT_MM = 25

/** Le nom imprimé, et il n'y en a qu'un : `designation`, le nom du comptoir,
 *  celui qui part déjà sur le ticket de caisse (`catalog-products.ts:94`).
 *  JAMAIS `name` : c'est le titre de la page du site, écrit pour le
 *  référencement, souvent long et jamais pensé pour 84 mm de papier. Un
 *  produit sans désignation s'imprime SANS nom — l'étiquette le montre, et
 *  c'est la fiche produit qu'il faut corriger, pas l'étiquette. */
export function labelTitle(product: LabelProduct): string {
	return product.designation?.trim() ?? ''
}

/**
 * La longueur de coupe qu'il FAUT à ce produit, en millimètres de contenu —
 * les marges d'entraînement du pilote ne sont pas comprises, l'appelant les
 * ajoute (il est le seul à les connaître, elles viennent du pilote).
 *
 * Le rouleau est continu : sa largeur est imposée (26 mm utiles sur du 29),
 * sa longueur ne l'est pas. C'est donc la longueur qui s'ajuste au contenu, et
 * jamais l'inverse — une étiquette de 84 mm pour un prix à trois chiffres,
 * c'est du papier jeté à chaque vente.
 *
 * Les deux sens ne se mesurent pas de la même façon :
 *  - horizontal, les trois blocs s'empilent dans la LARGEUR du rouleau, qui
 *    est fixe ; la longueur est celle du bloc le plus large, et c'est presque
 *    toujours le code-barres (113 modules × 0,33 mm ≈ 37 mm pour un EAN-13) ;
 *  - vertical, ils s'empilent dans la longueur : elle est leur SOMME.
 */
export function measureLabelLengthMm(
	product: LabelProduct,
	rollWidthMm: number,
	orientation: LabelOrientation = 'horizontal',
): number {
	const ctx = document.createElement('canvas').getContext('2d')
	if (!ctx) return rollWidthMm * 2

	const title = labelTitle(product)
	const price =
		typeof product.price_ttc === 'number' ? euros.format(product.price_ttc) : ''
	const code = (product.barcode || product.sku || '').trim()
	const modules = code ? barcodeModules(code) : 0

	if (orientation === 'horizontal') {
		// Le code-barres SEUL fixe la longueur. Le nom et le prix s'y adaptent
		// — le nom en rétrécissant jusqu'à tenir sur une ligne, le prix en
		// remplissant la hauteur restante. Les faire peser sur la longueur
		// donnait des étiquettes à rallonge pour une désignation bavarde.
		const needed = modules > 0 ? modules * MODULE_MM : rollWidthMm
		return Math.max(needed, MIN_CONTENT_MM) + PAD_MM * 2
	}

	const inner = mmToPx(rollWidthMm - PAD_MM * 2)
	let needed = 0

	if (title) {
		const size = fitFontSize(
			ctx,
			title,
			inner,
			mmToPx(NAME_MAX_MM),
			mmToPx(NAME_MIN_MM),
		)
		ctx.font = `bold ${size}px Arial, sans-serif`
		needed += pxToMm(size * 1.1) * wrapText(ctx, title, inner, 2).length
	}

	if (price) needed += PRICE_MAX_MM.vertical * 1.1
	if (modules > 0) needed += BARCODE_BLOCK_MM

	return needed + PAD_MM * 2
}

/**
 * Rend l'étiquette et retourne un PNG en data-URL.
 *
 * L'image fait toujours la taille de la page annoncée par le pilote — c'est ce
 * qui évite au rendu GDI de la rétrécir pour la faire tenir. Le contenu, lui,
 * est dessiné dans un repère qui suit le SENS demandé, et l'image pivote d'un
 * quart de tour quand les deux ne coïncident pas.
 */
export function renderProductLabel(
	product: LabelProduct,
	page: LabelPageSize,
	orientation: LabelOrientation = 'horizontal',
): string {
	const long = Math.max(page.widthMm, page.heightMm)
	const short = Math.min(page.widthMm, page.heightMm)

	const contentWmm = orientation === 'horizontal' ? long : short
	const contentHmm = orientation === 'horizontal' ? short : long

	// Le repère du contenu est-il tourné par rapport à la page ?
	const rotate = contentWmm > contentHmm !== page.widthMm > page.heightMm

	const canvas = document.createElement('canvas')
	canvas.width = mmToPx(page.widthMm)
	canvas.height = mmToPx(page.heightMm)

	const ctx = canvas.getContext('2d')
	if (!ctx) throw new Error('Canvas indisponible')

	ctx.fillStyle = '#ffffff'
	ctx.fillRect(0, 0, canvas.width, canvas.height)

	ctx.save()
	if (rotate) {
		// Origine en bas à gauche, puis quart de tour anti-horaire.
		ctx.translate(0, canvas.height)
		ctx.rotate(-Math.PI / 2)
	}

	drawContent(ctx, product, mmToPx(contentWmm), mmToPx(contentHmm), orientation)
	ctx.restore()

	return canvas.toDataURL('image/png')
}

function drawContent(
	ctx: CanvasRenderingContext2D,
	product: LabelProduct,
	width: number,
	height: number,
	orientation: LabelOrientation,
) {
	// 1 mm de marge, pas plus : le pilote a DÉJÀ retiré ses propres marges de
	// la zone imprimable qu'il annonce (26 mm annoncés sur un rouleau de 29).
	const pad = mmToPx(PAD_MM)
	const inner = width - pad * 2
	const centerX = width / 2

	ctx.fillStyle = '#000000'
	ctx.textAlign = 'center'

	// ── Code-barres d'abord : c'est le seul bloc dont la taille n'est pas
	// négociable — la scanette doit le lire. Il est posé en bas, sur TOUTE la
	// largeur utile, et le reste se partage ce qui reste au-dessus.
	const code = (product.barcode || product.sku || '').trim()
	const barcodeImg = code ? renderBarcode(code, inner, height * 0.3) : null

	let barcodeTop = height - pad
	if (barcodeImg) {
		barcodeTop = height - pad - barcodeImg.height
		ctx.drawImage(
			barcodeImg,
			pad,
			barcodeTop,
			barcodeImg.width,
			barcodeImg.height,
		)
	}

	// ── Nom, en haut. Dans la LONGUEUR il tient sur UNE ligne, quitte à
	// rétrécir : deux lignes y volaient au prix la hauteur qui lui manquait.
	// En travers, la largeur est trop courte pour cela — deux lignes.
	const maxLines = orientation === 'horizontal' ? 1 : 2
	let y = pad
	const title = labelTitle(product)
	if (title) {
		const size = fitFontSize(
			ctx,
			title,
			inner,
			mmToPx(NAME_MAX_MM),
			mmToPx(NAME_MIN_MM),
			maxLines,
		)
		ctx.font = `bold ${size}px Arial, sans-serif`
		ctx.textBaseline = 'top'
		const lines = wrapText(ctx, title, inner, maxLines)
		for (const line of lines) {
			ctx.fillText(line, centerX, y)
			y += size * 1.1
		}
	}

	// ── Prix : il prend TOUT ce qui reste entre le nom et le code-barres.
	// C'est l'information qu'un client lit à un mètre ; lui laisser une taille
	// fixe, c'est laisser du blanc au milieu de l'étiquette.
	if (typeof product.price_ttc === 'number') {
		const available = barcodeTop - y
		const text = euros.format(product.price_ttc)
		const bySize = fitFontSize(
			ctx,
			text,
			inner,
			Math.min(available * 0.95, mmToPx(PRICE_MAX_MM[orientation])),
			mmToPx(3),
			1,
		)
		ctx.font = `bold ${bySize}px Arial, sans-serif`
		ctx.textBaseline = 'middle'
		ctx.fillText(text, centerX, y + available / 2)
	}
}

/** La plus grande police à laquelle le texte tient encore dans la largeur —
 *  sur deux lignes pour un nom, sur une seule pour un prix (`lines`). Sans
 *  cela, un texte court garde une taille fixe et laisse du blanc autour de
 *  lui : c'est le défaut qu'on corrige ici, pas une coquetterie. */
function fitFontSize(
	ctx: CanvasRenderingContext2D,
	text: string,
	maxWidth: number,
	maxSize: number,
	minSize: number,
	lines = 2,
): number {
	for (let size = Math.floor(maxSize); size > minSize; size -= 1) {
		ctx.font = `bold ${size}px Arial, sans-serif`
		if (ctx.measureText(text).width <= maxWidth * lines) return size
	}
	return minSize
}

/** Coupe aux mots, et tronque à `maxLines` avec une ellipse : un nom long ne
 *  doit pas pousser le code-barres hors de l'étiquette. */
function wrapText(
	ctx: CanvasRenderingContext2D,
	text: string,
	maxWidth: number,
	maxLines: number,
): string[] {
	const words = text.split(/\s+/)
	const lines: string[] = []
	let current = ''

	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word
		if (ctx.measureText(candidate).width <= maxWidth || !current) {
			current = candidate
			continue
		}
		lines.push(current)
		current = word
		if (lines.length === maxLines) break
	}

	if (lines.length < maxLines && current) lines.push(current)

	const last = lines[maxLines - 1]
	if (
		lines.length === maxLines &&
		last &&
		ctx.measureText(last).width > maxWidth
	) {
		let truncated = last
		while (
			truncated.length > 1 &&
			ctx.measureText(`${truncated}…`).width > maxWidth
		) {
			truncated = truncated.slice(0, -1)
		}
		lines[maxLines - 1] = `${truncated}…`
	}

	return lines
}

/** EAN-13 quand le code en a la forme, CODE128 sinon — un SKU maison n'est pas
 *  un EAN et JsBarcode refuserait de le rendre.
 *
 *  Rendu EN DEUX PASSES, et c'est le cœur du problème des blancs latéraux :
 *  JsBarcode dimensionne son canvas au nombre de barres × `width` (la largeur
 *  d'un module, en pixels), soit 285 px pour un EAN-13 à `width: 3`. Poser ce
 *  canvas au milieu des 968 px d'une étiquette de 84 mm laissait les deux
 *  tiers en blanc ; l'étirer à l'affichage aurait étiré les chiffres avec les
 *  barres. On mesure donc une première fois, on en déduit la largeur de module
 *  qui remplit la place, et on re-rend : les barres occupent toute la largeur,
 *  les chiffres gardent leurs proportions. */
function barcodeOptions(value: string, barHeight: number) {
	return {
		format: /^\d{13}$/.test(value) ? ('EAN13' as const) : ('CODE128' as const),
		height: Math.round(barHeight),
		margin: 0,
		displayValue: true,
		fontSize: mmToPx(2.6),
		font: 'Arial, sans-serif',
		textMargin: mmToPx(0.4),
	}
}

/** Le nombre de modules du code, mesuré en rendant à `width: 1` : un module y
 *  vaut un pixel. C'est ce nombre, et non une largeur choisie, qui dit combien
 *  de millimètres le code-barres réclame. */
function barcodeModules(value: string): number {
	const probe = document.createElement('canvas')
	try {
		JsBarcode(probe, value, { ...barcodeOptions(value, 10), width: 1 })
	} catch {
		return 0
	}
	return probe.width
}

function renderBarcode(
	value: string,
	targetWidth: number,
	barHeight: number,
): HTMLCanvasElement | null {
	const options = barcodeOptions(value, barHeight)

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
		JsBarcode(canvas, value, {
			...options,
			width: targetWidth / probe.width,
		})
	} catch {
		return probe
	}

	return canvas
}
