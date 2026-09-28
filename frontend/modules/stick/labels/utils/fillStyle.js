// frontend/modules/stick/labels/utils/fillStyle.js
//
// COULEUR UNIE OU DÉGRADÉ. Un élément porte `fillGradient` —
// `{ from, to, angle }`, angle en degrés, 0 = de gauche à droite — ou rien.
// Konva dessine un dégradé entre deux POINTS exprimés dans le repère local du
// nœud : ils dépendent donc de la taille de la forme, et de son origine
// (coin haut gauche pour un Rect ou un Text, centre pour une Ellipse ou une
// Étoile). Une seule fonction les calcule, pour le canvas ET pour l'export
// planche : deux calculs, c'est deux dessins différents.

export const DEGRADE_PAR_DEFAUT = { from: '#3b82f6', to: '#ec4899', angle: 0 };

/**
 * Props Konva de remplissage.
 * @param {{from:string,to:string,angle?:number}|null|undefined} gradient
 * @param {number} width
 * @param {number} height
 * @param {string} color  couleur unie, utilisée sans dégradé
 * @param {boolean} [centre] true si l'origine du nœud est son centre
 */
export const remplissage = (gradient, width, height, color, centre = false) => {
  if (!gradient?.from || !gradient?.to) {
    // `fillPriority` explicite : repasser en uni doit ÉTEINDRE le dégradé
    // d'un nœud déjà dessiné, pas seulement cesser de le décrire.
    return { fill: color, fillPriority: 'color' };
  }
  const a = ((Number(gradient.angle) || 0) * Math.PI) / 180;
  const w = width || 0;
  const h = height || 0;
  const cx = centre ? 0 : w / 2;
  const cy = centre ? 0 : h / 2;
  // Demi-longueur de la projection du cadre sur l'axe du dégradé : les deux
  // couleurs pures tombent exactement sur les bords, quel que soit l'angle.
  const demi = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2;
  const dx = Math.cos(a) * demi;
  const dy = Math.sin(a) * demi;
  return {
    fill: color,
    fillPriority: 'linear-gradient',
    fillLinearGradientStartPoint: { x: cx - dx, y: cy - dy },
    fillLinearGradientEndPoint: { x: cx + dx, y: cy + dy },
    fillLinearGradientColorStops: [0, gradient.from, 1, gradient.to],
  };
};
