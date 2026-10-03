// frontend/modules/stick/labels/utils/reglagesParType.js
//
// QUEL RÉGLAGE VA OÙ, par type d'élément (refonte de l'interface, octobre
// 2026). La barre d'options portait jusqu'à 16 contrôles pour un texte et
// défilait sur 1 500 px ; elle ne garde que le NOYAU — ce qu'on touche à
// chaque affiche —, et le reste part dans l'onglet « Réglages » de la barre
// latérale, qui a la place d'afficher des curseurs sans menu déroulant.
// Pas d'onglet à part : les réglages détaillés d'un élément prennent la place
// des propositions de base dans l'onglet de SON type (`ongletDe`), et
// désélectionner y remet les propositions.
//
// Cette carte est la seule décision : `PropertyPanel` (barre) et le panneau
// « Réglages » la lisent tous les deux, un réglage n'est donc jamais aux deux
// endroits ni nulle part. Des identifiants de SECTION, pas de composants :
// module pur, testable sous Node.

/** Le noyau de la barre et les sections du panneau, dans l'ordre d'affichage. */
const CARTE = {
  // La barre d'options disparaît (décision du 3 octobre 2026) : un type
  // descendu n'y garde plus rien, tout est dans l'onglet de son type
  text: {
    barre: [],
    // `noyauTexte` : police, taille, style, alignement, couleur, contour,
    // surlignage, largeur — en quatre rangées, sans titre de section
    panneau: ['noyauTexte', 'espacement', 'contourStylise', 'masque'],
  },
  // Chaque type : un NOYAU (ses réglages courants, en rangées serrées sans
  // titre), puis ses sections rares, repliées (`SECTIONS_RARES`)
  shape: {
    barre: [],
    panneau: ['noyauForme', 'contourStylise', 'lissage', 'masque'],
  },
  dessin: {
    barre: [],
    panneau: ['noyauTrace', 'traitTrace', 'contourStylise', 'fermerTrace'],
  },
  image: {
    barre: [],
    panneau: ['noyauImage', 'masque'],
  },
  qrcode: {
    barre: [],
    panneau: ['noyauQr'],
  },
  barcode: {
    barre: [],
    panneau: ['noyauBarres'],
  },
  fiche: {
    barre: [],
    panneau: ['contenuFiche', 'styleTableau'],
  },
};

/** Sections qui ne valent que pour certaines formes. */
const SELON_FORME = {
  // Forme née d'un tracé fermé, qui a gardé son tracé d'origine (`formeLibre.js`)
  lissage: (el) => el.shape === 'libre' && !!el.traceLibre,
};

/** Dans le panneau pour tout élément, après ses sections propres. */
export const SECTIONS_COMMUNES = ['donneeProduit', 'remplirCanvas'];

/** Toujours dans la barre, après le noyau. */
export const ACTIONS_BARRE = ['position', 'supprimer', 'reglages', 'effets'];

/**
 * L'onglet de la barre latérale où vivent les réglages détaillés d'un type.
 * Grandit type par type, à mesure que ses réglages quittent la barre : un
 * type absent d'ici garde tout dans la barre d'options.
 */
const ONGLET_PAR_TYPE = {
  text: 'text',
  image: 'image', // l'onglet « Médias »
  dessin: 'dessin',
  shape: 'shape', // l'onglet « Assets »
  qrcode: 'shape', // le QR code s'ajoute depuis Assets
  barcode: 'donnees', // code-barres et fiche s'ajoutent depuis Données produit
  fiche: 'donnees',
};

/** L'onglet des réglages de cet élément, ou null. */
export const ongletDe = (el) => ONGLET_PAR_TYPE[el?.type] ?? null;

// Les onglets qu'une sélection ne quitte PAS d'office — ceux où sélectionner
// fait partie du travail de l'onglet :
// - Calques : cliquer un calque sélectionne, l'onglet se fermerait sous la souris ;
// - Effets : il règle justement l'élément sélectionné ;
// - Données produit : on y ajoute plusieurs éléments liés d'affilée, et chacun,
//   sélectionné à sa création, enverrait vers un autre onglet.
// Tous les autres suivent (Templates, Taille et fond, Produits compris) : depuis
// que la barre d'options a disparu, un élément sélectionné sans réglages à
// l'écran laissait l'utilisateur sans rien pour le modifier.
const ONGLETS_FIXES = new Set(['layers', 'effects', 'donnees']);

/**
 * L'onglet à afficher quand la sélection vient de changer : celui du type de
 * l'élément, sauf depuis un onglet fixe (`ONGLETS_FIXES`), où le bouton
 * « Réglages » de la barre flottante reste le chemin.
 */
export const ongletApresSelection = (courant, el) => {
  const cible = ongletDe(el);
  if (!cible) return courant;
  return ONGLETS_FIXES.has(courant) ? courant : cible;
};

const garder = (el) => (id) => !SELON_FORME[id] || SELON_FORME[id](el);

/**
 * Pour un élément : `{ barre, panneau }`, deux listes ordonnées de sections.
 * Type inconnu : rien de propre, seulement le commun.
 * `barre` est vide pour tout type : la barre d'options ne porte plus de réglage.
 */
export const reglagesDe = (el) => {
  const carte = CARTE[el?.type] ?? { barre: [], panneau: [] };
  return {
    barre: carte.barre.filter(garder(el)),
    panneau: [...carte.panneau.filter(garder(el)), ...SECTIONS_COMMUNES],
  };
};

/**
 * LES OPTIONS RAPIDES de la barre du haut, par type : des atomes de réglage
 * (les mêmes que dans le panneau, même écriture). Peu, pour ne jamais faire
 * défiler la barre. Ni la police (trop large), ni l'alignement du texte (il
 * fixe la largeur du bloc, et son Auto / Fixe doit rester à côté de lui).
 * AUCUNE COULEUR (décision du propriétaire) : la fenêtre du sélecteur déborde
 * depuis la barre ; les couleurs restent dans la barre latérale.
 */
const RAPIDES_PAR_TYPE = {
  text: ['taille', 'grasItalique', 'casse'],
  image: ['ajustementImage', 'miroirs'],
};
export const rapidesDe = (el) => RAPIDES_PAR_TYPE[el?.type] ?? [];

/**
 * Les sections RARES : repliées par défaut, pour que les réglages courants
 * tiennent sans ascenseur. Elles s'ouvrent d'elles-mêmes quand l'élément y
 * porte un réglage actif (`sectionActive`).
 */
export const SECTIONS_RARES = new Set(['espacement', 'contourStylise', 'masque', 'traitTrace', 'styleTableau']);

// Défauts de `utils/typo.js` (`TYPO_BORNES`) : recopiés ici pour rester pur
const ESPACEMENT_NEUTRE = { letterSpacing: 0, lineHeight: 1, charHeight: 100, curve: 0 };

/** L'élément porte-t-il un réglage actif dans cette section ? */
export const sectionActive = (id, el) => {
  if (!el) return false;
  if (id === 'espacement') {
    return Object.entries(ESPACEMENT_NEUTRE).some(([cle, neutre]) => el[cle] != null && el[cle] !== neutre);
  }
  if (id === 'contourStylise') return !!el.contourStyle && typeof el.contourStyle === 'object';
  if (id === 'masque') return !!(el.mask || el.maskTexture || el.maskPadding || el.maskFeather);
  // La forme du trait : épaisseur variable ou effilement
  if (id === 'traitTrace') return [el.thinning, el.effilementDebut, el.effilementFin].some((v) => v > 0);
  return false;
};

/** Une section s'affiche-t-elle dépliée pour cet élément ? */
export const sectionOuverte = (id, el) => !SECTIONS_RARES.has(id) || sectionActive(id, el);

/** Les types qui ont des réglages propres. */
export const TYPES_REGLABLES = Object.keys(CARTE);
