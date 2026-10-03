import { describe, it, expect } from 'vitest';
import { CASSES, appliquerCasse, casseDe } from './typo';

describe('casse d’un texte', () => {
  it('majuscules et minuscules, accents compris', () => {
    expect(appliquerCasse('Guitare électrique', 'majuscules')).toBe('GUITARE ÉLECTRIQUE');
    expect(appliquerCasse('GUITARE ÉLECTRIQUE', 'minuscules')).toBe('guitare électrique');
  });
  it('une majuscule à chaque mot, même depuis un texte tout en majuscules', () => {
    expect(appliquerCasse('GUITARE FOLK ÉLECTRO', 'capitales')).toBe('Guitare Folk Électro');
    expect(appliquerCasse("câble d'instrument 3m", 'capitales')).toBe("Câble D'Instrument 3m");
    expect(appliquerCasse('porte-médiator (lot)', 'capitales')).toBe('Porte-Médiator (Lot)');
    expect(appliquerCasse('ligne un\nligne deux', 'capitales')).toBe('Ligne Un\nLigne Deux');
  });
  it('normale, inconnue ou absente : le texte tel quel ; rien : chaîne vide', () => {
    expect(appliquerCasse('Tel Quel', 'normale')).toBe('Tel Quel');
    expect(appliquerCasse('Tel Quel', 'autre')).toBe('Tel Quel');
    expect(appliquerCasse('Tel Quel')).toBe('Tel Quel');
    expect(appliquerCasse(null, 'majuscules')).toBe('');
    expect(appliquerCasse(12.5, 'majuscules')).toBe('12.5');
  });
  it('un élément sans `casse`, ou avec une valeur inconnue, est en casse normale', () => {
    expect(casseDe({})).toBe('normale');
    expect(casseDe({ casse: 'gothique' })).toBe('normale');
    expect(casseDe({ casse: 'majuscules' })).toBe('majuscules');
    expect(CASSES.map((c) => c.id)).toEqual(['normale', 'majuscules', 'minuscules', 'capitales']);
  });
});
