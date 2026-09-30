import { describe, it, expect } from 'vitest';
import { chaikinFerme, formeDepuisDessin, lissageDe, relisser, REMPLISSAGE_FERME } from './formeLibre';
import { contourDeBase, contourStylise } from './contourStylise';

// Un tracé en boucle, dans son cadre local
const boucle = Array.from({ length: 60 }, (_, i) => {
  const a = (i / 60) * 2 * Math.PI;
  return [50 + 40 * Math.cos(a), 30 + 20 * Math.sin(a)];
}).flat();

const dessin = {
  id: 'd1',
  type: 'dessin',
  x: 100,
  y: 200,
  width: 100,
  height: 60,
  points: boucle,
  pressions: boucle.filter((_, i) => i % 2 === 0).map(() => 0.5),
  fill: '#ff0000',
  strokeWidth: 6,
  smoothing: 0.5,
  thinning: 0.3,
  fusion: 'multiply',
  contourStyle: { tremble: 0.4 },
};

describe('formeDepuisDessin', () => {
  it('rend une forme libre : contour = le trait, remplissage transparent', () => {
    const f = formeDepuisDessin(dessin);
    expect(f.type).toBe('shape');
    expect(f.shape).toBe('libre');
    expect(f.fill).toBe(REMPLISSAGE_FERME);
    expect(f.stroke).toBe('#ff0000');
    expect(f.strokeWidth).toBe(6);
    // champs du tracé retirés, contourStyle gardé (pas touché)
    for (const c of ['points', 'pressions', 'smoothing', 'thinning', 'fusion']) expect(f[c]).toBeUndefined();
    expect('contourStyle' in f).toBe(false);
  });

  it('points normalisés 0–1, cadre = la ligne du tracé, posé au même endroit', () => {
    const f = formeDepuisDessin(dessin);
    for (const v of f.pointsLibres) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // Chaikin rentre un peu les extrêmes : la boucle 10–90 × 10–50 à peu près
    expect(f.x).toBeGreaterThan(109);
    expect(f.x).toBeLessThan(112);
    expect(f.width).toBeGreaterThan(76);
    expect(f.width).toBeLessThanOrEqual(80);
    expect(f.scaleX).toBe(1);
  });

  it('l’échelle du tracé passe dans la taille, signe gardé', () => {
    const a = formeDepuisDessin(dessin);
    const b = formeDepuisDessin({ ...dessin, scaleX: -2, scaleY: 3 });
    // un demi-pixel par unité d'échelle
    expect(Math.abs(b.width - a.width * 2)).toBeLessThan(1);
    expect(Math.abs(b.height - a.height * 3)).toBeLessThan(1.5);
    expect(b.scaleX).toBe(-1);
    expect(b.scaleY).toBe(1);
    // même point à l'écran : coin local (bx, by) × échelle
    // à l'échelle 2, le demi-pixel devient un pixel
    expect(Math.abs(b.x - (100 + (a.x - 100) * -2))).toBeLessThan(1);
  });

  it('refuse ce qui n’est pas un tracé, ou un tracé sans surface', () => {
    expect(formeDepuisDessin({ type: 'shape' })).toBeNull();
    expect(formeDepuisDessin({ ...dessin, points: [0, 0, 10, 0] })).toBeNull();
  });
});

describe('forme libre dans la géométrie des formes', () => {
  it('contourDeBase met les points à la taille du cadre, fermés', () => {
    const { ferme, points } = contourDeBase({ shape: 'libre', width: 200, height: 100, pointsLibres: [0, 0, 1, 0, 0.5, 1] });
    expect(ferme).toBe(true);
    expect(points).toEqual([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 100, y: 100 }]);
  });

  it('le contour stylisé suit les points (clé de cache comprise)', () => {
    const base = { shape: 'libre', width: 100, height: 100, strokeWidth: 4, contourStyle: {}, id: 'x' };
    const a = contourStylise({ ...base, pointsLibres: [0, 0, 1, 0, 0.5, 1] });
    const b = contourStylise({ ...base, pointsLibres: [0, 0, 1, 0, 1, 1] });
    expect(a.ferme).toBe(true);
    expect(a.outline).not.toEqual(b.outline);
    expect(contourStylise({ ...base, pointsLibres: [] })).toBeNull();
  });

  it('Chaikin double les points à chaque passe', () => {
    expect(chaikinFerme([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], 2)).toHaveLength(12);
  });
});

describe('la fermeture garde le lissage du trait', () => {
  it('suit la ligne STABILISÉE : un zigzag s’y aplatit', () => {
    // zigzag de ±5 px autour d'une boucle : la stabilisation le lisse
    const zig = Array.from({ length: 120 }, (_, i) => {
      const a = (i / 120) * 2 * Math.PI;
      const r = 40 + (i % 2 ? 5 : -5);
      return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
    }).flat();
    const base = { ...dessin, points: zig, pressions: undefined, width: 100, height: 100 };
    // Longueur du contour, en pixels : un zigzag lissé est plus court
    const ecart = (f) => {
      const p = f.pointsLibres;
      let l = 0;
      for (let i = 2; i < p.length; i += 2) l += Math.hypot((p[i] - p[i - 2]) * f.width, (p[i + 1] - p[i - 1]) * f.height);
      return l;
    };
    const stable = formeDepuisDessin({ ...base, stabilisation: 0.9 });
    const brute = formeDepuisDessin({ ...base, stabilisation: 0 });
    // plus stabilisé = moins de dents
    expect(ecart(stable)).toBeLessThan(ecart(brute));
  });
});

describe('relisser : le lissage reste réglable après fermeture', () => {
  const forme = () => ({ id: 'd1', ...formeDepuisDessin(dessin) });

  it('la forme garde le tracé d’origine et ses réglages', () => {
    const f = forme();
    expect(f.traceLibre.points).toHaveLength(dessin.points.length);
    expect(f.traceLibre.smoothing).toBe(0.5);
    expect(lissageDe(f)).toEqual({ smoothing: 0.5, stabilisation: 0.35 });
  });

  it('mêmes réglages : même forme (idempotent)', () => {
    const f = forme();
    const r = relisser(f, {});
    // au demi-pixel : perfect-freehand n'est pas exactement invariant d'échelle
    expect(Math.abs(r.width - f.width)).toBeLessThan(0.5);
    expect(Math.abs(r.x - f.x)).toBeLessThan(0.5);
    // et relisser encore ne dérive pas
    const r2 = relisser({ ...f, ...r }, {});
    expect(Math.abs(r2.width - r.width)).toBeLessThan(0.5);
  });

  it('changer la stabilisation change la courbe et garde le réglage', () => {
    const f = forme();
    const r = relisser(f, { stabilisation: 0.95 });
    expect(r.traceLibre.stabilisation).toBe(0.95);
    expect(r.pointsLibres).not.toEqual(f.pointsLibres);
  });

  it('suit la taille actuelle : une forme agrandie le reste', () => {
    const f = forme();
    const r = relisser({ ...f, width: f.width * 2 }, {});
    expect(Math.abs(r.width - f.width * 2)).toBeLessThan(0.5);
  });

  it('une forme sans tracé gardé ne se relisse pas', () => {
    expect(relisser({ shape: 'libre', pointsLibres: [0, 0, 1, 0, 0, 1] }, { smoothing: 1 })).toBeNull();
  });
});
