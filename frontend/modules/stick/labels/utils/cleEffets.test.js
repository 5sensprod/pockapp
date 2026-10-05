import { describe, expect, it } from 'vitest';
import { cleEffets } from './cleEffets';

const el = { id: 'a', type: 'text', text: 'Titre', x: 10, y: 20, rotation: 0, innerShadowEnabled: true, innerShadowBlur: 8 };

describe('cleEffets', () => {
  it('ignore ce qui déplace sans changer les pixels', () => {
    expect(cleEffets({ ...el, x: 99, y: -3, rotation: 45, locked: true }, 2)).toBe(cleEffets(el, 2));
  });
  it("change avec un réglage d'effet, le contenu ou la taille", () => {
    const k = cleEffets(el, 2);
    expect(cleEffets({ ...el, innerShadowBlur: 9 }, 2)).not.toBe(k);
    expect(cleEffets({ ...el, text: 'Autre' }, 2)).not.toBe(k);
    expect(cleEffets({ ...el, width: 300 }, 2)).not.toBe(k);
    expect(cleEffets({ ...el, scaleX: 2 }, 2)).not.toBe(k);
  });
  it("change avec la source d'une image : un détourage invalide le cache des effets", () => {
    const photo = { id: 'p', type: 'image', src: 'data:image/jpeg;base64,AAAA', shadowBlur: 8 };
    expect(cleEffets({ ...photo, src: 'data:image/png;base64,BBBB' }, 2)).not.toBe(cleEffets(photo, 2));
  });
  it('change avec la résolution et la signature du nœud', () => {
    expect(cleEffets(el, 3)).not.toBe(cleEffets(el, 2));
    expect(cleEffets(el, 2, '120x40')).not.toBe(cleEffets(el, 2, '121x40'));
  });
  it("ne dépend pas de l'ordre des champs", () => {
    expect(cleEffets({ innerShadowBlur: 8, ...el }, 2)).toBe(cleEffets(el, 2));
  });
});
