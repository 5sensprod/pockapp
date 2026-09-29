// frontend/modules/stick/labels/components/canvas/ShapeNode.jsx
//
// LES FORMES GÉOMÉTRIQUES. L'onglet existait dans AppPos mais ses boutons ne
// faisaient rien, et le canvas ne savait pas rendre un élément `shape` :
// tout est écrit ici.
//
// Chaque forme est dessinée dans un cadre `width × height` dont le coin haut
// gauche est l'origine, comme pour une image ou un code-barres. C'est ce qui
// permet au Transformer de les redimensionner toutes de la même façon — un
// `Circle` Konva, lui, est centré sur son origine : il est donc décalé de la
// moitié du cadre plutôt que posé tel quel.

import React from 'react'
import { Ellipse, Line, Rect, RegularPolygon, Star } from 'react-konva'
import { remplissage } from '../../utils/fillStyle'
import { contourKonva, versPeinture } from '../../utils/paint'

/** Les formes proposées, dans l'ordre où le panneau les affiche. */
export const FORMES = [
	{ id: 'rectangle', label: 'Rectangle' },
	{ id: 'circle', label: 'Cercle' },
	{ id: 'triangle', label: 'Triangle' },
	{ id: 'star', label: 'Étoile' },
	{ id: 'line', label: 'Trait' },
]

/**
 * La géométrie d'une forme, sans React : `kind` est le nom de la classe Konva
 * et `props` ce qu'il faut lui passer. Partagée par le canvas (ci-dessous) et
 * par l'export en planche (`utils/exportPdfSheet.js`), qui ne dessinait
 * AUCUNE forme tant qu'elle n'existait qu'ici en JSX.
 */
export function dessinForme({
	shape = 'rectangle',
	x = 0,
	y = 0,
	width = 160,
	height = 160,
	fill = '#3b82f6',
	stroke = '',
	strokeWidth = 0,
	cornerRadius = 0,
	fillGradient = null,
	strokeGradient = null,
}) {
	// Un contour d'épaisseur nulle ou sans couleur ne se dessine pas : Konva
	// tracerait sinon un liseré noir par défaut. Le dégradé de contour
	// (`utils/paint.js`, `contourKonva`) est linéaire : Konva ne sait pas mieux.
	const degradeContour = versPeinture(strokeGradient)
	const traceContour = (centré) =>
		(stroke || degradeContour) && strokeWidth > 0
			? {
					strokeEnabled: true,
					strokeWidth,
					...contourKonva(degradeContour, width, height, stroke, centré),
				}
			: { strokeEnabled: false, strokeLinearGradientColorStops: null }
	const centre = { x: x + width / 2, y: y + height / 2 }
	const plein = (centré) =>
		remplissage(fillGradient, width, height, fill, centré)

	if (shape === 'circle') {
		return {
			kind: 'Ellipse',
			props: {
				...traceContour(true),
				...plein(true),
				...centre,
				radiusX: width / 2,
				radiusY: height / 2,
			},
		}
	}

	if (shape === 'triangle') {
		return {
			kind: 'RegularPolygon',
			props: {
				...traceContour(true),
				...plein(true),
				...centre,
				sides: 3,
				radius: Math.min(width, height) / 2,
			},
		}
	}

	if (shape === 'star') {
		return {
			kind: 'Star',
			props: {
				...traceContour(true),
				...plein(true),
				...centre,
				numPoints: 5,
				innerRadius: Math.min(width, height) / 4,
				outerRadius: Math.min(width, height) / 2,
			},
		}
	}

	if (shape === 'line') {
		// Un trait horizontal dont l'épaisseur est celle du contour, ou 2 px :
		// une ligne sans épaisseur serait invisible et impossible à rattraper.
		// Un trait n'a pas de remplissage : pas de dégradé.
		return {
			kind: 'Line',
			props: {
				x,
				y,
				points: [0, height / 2, width, height / 2],
				strokeWidth: strokeWidth > 0 ? strokeWidth : 2,
				...contourKonva(degradeContour, width, height, stroke || fill),
				lineCap: 'round',
			},
		}
	}

	return {
		kind: 'Rect',
		props: {
			...traceContour(false),
			...plein(false),
			x,
			y,
			width,
			height,
			cornerRadius,
		},
	}
}

const COMPOSANTS = { Ellipse, Line, Rect, RegularPolygon, Star }

const ShapeNode = ({
	shape,
	width,
	height,
	fill,
	stroke,
	strokeWidth,
	cornerRadius,
	fillGradient,
	strokeGradient,
	...rest
}) => {
	const { kind, props } = dessinForme({
		shape,
		x: rest.x ?? 0,
		y: rest.y ?? 0,
		width,
		height,
		fill,
		stroke,
		strokeWidth,
		cornerRadius,
		fillGradient,
		strokeGradient,
	})
	const Composant = COMPOSANTS[kind]
	return <Composant {...rest} {...props} />
}

export default ShapeNode
