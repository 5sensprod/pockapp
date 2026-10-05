import { describe, expect, it } from 'vitest';
import { SANS_DELAI, cleGeste, cleGesteTenu, memeOrdre, nouveauGeste, pasDuGesteTenu, prolongeGeste } from './gesteHistorique';

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

describe('geste tenu (glisser)', () => {
  const cle = cleGesteTenu('ordre', 1);
  it('se prolonge sans délai, mais pas d’un glisser au suivant', () => {
    expect(prolongeGeste({ cle, t: 1000 }, cle, 60_000, SANS_DELAI)).toBe(true);
    expect(prolongeGeste({ cle, t: 1000 }, cleGesteTenu('ordre', 2), 1001, SANS_DELAI)).toBe(false);
    expect(nouveauGeste()).not.toBe(nouveauGeste());
  });
  it('un pas au premier changement, retiré si l’on revient au départ', () => {
    expect(pasDuGesteTenu({ pose: false, revenu: false })).toBe('poser');
    expect(pasDuGesteTenu({ pose: true, revenu: false })).toBe('rien');
    expect(pasDuGesteTenu({ pose: true, revenu: true })).toBe('retirer');
    expect(pasDuGesteTenu({ pose: false, revenu: true })).toBe('rien');
  });
  it('compare l’ordre par les identifiants', () => {
    const [a, b] = [{ id: 'a' }, { id: 'b' }];
    expect(memeOrdre([a, b], [{ id: 'a' }, { id: 'b' }])).toBe(true);
    expect(memeOrdre([a, b], [b, a])).toBe(false);
    expect(memeOrdre([a, b], [a])).toBe(false);
  });
});
