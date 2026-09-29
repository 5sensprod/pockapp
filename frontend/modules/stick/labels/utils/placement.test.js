import { describe, expect, it } from 'vitest';
import {
  PAS_DECALAGE,
  eviterSuperposition,
  placerAuCentre,
  positionCentree,
  tailleInitiale,
} from './placement';

const canvas = { width: 400, height: 300 };

describe('tailleInitiale', () => {
  it('forme, image, code-barres : leur cadre', () => {
    expect(tailleInitiale({ type: 'shape', width: 100, height: 50 })).toEqual({ width: 100, height: 50 });
  });
  it('QR : un carré de côté size (160 par défaut)', () => {
    expect(tailleInitiale({ type: 'qrcode', size: 80 })).toEqual({ width: 80, height: 80 });
    expect(tailleInitiale({ type: 'qrcode' })).toEqual({ width: 160, height: 160 });
  });
  it('texte : la mesure injectée', () => {
    const mesure = () => ({ width: 120, height: 20 });
    expect(tailleInitiale({ type: 'text', text: 'x' }, mesure)).toEqual({ width: 120, height: 20 });
  });
  it('texte sans mesure : repli sur la taille de police', () => {
    expect(tailleInitiale({ type: 'text', fontSize: 24 })).toEqual({ width: 0, height: 24 });
  });
});

describe('positionCentree', () => {
  it('centre le cadre dans le canvas actuel', () => {
    expect(positionCentree({ width: 100, height: 50 }, canvas)).toEqual({ x: 150, y: 125 });
  });
  it('un cadre plus grand que le canvas déborde également des deux côtés', () => {
    expect(positionCentree({ width: 600, height: 300 }, canvas)).toEqual({ x: -100, y: 0 });
  });
});

describe('eviterSuperposition', () => {
  it('ne bouge pas une place libre', () => {
    expect(eviterSuperposition({ x: 10, y: 10 }, [{ x: 10, y: 11 }])).toEqual({ x: 10, y: 10 });
  });
  it('décale en diagonale tant que la place est prise', () => {
    const pris = [{ x: 10, y: 10 }, { x: 10 + PAS_DECALAGE, y: 10 + PAS_DECALAGE }];
    expect(eviterSuperposition({ x: 10, y: 10 }, pris)).toEqual({
      x: 10 + 2 * PAS_DECALAGE,
      y: 10 + 2 * PAS_DECALAGE,
    });
  });
  it('plafonne le décalage', () => {
    const pris = Array.from({ length: 100 }, (_, i) => ({ x: i * PAS_DECALAGE, y: i * PAS_DECALAGE }));
    expect(eviterSuperposition({ x: 0, y: 0 }, pris).x).toBeLessThanOrEqual(20 * PAS_DECALAGE);
  });
});

describe('placerAuCentre', () => {
  it('une taille imposée (fiche) prime sur le cadre de l’élément', () => {
    const pos = placerAuCentre({ type: 'fiche', width: 100 }, { canvas, taille: { width: 100, height: 100 } });
    expect(pos).toEqual({ x: 150, y: 100 });
  });
  it('deux ajouts identiques ne se superposent pas', () => {
    const el = { type: 'shape', width: 100, height: 50 };
    const premier = placerAuCentre(el, { canvas, elements: [] });
    const second = placerAuCentre(el, { canvas, elements: [{ ...el, ...premier }] });
    expect(second).toEqual({ x: premier.x + PAS_DECALAGE, y: premier.y + PAS_DECALAGE });
  });
});

import { cadreDuCanvas, fondDe } from './placement';

describe('remplir le canvas', () => {
  it('toute la surface, sans rotation ni échelle', () => {
    expect(cadreDuCanvas({ type: 'image', rotation: 30, scaleX: 2 }, { width: 400, height: 300 })).toEqual({
      x: 0, y: 0, width: 400, height: 300, rotation: 0, scaleX: 1, scaleY: 1,
    });
  });
  it('un QR reste carré, centré', () => {
    expect(cadreDuCanvas({ type: 'qrcode' }, { width: 400, height: 300 })).toMatchObject({ x: 50, y: 0, size: 300 });
  });
  it('le fond est l’élément marqué', () => {
    expect(fondDe([{ id: 'a' }, { id: 'b', role: 'fond' }])?.id).toBe('b');
    expect(fondDe([])).toBeNull();
  });
});
