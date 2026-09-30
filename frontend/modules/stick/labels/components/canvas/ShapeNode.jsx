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
import { Ellipse, Line, Rect, RegularPolygon, Shape, Star } from 'react-konva'
import { remplissage } from '../../utils/fillStyle'
import { contourKonva, degradeCanvas2D, isTexture, versPeinture } from '../../utils/paint'
import { contourDeBase, contourStylise, installerCadreReel, tracerLigne, tracerOutline } from '../../utils/contourStylise'
import { ombreDeSilhouette } from '../../utils/ombreSilhouette'

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
	contourStyle = null,
	id = '',
	pointsLibres = null,
}) {
	// CONTOUR STYLISÉ (`utils/contourStylise.js`) : un `Konva.Shape` qui peint
	// le remplissage puis le trait épaissi. Même origine que la primitive
	// qu'il remplace — les formes centrées le sont par `offset` —, pour que
	// `positionDepuisNoeud`, la rotation et le Transformer ne voient rien.
	const stylise = contourStylise({ shape, width, height, cornerRadius, strokeWidth, contourStyle, id, pointsLibres })
	if (stylise && (stroke || strokeGradient || shape === 'line')) {
		const centree = ['circle', 'triangle', 'star'].includes(shape)
		const couleur = shape === 'line' ? stroke || fill : stroke
		// Un trait n'a pas de remplissage ; `fillEnabled` reste vrai, le canvas de
		// détection (hitFunc) passe par `fillShape`, qui l'exige.
		// Une TEXTURE est un motif sans répétition posé sur un cadre : celui du
		// dessin réel, que le bord déformé dépasse — sinon elle s'arrêterait au
		// cadre de la forme (un dégradé, lui, s'étend à l'infini).
		const texture = isTexture(versPeinture(fillGradient))
		const pleine = !stylise.ferme
			? {}
			: texture
				? {
						...remplissage(fillGradient, stylise.cadre.width, stylise.cadre.height, fill, false),
						fillPatternX: stylise.cadre.x,
						fillPatternY: stylise.cadre.y,
					}
				: remplissage(fillGradient, width, height, fill, false)
		const peindre = (ctx, noeud, scene) => {
			installerCadreReel(noeud) // un clone l'a perdu
			// L'ombre, que Konva allume avant la sceneFunc, tomberait sur chaque
			// remplissage : celle du trait sur le fond. On dessine l'ombre de la
			// SILHOUETTE seule, puis la forme sans ombre (`ombreSilhouette`).
			if (scene && ombreSilhouette(ctx, stylise)) {
				ctx._context.save()
				ctx._context.shadowColor = 'rgba(0,0,0,0)'
				peindre(ctx, noeud, 'sansOmbre')
				ctx._context.restore()
				return
			}
			if (stylise.ferme) {
				ctx.beginPath()
				tracerLigne(ctx, stylise.ligne)
				ctx.fillShape(noeud)
			}
			ctx.beginPath()
			tracerOutline(ctx, stylise.outline)
			if (!scene) return ctx.fillShape(noeud)
			ctx.setAttr('fillStyle', degradeCanvas2D(ctx, strokeGradient, width, height, stylise.cadre) ?? couleur)
			ctx.fill()
		}
		return {
			kind: 'Shape',
			// À poser sur le nœud (`getSelfRect`) : voir `contourStylise`
			cadre: stylise.cadre,
			props: {
				...pleine,
				x: centree ? x + width / 2 : x,
				y: centree ? y + height / 2 : y,
				offsetX: centree ? width / 2 : 0,
				offsetY: centree ? height / 2 : 0,
				width,
				height,
				strokeEnabled: false,
				// Le cadre réel, en ATTRIBUT : un clone (export) le garde
				cadreReel: stylise.cadre,
				sceneFunc: (ctx, noeud) => peindre(ctx, noeud, true),
				hitFunc: (ctx, noeud) => peindre(ctx, noeud, false),
			},
		}
	}

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

	if (shape === 'libre') {
		// Forme LIBRE, née d'un tracé fermé (`utils/formeLibre.js`) : ses points
		// normalisés mis à la taille du cadre, segments droits (pas de tension :
		// le contour stylisé n'en a pas, les deux rendus doivent coïncider)
		return {
			kind: 'Line',
			props: {
				...traceContour(false),
				...plein(false),
				x,
				y,
				points: contourDeBase({ shape, width, height, pointsLibres }).points.flatMap((p) => [p.x, p.y]),
				closed: true,
				lineJoin: 'round',
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

/**
 * Ombre de la silhouette d'un contour stylisé (remplissage ET trait, une
 * seule ombre, sans ombre du trait sur le fond) : `utils/ombreSilhouette.js`.
 * Ligne et trait en deux remplissages — un seul chemin laisserait des trous,
 * sens de parcours opposés.
 */
const ombreSilhouette = (ctx, stylise) =>
	ombreDeSilhouette(ctx, stylise.cadre, (s) => {
		if (stylise.ferme) {
			s.beginPath()
			tracerLigne(s, stylise.ligne)
			s.fill()
		}
		s.beginPath()
		tracerOutline(s, stylise.outline)
		s.fill()
	})

const COMPOSANTS = { Ellipse, Line, Rect, RegularPolygon, Shape, Star }

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
	contourStyle,
	pointsLibres,
	...rest
}) => {
	const { kind, props, cadre } = dessinForme({
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
		contourStyle,
		id: rest.id,
		pointsLibres,
	})
	const Composant = COMPOSANTS[kind]
	// Contour stylisé : le cadre réel du trait, qui déborde de width × height
	const poserCadre = cadre ? (n) => installerCadreReel(n) : undefined
	return <Composant {...rest} {...props} ref={poserCadre} />
}

export default ShapeNode
