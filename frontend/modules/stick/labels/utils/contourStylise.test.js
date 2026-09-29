import { describe, it, expect } from 'vitest';
import {
  bruitPeriodique,
  contourDeBase,
  contourStylise,
  graineDe,
  reechantillonner,
  reglagesContour,
  CONTOUR_STYLISE_DEFAUT,
} from './contourStylise';
import { getBoundingBox } from './dessin';

const forme = (maj = {}) => ({
  shape: 'rectangle',
  width: 200,
  height: 100,
  cornerRadius: 0,
  strokeWidth: 6,
  contourStyle: { ...CONTOUR_STYLISE_DEFAUT },
  id: 'el-1',
  ...maj,
});

describe('contour stylisé : géométrie de base (celle de Konva)', () => {
  it('rectangle, arrondi borné à la moitié du petit côté', () => {
    expect(contourDeBase({ width: 20, height: 10 }).points).toEqual([
      { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 },
    ]);
    const box = getBoundingBox(contourDeBase({ width: 20, height: 10, cornerRadius: 99 }).points);
    expect(box.width).toBeCloseTo(20, 6);
    expect(box.height).toBeCloseTo(10, 6);
  });
  it('triangle et étoile : premier sommet en haut, rayon = moitié du petit côté', () => {
    const t = contourDeBase({ shape: 'triangle', width: 100, height: 60 }).points;
    expect(t[0].x).toBeCloseTo(50, 6);
    expect(t[0].y).toBeCloseTo(0, 6);
    const e = contourDeBase({ shape: 'star', width: 100, height: 100 }).points;
    expect(e).toHaveLength(10);
    expect(Math.hypot(e[1].x - 50, e[1].y - 50)).toBeCloseTo(25, 6);
  });
  it('trait : ouvert, au milieu de la hauteur', () => {
    expect(contourDeBase({ shape: 'line', width: 80, height: 10 })).toEqual({
      ferme: false,
      points: [{ x: 0, y: 5 }, { x: 80, y: 5 }],
    });
  });
  it('rééchantillonnage : pas régulier, longueur exacte', () => {
    const { points, longueur } = reechantillonner(contourDeBase({ width: 20, height: 10 }).points, true, 2);
    expect(longueur).toBe(60);
    expect(points).toHaveLength(30);
  });
});

describe('contour stylisé : bruit et réglages', () => {
  it('bruit périodique : borné, se referme, même graine = même valeur', () => {
    const g = graineDe('abc');
    expect(g).toBe(graineDe('abc'));
    expect(g).not.toBe(graineDe('abd'));
    for (let t = 0; t < 8; t += 0.37) {
      const v = bruitPeriodique(g, 8, t);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(bruitPeriodique(g, 8, t + 8)).toBeCloseTo(v, 12);
    }
  });
  it('absent ou non-objet = pas de contour stylisé ; valeurs bornées', () => {
    expect(reglagesContour({})).toBeNull();
    expect(reglagesContour({ contourStyle: 'x' })).toBeNull();
    expect(reglagesContour({ contourStyle: { tremble: 5, ondes: 999 } })).toMatchObject({ tremble: 1, ondes: 60 });
  });
});

describe('contour stylisé : le trait', () => {
  it('rien sans réglages ni épaisseur', () => {
    expect(contourStylise(forme({ contourStyle: null }))).toBeNull();
    expect(contourStylise(forme({ strokeWidth: 0 }))).toBeNull();
  });
  it('déterministe : même élément = même trait (écran et exports)', () => {
    const a = contourStylise(forme());
    const b = contourStylise({ ...forme(), contourStyle: { ...CONTOUR_STYLISE_DEFAUT } });
    expect(b.outline).toEqual(a.outline);
    expect(contourStylise(forme({ id: 'el-2' })).outline).not.toEqual(a.outline);
  });
  it('sans déformation, le trait suit le cadre', () => {
    const c = contourStylise(forme({ contourStyle: { tremble: 0, ondulation: 0, variation: 0 } }));
    const box = getBoundingBox(c.outline);
    expect(box.x).toBeCloseTo(-3, 0);
    expect(box.width).toBeCloseTo(206, 0);
    const ligne = getBoundingBox(c.ligne);
    expect(ligne).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });
  it("l'ondulation déborde du cadre, le remplissage la suit", () => {
    const c = contourStylise(forme({ contourStyle: { tremble: 0, ondulation: 1, ondes: 10, variation: 0 } }));
    expect(getBoundingBox(c.ligne).width).toBeGreaterThan(210);
  });
  it('le trait ouvert (line) ne se referme pas', () => {
    const c = contourStylise(forme({ shape: 'line', height: 10 }));
    expect(c.ferme).toBe(false);
    expect(c.outline.length).toBeGreaterThan(3);
  });
});

describe('contour stylisé : cadre réel', () => {
  it('englobe le trait qui déborde du cadre de la forme', () => {
    const c = contourStylise(forme({ contourStyle: { tremble: 0, ondulation: 1, ondes: 8, variation: 0 } }));
    expect(c.cadre.x).toBeLessThan(0);
    expect(c.cadre.x + c.cadre.width).toBeGreaterThan(200);
    const b = getBoundingBox(c.outline);
    expect(c.cadre.x).toBeLessThanOrEqual(b.x);
  });
});
