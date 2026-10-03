// frontend/modules/stick/labels/utils/majSelection.js
//
// UN RÉGLAGE S'APPLIQUE À TOUTE LA SÉLECTION. Avant, le panneau ne réglait
// que l'élément principal : trois textes sélectionnés, on changeait la police,
// un seul changeait — sans que rien ne le dise.
//
// Ce qui se PARTAGE est le STYLE, pas la géométrie ni le contenu : la même
// frontière que copier / coller le style (`HORS_STYLE`, `styleCopie.js`). Un
// réglage qui porte de la géométrie (un tracé redessiné rend son nouveau
// cadre et ses points, un alignement de texte rend une largeur) est rejoué
// pour chaque autre élément à partir de ses réglages seuls.
// Module pur : `redessiner` est passé en paramètre. Testable sous Node.

import { HORS_STYLE } from './styleCopie';

/**
 * Les éléments que touche un réglage fait sur `principal` : la sélection,
 * verrouillés exclus, du même type (`memeType`, les réglages d'un type) ou de
 * tout type (les effets). Le principal vient toujours en premier.
 */
export const ciblesDe = ({ elements, selectedId, extraIds }, principal, memeType = true) => {
  if (!principal) return [];
  const choisis = new Set([selectedId, ...(extraIds ?? [])]);
  const autres = (elements ?? []).filter(
    (e) => e.id !== principal.id && choisis.has(e.id) && !e.locked && (!memeType || e.type === principal.type)
  );
  return [principal, ...autres];
};

/** La part d'une mise à jour qui est du style : ni géométrie, ni contenu. */
export const partStyle = (m) => {
  const style = {};
  for (const [cle, valeur] of Object.entries(m ?? {})) if (!HORS_STYLE.has(cle)) style[cle] = valeur;
  return style;
};

/**
 * Ce qu'un AUTRE élément de la sélection reçoit quand le principal reçoit
 * `m` : la part de style, rejouée par `redessiner` pour un tracé (son cadre
 * et ses points lui sont propres). null : rien à lui appliquer.
 */
export const majPourAutre = (cible, m, redessiner) => {
  const style = partStyle(m);
  if (!Object.keys(style).length) return null;
  if (cible.type === 'dessin' && redessiner) return redessiner(cible, style) ?? style;
  return style;
};

/** `{ id: mises à jour }` pour toute la sélection ; le principal reçoit `m` tel quel. */
export const majDeSelection = (etat, principal, m, { memeType = true, redessiner } = {}) => {
  const parId = {};
  for (const cible of ciblesDe(etat, principal, memeType)) {
    const maj = cible.id === principal.id ? m : majPourAutre(cible, m, redessiner);
    if (maj && Object.keys(maj).length) parId[cible.id] = maj;
  }
  return parId;
};
