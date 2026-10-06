// frontend/modules/stick/labels/utils/elementsPourProduit.test.js
//
// Ce que garde ce fichier (6 octobre 2026, `04-donnees-produit.md`) :
// - un template d'AVANT les produits épinglés (aucun `produitId`) est rempli
//   exactement comme avant, et n'est jamais réécrit ;
// - deux produits sur une page sont résolus CHACUN pour le sien ;
// - l'export planche rend ce que le canvas affiche — par le même
//   `resolvePropForElement`, donc le même `getProductField` ;
// - en planche, un élément épinglé est le même dans toutes les cases ;
// - un produit épinglé introuvable ne retombe JAMAIS sur celui de la page.
import { describe, expect, it } from 'vitest';
import { elementsPourProduit } from './elementsPourProduit';
import { getProductField, produitDe, resolvePropForElement } from './dataBinding';

const produit = (id, extra = {}) => ({
  _id: id,
  name: `Nom ${id}`,
  price: 100,
  sale_price: null,
  description: '<p>Une description</p>',
  sku: `SKU-${id}`,
  website_url: `https://exemple.test/${id}`,
  brand_ref: { name: `Marque ${id}`, image: `http://x/marque-${id}.png` },
  meta_data: [{ key: 'barcode', value: `300000000000${id.length}` }],
  image: { src: `http://x/${id}.jpg`, url: `http://x/${id}.jpg` },
  gallery_images: [],
  ...extra,
});

const A = produit('a', { price: 499, sale_price: 399 });
const B = produit('b', { price: 149 });
const parId = { a: A, b: B };

/** Un template tel qu'il s'enregistrait avant : des liaisons, aucun `produitId`. */
const ANCIEN = [
  { id: 't1', type: 'text', text: 'Titre fixe', fontSize: 20 },
  { id: 't2', type: 'text', text: '', dataBinding: 'name' },
  { id: 't3', type: 'text', text: '', dataBinding: 'sale_price' },
  { id: 'i1', type: 'image', src: '{{product_image}}', dataBinding: 'product_image_src' },
  { id: 'i2', type: 'image', src: 'http://x/fixe.png' },
  { id: 'q1', type: 'qrcode', qrValue: '', dataBinding: 'website_url' },
  { id: 'b1', type: 'barcode', barcodeValue: '', dataBinding: 'barcode' },
  { id: 'f1', type: 'fiche', section: 'specs' },
  { id: 's1', type: 'shape', shape: 'rectangle' },
];

/** Ce que le CANVAS passe à ses nœuds (`KonvaCanvas.jsx`) pour un élément. */
const aLEcran = (el, produitPage, cache) => {
  const p = produitDe(el, produitPage, cache);
  if (el.type === 'text') return String(resolvePropForElement(el.text, el, p) ?? '');
  if (el.type === 'qrcode') return String(resolvePropForElement(el.qrValue, el, p) ?? '');
  if (el.type === 'barcode') return String(resolvePropForElement(el.barcodeValue, el, p) ?? '');
  if (el.type === 'image') return String(resolvePropForElement(el.src, el, p) ?? '');
  return undefined;
};
const aLExport = (el) =>
  ({ text: el.text, qrcode: el.qrValue, barcode: el.barcodeValue, image: el.src })[el.type];

describe('un template sans produit épinglé se comporte comme avant', () => {
  it('sans produit de case : les éléments sont rendus TELS QUELS (même référence)', () => {
    expect(elementsPourProduit(ANCIEN, null, { produitsParId: parId })).toBe(ANCIEN);
  });

  it('avec un produit de case : les valeurs d\'avant, à l\'identique', () => {
    const rendu = elementsPourProduit(ANCIEN, A, { produitsParId: parId });
    const parIdEl = Object.fromEntries(rendu.map((e) => [e.id, e]));
    expect(parIdEl.t1.text).toBe('Titre fixe');
    expect(parIdEl.t2.text).toBe('Nom a');
    expect(parIdEl.t3.text).toBe('399 €');
    expect(parIdEl.i1.src).toBe('http://x/a.jpg');
    expect(parIdEl.i2).toBe(ANCIEN[4]); // image fixe : pas même copiée
    expect(parIdEl.q1.qrValue).toBe('https://exemple.test/a');
    expect(parIdEl.b1.barcodeValue).toBe('3000000000001');
    expect(parIdEl.f1.ficheContenu).toBeDefined();
    expect(parIdEl.s1).toBe(ANCIEN[8]);
  });

  it('le cache des produits épinglés ne change RIEN à un template qui n\'en a pas', () => {
    expect(elementsPourProduit(ANCIEN, A, { produitsParId: parId })).toEqual(
      elementsPourProduit(ANCIEN, A, { produitsParId: {} })
    );
  });

  it('le template n\'est jamais réécrit : aucun `produitId` n\'apparaît', () => {
    const avant = JSON.stringify(ANCIEN);
    const rendu = elementsPourProduit(ANCIEN, A, { produitsParId: parId });
    expect(JSON.stringify(ANCIEN)).toBe(avant);
    expect(rendu.some((e) => 'produitId' in e)).toBe(false);
  });
});

/** Une affiche de pack : A suit la page, B est épinglé. */
const PACK = [
  { id: 'na', type: 'text', text: '', dataBinding: 'name' },
  { id: 'pa', type: 'text', text: '', dataBinding: 'price' },
  { id: 'ia', type: 'image', src: '{{product_image}}', dataBinding: 'product_image' },
  { id: 'nb', type: 'text', text: '', dataBinding: 'name', produitId: 'b' },
  { id: 'pb', type: 'text', text: '', dataBinding: 'price', produitId: 'b' },
  { id: 'ib', type: 'image', src: '{{product_image}}', dataBinding: 'product_image', produitId: 'b' },
  { id: 'lb', type: 'image', src: '', dataBinding: 'brand_image', produitId: 'b' },
  { id: 'qb', type: 'qrcode', qrValue: '', dataBinding: 'website_url', produitId: 'b' },
  { id: 'bb', type: 'barcode', barcodeValue: '', dataBinding: 'barcode', produitId: 'b' },
  { id: 'fb', type: 'fiche', section: 'specs', produitId: 'b' },
];

describe('deux produits sur une page', () => {
  it('chacun est résolu pour le sien', () => {
    const r = Object.fromEntries(elementsPourProduit(PACK, A, { produitsParId: parId }).map((e) => [e.id, e]));
    expect(r.na.text).toBe('Nom a');
    expect(r.pa.text).toBe('499 €');
    expect(r.ia.src).toBe('http://x/a.jpg');
    expect(r.nb.text).toBe('Nom b');
    expect(r.pb.text).toBe('149 €');
    expect(r.ib.src).toBe('http://x/b.jpg');
    expect(r.lb.src).toBe('http://x/marque-b.png');
    expect(r.qb.qrValue).toBe('https://exemple.test/b');
    expect(r.bb.barcodeValue).toBe(getProductField(B, 'barcode'));
    expect(r.fb.ficheContenu).toBeDefined();
  });

  it('les deux produits épinglés, tirage SANS produit : une page, tout est résolu', () => {
    const tout = PACK.map((e) => (e.produitId ? e : { ...e, produitId: 'a' }));
    const r = Object.fromEntries(elementsPourProduit(tout, null, { produitsParId: parId }).map((e) => [e.id, e]));
    expect(r.na.text).toBe('Nom a');
    expect(r.nb.text).toBe('Nom b');
    expect(r.ia.src).toBe('http://x/a.jpg');
    expect(r.ib.src).toBe('http://x/b.jpg');
  });

  it('la correction manuelle d\'un texte suit le produit de l\'ÉLÉMENT', () => {
    const el = { id: 'x', type: 'text', text: '', dataBinding: 'name', produitId: 'b', textOverrides: { a: 'Faux', b: 'Nom b corrigé' } };
    expect(elementsPourProduit([el], A, { produitsParId: parId })[0].text).toBe('Nom b corrigé');
  });
});

describe('l\'export rend ce que l\'écran affiche', () => {
  const cas = [
    ['produit de page A', A],
    ['produit de page B', B],
    ['sans produit de page', null],
  ];
  for (const [nom, page] of cas) {
    it(`pack, ${nom}`, () => {
      const rendu = elementsPourProduit(PACK, page, { produitsParId: parId });
      for (const [i, el] of PACK.entries()) {
        // Sans épingle et sans produit de page, l'export garde le modèle tel
        // quel : le comportement d'avant, hors de cette garde
        if (!el.produitId && !page) continue;
        if (el.type === 'fiche') continue;
        expect(aLExport(rendu[i]), `${el.id} (${nom})`).toBe(aLEcran(el, page, parId));
      }
    });
  }

  it('ancien template, avec un produit de page', () => {
    const rendu = elementsPourProduit(ANCIEN, B, { produitsParId: parId });
    for (const [i, el] of ANCIEN.entries()) {
      if (el.type === 'fiche' || el.type === 'shape') continue;
      expect(aLExport(rendu[i]), el.id).toBe(aLEcran(el, B, parId));
    }
  });
});

describe('en planche : un élément épinglé est le même dans toutes les cases', () => {
  it('les éléments de B ne bougent pas, ceux de la page suivent la case', () => {
    const caseA = Object.fromEntries(elementsPourProduit(PACK, A, { produitsParId: parId }).map((e) => [e.id, e]));
    const caseB = Object.fromEntries(elementsPourProduit(PACK, B, { produitsParId: parId }).map((e) => [e.id, e]));
    for (const id of ['nb', 'pb', 'ib', 'lb', 'qb', 'bb']) expect(caseA[id]).toEqual(caseB[id]);
    expect(caseA.na.text).toBe('Nom a');
    expect(caseB.na.text).toBe('Nom b');
  });
});

describe('produit épinglé introuvable', () => {
  const sansB = { a: A };

  it('ne retombe jamais sur le produit de la page : vide', () => {
    const r = Object.fromEntries(elementsPourProduit(PACK, A, { produitsParId: sansB }).map((e) => [e.id, e]));
    expect(r.nb.text).toBe('');
    expect(r.pb.text).not.toContain('499');
    expect(r.ib.src).toBe(''); // pas le gabarit `{{product_image}}`
    expect(r.qb.qrValue).toBe('');
    expect(r.bb.barcodeValue).toBe('');
    expect(r.fb.ficheContenu).toBeNull();
    // … et le produit de la page, lui, reste résolu
    expect(r.na.text).toBe('Nom a');
  });

  it('`produitDe` : la page sans épingle, l\'épinglé sinon, jamais un repli', () => {
    expect(produitDe({ dataBinding: 'name' }, A, parId)).toBe(A);
    expect(produitDe({ dataBinding: 'name', produitId: 'b' }, A, parId)).toBe(B);
    expect(produitDe({ dataBinding: 'name', produitId: 'z' }, A, parId)).toBeNull();
    expect(produitDe({ dataBinding: 'name' }, null, parId)).toBeNull();
  });
});
