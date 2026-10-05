// frontend/modules/stick/labels/utils/calques.js
//
// CE QUE LA LISTE DES CALQUES DIT D'UN ÉLÉMENT : son nom, son icône, ses
// états. `LayersPanel` le calculait dans son rendu, et nommait d'après
// `el.type` ce qu'il ne connaissait pas : « Barcode », « Image », « Qrcode ».
//
// `iconeCalque` rend une CLÉ, pas un composant : ce module reste pur.

import { libelleLiaison } from './champsProduit';

const FORMES = { rectangle: 'Rectangle', circle: 'Cercle', triangle: 'Triangle', star: 'Étoile', line: 'Trait' };
const SECTIONS_FICHE = { specs: 'Caractéristiques', highlights: 'Points forts', tips: 'Conseils' };
const ICONES = { text: 'texte', image: 'image', shape: 'forme', qrcode: 'qr', barcode: 'code-barres', dessin: 'trace', fiche: 'fiche' };

/** « Texte (Prix) » si l'élément est lié, sinon le nom seul. */
const avecLiaison = (nom, el) => (el.dataBinding ? `${nom} (${libelleLiaison(el)})` : nom);

/** Le nom d'un élément dans la liste des calques. */
export const nomCalque = (el) => {
  // Le fond de la page, quel que soit ce qui le porte (un rectangle, une image)
  if (el?.role === 'fond') return 'Fond';
  switch (el?.type) {
    case 'text':
      if (el.dataBinding) return avecLiaison('Texte', el);
      return el.text?.split('(')[0]?.trim() || 'Texte';
    case 'image':
      return avecLiaison('Image', el);
    case 'shape':
      return FORMES[el.shape] || 'Forme';
    case 'dessin':
      return el.brushType === 'highlighter' ? 'Surligneur' : 'Dessin';
    case 'qrcode':
      if (el.dataBinding) return avecLiaison('QR', el);
      return el.qrValue ? `QR : ${el.qrValue}` : 'QR code';
    case 'barcode':
      return avecLiaison('Code-barres', el);
    case 'fiche':
      return SECTIONS_FICHE[el.section] || 'Fiche';
    default:
      return 'Élément';
  }
};

/** La clé de l'icône : texte, image, forme, qr, code-barres, trace, fiche. */
export const iconeCalque = (el) => ICONES[el?.type] ?? 'forme';

/** Ce qui doit se voir sans survoler la rangée. */
export const etatsCalque = (el) => ({
  verrouille: !!el?.locked,
  masque: el?.visible === false,
  lie: libelleLiaison(el) !== null,
});
