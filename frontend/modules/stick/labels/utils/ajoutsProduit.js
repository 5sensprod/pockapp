// frontend/modules/stick/labels/utils/ajoutsProduit.js
//
// AJOUTER un élément lié au produit : une seule création par type, appelée
// par son onglet (Fiche produit, Images) ET par l'onglet « Données produit ».
// Deux copies de la même création, c'est deux éléments qui divergent.
//
// Lit le store par `getState()` : appelé depuis un clic, jamais pendant un rendu.

import useLabelStore from '../store/useLabelStore';
import { contenuFiche, EXEMPLE_FICHE } from './ficheProduit';
import { FICHE_PAR_DEFAUT, construireFiche } from './ficheKonva';
import { cadreSurCanvas } from './imagePlacement';
import { AJUSTEMENT_NOUVELLE_IMAGE } from './ajustementImage';
import { getProductField } from './dataBinding';

/**
 * 📌 DE QUEL PRODUIT parle l'élément qu'on ajoute ? Celui que le vendeur a
 * choisi en tête de l'onglet « Infos produit » (`produitCible` du store) :
 * - `null` : le produit de la PAGE — `liaison` est vide, l'élément est écrit
 *   exactement comme avant ;
 * - un id : un produit ÉPINGLÉ — l'élément porte `produitId` et le suivra
 *   quelle que soit la page (`produitDe`, `dataBinding.js`).
 * `produit` sert à dimensionner et à préremplir, comme `selectedProduct` avant.
 */
export const cibleAjout = () => {
  const { produitCible, produitsParId, selectedProduct } = useLabelStore.getState();
  if (!produitCible) return { produit: selectedProduct ?? null, liaison: {} };
  return { produit: produitsParId[produitCible] ?? null, liaison: { produitId: produitCible } };
};

/** Proportions d'une image (1 si elle ne se charge pas). */
export const proportionsImage = (src) =>
  new Promise((resolve) => {
    if (!src) return resolve(1);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img.naturalWidth / img.naturalHeight || 1);
    img.onerror = () => resolve(1);
    img.src = src;
  });

/**
 * Une section de la fiche produit (`SECTIONS_FICHE`). La hauteur suit le
 * contenu : `construireFiche` la calcule sans rendu, sur le MÊME contenu que
 * dessine `KonvaCanvas` (produit du canvas, sinon l'exemple).
 */
export const ajouterFiche = (section) => {
  const { addElementCentre, canvasSize } = useLabelStore.getState();
  const { produit: selectedProduct, liaison } = cibleAjout();
  const largeur = Math.min(FICHE_PAR_DEFAUT.width, Math.round(canvasSize.width * 0.8));
  const el = {
    ...FICHE_PAR_DEFAUT,
    type: 'fiche',
    section: section.id,
    title: section.titre,
    width: largeur,
    visible: true,
    locked: false,
    ...liaison,
  };
  const contenu = selectedProduct
    ? contenuFiche(selectedProduct.description, section.id)
    : EXEMPLE_FICHE[section.id] ?? EXEMPLE_FICHE.specs;
  let hauteur = FICHE_PAR_DEFAUT.fontSize * 4;
  try {
    if (contenu) hauteur = construireFiche(el, contenu).height;
  } catch {
    // mesure impossible : hauteur approchée
  }
  addElementCentre(el, { width: largeur, height: hauteur });
};

/**
 * La photo principale du produit (ou une photo de sa galerie), LIÉE (elle suit le produit affiché) et en
 * Contenir (entière, quelles que soient ses proportions). Le cadre prend les
 * proportions de la photo du produit affiché.
 */
export const ajouterPhotoProduit = async (photo = null) => {
  const { produit: selectedProduct, liaison } = cibleAjout();
  // `photo` : une photo de la galerie (`photosGalerie`) — liée à SON rang,
  // qui changera d'image avec le produit comme la photo principale
  const src = photo?.src || selectedProduct?.image?.src || selectedProduct?.image?.url || '';
  const aspectRatio = await proportionsImage(src);
  const { addElementCentre, canvasSize } = useLabelStore.getState();
  addElementCentre({
    type: 'image',
    ...cadreSurCanvas(aspectRatio, canvasSize),
    ...AJUSTEMENT_NOUVELLE_IMAGE,
    src: photo ? '' : '{{product_image}}', // la liaison prime (`resolvePropForElement`)
    dataBinding: photo?.cle || 'product_image',
    ...liaison,
    opacity: 1,
    rotation: 0,
    visible: true,
    locked: false,
    aspectRatio,
  });
};

/**
 * Une image de PocketStock LIÉE au produit : le logo de sa marque
 * (`brand_image`) ou l'image de sa catégorie (`category_image`). Elle suit le
 * produit affiché ; un produit qui n'en a pas ne dessine rien. Le cadre prend
 * les proportions de l'image du produit affiché (carré s'il n'en a pas).
 */
export const ajouterImageLiee = async (cle) => {
  const { produit: selectedProduct, liaison } = cibleAjout();
  const src = getProductField(selectedProduct, cle) || '';
  const aspectRatio = await proportionsImage(src);
  const { addElementCentre, canvasSize } = useLabelStore.getState();
  // Un logo n'occupe pas toute la page : le tiers de ce que prendrait une photo
  const cadre = cadreSurCanvas(aspectRatio, canvasSize);
  addElementCentre({
    type: 'image',
    width: Math.round(cadre.width / 3),
    height: Math.round(cadre.height / 3),
    ...AJUSTEMENT_NOUVELLE_IMAGE,
    src: '',
    dataBinding: cle,
    ...liaison,
    opacity: 1,
    rotation: 0,
    visible: true,
    locked: false,
    aspectRatio,
  });
};

/**
 * Une image FIXE de PocketStock (logo de l'entreprise, logo d'une marque,
 * image d'une catégorie choisis dans la bibliothèque) : elle ne suit aucun
 * produit. `image` : `{ src, nom }`.
 */
export const ajouterImageFixe = async (image) => {
  if (!image?.src) return;
  const aspectRatio = await proportionsImage(image.src);
  const { addElementCentre, canvasSize } = useLabelStore.getState();
  const cadre = cadreSurCanvas(aspectRatio, canvasSize);
  addElementCentre({
    type: 'image',
    width: Math.round(cadre.width / 3),
    height: Math.round(cadre.height / 3),
    ...AJUSTEMENT_NOUVELLE_IMAGE,
    src: image.src,
    name: image.nom,
    opacity: 1,
    rotation: 0,
    visible: true,
    locked: false,
    aspectRatio,
  });
};

/** Réglages d'un QR neuf, lié ou non. */
export const QR_PAR_DEFAUT = {
  type: 'qrcode',
  size: 160,
  color: '#000000',
  bgColor: '#FFFFFF00',
  visible: true,
  locked: false,
};

/**
 * Un QR LIÉ à l'adresse du produit sur le site (`website_url`), et à rien
 * d'autre : sans adresse, il ne s'affiche pas (`KonvaCanvas.jsx`,
 * `exportPdfSheet.js`). `qrValue` ne sert qu'après « Valeur fixe ».
 */
export const ajouterQRProduit = () => {
  const { addElementCentre } = useLabelStore.getState();
  const { produit: selectedProduct, liaison } = cibleAjout();
  addElementCentre({
    ...QR_PAR_DEFAUT,
    qrValue: selectedProduct?.website_url || '',
    dataBinding: 'website_url',
    ...liaison,
  });
};

/**
 * Formats de code-barres proposés (JsBarcode), repris de l'ancien onglet
 * « Code-barres ». `valide` : le numéro doit s'y plier, sinon JsBarcode ne
 * dessine rien.
 */
export const FORMATS_CODE_BARRES = [
  { id: 'CODE128', label: 'CODE128', aide: 'Universel (recommandé)', width: 200 },
  { id: 'EAN13', label: 'EAN-13', aide: '13 chiffres', width: 200, valide: (v) => /^\d{13}$/.test(v) },
  { id: 'EAN8', label: 'EAN-8', aide: '8 chiffres', width: 150, valide: (v) => /^\d{8}$/.test(v) },
  { id: 'UPC', label: 'UPC-A', aide: '12 chiffres', width: 200, valide: (v) => /^\d{12}$/.test(v) },
  { id: 'CODE39', label: 'CODE39', aide: 'Industriel', width: 200 },
];

/** Le format accepte-t-il ce numéro ? (sans numéro : oui, rien à juger) */
export const formatCompatible = (format, valeur) => !valeur || !format.valide || format.valide(String(valeur));

/** Un code-barres LIÉ au champ `barcode` du produit, au format choisi. */
export const ajouterCodeBarres = (format) => {
  const { addElementCentre } = useLabelStore.getState();
  const { produit: selectedProduct, liaison } = cibleAjout();
  const valeur = selectedProduct?.meta_data?.find?.((m) => m?.key === 'barcode')?.value ?? '';
  addElementCentre({
    type: 'barcode',
    width: format.width,
    height: 80,
    barcodeValue: String(valeur),
    format: format.id,
    displayValue: true,
    fontSize: 14,
    textMargin: 2,
    margin: 10,
    background: '#FFFFFF',
    lineColor: '#000000',
    visible: true,
    locked: false,
    dataBinding: 'barcode',
    ...liaison,
  });
};
