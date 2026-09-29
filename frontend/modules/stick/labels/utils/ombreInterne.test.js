import { describe, expect, it } from 'vitest';
import { ombreInterneDe, ombrerPixels, rgbDe } from './ombreInterne';

// Un carré blanc opaque de 4 × 4 au milieu d'un cadre 8 × 8 transparent
const carre = () => {
  const data = new Uint8ClampedArray(8 * 8 * 4);
  for (let y = 2; y < 6; y++)
    for (let x = 2; x < 6; x++) data.set([255, 255, 255, 255], (y * 8 + x) * 4);
  return { width: 8, height: 8, data };
};
const px = (img, x, y) => Array.from(img.data.slice((y * 8 + x) * 4, (y * 8 + x) * 4 + 4));

describe('ombre interne', () => {
  it('désactivée : null ; activée : bornée', () => {
    expect(ombreInterneDe({})).toBeNull();
    expect(ombreInterneDe({ innerShadowEnabled: true, innerShadowOpacity: 3 })).toEqual({
      color: '#000000', opacity: 1, blur: 8, offsetX: 2, offsetY: 2,
    });
    expect(rgbDe('#f00')).toEqual([255, 0, 0]);
  });
  it('décalage (1, 1) sans flou : le bord haut-gauche s’assombrit, le reste non', () => {
    const img = ombrerPixels(carre(), { color: '#000000', opacity: 1, blur: 0, offsetX: 1, offsetY: 1 }, 1);
    expect(px(img, 2, 2)).toEqual([0, 0, 0, 255]); // coin haut gauche : ombré
    expect(px(img, 5, 5)).toEqual([255, 255, 255, 255]); // coin bas droit : intact
    expect(px(img, 0, 0)[3]).toBe(0); // hors de l'élément : toujours transparent
  });
  it('le flou est délégué, au rayon du cache', () => {
    const rayons = [];
    ombrerPixels(carre(), { color: '#000', opacity: 1, blur: 2, offsetX: 0, offsetY: 0 }, 3, (_, r) => rayons.push(r));
    expect(rayons).toEqual([6]);
  });
});

import { ombrePorteeDe, ombrePorteePixels } from './ombreInterne';

describe('ombre portée refaite (élément masqué)', () => {
  it('défauts du panneau Effets', () => {
    expect(ombrePorteeDe({})).toBeNull();
    expect(ombrePorteeDe({ shadowEnabled: true })).toEqual({ color: '#000000', opacity: 0.4, blur: 8, offsetX: 2, offsetY: 2 });
  });
  it('l’ombre suit l’alpha masqué, sous l’élément, décalée', () => {
    const img = ombrePorteePixels(carre(), { color: '#000000', opacity: 1, blur: 0, offsetX: 2, offsetY: 2 }, 1);
    expect(px(img, 3, 3)).toEqual([255, 255, 255, 255]); // l'élément reste dessus
    expect(px(img, 7, 7)).toEqual([0, 0, 0, 255]); // ombre noire, hors de l'élément
    expect(px(img, 1, 1)[3]).toBe(0); // rien du côté opposé
  });
});
