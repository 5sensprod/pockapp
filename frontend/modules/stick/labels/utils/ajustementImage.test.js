// frontend/modules/stick/labels/utils/ajustementImage.test.js
//
// Ce que garde ce fichier : en Contenir, la photo entière tient dans le cadre,
// centrée, sans déformation — quelles que soient ses proportions.
import { describe, expect, it } from 'vitest';
import { estContenu, rectContenu } from './ajustementImage';

describe('rectContenu', () => {
  it('photo en largeur dans un cadre carré : marges en haut et en bas', () => {
    expect(rectContenu(100, 100, 400, 200)).toEqual({ x: 0, y: 25, width: 100, height: 50 });
  });
  it('photo en hauteur dans un cadre carré : marges à gauche et à droite', () => {
    expect(rectContenu(100, 100, 200, 400)).toEqual({ x: 25, y: 0, width: 50, height: 100 });
  });
  it('mêmes proportions : le cadre entier', () => {
    expect(rectContenu(300, 150, 600, 300)).toEqual({ x: 0, y: 0, width: 300, height: 150 });
  });
  it('proportions gardées', () => {
    const r = rectContenu(120, 340, 1234, 567);
    expect(r.width / r.height).toBeCloseTo(1234 / 567, 9);
    expect(r.width).toBeLessThanOrEqual(120);
    expect(r.height).toBeLessThanOrEqual(340);
  });
  it('taille inconnue : le cadre', () => {
    expect(rectContenu(80, 40, 0, 0)).toEqual({ x: 0, y: 0, width: 80, height: 40 });
  });
});

describe('estContenu', () => {
  it("un template ancien (sans `fit`) reste en Remplir", () => {
    expect(estContenu({ type: 'image' })).toBe(false);
    expect(estContenu({ type: 'image', fit: 'contain' })).toBe(true);
  });
});
