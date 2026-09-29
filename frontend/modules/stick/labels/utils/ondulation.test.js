import { describe, it, expect } from 'vitest';
import { onduler, ondulationDe, ONDULATION_DEFAUT } from './ondulation';
import { styleApplicable } from './styleCopie';

// Image de test : une colonne opaque au milieu, le reste transparent
const image = (w, h, colonne) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const i = (y * w + colonne) * 4;
    data.set([255, 0, 0, 255], i);
  }
  return { width: w, height: h, data };
};
const alpha = (img, x, y) => img.data[(y * img.width + x) * 4 + 3];

describe('ondulation : réglages', () => {
  it('absente, non-objet ou amplitude nulle = pas d’effet', () => {
    expect(ondulationDe({})).toBeNull();
    expect(ondulationDe({ ondulationEffet: 'x' })).toBeNull();
    expect(ondulationDe({ ondulationEffet: { amplitude: 0 } })).toBeNull();
  });
  it('bornée, sens inconnu = horizontale', () => {
    expect(ondulationDe({ ondulationEffet: { amplitude: 999, longueur: 1, sens: '?' } })).toEqual({
      amplitude: 50,
      longueur: 4,
      sens: 'horizontal',
    });
    expect(ondulationDe({ ondulationEffet: { ...ONDULATION_DEFAUT } })).toEqual(ONDULATION_DEFAUT);
  });
});

describe('ondulation : pixels', () => {
  it('horizontale : la colonne droite devient une onde, décalée selon la hauteur', () => {
    const img = onduler(image(40, 40, 20), { amplitude: 5, longueur: 40, sens: 'horizontal' });
    expect(alpha(img, 20, 0)).toBe(255); // phase 0 : pas de décalage
    expect(alpha(img, 25, 10)).toBe(255); // quart d'onde : +5 px
    expect(alpha(img, 20, 10)).toBe(0);
    expect(alpha(img, 15, 30)).toBe(255); // trois quarts : −5 px
  });
  it('verticale : une colonne verticale ne bouge pas de côté', () => {
    const img = onduler(image(40, 40, 20), { amplitude: 5, longueur: 40, sens: 'vertical' });
    expect(alpha(img, 20, 20)).toBe(255);
  });
  it('phase mesurée depuis le coin du contenu : même onde quelle que soit la résolution', () => {
    // Même contenu à ratio 1 et 2, marge de 3 unités : l'onde tombe au même endroit
    const a = onduler(image(40, 46, 23), { amplitude: 5, longueur: 40, sens: 'horizontal' }, 1, 3);
    const b = onduler(image(80, 92, 46), { amplitude: 5, longueur: 40, sens: 'horizontal' }, 2, 3);
    expect(alpha(a, 28, 13)).toBe(255); // unité 10 du contenu : +5
    expect(alpha(b, 56, 26)).toBe(255); // la même, à ratio 2
  });
  it('style copié d’un texte vers une image : l’ondulation suit', () => {
    const style = { type: 'text', props: { ondulationEffet: { amplitude: 4 } } };
    expect(styleApplicable(style, { type: 'image' })).toEqual({ ondulationEffet: { amplitude: 4 } });
  });
});
