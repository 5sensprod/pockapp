import { describe, expect, it } from 'vitest';
import { TYPES_TEXTURE, carteNiveaux, niveauTexture, sanitizeTexture } from './bruit';
import { resolutionCarte } from './carteTexture';
import { dessinParticulier, retraitMasque, sceneImage } from './imageForme';

const tex = (type, plus = {}) => sanitizeTexture({ type, ...plus });

describe('textures paramétriques', () => {
  it('rejette ce qui n’est pas une texture, borne le reste', () => {
    expect(sanitizeTexture(null)).toBeNull();
    expect(sanitizeTexture({ type: 'plasma' })).toBeNull();
    expect(tex('perlin', { scale: 1e9, octaves: 99, threshold: -3 })).toMatchObject({
      scale: 64,
      octaves: 6,
      threshold: 0,
    });
  });

  it.each(TYPES_TEXTURE.map((t) => t.id))('%s : dans [0, 1], déterministe par graine', (type) => {
    const t = tex(type, { seed: 42 });
    const a = carteNiveaux(t, 32, 32);
    expect(carteNiveaux(t, 32, 32)).toEqual(a);
    expect(carteNiveaux({ ...t, seed: 43 }, 32, 32)).not.toEqual(a);
    for (let i = 0; i < 200; i++) {
      const n = niveauTexture(t, Math.random(), Math.random(), 1.5);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });

  it('le motif ne dépend pas de la résolution (écran = export)', () => {
    const t = tex('perlin', { seed: 7 });
    const petite = carteNiveaux(t, 64, 64);
    const grande = carteNiveaux(t, 256, 256);
    // pixel (i, j) de la petite = centre du bloc 4 × 4 de la grande : proches
    let ecart = 0;
    for (let j = 0; j < 64; j++)
      for (let i = 0; i < 64; i++) ecart = Math.max(ecart, Math.abs(petite[j * 64 + i] - grande[(j * 4 + 2) * 256 + i * 4 + 2]));
    expect(ecart).toBeLessThan(12);
  });

  it('inverser donne le complément', () => {
    const t = tex('voronoi', { seed: 3 });
    expect(niveauTexture({ ...t, invert: true }, 0.3, 0.6)).toBeCloseTo(1 - niveauTexture(t, 0.3, 0.6));
  });

  it('résolution des cartes : paliers de 64, plafonnés', () => {
    expect(resolutionCarte(1)).toBe(64);
    expect(resolutionCarte(130)).toBe(192);
    expect(resolutionCarte(5000)).toBe(1024);
    expect(resolutionCarte(5000, 2048)).toBe(2048);
  });
});

describe('retrait et texture du masque', () => {
  it('retrait en % du cadre, borné à 40', () => {
    expect(retraitMasque({})).toBe(0);
    expect(retraitMasque({ maskPadding: 10 })).toBeCloseTo(0.1);
    expect(retraitMasque({ maskPadding: 90 })).toBeCloseTo(0.4);
  });
  it('une texture seule suffit à un dessin particulier', () => {
    expect(dessinParticulier({ maskTexture: { type: 'perlin' } })).toBe(true);
    expect(sceneImage({ maskTexture: { type: 'perlin' } })).toBeTypeOf('function');
    expect(sceneImage({ maskTexture: { type: 'inconnu' } })).toBeUndefined();
  });
});

describe('fondu du masque', () => {
  it('en % du plus petit côté, borné à 25', async () => {
    const { fonduMasque } = await import('./imageForme');
    expect(fonduMasque({})).toBe(0);
    expect(fonduMasque({ maskFeather: 10 })).toBeCloseTo(0.1);
    expect(fonduMasque({ maskFeather: 80 })).toBeCloseTo(0.25);
    expect(dessinParticulier({ maskFeather: 5 })).toBe(true);
    expect(sceneImage({ maskFeather: 5 })).toBeTypeOf('function');
  });
});
