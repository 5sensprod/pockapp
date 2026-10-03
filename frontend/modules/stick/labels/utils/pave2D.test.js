import { describe, it, expect } from 'vitest';
import { MARGE, accrocher, contraindre, deplacer, depuisPave, pasClavier, polaire, valeurGlissee, versPave } from './pave2D';
import {
  OMBRE_BORNES,
  OMBRE_DEFAUT,
  OMBRE_INTERNE,
  OMBRE_INTERNE_BORNES,
  OMBRE_INTERNE_DEFAUT,
  PRESETS_OMBRE,
  PRESETS_OMBRE_INTERNE,
  couleurAvecOpacite,
  filtreApercu,
  ombreDe,
  ombreDuPreset,
  ombreInterneApercu,
} from './presetsOmbre';

const pave = { taille: 112, max: 40, pas: 1 };

describe('pavé ↔ valeurs', () => {
  it('centre = (0, 0), bords de la course = ±max', () => {
    expect(depuisPave(56, 56, pave)).toEqual({ x: 0, y: 0 });
    expect(depuisPave(112 - MARGE, MARGE, pave)).toEqual({ x: 40, y: -40 });
  });
  it('hors du pavé : borné', () => {
    expect(depuisPave(500, -200, pave)).toEqual({ x: 40, y: -40 });
  });
  it('aller-retour stable pour tout entier de -40 à 40', () => {
    for (let v = -40; v <= 40; v++) {
      const { px, py } = versPave(v, -v, pave);
      expect(depuisPave(px, py, pave)).toEqual({ x: v, y: -v + 0 });
    }
  });
  it('valeur hors bornes collée au bord, valeur absente au centre, jamais NaN', () => {
    expect(versPave(60, -90, pave)).toEqual({ px: 112 - MARGE, py: MARGE });
    expect(versPave(undefined, Number.NaN, pave)).toEqual({ px: 56, py: 56 });
  });
});

describe('accrochage et contrainte', () => {
  it('accroche chaque axe à 0 sous le seuil', () => {
    expect(accrocher({ x: 1, y: 17 }, 2)).toEqual({ x: 0, y: 17 });
    expect(accrocher({ x: -2, y: 2 }, 2)).toEqual({ x: 0, y: 0 });
    expect(accrocher({ x: 3, y: 3 }, 2)).toEqual({ x: 3, y: 3 });
    expect(accrocher({ x: 1, y: 1 }, 0)).toEqual({ x: 1, y: 1 });
  });
  it('Maj : axe dominant, ou diagonale', () => {
    expect(contraindre({ x: 10, y: 2 })).toEqual({ x: 10, y: 0 });
    expect(contraindre({ x: -3, y: 20 })).toEqual({ x: 0, y: 20 });
    expect(contraindre({ x: 9, y: -7 })).toEqual({ x: 8, y: -8 });
    expect(contraindre({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('affichage et clavier', () => {
  it('polaire : 0° à droite, 90° vers le bas', () => {
    expect(polaire(10, 0)).toEqual({ angle: 0, distance: 10 });
    expect(polaire(0, 10)).toEqual({ angle: 90, distance: 10 });
    expect(polaire(2, 2)).toEqual({ angle: 45, distance: 3 });
    expect(polaire(-5, 0)).toEqual({ angle: 180, distance: 5 });
    expect(polaire(0, 0)).toEqual({ angle: 0, distance: 0 });
  });
  it('flèches ±1, Maj ±10, Origine au centre, bornes tenues', () => {
    expect(pasClavier('ArrowLeft')).toEqual({ dx: -1, dy: 0 });
    expect(pasClavier('ArrowDown', true)).toEqual({ dx: 0, dy: 10 });
    expect(pasClavier('a')).toBeNull();
    expect(deplacer({ x: 35, y: 0 }, pasClavier('ArrowRight', true), 40)).toEqual({ x: 40, y: 0 });
    expect(deplacer({ x: 12, y: -7 }, pasClavier('Home'), 40)).toEqual({ x: 0, y: 0 });
  });
});

describe('champ à glisser', () => {
  it('deux pixels par pas ; Maj ×10, Alt ÷10 ; borné', () => {
    expect(valeurGlissee(8, 10, { pas: 1 })).toBe(13);
    expect(valeurGlissee(8, -4, { pas: 1, maj: true })).toBe(-12);
    expect(valeurGlissee(8, 6, { pas: 1, alt: true })).toBe(8.3);
    expect(valeurGlissee(38, 100, { pas: 1, min: 0, max: 40 })).toBe(40);
    expect(valeurGlissee(undefined, 4, { pas: 1 })).toBe(2);
  });
});

describe('ombre portée : défauts, préréglages, aperçu', () => {
  it('les défauts sont ceux du rendu', () => {
    expect(ombreDe({})).toEqual({ actif: false, couleur: '#000000', opacite: 0.4, flou: 8, x: 2, y: 2 });
    expect(ombreDe({ shadowEnabled: true, shadowOffsetX: 0, shadowBlur: 0 })).toMatchObject({ actif: true, x: 0, flou: 0 });
  });
  it('chaque préréglage porte exactement les six clés, dans les bornes', () => {
    const cles = ['shadowEnabled', ...Object.keys(OMBRE_DEFAUT)].sort();
    for (const p of PRESETS_OMBRE) {
      expect(Object.keys(p.valeurs).sort(), p.id).toEqual(cles);
      expect(Math.abs(p.valeurs.shadowOffsetX)).toBeLessThanOrEqual(OMBRE_BORNES.decalage);
      expect(Math.abs(p.valeurs.shadowOffsetY)).toBeLessThanOrEqual(OMBRE_BORNES.decalage);
      expect(p.valeurs.shadowBlur).toBeLessThanOrEqual(OMBRE_BORNES.flou);
      expect(p.valeurs.shadowOpacity).toBeGreaterThan(0);
      expect(p.valeurs.shadowOpacity).toBeLessThanOrEqual(1);
    }
    expect(new Set(PRESETS_OMBRE.map((p) => p.id)).size).toBe(PRESETS_OMBRE.length);
  });
  it('couleur + opacité → rgba ; une couleur illisible est rendue telle quelle', () => {
    expect(couleurAvecOpacite('#000000', 0.4)).toBe('rgba(0, 0, 0, 0.4)');
    expect(couleurAvecOpacite('#f0a', 1)).toBe('rgba(255, 0, 170, 1)');
    expect(couleurAvecOpacite('#12', 0.5)).toBe('#12');
    expect(couleurAvecOpacite('', 0.5)).toBe('#000000');
  });
  it('le filtre d’aperçu suit l’échelle du pavé', () => {
    expect(filtreApercu({ couleur: '#000000', opacite: 0.4, flou: 8, x: 2, y: -4 }, 1.25)).toBe(
      'drop-shadow(2.5px -5px 5px rgba(0, 0, 0, 0.4))'
    );
  });
});

describe('ombre interne : mêmes formes, autres clés', () => {
  it('lit les clés `innerShadow*`, avec ses propres défauts (opacité 0,5)', () => {
    expect(ombreDe({}, OMBRE_INTERNE)).toEqual({ actif: false, couleur: '#000000', opacite: 0.5, flou: 8, x: 2, y: 2 });
    // l'ombre portée du même élément n'y entre pas
    expect(ombreDe({ shadowEnabled: true, shadowOffsetX: 30 }, OMBRE_INTERNE)).toMatchObject({ actif: false, x: 2 });
    expect(ombreDe({ innerShadowEnabled: true, innerShadowBlur: 50 }, OMBRE_INTERNE)).toMatchObject({ actif: true, flou: 50 });
  });
  it('ses préréglages portent exactement ses six clés, dans ses bornes (flou jusqu’à 60)', () => {
    const cles = ['innerShadowEnabled', ...Object.keys(OMBRE_INTERNE_DEFAUT)].sort();
    for (const p of PRESETS_OMBRE_INTERNE) {
      expect(Object.keys(p.valeurs).sort(), p.id).toEqual(cles);
      const o = ombreDuPreset(p, OMBRE_INTERNE);
      expect(o.actif).toBe(true);
      expect(o.flou).toBeLessThanOrEqual(OMBRE_INTERNE_BORNES.flou);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(OMBRE_INTERNE_BORNES.decalage);
    }
    // aucun préréglage d'une ombre n'écrit dans l'autre
    for (const p of PRESETS_OMBRE) expect(Object.keys(p.valeurs).some((c) => c.startsWith('inner'))).toBe(false);
  });
  it('aperçu en `box-shadow` inset', () => {
    expect(ombreInterneApercu({ couleur: '#000000', opacite: 0.5, flou: 8, x: 2, y: 2 }, 1)).toBe(
      'inset 2px 2px 4px rgba(0, 0, 0, 0.5)'
    );
  });
});
