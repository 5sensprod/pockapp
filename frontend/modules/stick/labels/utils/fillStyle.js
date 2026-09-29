// frontend/modules/stick/labels/utils/fillStyle.js
//
// COULEUR UNIE OU DÉGRADÉ. Un élément porte `fillGradient` —
// `{ from, to, angle }`, angle en degrés, 0 = de gauche à droite — ou rien.
// Konva dessine un dégradé entre deux POINTS exprimés dans le repère local du
// nœud : ils dépendent donc de la taille de la forme, et de son origine
// (coin haut gauche pour un Rect ou un Text, centre pour une Ellipse ou une
// Étoile). Une seule fonction les calcule, pour le canvas ET pour l'export
// planche : deux calculs, c'est deux dessins différents.

import { remplissageKonva } from './paint';

// Depuis le 29/09/2026, le dégradé suit le modèle de PocketStick
// (`utils/paint.js`, linéaire ou radial, 2 à 16 arrêts) ; l'ancien
// `{ from, to, angle }` reste lu tel quel. `remplissage` n'est plus qu'un relais.

export const DEGRADE_PAR_DEFAUT = { from: '#3b82f6', to: '#ec4899', angle: 0 };

/**
 * Props Konva de remplissage.
 * @param {{from:string,to:string,angle?:number}|null|undefined} gradient
 * @param {number} width
 * @param {number} height
 * @param {string} color  couleur unie, utilisée sans dégradé
 * @param {boolean} [centre] true si l'origine du nœud est son centre
 * @returns {Record<string, any>}
 */
export const remplissage = (gradient, width, height, color, centre = false) =>
  remplissageKonva(gradient, width, height, color, centre);
