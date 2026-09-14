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

/** Les formes proposées, dans l'ordre où le panneau les affiche. */
export const FORMES = [
	{ id: 'rectangle', label: 'Rectangle' },
	{ id: 'circle', label: 'Cercle' },
	{ id: 'triangle', label: 'Triangle' },
	{ id: 'star', label: 'Étoile' },
	{ id: 'line', label: 'Trait' },
]

const ShapeNode = ({
	shape = 'rectangle',
	width = 160,
	height = 160,
	fill = '#3b82f6',
	stroke = '',
	strokeWidth = 0,
	cornerRadius = 0,
	...rest
}) => {
	// Un contour d'épaisseur nulle ou sans couleur ne se dessine pas : Konva
	// tracerait sinon un liseré noir par défaut.
	const contour =
		stroke && strokeWidth > 0
			? { stroke, strokeWidth }
			: { strokeEnabled: false }

	if (shape === 'circle') {
		return (
			<Ellipse
				{...rest}
				{...contour}
				x={(rest.x ?? 0) + width / 2}
				y={(rest.y ?? 0) + height / 2}
				radiusX={width / 2}
				radiusY={height / 2}
				fill={fill}
			/>
		)
	}

	if (shape === 'triangle') {
		return (
			<RegularPolygon
				{...rest}
				{...contour}
				x={(rest.x ?? 0) + width / 2}
				y={(rest.y ?? 0) + height / 2}
				sides={3}
				radius={Math.min(width, height) / 2}
				fill={fill}
			/>
		)
	}

	if (shape === 'star') {
		return (
			<Star
				{...rest}
				{...contour}
				x={(rest.x ?? 0) + width / 2}
				y={(rest.y ?? 0) + height / 2}
				numPoints={5}
				innerRadius={Math.min(width, height) / 4}
				outerRadius={Math.min(width, height) / 2}
				fill={fill}
			/>
		)
	}

	if (shape === 'line') {
		// Un trait horizontal dont l'épaisseur est celle du contour, ou 2 px :
		// une ligne sans épaisseur serait invisible et impossible à rattraper.
		return (
			<Line
				{...rest}
				points={[0, height / 2, width, height / 2]}
				stroke={stroke || fill}
				strokeWidth={strokeWidth > 0 ? strokeWidth : 2}
				lineCap='round'
			/>
		)
	}

	return (
		<Rect
			{...rest}
			{...contour}
			width={width}
			height={height}
			cornerRadius={cornerRadius}
			fill={fill}
		/>
	)
}

export default ShapeNode
