// Repris de PocketStick (`src/editor/draw/path.test.js`) ; l'élément `svg`
// devient un élément `dessin` qui garde ses points.
import { describe, it, expect } from 'vitest';
import {
  strokeOutline,
  outlineToPathData,
  getBoundingBox,
  elementDessin,
  dessinTrace,
  pointsDe,
  brushOptions,
  brushCursor,
  pressionReelle,
} from './dessin';

describe('dessin : tracé → contour', () => {
  const line = Array.from({ length: 21 }, (_, i) => ({ x: i * 5, y: 50 }));
  const jagged = Array.from({ length: 21 }, (_, i) => ({ x: i * 5, y: 50 + (i % 2 ? 6 : -6) }));
  const spread = (outline) => getBoundingBox(outline).height;

  it("contour de l'épaisseur du pinceau autour d'un trait droit", () => {
    const box = getBoundingBox(strokeOutline(line, { strokeWidth: 10, smoothing: 0.5, thinning: 0 }));
    expect(box.height).toBeGreaterThan(9);
    expect(box.height).toBeLessThan(11);
  });
  it('adoucir : un tracé tremblé devient plus régulier', () => {
    const raw = spread(strokeOutline(jagged, { strokeWidth: 4, smoothing: 0, thinning: 0 }));
    const soft = spread(strokeOutline(jagged, { strokeWidth: 4, smoothing: 1, thinning: 0 }));
    expect(soft).toBeLessThan(raw);
  });
  it('chemin fermé en courbes quadratiques', () => {
    expect(outlineToPathData([{ x: 0, y: 0 }])).toBe('');
    const d = outlineToPathData([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }]);
    expect(d).toBe('M 2,0 Q 4,0 4,2 Q 4,4 2,2 Q 0,0 2,0 Z');
  });
  it('cadre : contour + 1 px', () => {
    expect(getBoundingBox([{ x: 5, y: 7 }, { x: 1, y: 9 }])).toEqual({ x: 1, y: 7, width: 4, height: 2 });
    const el = elementDessin([{ x: 10, y: 20 }, { x: 30, y: 20 }], { stroke: '#f00', strokeWidth: 4, smoothing: 0.5, thinning: 0 });
    expect(el.x).toBeLessThanOrEqual(7);
    expect(el.width).toBeGreaterThanOrEqual(25);
  });
  it('élément dessin au relâchement, rien pour un seul point', () => {
    expect(elementDessin([{ x: 1, y: 1 }], { stroke: '#000', strokeWidth: 5, opacity: 1 })).toBeNull();
    const el = elementDessin([{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }], {
      stroke: '#123456',
      strokeWidth: 10,
      opacity: 0.5,
    });
    expect(el).toMatchObject({ type: 'dessin', opacity: 0.5, fill: '#123456' });
    expect(el.width).toBeGreaterThan(100);
  });
  it('garde les points, relatifs au cadre', () => {
    const el = elementDessin([{ x: 100, y: 200 }, { x: 150, y: 200 }], { stroke: '#000', strokeWidth: 10, smoothing: 0.5 });
    expect(pointsDe(el).map((p) => ({ x: p.x + el.x, y: p.y + el.y }))).toEqual([
      { x: 100, y: 200 },
      { x: 150, y: 200 },
    ]);
  });
  it('tracé recalculé = contour de création (même règle partout)', () => {
    const pts = [{ x: 0, y: 0 }, { x: 40, y: 30 }, { x: 90, y: 10 }];
    const opts = { stroke: '#0a0', strokeWidth: 8, smoothing: 0.5, thinning: 0.3, opacity: 1 };
    const el = elementDessin(pts, opts);
    const attendu = outlineToPathData(strokeOutline(pointsDe(el), opts));
    expect(dessinTrace(el)).toEqual({ data: attendu, fill: '#0a0', opacity: 1 });
    // recolorer ne touche que la couleur
    expect(dessinTrace({ ...el, fill: '#f00' }).data).toBe(attendu);
  });
  it('options de pinceau', () => {
    expect(brushOptions('highlighter', { strokeWidth: 8 })).toEqual({ brushType: 'highlighter', opacity: 0.5, strokeWidth: 30 });
    expect(brushOptions('brush', { strokeWidth: 8 })).toEqual({ brushType: 'brush', opacity: 1, strokeWidth: 8 });
  });
});

describe('dessin : curseur', () => {
  it('croix hors de 4–100 px, sinon rond centré', () => {
    expect(brushCursor(2, '#000', 1)).toBe('crosshair');
    expect(brushCursor(120, '#000', 1)).toBe('crosshair');
    expect(brushCursor(20, '#000', 1)).toMatch(/^url\("data:image\/svg\+xml;base64,.+"\) 10 10, crosshair$/);
  });
});

describe('dessin : pression du stylet (lot 2)', () => {
  // Trait horizontal : pression faible puis forte
  const trait = Array.from({ length: 41 }, (_, i) => ({ x: i * 5, y: 50, pressure: i < 20 ? 0.1 : 1 }));
  const hauteurEntre = (outline, x0, x1) => getBoundingBox(outline.filter((p) => p.x >= x0 && p.x <= x1)).height;
  const reglages = { strokeWidth: 20, smoothing: 0.5, thinning: 1 };

  it('seul le stylet en mode « stylet » utilise la pression réelle', () => {
    expect(pressionReelle('pen', 'stylet')).toBe(true);
    expect(pressionReelle('mouse', 'stylet')).toBe(false);
    expect(pressionReelle('touch', 'stylet')).toBe(false);
    expect(pressionReelle('pen', 'vitesse')).toBe(false);
  });
  it('la pression réelle élargit le trait là où elle est forte', () => {
    const o = strokeOutline(trait, { ...reglages, pression: true });
    expect(hauteurEntre(o, 150, 180)).toBeGreaterThan(hauteurEntre(o, 20, 60) * 1.5);
  });
  it('sans pression, la même entrée ignore les valeurs relevées', () => {
    const sans = strokeOutline(trait, reglages);
    const deux = strokeOutline(trait.map(({ x, y }) => ({ x, y })), reglages);
    expect(sans).toEqual(deux);
  });
  it("l'élément garde les pressions, et le tracé recalculé les relit", () => {
    const opts = { stroke: '#000', ...reglages, opacity: 1 };
    const el = elementDessin(trait, { ...opts, pression: true });
    expect(el.pressions).toHaveLength(trait.length);
    expect(pointsDe(el)[30].pressure).toBe(1);
    const attendu = outlineToPathData(strokeOutline(pointsDe(el), { ...opts, pression: true }));
    expect(dessinTrace(el).data).toBe(attendu);
  });
  it('un élément sans pressions (lot 0, souris) reste inchangé', () => {
    const el = elementDessin(trait, { stroke: '#000', ...reglages });
    expect(el.pressions).toBeUndefined();
    expect(pointsDe(el)[0]).not.toHaveProperty('pressure');
  });
});
