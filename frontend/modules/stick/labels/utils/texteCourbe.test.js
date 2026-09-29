import { describe, expect, it } from 'vitest';
import { courbureDe, disposerCourbe, propsCourbure } from './texteCourbe';

const ligne = (n, w = 10) => ({ lettres: Array.from({ length: n }, (_, i) => ({ c: String(i), w })), largeur: n * w });
const base = { W: 100, lh: 20, fontSize: 20, align: 'left' };

describe('texte courbé', () => {
  it('bornée, 0 sans courbure (dessin normal de Konva)', () => {
    expect(courbureDe({ curve: 300 })).toBe(100);
    expect(courbureDe({})).toBe(0);
    expect(propsCourbure(0)).toEqual({ courbeTexte: 0, sceneFunc: undefined, hitFunc: undefined });
    expect(propsCourbure(40).sceneFunc).toBeTypeOf('function');
  });
  it('en arche : milieu en haut, bords plus bas, symétrique, lettres tournées', () => {
    const { lettres } = disposerCourbe({ ...base, lignes: [ligne(10)], curve: 100 });
    const [a, , , , m1, m2, , , , z] = lettres;
    expect(a.y).toBeGreaterThan(m1.y);
    expect(a.y).toBeCloseTo(z.y);
    expect(a.x + z.x).toBeCloseTo(100); // symétrie autour du milieu
    expect(a.angle).toBeLessThan(0);
    expect(z.angle).toBeGreaterThan(0);
    expect(m1.angle).toBeCloseTo(-m2.angle);
  });
  it('en creux : les bords remontent, l’étendue dépasse le cadre vers le haut', () => {
    const { lettres, rect } = disposerCourbe({ ...base, lignes: [ligne(10)], curve: -100 });
    expect(lettres[0].y).toBeLessThan(lettres[5].y);
    expect(rect.y).toBeLessThan(0);
  });
  it('les lignes suivent des arcs concentriques', () => {
    const { lettres } = disposerCourbe({ ...base, lignes: [ligne(4), ligne(4)], curve: 50 });
    expect(lettres[4].y).toBeGreaterThan(lettres[0].y);
  });
});
