// Le TIRAGE : quels produits, combien de fois. Le canvas est le modèle, le
// tirage dit qui l'imprime et combien de fois ; les pages en DÉCOULENT, elles
// ne se créent jamais à la main. Fonctions pures, lues par l'export et par la
// bande d'aperçu — voir `PocketStick-docs/03-tirage.md`.

export const QUANTITE_MAX = 999;

/** Quantité bornée à [1, QUANTITE_MAX], 1 si illisible. */
export const quantiteValide = (n) => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.min(QUANTITE_MAX, Math.max(1, v)) : 1;
};

/**
 * Déplie le tirage en cases, dans l'ordre de la liste : A ×3 puis B ×2 donne
 * A, A, A, B, B. Chaque case est `{ productId, index }` — `index` est la ligne
 * du tirage, ce qui permet à l'aperçu de pointer le produit. Sans produit, le
 * tirage est une seule ligne « Sans produit × quantiteSansProduit »
 * (`productId: null`).
 */
export const casesDuTirage = ({ selectedProductIds = [], quantites = {}, quantiteSansProduit = 1 }) => {
  if (!selectedProductIds.length) {
    return Array.from({ length: quantiteValide(quantiteSansProduit) }, () => ({ productId: null, index: 0 }));
  }
  const cases = [];
  selectedProductIds.forEach((productId, index) => {
    const n = quantiteValide(quantites[productId] ?? 1);
    for (let k = 0; k < n; k++) cases.push({ productId, index });
  });
  return cases;
};

/**
 * Découpe les cases en pages. `format` vaut `'page'` (une case par page) ou
 * `'planche'` (rows × cols). Rend `{ parPage, pages, libres }` — la dernière
 * page est complétée par des `null` (cases libres), et il y a toujours au
 * moins une page.
 */
export const pagination = (cases, { format = 'page', rows = 1, cols = 1 } = {}) => {
  const parPage = format === 'planche' ? Math.max(1, (rows | 0) * (cols | 0)) : 1;
  const pages = [];
  for (let i = 0; i < cases.length; i += parPage) {
    const page = cases.slice(i, i + parPage);
    while (page.length < parPage) page.push(null);
    pages.push(page);
  }
  if (!pages.length) pages.push(Array.from({ length: parPage }, () => null));
  const libres = pages.length * parPage - cases.length;
  return { parPage, pages, libres };
};

/** Formats de feuille de la planche, en points. */
export const SHEET_FORMATS = [
  { id: 'a4-portrait', label: 'A4 Portrait', width: 595, height: 842 },
  { id: 'a4-landscape', label: 'A4 Paysage', width: 842, height: 595 },
];
