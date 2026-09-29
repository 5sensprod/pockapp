// frontend/modules/stick/labels/utils/qrImage.js
//
// LE DESSIN d'un QR code, en dataURL PNG : une seule fonction pour le canvas
// (`canvas/QRCodeNode.jsx`) et l'export planche (`exportPdfSheet.js`), comme
// `barcodeCanvas.js` pour le code-barres.
//
// Avec un dégradé (`fillGradient`, modèle de `utils/paint.js`), ce sont les
// MODULES qui le reçoivent : le QR est dessiné en noir sur transparent, le
// dégradé remplace le noir (`source-in`), puis le fond uni passe dessous
// (`destination-over`). Un dégradé trop clair rend le QR illisible : c'est
// au vendeur d'en juger, comme pour une couleur unie.

import QRCode from 'qrcode';
import { degradeCanvas2D, versPeinture } from './paint';

const OPTIONS = { margin: 2, errorCorrectionLevel: 'H' };

export async function dessinerQR(valeur, { resolution, color = '#000000', bgColor = '#FFFFFF00', gradient = null }) {
  const texte = valeur || ' ';
  if (!versPeinture(gradient)) {
    return QRCode.toDataURL(texte, {
      ...OPTIONS,
      width: resolution,
      color: { dark: color, light: bgColor },
      type: 'image/png',
      rendererOpts: { quality: 1.0 },
    });
  }
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, texte, {
    ...OPTIONS,
    width: resolution,
    color: { dark: '#000000ff', light: '#00000000' },
  });
  const ctx = canvas.getContext('2d');
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = degradeCanvas2D(ctx, gradient, canvas.width, canvas.height);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
