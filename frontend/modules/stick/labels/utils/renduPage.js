// frontend/modules/stick/labels/utils/renduPage.js
//
// LE RENDU DE LA PAGE en image, pour l'embellissement par IA
// (`lib/embellir.ts`). Même méthode que `exportPdf.js` : un CLONE du groupe du
// document dans un Stage hors écran, sans zoom ni décalage — l'écran n'est pas
// touché. Sur fond blanc, comme la page imprimée.
//
// `masques` : les `id` des calques à ne pas rendre (les textes et les données
// produit, en mode « décor seul »). Ils sont cachés sur le clone seulement.
//
// `rendreElement` rend UN calque seul, sur fond transparent, cadré sur lui :
// l'ingrédient d'une composition par IA (`lib/composer.ts`) quand c'est une
// forme ou un dessin, qui n'ont pas de fichier à envoyer.

import Konva from 'konva';
import { recacherFiltres } from './effetsKonva';
import { retexturer } from './peintureTexture';
import { dataURLEnBlob } from '../lib/detourage';

/** Le facteur d'échelle qui amène le plus grand côté de la page à `coteMax` pixels (1 à 4). */
export const echelleDeRendu = (width, height, coteMax) =>
  Math.max(1, Math.min(4, coteMax / Math.max(width, height, 1)));

/** La partie de `rect` qui tient dans la page, ou null s'il n'en reste rien. */
export const dansLaPage = (rect, width, height, marge = 0) => {
  if (!rect) return null;
  const x = Math.max(0, Math.floor(rect.x - marge));
  const y = Math.max(0, Math.floor(rect.y - marge));
  const x2 = Math.min(width, Math.ceil(rect.x + rect.width + marge));
  const y2 = Math.min(height, Math.ceil(rect.y + rect.height + marge));
  return x2 - x >= 1 && y2 - y >= 1 ? { x, y, width: x2 - x, height: y2 - y } : null;
};

/**
 * `fond` : la couleur sous la page, ou null pour un fond TRANSPARENT.
 * `cadrer` : l'`id` d'un calque — l'image est alors rognée sur lui (ce qui en
 * tient dans la page), et `coteMax` vaut pour ce cadre.
 */
export async function rendrePage(docNode, { width, height, coteMax = 2048, masques = [], fond = '#ffffff', cadrer = null } = {}) {
  if (!docNode || !(width > 0) || !(height > 0)) throw new Error("La page n'est pas disponible.");

  const clone = docNode.clone({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
  for (const id of masques) clone.findOne(`#${id}`)?.hide();

  const container = document.createElement('div');
  const stage = new Konva.Stage({ container, width, height });
  try {
    const layer = new Konva.Layer();
    stage.add(layer);
    if (fond) layer.add(new Konva.Rect({ x: 0, y: 0, width, height, fill: fond }));
    layer.add(clone);
    let zone = { x: 0, y: 0, width, height };
    if (cadrer) {
      zone = dansLaPage(clone.findOne(`#${cadrer}`)?.getClientRect({ relativeTo: layer }), width, height, 2);
      if (!zone) throw new Error("Cet élément n'a rien de visible sur la page.");
    }
    const pixelRatio = echelleDeRendu(zone.width, zone.height, coteMax);
    // Comme l'export : textures puis caches d'effets, à la résolution du rendu
    retexturer(clone, pixelRatio);
    recacherFiltres(clone, pixelRatio);
    layer.draw();
    return dataURLEnBlob(stage.toDataURL({ ...zone, pixelRatio, mimeType: 'image/png' }));
  } finally {
    stage.destroy();
    container.remove();
  }
}

/** UN calque seul, sur fond transparent, cadré sur lui. `ids` : tous les calques de la page. */
export const rendreElement = (docNode, id, { width, height, coteMax = 1536, ids = [] } = {}) =>
  rendrePage(docNode, {
    width,
    height,
    coteMax,
    masques: ids.map(String).filter((autre) => autre !== String(id)),
    fond: null,
    cadrer: id,
  });
