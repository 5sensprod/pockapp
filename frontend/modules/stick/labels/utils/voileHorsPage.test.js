import { describe, expect, it } from 'vitest';
import { bandesHorsPage, estTransparente } from './voileHorsPage';

describe('bandesHorsPage', () => {
  it('couvre la scène sauf la page, sans chevauchement', () => {
    const scene = { width: 1000, height: 800 };
    const page = { x: 100, y: 50, width: 600, height: 400 };
    const bandes = bandesHorsPage(scene, page);
    expect(bandes).toEqual([
      { cle: 'haut', x: 0, y: 0, width: 1000, height: 50 },
      { cle: 'bas', x: 0, y: 450, width: 1000, height: 350 },
      { cle: 'gauche', x: 0, y: 50, width: 100, height: 400 },
      { cle: 'droite', x: 700, y: 50, width: 300, height: 400 },
    ]);
    const aire = bandes.reduce((s, b) => s + b.width * b.height, 0);
    expect(aire).toBe(1000 * 800 - 600 * 400);
  });

  it('omet les bandes vides quand la page touche un bord', () => {
    const bandes = bandesHorsPage({ width: 600, height: 500 }, { x: 0, y: 50, width: 600, height: 400 });
    expect(bandes.map((b) => b.cle)).toEqual(['haut', 'bas']);
  });

  it('borne une page plus grande que la scène', () => {
    expect(bandesHorsPage({ width: 100, height: 100 }, { x: -10, y: -10, width: 200, height: 200 })).toEqual([]);
  });
});

describe('estTransparente', () => {
  it('reconnaît les fonds transparents', () => {
    expect(estTransparente('rgba(0, 0, 0, 0)')).toBe(true);
    expect(estTransparente('transparent')).toBe(true);
    expect(estTransparente('rgb(243, 244, 246)')).toBe(false);
    expect(estTransparente('rgba(17, 24, 39, 1)')).toBe(false);
  });
});
