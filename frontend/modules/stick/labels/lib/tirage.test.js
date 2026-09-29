import { describe, expect, it } from 'vitest';
import { casesDuTirage, pagination, quantiteValide } from './tirage';

describe('casesDuTirage', () => {
  it("déplie les quantités dans l'ordre de la liste", () => {
    const cases = casesDuTirage({ selectedProductIds: ['a', 'b'], quantites: { a: 3, b: 2 } });
    expect(cases.map((c) => c.productId)).toEqual(['a', 'a', 'a', 'b', 'b']);
    expect(cases.map((c) => c.index)).toEqual([0, 0, 0, 1, 1]);
  });
  it('vaut 1 par défaut', () => {
    expect(casesDuTirage({ selectedProductIds: ['a', 'b'] })).toHaveLength(2);
  });
  it('sans produit : « Sans produit × N »', () => {
    expect(casesDuTirage({ quantiteSansProduit: 4 })).toEqual(
      Array.from({ length: 4 }, () => ({ productId: null, index: 0 }))
    );
    expect(casesDuTirage({})).toHaveLength(1);
  });
  it('borne les quantités', () => {
    expect(quantiteValide(0)).toBe(1);
    expect(quantiteValide('x')).toBe(1);
    expect(quantiteValide(2.7)).toBe(2);
    expect(quantiteValide(5000)).toBe(999);
  });
});

describe('pagination', () => {
  const cases = (n) => Array.from({ length: n }, (_, i) => ({ productId: `p${i}`, index: i }));
  it('une par page', () => {
    const r = pagination(cases(3), { format: 'page' });
    expect(r.parPage).toBe(1);
    expect(r.pages).toHaveLength(3);
    expect(r.libres).toBe(0);
  });
  it("planche : pages ajoutées d'elles-mêmes, dernière complétée", () => {
    const r = pagination(cases(10), { format: 'planche', rows: 2, cols: 4 });
    expect(r.parPage).toBe(8);
    expect(r.pages).toHaveLength(2);
    expect(r.pages[1].filter(Boolean)).toHaveLength(2);
    expect(r.libres).toBe(6);
  });
  it('jamais zéro page', () => {
    const r = pagination([], { format: 'planche', rows: 3, cols: 8 });
    expect(r.pages).toHaveLength(1);
    expect(r.libres).toBe(24);
  });
});
