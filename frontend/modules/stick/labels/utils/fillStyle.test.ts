import { describe, expect, it, vi } from 'vitest'

// react-konva réclame le module natif `canvas` sous Node ; seule la géométrie est testée ici.
vi.mock('react-konva', () => ({
	Ellipse: 'Ellipse',
	Line: 'Line',
	Rect: 'Rect',
	RegularPolygon: 'RegularPolygon',
	Shape: 'Shape',
	Star: 'Star',
}))
import { dessinForme } from '../components/canvas/ShapeNode'
import { texteCorrige, resolvePropForElement } from './dataBinding'
import { remplissage } from './fillStyle'

describe('remplissage', () => {
	it('sans dégradé : couleur unie, et le dégradé est éteint', () => {
		expect(remplissage(null, 100, 50, '#f00')).toEqual({
			fill: '#f00',
			fillPriority: 'color',
			textureRemplissage: null,
		})
	})
	it('0° : de bord gauche à bord droit, origine en coin', () => {
		const p = remplissage(
			{ from: '#000', to: '#fff', angle: 0 },
			100,
			50,
			'#f00',
		)
		expect(p.fillLinearGradientStartPoint).toEqual({ x: expect.closeTo(0), y: expect.closeTo(25) })
		expect(p.fillLinearGradientEndPoint).toEqual({ x: expect.closeTo(100), y: expect.closeTo(25) })
	})
	it('origine au centre (ellipse, étoile)', () => {
		const p = remplissage(
			{ from: '#000', to: '#fff', angle: 0 },
			100,
			50,
			'#f00',
			true,
		)
		expect(p.fillLinearGradientStartPoint).toEqual({ x: expect.closeTo(-50), y: expect.closeTo(0) })
	})
})

describe('dessinForme', () => {
	it('chaque forme a sa classe Konva', () => {
		for (const [shape, kind] of [
			['rectangle', 'Rect'],
			['circle', 'Ellipse'],
			['triangle', 'RegularPolygon'],
			['star', 'Star'],
			['line', 'Line'],
		]) {
			expect(dessinForme({ shape }).kind).toBe(kind)
		}
	})
	it('une forme centrée est décalée de la moitié du cadre', () => {
		const { props } = dessinForme({
			shape: 'circle',
			x: 10,
			y: 20,
			width: 100,
			height: 60,
		})
		expect(props).toMatchObject({ x: 60, y: 50, radiusX: 50, radiusY: 30 })
	})
})

describe('correction de texte lié', () => {
	const el = {
		type: 'text',
		dataBinding: 'name',
		textOverrides: { a: 'Guitare' },
	}
	it("l'emporte pour SON produit seulement", () => {
		expect(resolvePropForElement('', el, { _id: 'a', name: 'Guiatre' })).toBe(
			'Guitare',
		)
		expect(resolvePropForElement('', el, { _id: 'b', name: 'Basse' })).toBe(
			'Basse',
		)
	})
	it('sans produit, pas de correction', () => {
		expect(texteCorrige(el, null)).toBeUndefined()
	})
})

describe('dessinForme : contour stylisé', () => {
	// `dessinForme` est en JS : son `contourStyle = null` se lit comme un type `null`
	const style: any = { variation: 0.5, tremble: 0.3, ondulation: 0, ondes: 12, effilementDebut: 0, effilementFin: 0 }
	it('une forme à contour stylisé devient un Konva.Shape, même origine', () => {
		const r = dessinForme({ shape: 'rectangle', x: 10, y: 20, width: 100, height: 50, stroke: '#000', strokeWidth: 4, contourStyle: style, id: 'a' })
		expect(r.kind).toBe('Shape')
		expect(r.props).toMatchObject({ x: 10, y: 20, offsetX: 0, offsetY: 0, width: 100, height: 50, strokeEnabled: false })
		expect(typeof (r.props as any).sceneFunc).toBe('function')
	})
	it('une forme centrée garde son centre par offset', () => {
		const r = dessinForme({ shape: 'circle', x: 10, y: 20, width: 100, height: 50, stroke: '#000', strokeWidth: 4, contourStyle: style, id: 'a' })
		expect(r.props).toMatchObject({ x: 60, y: 45, offsetX: 50, offsetY: 25 })
	})
	it('sans épaisseur ou sans couleur de contour : la primitive Konva, comme avant', () => {
		expect(dessinForme({ shape: 'circle', strokeWidth: 0, stroke: '#000', contourStyle: style }).kind).toBe('Ellipse')
		expect(dessinForme({ shape: 'rectangle', strokeWidth: 4, stroke: '', contourStyle: style }).kind).toBe('Rect')
	})
})
