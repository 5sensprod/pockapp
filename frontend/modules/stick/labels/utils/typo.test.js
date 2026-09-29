import { describe, expect, it } from 'vitest';
import { typoTexte } from './typo';

describe('typographie du texte', () => {
  it('par défaut : rien ne change', () => {
    expect(typoTexte({})).toEqual({ letterSpacing: 0, lineHeight: 1, hauteur: 1 });
  });
  it('bornée, hauteur en facteur', () => {
    expect(typoTexte({ letterSpacing: 500, lineHeight: 0.1, charHeight: 150 })).toEqual({
      letterSpacing: 100,
      lineHeight: 0.5,
      hauteur: 1.5,
    });
    expect(typoTexte({ letterSpacing: 'x' }).letterSpacing).toBe(0);
  });
});
