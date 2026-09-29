// frontend/modules/stick/labels/utils/cleEffets.js
//
// CLÉ D'EFFETS d'un élément (JS pur, testé sous Node). Le canvas
// (`KonvaCanvas`) ne remet un nœud en cache (`appliquerEffets`) que si cette
// clé a changé : avant, TOUS les nœuds filtrés étaient recalculés trois fois à
// chaque modification du document (mesuré sur « Mon template test », 29/09/2026 :
// 60 à 80 ms de JS par passe au ratio 2).
//
// Ce qui déplace le nœud sans changer ses pixels (position, rotation, verrou)
// n'entre pas dans la clé : le cache est dans le repère du nœud. Tout le reste
// y entre — mieux vaut un recalcul de trop qu'un effet périmé. Le CONTENU que
// l'élément ne porte pas (texte lié à un produit, image chargée plus tard,
// police arrivée après coup) est la `signature` lue sur le nœud par l'appelant.
//
// Les exports ne passent pas par là (`recacherFiltres`, `exportPdfSheet`).

const HORS_CLE = new Set(['x', 'y', 'rotation', 'locked']);

export const cleEffets = (el, ratio, signature = '') => {
  const champs = {};
  for (const k of Object.keys(el ?? {}).sort()) if (!HORS_CLE.has(k)) champs[k] = el[k];
  return `${ratio}|${signature}|${JSON.stringify(champs)}`;
};
