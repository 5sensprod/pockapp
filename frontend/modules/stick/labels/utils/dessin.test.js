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
  pointsDeformes,
  brushOptions,
  brushCursor,
  pressionReelle,
  pointUtile,
  simplifier,
  fusionDe,
  redessiner,
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
    expect(dessinTrace(el)).toMatchObject({ data: attendu, fill: '#0a0', fillPriority: 'color', opacity: 1 });
    // recolorer ne touche que la couleur
    expect(dessinTrace({ ...el, fill: '#f00' }).data).toBe(attendu);
  });
  it('options de pinceau', () => {
    expect(brushOptions('highlighter', { strokeWidth: 8 })).toEqual({ brushType: 'highlighter', opacity: 0.5, strokeWidth: 30 });
    expect(brushOptions('brush', { strokeWidth: 8 })).toEqual({ brushType: 'brush', opacity: 1, strokeWidth: 8 });
  });
});

describe('dessin : remplissage', () => {
  it('dégradé : la règle des formes, sur le cadre du dessin', () => {
    const el = elementDessin([{ x: 0, y: 0 }, { x: 100, y: 0 }], { stroke: '#000', strokeWidth: 10, smoothing: 0.5 });
    const t = dessinTrace({ ...el, fillGradient: { from: '#f00', to: '#00f', angle: 0 } });
    expect(t.fillPriority).toBe('linear-gradient');
    expect(t.fillLinearGradientColorStops).toContain('#f00');
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

describe('dessin : courbe assistée (lot 3)', () => {
  it('distance minimale : un point trop proche du précédent est écarté', () => {
    expect(pointUtile(null, { x: 0, y: 0 }, 2)).toBe(true);
    expect(pointUtile({ x: 0, y: 0 }, { x: 1, y: 1 }, 2)).toBe(false);
    expect(pointUtile({ x: 0, y: 0 }, { x: 2, y: 0 }, 2)).toBe(true);
  });
  it('Ramer-Douglas-Peucker : une droite bruitée garde ses extrémités, un coin reste', () => {
    const droite = Array.from({ length: 50 }, (_, i) => ({ x: i, y: i % 2 ? 0.2 : -0.2, pressure: i / 49 }));
    const s = simplifier(droite, 1);
    expect(s).toEqual([droite[0], droite[49]]);
    const coin = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 10, y: 10 }];
    expect(simplifier(coin, 1)).toEqual([coin[0], coin[2], coin[4]]);
    expect(simplifier(coin, 0)).toBe(coin);
  });
  it('simplification 0 = élément identique à avant le lot 3', () => {
    const pts = Array.from({ length: 30 }, (_, i) => ({ x: i * 3, y: Math.sin(i / 3) * 10 }));
    const opts = { stroke: '#000', strokeWidth: 10, smoothing: 0.5, thinning: 0 };
    expect(elementDessin(pts, { ...opts, simplification: 0 }).points).toEqual(elementDessin(pts, opts).points);
    expect(elementDessin(pts, { ...opts, simplification: 1 }).points.length).toBeLessThan(pts.length * 2);
  });
  it('stabilisation absente = 0,7 × adoucir (éléments anciens) ; présente = séparée', () => {
    const pts = Array.from({ length: 21 }, (_, i) => ({ x: i * 5, y: 50 + (i % 2 ? 6 : -6) }));
    const base = { strokeWidth: 4, smoothing: 0.5, thinning: 0 };
    expect(strokeOutline(pts, base)).toEqual(strokeOutline(pts, { ...base, stabilisation: 0.35 }));
    const h = (o) => getBoundingBox(o).height;
    expect(h(strokeOutline(pts, { ...base, stabilisation: 1 }))).toBeLessThan(h(strokeOutline(pts, { ...base, stabilisation: 0 })));
  });
  it("l'élément garde sa stabilisation et le tracé recalculé la relit", () => {
    const pts = [{ x: 0, y: 0 }, { x: 30, y: 20 }, { x: 60, y: 0 }, { x: 90, y: 30 }];
    const opts = { stroke: '#000', strokeWidth: 8, smoothing: 0.2, thinning: 0, stabilisation: 0.9 };
    const el = elementDessin(pts, opts);
    expect(el.stabilisation).toBe(0.9);
    expect(dessinTrace(el).data).toBe(outlineToPathData(strokeOutline(pointsDe(el), opts)));
  });
});

describe('dessin : effilement (lot 4)', () => {
  const trait = Array.from({ length: 41 }, (_, i) => ({ x: i * 5, y: 50 }));
  const base = { strokeWidth: 20, smoothing: 0.5, thinning: 0 };
  const hauteurEntre = (o, x0, x1) => getBoundingBox(o.filter((p) => p.x >= x0 && p.x <= x1)).height;

  it('absent ou 0 = bouts ronds, comme avant', () => {
    expect(strokeOutline(trait, { ...base, effilementDebut: 0, effilementFin: 0 })).toEqual(strokeOutline(trait, base));
  });
  it('effiler le début amincit le début, pas la fin', () => {
    const o = strokeOutline(trait, { ...base, effilementDebut: 1 });
    expect(hauteurEntre(o, 5, 30)).toBeLessThan(hauteurEntre(o, 170, 195));
  });
  it('effiler la fin amincit la fin, pas le début', () => {
    const o = strokeOutline(trait, { ...base, effilementFin: 1 });
    expect(hauteurEntre(o, 170, 195)).toBeLessThan(hauteurEntre(o, 5, 30));
  });
  it("l'élément garde l'effilement (seulement s'il vaut quelque chose)", () => {
    const opts = { stroke: '#000', ...base, effilementDebut: 0.5 };
    const el = elementDessin(trait, opts);
    expect(el.effilementDebut).toBe(0.5);
    expect(el).not.toHaveProperty('effilementFin');
    expect(dessinTrace(el).data).toBe(outlineToPathData(strokeOutline(pointsDe(el), opts)));
  });
});

describe('dessin : fusion du surligneur (lot 5)', () => {
  const pts = [{ x: 0, y: 0 }, { x: 60, y: 0 }];
  const opts = { stroke: '#ff0', strokeWidth: 30, smoothing: 0.5, opacity: 0.5 };

  it('le surligneur crée un trait en fusion produit, le pinceau non', () => {
    expect(elementDessin(pts, { ...opts, brushType: 'highlighter' }).fusion).toBe('multiply');
    expect(elementDessin(pts, { ...opts, brushType: 'brush' })).not.toHaveProperty('fusion');
  });
  it('dessinTrace rend la fusion ; absente ou inconnue = normale', () => {
    const el = elementDessin(pts, { ...opts, brushType: 'highlighter' });
    expect(dessinTrace(el).globalCompositeOperation).toBe('multiply');
    expect(dessinTrace({ ...el, fusion: null }).globalCompositeOperation).toBe('source-over');
    expect(fusionDe({ fusion: 'destination-out' })).toBe('source-over');
  });
});

describe('dessin : redessiner un trait (lot 6)', () => {
  const pts = [{ x: 100, y: 100 }, { x: 140, y: 130 }, { x: 200, y: 110 }];
  const opts = { stroke: '#000', strokeWidth: 6, smoothing: 0.5, thinning: 0 };
  // Position d'un point sur la PAGE : x/y, puis échelle et rotation du nœud
  const surPage = (el) => {
    const a = ((el.rotation || 0) * Math.PI) / 180;
    return pointsDe(el).map((p) => {
      const lx = p.x * (el.scaleX || 1);
      const ly = p.y * (el.scaleY || 1);
      return { x: el.x + lx * Math.cos(a) - ly * Math.sin(a), y: el.y + lx * Math.sin(a) + ly * Math.cos(a) };
    });
  };
  const proches = (a, b) => a.forEach((p, i) => {
    expect(p.x).toBeCloseTo(b[i].x, 6);
    expect(p.y).toBeCloseTo(b[i].y, 6);
  });

  it('mêmes réglages : rien ne bouge', () => {
    const el = elementDessin(pts, opts);
    expect(redessiner(el, {})).toMatchObject({ x: el.x, y: el.y, width: el.width, height: el.height, points: el.points });
  });
  it('plus épais : le cadre grandit, les points restent au même endroit de la page', () => {
    const el = elementDessin(pts, opts);
    const maj = { ...el, ...redessiner(el, { strokeWidth: 40 }) };
    expect(maj.strokeWidth).toBe(40);
    expect(maj.width).toBeGreaterThan(el.width);
    proches(surPage(maj), surPage(el));
    // et le cadre est celui qu'aurait eu un trait créé épais
    expect(maj.width).toBe(elementDessin(pts, { ...opts, strokeWidth: 40 }).width);
  });
  it('tourné et mis à l’échelle : le trait ne bouge pas non plus', () => {
    const el = { ...elementDessin(pts, opts), rotation: 35, scaleX: 1.5, scaleY: 0.8 };
    const maj = { ...el, ...redessiner(el, { strokeWidth: 30, effilementFin: 1 }) };
    proches(surPage(maj), surPage(el));
  });
  it('les pressions et la simplification ne sont pas touchées', () => {
    const el = elementDessin(pts.map((p) => ({ ...p, pressure: 0.3 })), { ...opts, pression: true });
    const u = redessiner(el, { strokeWidth: 20, simplification: 1 });
    expect(u).not.toHaveProperty('pressions');
    expect(u.points).toHaveLength(el.points.length);
  });
});

describe('contour à main levée d’un tracé (pointsDeformes)', () => {
  const trait = {
    id: 'trait1',
    type: 'dessin',
    x: 0,
    y: 0,
    points: Array.from({ length: 40 }, (_, i) => [i * 5, 20]).flat(),
    strokeWidth: 4,
    fill: '#000',
  };
  const style = { variation: 0.5, effilementDebut: 0, effilementFin: 0, ondulation: 1, ondes: 12, tremble: 0.5 };

  it('sans contourStyle, ou tremblé et ondulation à 0 : points inchangés', () => {
    const pts = pointsDe(trait);
    expect(pointsDeformes(pts, { strokeWidth: 4 }, 'trait1')).toBe(pts);
    expect(pointsDeformes(pts, { strokeWidth: 4, contourStyle: { ...style, ondulation: 0, tremble: 0 } }, 'x')).toBe(pts);
    expect(dessinTrace({ ...trait, contourStyle: null }).data).toBe(dessinTrace({ ...trait }).data);
  });

  it('déterministe, et la graine vient de l’id', () => {
    const a = dessinTrace({ ...trait, points: [...trait.points], contourStyle: style }).data;
    const b = dessinTrace({ ...trait, points: [...trait.points], contourStyle: style }).data;
    const c = dessinTrace({ ...trait, id: 'autre', points: [...trait.points], contourStyle: { ...style, ondulation: 0 } }).data;
    const d = dessinTrace({ ...trait, points: [...trait.points], contourStyle: { ...style, ondulation: 0 } }).data;
    expect(a).toBe(b);
    expect(c).not.toBe(d);
  });

  it('le cache suit les réglages sur le même tableau de points', () => {
    const el = { ...trait, points: [...trait.points] };
    const avant = dessinTrace(el).data;
    expect(dessinTrace({ ...el, contourStyle: style }).data).not.toBe(avant);
  });

  it('la pression du stylet est gardée par le rééchantillonnage', () => {
    const pts = [{ x: 0, y: 0, pressure: 0 }, { x: 100, y: 0, pressure: 1 }];
    const sortie = pointsDeformes(pts, { strokeWidth: 4, contourStyle: style }, 'p');
    expect(sortie.length).toBeGreaterThan(2);
    for (const p of sortie) expect(p.pressure).toBeGreaterThanOrEqual(0);
    expect(sortie[Math.floor(sortie.length / 2)].pressure).toBeCloseTo(0.5, 1);
  });

  it('redessiner agrandit le cadre pour l’ondulation, sans déplacer les points gardés', () => {
    const sans = redessiner(trait, {});
    const avec = redessiner(trait, { contourStyle: style });
    expect(avec.contourStyle).toEqual(style);
    expect(avec.height).toBeGreaterThan(sans.height);
    // mêmes points relatifs, décalés du même entier que le cadre
    const dy = avec.y - sans.y;
    expect(avec.points[1]).toBeCloseTo(sans.points[1] - dy, 5);
  });
});
