import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { commandesLettres, comparerMasques, positionsCourbes, positionsDroites } from './contourLettres';

// Mesure factice : 10 par lettre, et l'approche « AV » retire 2.
const mesurer = (t) => Array.from(t).length * 10 - (t.includes('AV') ? 2 : 0);
const base = { largeur: 100, hauteur: 40, fontSize: 20, lineHeight: 1, mesurer };

describe('positionsDroites', () => {
  it('ligne entière : la lettre finit où finit le texte qui la contient (approche comprise)', () => {
    const pos = positionsDroites({ ...base, lignes: [{ text: 'AVA', width: 28 }] });
    expect(pos.map((p) => p.x)).toEqual([0, 8, 18]); // le V recule de l'approche « AV »
    expect(pos[0].y).toBe(10); // milieu de la première ligne
  });

  it('interlettrage : lettre par lettre, comme Konva', () => {
    const pos = positionsDroites({ ...base, letterSpacing: 3, lignes: [{ text: 'AB', width: 26 }] });
    expect(pos.map((p) => p.x)).toEqual([0, 13]);
  });

  it('alignement centré et droit, lignes suivantes', () => {
    const lignes = [{ text: 'AB', width: 20 }, { text: 'C', width: 10 }];
    expect(positionsDroites({ ...base, align: 'center', lignes }).map((p) => [p.x, p.y])).toEqual([[40, 10], [50, 10], [45, 30]]);
    expect(positionsDroites({ ...base, align: 'right', lignes })[2].x).toBe(90);
  });

  it('justification : les espaces reçoivent le reste, pas la dernière ligne', () => {
    const lignes = [{ text: 'A B', width: 30 }, { text: 'C D', width: 30, lastInParagraph: true }];
    const pos = positionsDroites({ ...base, align: 'justify', lignes });
    expect(pos[2].x).toBe(90); // 70 de reste sur un espace
    expect(pos[5].x).toBe(20);
  });
});

describe('positionsCourbes', () => {
  it('courbure faible : proche de la ligne droite', () => {
    const pos = positionsCourbes({ ...base, curve: 1, lignes: [{ text: 'AB', width: 20 }] });
    expect(pos[0].x).toBeCloseTo(0, 0);
    expect(pos[1].x).toBeCloseTo(10, 0);
  });
});

const ARIAL = 'C:/Windows/Fonts/arial.ttf';
describe.skipIf(!existsSync(ARIAL))('commandesLettres (Arial du poste)', () => {
  it('pose chaque lettre à sa position, ligne alphabétique décalée', async () => {
    const opentype = await import('opentype.js');
    const police = opentype.parse(readFileSync(ARIAL).buffer);
    const cmds = commandesLettres(police, [{ c: 'H', x: 50, y: 10, angle: 0 }, { c: ' ', x: 70, y: 10, angle: 0 }], {
      fontSize: 100,
      decalAlpha: 30,
    });
    const xs = cmds.filter((c) => 'x' in c).map((c) => c.x);
    const ys = cmds.filter((c) => 'y' in c).map((c) => c.y);
    // H d'Arial : jambage gauche vers x=16 (pour 100 px), hauteur 71,6.
    expect(Math.min(...xs)).toBeGreaterThan(50);
    expect(Math.max(...ys)).toBeCloseTo(40, 0); // ligne alphabétique = 10 + 30
    expect(Math.min(...ys)).toBeCloseTo(40 - 71.6, 0);
  });
});

describe('comparerMasques', () => {
  const masque = (w, h, plein) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (plein(x, y)) d[(y * w + x) * 4 + 3] = 255;
    return d;
  };
  it('identiques : IoU 1, écart 0', () => {
    const a = masque(20, 20, (x, y) => x >= 5 && x < 15 && y >= 5 && y < 15);
    const r = comparerMasques(a, a, 20, 20, 1);
    expect(r.iou).toBe(1);
    expect(r.ecartMoyen).toBe(0);
  });
  it('décalé d’un pixel : écart du cadre et bande mesurés', () => {
    const a = masque(20, 20, (x, y) => x >= 5 && x < 15 && y >= 5 && y < 15);
    const b = masque(20, 20, (x, y) => x >= 6 && x < 16 && y >= 5 && y < 15);
    const r = comparerMasques(a, b, 20, 20, 1);
    expect(r.cadre).toEqual([1, 0, 1, 0]);
    expect(r.ecartMoyen).toBeCloseTo(20 / 36, 3);
  });
});
