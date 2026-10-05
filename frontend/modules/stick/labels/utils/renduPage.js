// frontend/modules/stick/labels/utils/renduPage.js
//
// LE RENDU DE LA PAGE en image, pour l'embellissement par IA
// (`lib/embellir.ts`). Même méthode que `exportPdf.js` : un CLONE du groupe du
// document dans un Stage hors écran, sans zoom ni décalage — l'écran n'est pas
// touché. Sur fond blanc, comme la page imprimée.
//
// `masques` : les `id` des calques à ne pas rendre (les textes et les données
// produit, en mode « décor seul »). Ils sont cachés sur le clone seulement.

import Konva from 'konva';
import { recacherFiltres } from './effetsKonva';
import { retexturer } from './peintureTexture';
import { dataURLEnBlob } from '../lib/detourage';

/** Le facteur d'échelle qui amène le plus grand côté de la page à `coteMax` pixels (1 à 4). */
export const echelleDeRendu = (width, height, coteMax) =>
  Math.max(1, Math.min(4, coteMax / Math.max(width, height, 1)));

export async function rendrePage(docNode, { width, height, coteMax = 2048, masques = [] } = {}) {
  if (!docNode || !(width > 0) || !(height > 0)) throw new Error("La page n'est pas disponible.");

  const clone = docNode.clone({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
  for (const id of masques) clone.findOne(`#${id}`)?.hide();

  const container = document.createElement('div');
  const stage = new Konva.Stage({ container, width, height });
  try {
    const layer = new Konva.Layer();
    stage.add(layer);
    layer.add(new Konva.Rect({ x: 0, y: 0, width, height, fill: '#ffffff' }));
    layer.add(clone);
    const pixelRatio = echelleDeRendu(width, height, coteMax);
    // Comme l'export : textures puis caches d'effets, à la résolution du rendu
    retexturer(clone, pixelRatio);
    recacherFiltres(clone, pixelRatio);
    layer.draw();
    return dataURLEnBlob(stage.toDataURL({ pixelRatio, mimeType: 'image/png' }));
  } finally {
    stage.destroy();
    container.remove();
  }
}
