// frontend/modules/stick/labels/utils/elementsPourProduit.js
//
// LES ÉLÉMENTS D'UNE CASE, remplis pour son produit : ce que dessinent l'export
// planche (`exportPdfSheet.js`) et la bande d'aperçu (`apercuCase`). Sorti
// d'`exportPdfSheet.js` le 6 octobre 2026, à l'identique, pour être testable
// sous Node (ce fichier-là importe Konva et jsPDF) — un gardien vérifie qu'il
// rend ce que le canvas affiche (`elementsPourProduit.test.js`).
//
// 📌 Chaque élément est rempli pour SON produit (`produitDe`, `dataBinding.js`) :
// celui de la case, ou son produit ÉPINGLÉ (`el.produitId`) — le même dans
// TOUTES les cases, c'est la règle de la planche pour une affiche de pack.
// Un élément sans épingle, dans une case sans produit, est rendu tel quel :
// le comportement d'avant, inchangé.

import { appliquerCasse, casseDe } from './typo';
import { getProductField, produitDe, resolvePropForElement, resolveTemplate } from './dataBinding';
import { contenuFiche } from './ficheProduit';

/**
 * Remplace les valeurs des éléments liés à un produit (non destructif)
 * ⚠️ Aligné avec la logique du canvas (dataBinding + templates)
 * - Images: support 'product_image_src'/'product_image', 'image.src', 'product_gallery_N'
 * - Text: prix formaté "€" (comme à l'écran)
 *
 * `produitCase` : le produit de la case (null : sans produit).
 * `produitsParId` : le cache du store, pour les produits épinglés.
 */
export function elementsPourProduit(elements, produitCase, { fillQrWhenNoBinding = false, produitsParId = {} } = {}) {
  const epingles = (elements || []).some((el) => el?.produitId);
  if (!produitCase && !epingles) return elements;

  return (elements || []).map((el) => {
    if (el?.visible === false) return el;
    // Sans épingle et sans produit de case : le modèle tel quel, comme avant
    if (!el?.produitId && !produitCase) return el;
    const product = produitDe(el, produitCase, produitsParId);

    // 📝 TEXT — binding + templates, avec prix formaté (comme le canvas)
    if (el?.type === 'text') {
      // La MÊME résolution que le canvas : prix formatés, description sans
      // HTML, et correction manuelle du texte lié pour ce produit.
      // … puis la casse (`utils/typo.js`), un style appliqué au dessin comme à l'écran
      const nextText = appliquerCasse(String(resolvePropForElement(el.text ?? '', el, product) ?? ''), casseDe(el));
      return { ...el, text: nextText };
    }

    // 📋 FICHE — la section du produit de CETTE cellule (null : rien d'imprimé)
    if (el?.type === 'fiche') {
      return { ...el, ficheContenu: product ? contenuFiche(product.description, el.section) : null };
    }

    // 🔲 QRCODE — binding brut (pas de €), sinon templating, sinon fallback
    if (el?.type === 'qrcode') {
      let nextQr =
        el.dataBinding != null
          ? String(getProductField(product, el.dataBinding) ?? '')
          : resolveTemplate(el.qrValue ?? '', product, { type: 'qrcode' });
      // Seule l'URL web : un repli sur le code-barres ou la référence encodait
      // un nombre que personne ne peut ouvrir (voir `AssetsPanel.jsx`).
      if (!nextQr && fillQrWhenNoBinding) nextQr = product?.website_url || '';
      return { ...el, qrValue: nextQr };
    }

    // 📊 BARCODE — binding brut (pas de €), sinon templating
    if (el?.type === 'barcode') {
      const nextBc =
        el.dataBinding != null
          ? String(getProductField(product, el.dataBinding) ?? '')
          : resolveTemplate(el.barcodeValue ?? '', product, { type: 'barcode' });
      return { ...el, barcodeValue: nextBc };
    }

    // 🖼️ IMAGE — support dataBinding & templates (SRC prioritaire)
    if (el?.type === 'image') {
      let nextSrc = '';

      if (el.dataBinding) {
        // aliases standards
        if (el.dataBinding === 'product_image' || el.dataBinding === 'product_image_src') {
          nextSrc = String(getProductField(product, 'product_image_src') ?? '');
        } else if (el.dataBinding === 'image.src' || el.dataBinding === 'image_src') {
          nextSrc = String(getProductField(product, 'image.src') ?? '');
        } else {
          // binding libre (ex. 'image.somewhere.src')
          nextSrc = String(getProductField(product, el.dataBinding) ?? '');
        }
        // Épinglée et vide (produit sans photo, ou introuvable) : RIEN, comme à
        // l'écran — pas le gabarit `{{product_image}}` resté dans `src`.
        if (el.produitId) return { ...el, src: nextSrc };
      } else {
        // templating dans el.src (ex. "{{image.src}}")
        nextSrc = String(resolveTemplate(el.src ?? '', product, { type: 'image' }) ?? '');
      }

      return nextSrc && nextSrc !== el.src ? { ...el, src: nextSrc } : el;
    }

    return el;
  });
}
