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
