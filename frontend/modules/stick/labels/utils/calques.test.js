import { describe, it, expect } from 'vitest';
import { etatsCalque, iconeCalque, nomCalque } from './calques';
import { CHAMPS_PRODUIT } from './champsProduit';

describe('nom d’un calque', () => {
  it('un texte fixe porte son texte, coupé à la parenthèse', () => {
    expect(nomCalque({ type: 'text', text: 'Promo (été)' })).toBe('Promo');
    expect(nomCalque({ type: 'text', text: '' })).toBe('Texte');
  });
  it('un élément lié dit son champ, par son libellé', () => {
    const { cle, libelle } = CHAMPS_PRODUIT[0];
    expect(nomCalque({ type: 'text', text: 'x', dataBinding: cle })).toBe(`Texte (${libelle})`);
    expect(nomCalque({ type: 'qrcode', dataBinding: cle })).toBe(`QR (${libelle})`);
  });
  it('les formes et les tracés sont nommés en français', () => {
    expect(nomCalque({ type: 'shape', shape: 'star' })).toBe('Étoile');
    expect(nomCalque({ type: 'shape', shape: 'libre' })).toBe('Forme');
    expect(nomCalque({ type: 'dessin' })).toBe('Dessin');
    expect(nomCalque({ type: 'dessin', brushType: 'highlighter' })).toBe('Surligneur');
  });
  it('plus aucun nom tiré de `el.type` : ni « Barcode », ni « Qrcode »', () => {
    expect(nomCalque({ type: 'barcode' })).toBe('Code-barres');
    expect(nomCalque({ type: 'qrcode' })).toBe('QR code');
    expect(nomCalque({ type: 'qrcode', qrValue: 'https://a.fr' })).toBe('QR : https://a.fr');
    expect(nomCalque({ type: 'image' })).toBe('Image');
    expect(nomCalque({ type: 'inconnu' })).toBe('Élément');
  });
  it('le fond s’appelle « Fond », rectangle ou image', () => {
    expect(nomCalque({ type: 'shape', shape: 'rectangle', role: 'fond' })).toBe('Fond');
    expect(nomCalque({ type: 'image', role: 'fond' })).toBe('Fond');
  });
  it('une fiche porte le nom de sa section', () => {
    expect(nomCalque({ type: 'fiche', section: 'highlights' })).toBe('Points forts');
    expect(nomCalque({ type: 'fiche' })).toBe('Fiche');
  });
});

describe('icône et états d’un calque', () => {
  it('un tracé et une fiche ont leur icône, plus celle du texte', () => {
    expect(iconeCalque({ type: 'dessin' })).toBe('trace');
    expect(iconeCalque({ type: 'fiche' })).toBe('fiche');
    expect(iconeCalque({ type: 'text' })).toBe('texte');
  });
  it('verrouillé, masqué, lié', () => {
    expect(etatsCalque({ type: 'text' })).toEqual({ verrouille: false, masque: false, lie: false });
    expect(etatsCalque({ type: 'text', locked: true, visible: false })).toEqual({ verrouille: true, masque: true, lie: false });
    expect(etatsCalque({ type: 'text', dataBinding: CHAMPS_PRODUIT[0].cle }).lie).toBe(true);
    expect(etatsCalque({ type: 'fiche' }).lie).toBe(true);
  });
});
