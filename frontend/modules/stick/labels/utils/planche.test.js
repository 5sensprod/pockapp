import { describe, it, expect } from 'vitest';
import { tailleCase } from './planche';

const a4 = { width: 595, height: 842 };

describe('taille d’une case de planche', () => {
  it('sans marge ni écart : la feuille partagée', () => {
    expect(tailleCase(a4, { rows: 2, cols: 2, margin: 0, spacing: 0 })).toEqual({ width: 297, height: 421 });
  });
  it('marges des deux côtés, écarts entre les cases seulement', () => {
    // largeur : 595 − 2×10 − 2×4 = 567 → 189 ; hauteur : 842 − 20 − 7×4 = 794 → 99
    expect(tailleCase(a4, { rows: 8, cols: 3, margin: 10, spacing: 4 })).toEqual({ width: 189, height: 99 });
  });
  it('des marges plus grandes que la feuille : zéro, jamais négatif', () => {
    expect(tailleCase({ width: 80, height: 80 }, { rows: 1, cols: 1, margin: 50, spacing: 0 })).toEqual({ width: 0, height: 0 });
  });
});
