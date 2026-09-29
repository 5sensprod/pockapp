import { describe, expect, it } from 'vitest';
import { cleGeste, prolongeGeste } from './gesteHistorique';

describe('gesteHistorique', () => {
  const cle = cleGeste('a', { innerShadowBlur: 3 });
  it('prolonge un geste sur le même élément et les mêmes champs', () => {
    expect(prolongeGeste({ cle, t: 1000 }, cle, 1400)).toBe(true);
  });
  it("s'arrête après le délai, sur un autre champ ou un autre élément", () => {
    expect(prolongeGeste({ cle, t: 1000 }, cle, 1700)).toBe(false);
    expect(prolongeGeste({ cle, t: 1000 }, cleGeste('a', { color: '#fff' }), 1100)).toBe(false);
    expect(prolongeGeste({ cle, t: 1000 }, cleGeste('b', { innerShadowBlur: 3 }), 1100)).toBe(false);
    expect(prolongeGeste(null, cle, 1100)).toBe(false);
  });
  it("ne dépend pas de l'ordre des champs", () => {
    expect(cleGeste('a', { x: 1, y: 2 })).toBe(cleGeste('a', { y: 2, x: 1 }));
  });
});
