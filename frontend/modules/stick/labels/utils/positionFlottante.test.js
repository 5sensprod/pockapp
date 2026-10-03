import { describe, it, expect } from 'vitest';
import { positionFlottante } from './positionFlottante';

const ecran = { width: 1366, height: 768 };
const bouton = (left, top = 60) => ({ left, top, bottom: top + 30 });

describe('positionFlottante', () => {
  it('sous le bouton, alignée à gauche, quand tout tient', () => {
    const p = positionFlottante(bouton(200), { width: 256, height: 300 }, ecran);
    expect(p).toMatchObject({ top: 96, left: 200, auDessus: false });
    expect(p.maxHeight).toBe(768 - 96 - 8);
  });

  it('ramenée dans l’écran à droite, selon SA largeur (pas 300 px en dur)', () => {
    expect(positionFlottante(bouton(1300), { width: 256, height: 100 }, ecran).left).toBe(1366 - 256 - 8);
    expect(positionFlottante(bouton(1300), { width: 420, height: 100 }, ecran).left).toBe(1366 - 420 - 8);
  });

  it('jamais hors de l’écran à gauche', () => {
    expect(positionFlottante(bouton(-40), { width: 256, height: 100 }, ecran).left).toBe(8);
    // fenêtre plus large que l'écran : collée à gauche
    expect(positionFlottante(bouton(10), { width: 2000, height: 100 }, ecran).left).toBe(8);
  });

  it('trop haute : sa hauteur est bornée à la place disponible, elle défile', () => {
    const p = positionFlottante(bouton(200), { width: 256, height: 1200 }, ecran);
    expect(p.auDessus).toBe(false);
    expect(p.top + p.maxHeight).toBe(768 - 8);
  });

  it('bouton en bas d’écran : au-dessus, collée au bouton', () => {
    const p = positionFlottante(bouton(200, 700), { width: 256, height: 300 }, ecran);
    expect(p.auDessus).toBe(true);
    expect(p.top).toBe(700 - 6 - 300);
    expect(p.maxHeight).toBe(700 - 6 - 8);
  });

  it('au-dessus mais trop haute : bornée, sans sortir par le haut', () => {
    const p = positionFlottante(bouton(200, 700), { width: 256, height: 2000 }, ecran);
    expect(p.top).toBe(8);
    expect(p.maxHeight).toBe(686);
  });
});
