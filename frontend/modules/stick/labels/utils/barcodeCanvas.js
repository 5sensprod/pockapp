// frontend/modules/stick/labels/utils/barcodeCanvas.js
//
// LE DESSIN d'un code-barres, sorti de `BarcodeNode.jsx` pour que l'export en
// planche (`exportPdfSheet.js`) produise EXACTEMENT le même symbole : il avait
// son propre appel à JsBarcode, qui ignorait la hauteur et la largeur des
// barres et le format du numéro, et étirait le symbole dans le cadre.
//
// Rend un <canvas> ; le cadre affiche ensuite l'image à la largeur `width`,
// hauteur = width × (hauteur / largeur du canvas) — jamais déformée.

import JsBarcode from 'jsbarcode';
import { formaterTexteCodeBarres } from './barcodeText';

export function dessinerCodeBarres(
  {
    barcodeValue = '',
    format = 'CODE128',
    width = 200,
    height = 80,
    displayValue = true,
    fontSize = 14,
    textMargin = 2,
    margin = 10,
    barHeight,
    barWidth,
    textFormat = 'brut',
    background = '#FFFFFF',
    lineColor = '#000000',
  },
  // Largeur de rendu visée, en pixels : le PDF en demande plus que l'écran
  largeurCible = (width || 200) * 2
) {
  const canvas = document.createElement('canvas');
  const value = barcodeValue || '000000000000';

  // `textFormat: 'aucun'` masque le numéro : c'est un réglage de texte,
  // il n'a pas à passer par une seconde case à cocher.
  const numeroVisible = displayValue && textFormat !== 'aucun';
  const hauteurBarres =
    barHeight != null && barHeight > 0
      ? barHeight
      : height - (numeroVisible ? fontSize + textMargin * 2 : 0);

  const largeurBarres = barWidth != null && barWidth > 0 ? barWidth : 2;

  // ── RÉSOLUTION ────────────────────────────────────────────────────────
  // JsBarcode rend un BITMAP à sa taille naturelle, que Konva étire ensuite
  // jusqu'à la largeur du cadre. Un symbole naturel de 200 px posé sur 600 px
  // est donc agrandi trois fois : bords de barres adoucis à l'écran, et
  // surtout au PDF. Un scanner lit mal des bords flous.
  //
  // On dessine donc à une échelle ENTIÈRE — un multiple exact, pour que chaque
  // barre reste un nombre entier de pixels et qu'aucune ne soit rendue plus
  // large que sa voisine par un arrondi.
  const dessiner = (echelle) => {
    JsBarcode(canvas, value, {
      format,
      width: largeurBarres * echelle,
      height: Math.max(1, hauteurBarres * echelle),
      displayValue: numeroVisible,
      text: numeroVisible ? formaterTexteCodeBarres(value, textFormat) : undefined,
      fontSize: fontSize * echelle,
      textMargin: textMargin * echelle,
      margin: margin * echelle,
      background,
      lineColor,
      valid: (valid) => {
        if (!valid) console.warn('⚠️ Code-barres invalide:', value, 'format:', format);
      },
    });
  };

  // Première passe : elle donne la largeur naturelle, qui dépend de la valeur
  // encodée et du format — impossible à connaître d'avance. Deuxième passe si
  // la cible est plus large ; plafonnée pour ne pas fabriquer un bitmap
  // démesuré sur une planche.
  dessiner(1);
  const naturelle = canvas.width || 1;
  const echelle = Math.min(8, Math.max(1, Math.ceil(largeurCible / naturelle)));
  if (echelle > 1) dessiner(echelle);
  return canvas;
}
