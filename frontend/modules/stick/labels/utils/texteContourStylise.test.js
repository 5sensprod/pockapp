import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contourLettresDemande, geometrieContourLettres, ondesDuContour, propsContourLettres, GRAS_FABRIQUE, PENTE_ITALIQUE } from './texteContourStylise';
import { CONTOUR_STYLISE_DEFAUT } from './contourStylise';

describe('contourLettresDemande', () => {
  it('réglages, épaisseur ET couleur', () => {
    const base = { contourStyle: { ...CONTOUR_STYLISE_DEFAUT }, strokeWidth: 2, stroke: '#000' };
    expect(contourLettresDemande(base)).toBe(true);
    expect(contourLettresDemande({ ...base, contourStyle: null })).toBe(false);
    expect(contourLettresDemande({ ...base, strokeWidth: 0 })).toBe(false);
    expect(contourLettresDemande({ ...base, stroke: '' })).toBe(false);
    expect(contourLettresDemande({ ...base, stroke: '', strokeGradient: { from: '#000', to: '#fff' } })).toBe(true);
  });
});

describe('ondesDuContour', () => {
  it('proportionnelles à la longueur : un grand contour ondule plus, au même rythme', () => {
    expect(ondesDuContour(40, 40, 4)).toBe(1);
    expect(ondesDuContour(400, 40, 4)).toBe(10);
    expect(ondesDuContour(400, 40, 12)).toBe(30);
    expect(ondesDuContour(1, 40, 1)).toBe(1); // jamais zéro
  });
});

describe('propsContourLettres', () => {
  const chargee = { police: {}, graisse: 400, italique: false, cle: 'x' };
  it('gras et italique FABRIQUÉS par le navigateur : épaississement et pente', () => {
    const p = propsContourLettres({ chargee, gras: true, italique: true, stroke: '#f00', ep: 2, fontSize: 60, contourStyle: {}, id: 'a' });
    expect(p.strokeEnabled).toBe(false);
    expect(p.contourLettres.ep).toBeCloseTo(2 + 60 * GRAS_FABRIQUE);
    expect(p.contourLettres.inclinaison).toBe(PENTE_ITALIQUE);
  });
  it('vrais fichiers gras et italique : rien à fabriquer', () => {
    const p = propsContourLettres({ chargee: { ...chargee, graisse: 700, italique: true }, gras: true, italique: true, stroke: '#f00', ep: 2, fontSize: 60, contourStyle: {}, id: 'a' });
    expect(p.contourLettres.ep).toBe(2);
    expect(p.contourLettres.inclinaison).toBe(0);
  });
});

const ARIAL = 'C:/Windows/Fonts/arial.ttf';
describe.skipIf(!existsSync(ARIAL))('geometrieContourLettres (Arial du poste)', () => {
  it('un trait par contour — « o » en a deux, « l » un —, déterministe', async () => {
    const opentype = await import('opentype.js');
    const police = opentype.parse(readFileSync(ARIAL).buffer);
    const args = {
      police,
      positions: [{ c: 'o', x: 0, y: 20, angle: 0 }, { c: 'l', x: 30, y: 20, angle: 0 }, { c: ' ', x: 40, y: 20, angle: 0 }],
      fontSize: 40,
      decalAlpha: 10,
      inclinaison: 0,
      ep: 2,
      contourStyle: { ...CONTOUR_STYLISE_DEFAUT, ondulation: 0.5 },
      id: 'el-1',
    };
    const g = geometrieContourLettres(args);
    expect(g.traits).toHaveLength(3);
    expect(g.absentes).toEqual([]);
    expect(g.cadre.width).toBeGreaterThan(30);
    expect(geometrieContourLettres(args).traits).toEqual(g.traits); // même dessin à l'écran et à l'export
    expect(geometrieContourLettres({ ...args, id: 'el-2' }).traits).not.toEqual(g.traits);
  });
});
