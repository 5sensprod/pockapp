// frontend/modules/stick/labels/components/ui/styles.js
//
// LES CLASSES COMMUNES de la barre latérale. Chaque panneau redéfinissait les
// siennes (`ligne`, `champ`, `bouton`…) : trois styles de bouton, quatre
// largeurs de champ, cinq tailles de pastille de couleur. Ici, une seule fois.
//
// Règles : un seul accent, le BLEU (l'orange est réservé à ce qui vient de la
// fiche produit, l'ambre aux avertissements, le rouge au destructif) ;
// contrôles de 28 px (`h-7`), rayon 6 px (`rounded-md`), texte 12 px.

/** Une ligne « libellé à gauche, contrôle à droite ». */
export const LIGNE = 'flex items-center justify-between gap-2 min-h-7 text-xs text-gray-700 dark:text-gray-300';

/** Champ de saisie (texte, nombre, liste). Ajouter la largeur : `w-16`, `w-full`… */
export const CHAMP =
  'h-7 px-2 text-xs rounded-md border border-transparent bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white tabular-nums focus:border-blue-500 focus:outline-none disabled:opacity-60';

/** Sélecteur de couleur natif (`<input type="color">`), à la taille des contrôles. */
export const PASTILLE = 'h-7 w-9 flex-none rounded-md cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent';

/**
 * Bouton à icône qui BASCULE (gras, miroir, alignement choisi). Actif : fond
 * bleu léger et icône bleue — l'aplat bleu reste réservé à l'onglet actif.
 */
export const boutonBascule = (actif) =>
  `h-7 min-w-7 px-1.5 inline-flex items-center justify-center gap-1.5 rounded-md text-xs transition-colors ${
    actif
      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
  }`;

/** Bouton à icône qui AGIT (aligner, répartir) : jamais d'état actif. */
export const BOUTON_ICONE =
  'h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors';

/** Bouton d'action secondaire, avec libellé. */
export const BOUTON_ACTION =
  'h-7 px-2 inline-flex items-center justify-center gap-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

/** Bouton d'action principale (valider un recadrage). */
export const BOUTON_PRINCIPAL =
  'h-7 px-2 inline-flex items-center justify-center gap-1.5 text-xs rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors';

// ─── Panneaux de PROPOSITIONS (audit du 3 octobre 2026, 09-audit-barre-laterale.md) ───

/** Le corps d'un panneau : mêmes marges que les réglages, groupes espacés de 16 px. */
export const PANNEAU = 'px-3 py-3 space-y-4';

/** Texte d'aide : une ligne au plus, sinon une infobulle. */
export const AIDE = 'text-[11px] leading-snug text-gray-500 dark:text-gray-400';

/** Tuile de proposition : la matière de `CHAMP`, sans bordure ni ombre. */
export const TUILE =
  'rounded-md bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50 disabled:pointer-events-none';

/** La même, pour ce qui vient de la fiche produit : survol orange. */
export const TUILE_PRODUIT =
  'rounded-md bg-gray-100 dark:bg-gray-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 disabled:opacity-50 disabled:pointer-events-none';

/** Bouton discret : un lien (« Actualiser », « Valeurs normales »). */
export const BOUTON_DISCRET = 'text-[11px] text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 disabled:no-underline';

/** Bouton à icône destructif : icône rouge, fond rouge léger au survol, jamais d'aplat. */
export const BOUTON_DESTRUCTIF =
  'h-7 w-7 inline-flex items-center justify-center rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors';
