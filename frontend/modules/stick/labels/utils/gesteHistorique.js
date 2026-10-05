// frontend/modules/stick/labels/utils/gesteHistorique.js
//
// UN GESTE, UNE ÉTAPE D'HISTORIQUE (JS pur, testé sous Node). Un curseur ou
// le sélecteur de couleur appellent `updateElement` à chaque mouvement : sans
// regroupement, chaque événement était une étape, et Ctrl+Z remontait un
// curseur cran par cran. Deux modifications font partie du même geste si
// elles touchent le MÊME élément et les MÊMES champs, à moins de `DELAI_GESTE`
// l'une de l'autre (fenêtre glissante : un curseur tenu reste un seul geste).

export const DELAI_GESTE = 600;

export const cleGeste = (id, updates) => `${id}|${Object.keys(updates ?? {}).sort().join(',')}`;

/** Vrai si la modification `cle` à l'instant `t` prolonge le geste `prec`. */
export const prolongeGeste = (prec, cle, t, delai = DELAI_GESTE) =>
  !!prec && prec.cle === cle && t - prec.t < delai;

// ── LE GESTE TENU ───────────────────────────────────────────────────────────
// Un glisser (l'ordre des calques) a un début et une fin : pas de délai, on
// peut tenir un calque dix secondes au-dessus d'une rangée. Ce qui le borne
// est son NUMÉRO, pris au début du geste — deux glissers de suite ne se
// confondent pas —, et toute autre étape d'historique le termine, comme pour
// un curseur.

export const SANS_DELAI = Number.POSITIVE_INFINITY;

let dernierGeste = 0;
/** Un numéro neuf, à prendre au DÉBUT du geste (`onDragStart`). */
export const nouveauGeste = () => ++dernierGeste;

export const cleGesteTenu = (nom, numero) => `${nom}#${numero}`;

/** Vrai si les deux listes rangent les mêmes éléments dans le même ordre. */
export const memeOrdre = (a, b) => a.length === b.length && a.every((el, i) => el.id === b[i].id);

/**
 * Ce qu'un cran d'un geste tenu fait à l'historique. `pose` : le geste a déjà
 * son pas. `revenu` : ce cran ramène l'état de DÉPART du geste.
 * - `'poser'` : premier cran qui change quelque chose → le pas du geste ;
 * - `'retirer'` : revenu au départ → le pas n'a plus lieu d'être ;
 * - `'rien'` : le pas est déjà là (ou n'a pas à y être).
 */
export const pasDuGesteTenu = ({ pose, revenu }) => {
  if (revenu) return pose ? 'retirer' : 'rien';
  return pose ? 'rien' : 'poser';
};
