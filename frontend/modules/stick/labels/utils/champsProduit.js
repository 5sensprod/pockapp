// frontend/modules/stick/labels/utils/champsProduit.js
//
// LE REGISTRE DES DONNÉES PRODUIT qu'un élément peut lier (`el.dataBinding`).
//
// Avant lui, trois listes de champs vivaient dans trois panneaux, avec trois
// contenus, et la photo du produit avait DEUX clés : le panneau Images écrivait
// `product_image_src`, les Propriétés `product_image` — et le panneau Images ne
// reconnaissait que la seconde. Ici, une clé canonique par donnée, et ses alias.
//
// Les templates existants (IndexedDB, `.json` exportés) portent les anciennes
// clés : elles restent LUES, jamais réécrites. Seul un geste du vendeur écrit
// une clé canonique. Module pur, sans React ni Konva (tests Node).

/**
 * `types` : les éléments qui peuvent porter ce champ. Un QR n'encode qu'une
 * adresse (`AssetsPanel.jsx`), un code-barres qu'un code, une image qu'une
 * photo. Le texte accepte tout ce qui s'écrit.
 */
export const CHAMPS_PRODUIT = [
  { cle: 'name', libelle: 'Nom du produit', types: ['text'] },
  { cle: 'price', libelle: 'Prix', types: ['text'] },
  { cle: 'sale_price', libelle: 'Prix promo', types: ['text'] },
  { cle: 'description', libelle: 'Description', types: ['text'] },
  { cle: 'brand', libelle: 'Marque', types: ['text'] },
  { cle: 'sku', libelle: 'Référence', types: ['text', 'barcode'] },
  { cle: 'stock', libelle: 'Stock', types: ['text'] },
  { cle: 'supplier', libelle: 'Fournisseur', types: ['text'] },
  { cle: 'website_url', libelle: 'Adresse sur le site', types: ['text', 'qrcode'] },
  { cle: 'barcode', libelle: 'Code-barres', types: ['text', 'barcode'] },
  {
    cle: 'product_image',
    libelle: 'Photo du produit',
    types: ['image'],
    alias: ['product_image_src', 'image.src', 'image_src'],
  },
  // Images de PocketStock qui suivent le produit (3 octobre 2026) : le logo de
  // SA marque, l'image de SA catégorie — la première de la fiche qui en a une
  // (`lib/images-catalogue.ts`). Vides pour un produit : l'élément ne dessine rien.
  { cle: 'brand_image', libelle: 'Logo de la marque', types: ['image'] },
  { cle: 'category_image', libelle: 'Image de la catégorie', types: ['image'] },
];

const PAR_CLE = new Map();
for (const champ of CHAMPS_PRODUIT) {
  PAR_CLE.set(champ.cle, champ);
  for (const a of champ.alias ?? []) PAR_CLE.set(a, champ);
}

/** La clé d'une photo de la GALERIE (index dans `gallery_images`). */
export const cleGalerie = (i) => `product_gallery_${i}`;
const GALERIE = /^product_gallery_(\d+)$/;

/** Le champ du registre désigné par une clé ou un alias ; `null` sinon.
 *  Les photos de la galerie sont en nombre variable : champs calculés. */
export const champProduit = (cle) => {
  if (!cle) return null;
  const connu = PAR_CLE.get(cle);
  if (connu) return connu;
  const g = GALERIE.exec(cle);
  return g ? { cle, libelle: `Galerie, photo ${Number(g[1]) + 1}`, types: ['image'] } : null;
};

/**
 * Les photos de la galerie d'un produit, avec leur clé — SAUF celle qui est
 * déjà l'image principale (tout fichier importé entre par la galerie, l'image
 * principale n'en est qu'une désignation).
 */
export const photosGalerie = (product) => {
  const principale = product?.image?.src;
  return (product?.gallery_images ?? [])
    .map((g, i) => ({ ...champProduit(cleGalerie(i)), src: typeof g === 'string' ? g : g?.src }))
    .filter((p) => p.src && p.src !== principale);
};

/** La clé canonique ; une clé hors registre est rendue telle quelle. */
export const cleCanonique = (cle) => champProduit(cle)?.cle ?? cle ?? null;

/** Deux clés désignent-elles la même donnée ? (`product_image` ≡ `product_image_src`) */
export const memeChamp = (a, b) => !!a && !!b && cleCanonique(a) === cleCanonique(b);

/** Les champs qu'un type d'élément peut lier. */
export const champsPourType = (type) => CHAMPS_PRODUIT.filter((c) => c.types.includes(type));

/**
 * Le libellé de la donnée liée à un élément, pour le vendeur ; `null` si
 * l'élément n'est pas lié. Une fiche est liée sans `dataBinding` : sa
 * `section` désigne une partie de la description.
 */
export const libelleLiaison = (el) => {
  if (!el) return null;
  if (el.type === 'fiche') return 'Description';
  if (!el.dataBinding) return null;
  return champProduit(el.dataBinding)?.libelle ?? el.dataBinding;
};

/** La propriété qui porte la valeur fixe d'un élément, par type. */
const PROP_VALEUR = { text: 'text', qrcode: 'qrValue', barcode: 'barcodeValue', image: 'src' };

/** Un type d'élément peut-il être lié ? (la fiche l'est par sa `section`) */
export const typeLiable = (type) => type in PROP_VALEUR;

/**
 * Ce qu'il faut écrire dans l'élément pour le lier à `cle`, ou le délier
 * (`cle` nul). `null` : geste refusé (champ incompatible avec le type).
 *
 * Délier FIGE la valeur affichée pour ce produit : le vendeur garde ce qu'il
 * voit, au lieu de retomber sur la valeur de création — ou, pour une image
 * posée par le panneau Images, sur `{{product_image}}`, qui se résolvait
 * encore après « Délier ».
 */
export const miseAJourLiaison = (el, cle, product, resoudre) => {
  const prop = PROP_VALEUR[el?.type];
  if (!prop) return null;
  if (cle) {
    const champ = champProduit(cle);
    if (!champ || !champ.types.includes(el.type)) return null;
    return { dataBinding: champ.cle };
  }
  if (!el.dataBinding) return null;
  const v = resoudre(el[prop], el, product);
  // Un élément délié ne parle plus d'aucun produit : l'épingle part avec la liaison
  return { dataBinding: null, [prop]: v == null ? '' : String(v), ...(el.produitId ? { produitId: null } : {}) };
};

/** L'élément est-il lié à une donnée produit ? (une fiche l'est toujours) */
const estLie = (el) => !!el && (el.type === 'fiche' || !!el.dataBinding);

/**
 * Les produits ÉPINGLÉS sur l'affiche (`el.produitId`, voir `produitDe` dans
 * `dataBinding.js`), sans doublon, dans l'ordre des calques. Une épingle sur un
 * élément qui n'est plus lié ne compte pas.
 */
export const idsEpingles = (elements) => {
  const ids = [];
  for (const el of elements ?? []) {
    if (el?.produitId && estLie(el) && !ids.includes(el.produitId)) ids.push(el.produitId);
  }
  return ids;
};

/**
 * Ce qu'il faut écrire pour que les éléments épinglés à `ancien` parlent de
 * `nouveau` : `{ id: { produitId } }`, pour `updateElements` (un seul pas
 * d'historique). C'est ce qui refait un pack avec d'autres produits.
 */
export const remplacementProduit = (elements, ancien, nouveau) => {
  const maj = {};
  if (!ancien || !nouveau || ancien === nouveau) return maj;
  for (const el of elements ?? []) if (el?.produitId === ancien) maj[el.id] = { produitId: nouveau };
  return maj;
};

/** Les éléments du document liés à une donnée produit, dans leur ordre. */
export const elementsLies = (elements) =>
  (elements ?? []).filter((el) => libelleLiaison(el) !== null);
