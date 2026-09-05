// frontend/lib/labels/label-layout.test.ts
//
// GARDIEN : la longueur de l'étiquette est la SOMME de ce qu'on imprime, et
// rien de plus.
//
// Sur un rouleau continu, chaque millimètre de longueur est du papier dépensé,
// à chaque vente. Les deux fautes que ces tests interdisent :
//  - la gouttière du DERNIER bloc, qui laissait un espace mort en queue ;
//  - un bloc masqué qui continue de prendre sa place.

import { describe, expect, it } from 'vitest'

import { computeLabelLayout, type TextMeasurer } from './label-layout'
import { DEFAULT_LABEL_STYLE, type LabelStyle } from './label-style'

/** Mesureur déterministe : 0,6 mm de large par caractère et par millimètre de
 *  police. Aucun canvas, donc aucun navigateur. */
const measure: TextMeasurer = (text, spec) =>
	text.length * (spec.sizeMm * 0.6 + spec.letterSpacingMm)

const style = (patch: Partial<LabelStyle> = {}): LabelStyle => ({
	...DEFAULT_LABEL_STYLE,
	...patch,
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
		gapMm: 2,
	},
	...patch,
})

const input = (s: LabelStyle) => ({
	title: 'Casque',
	price: '5,00 €',
	barcodeModules: 113,
	style: s,
	rollWidthMm: 25.9,
	measure,
})

describe('la longueur, dans le sens qui empile (texte en largeur)', () => {
	it("n'emporte pas la gouttière du dernier bloc", () => {
		const layout = computeLabelLayout(input(style()))

		// 1 (marge) + 3×1,15 (nom) + 1 + 6×1,15 (prix) + 1 + 9,99 (code) + 1
		expect(layout.lengthMm).toBeCloseTo(24.34, 2)

		// Le code-barres est le dernier : sa gouttière de 2 mm ne compte pas.
		const barcode = layout.blocks.at(-1)
		expect(barcode?.id).toBe('barcode')
		expect(barcode?.y! + barcode?.height!).toBeCloseTo(layout.lengthMm - 1, 2)
	})

	it('rend les millimètres d’un bloc masqué', () => {
		const avec = computeLabelLayout(input(style()))
		const sans = computeLabelLayout(
			input(style({ name: { ...DEFAULT_LABEL_STYLE.name, visible: false } })),
		)

		expect(sans.blocks.map((b) => b.id)).toEqual(['price', 'barcode'])
		// Le nom (3 × 1,15) ET sa gouttière (1) sont rendus.
		expect(avec.lengthMm - sans.lengthMm).toBeCloseTo(4.45, 2)
	})

	it('descend quand on baisse la hauteur des barres', () => {
		const haut = computeLabelLayout(input(style()))
		const bas = computeLabelLayout(
			input(
				style({
					barcode: {
						visible: true,
						heightMm: 4,
						showText: true,
						textSizeMm: 2.6,
						gapMm: 2,
					},
				}),
			),
		)

		expect(haut.lengthMm - bas.lengthMm).toBeCloseTo(3, 2)
	})
})

describe('la longueur, dans le sens qui range côte à côte (texte en longueur)', () => {
	it('est le PLUS LONG des blocs, pas leur somme', () => {
		const layout = computeLabelLayout(input(style({ orientation: 'rotated' })))

		// Le code-barres : 113 modules × 0,33 = 37,29 mm, plus les deux marges.
		expect(layout.lengthMm).toBeCloseTo(39.29, 2)
		expect(layout.blocks.every((block) => block.rotated)).toBe(true)
	})
})
