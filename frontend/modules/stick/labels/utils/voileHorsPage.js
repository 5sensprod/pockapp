/**
 * Voile hors page — AFFICHAGE D'ÉCRAN SEULEMENT.
 *
 * Ce qui dépasse de la page reste visible mais voilé de la couleur du fond de
 * l'espace de travail, comme dans Polotno : on voit que ça ne s'imprimera pas.
 * Le voile vit hors du groupe du document (que l'export clone) : il ne
 * s'imprime jamais.
 */

/** Opacité du voile : l'élément s'efface dans le fond sans disparaître. */
export const OPACITE_VOILE = 0.7;

/**
 * Les quatre bandes (haut, bas, gauche, droite) qui couvrent la scène SAUF la
 * page, en coordonnées de la scène (px écran, sans mise à l'échelle). Les
 * bandes vides sont omises.
 */
export function bandesHorsPage(scene, page) {
  const { width: sw, height: sh } = scene;
  const x0 = Math.max(0, page.x);
  const y0 = Math.max(0, page.y);
  const x1 = Math.min(sw, page.x + page.width);
  const y1 = Math.min(sh, page.y + page.height);
  const bandes = [
    { cle: 'haut', x: 0, y: 0, width: sw, height: y0 },
    { cle: 'bas', x: 0, y: y1, width: sw, height: sh - y1 },
    { cle: 'gauche', x: 0, y: y0, width: x0, height: y1 - y0 },
    { cle: 'droite', x: x1, y: y0, width: sw - x1, height: y1 - y0 },
  ];
  return bandes.filter((b) => b.width > 0 && b.height > 0);
}

/** Une couleur CSS calculée est-elle transparente ? */
export function estTransparente(couleur) {
  if (!couleur || couleur === 'transparent') return true;
  const m = /rgba?\(([^)]+)\)/.exec(couleur);
  if (!m) return false;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  return parts.length === 4 && Number.parseFloat(parts[3]) === 0;
}

/**
 * Couleur de fond effective derrière `el` : le premier ancêtre dont le fond
 * n'est pas transparent. Repli : blanc.
 */
export function couleurDuFond(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const bg = getComputedStyle(n).backgroundColor;
    if (!estTransparente(bg)) return bg;
  }
  return '#ffffff';
}
