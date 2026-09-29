import { describe, expect, it } from 'vitest';
import {
  contourKonva,
  premiereCouleur,
  remplissageKonva,
  sanitizeGradient,
  versPeinture,
} from './paint';

const lineaire = {
  type: 'linear-gradient',
  angle: 90,
  stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }],
};
const radial = {
  type: 'radial-gradient',
  center: { x: 0.5, y: 0.5 },
  radius: 0.5,
  stops: [{ offset: 1, color: '#000000' }, { offset: 0, color: '#ffffff' }],
};

describe('versPeinture', () => {
  it('lit l’ancien { from, to, angle } : 0° vers la droite = 90° CSS', () => {
    expect(versPeinture({ from: '#ff0000', to: '#0000ff', angle: 0 })).toEqual(lineaire);
  });
  it('garde le modèle PocketStick, arrêts triés', () => {
    expect(versPeinture(radial).stops.map((s) => s.offset)).toEqual([0, 1]);
  });
  it('rejette l’illisible', () => {
    expect(versPeinture(null)).toBeNull();
    expect(versPeinture({ type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#f00' }] })).toBeNull();
    expect(sanitizeGradient({ ...lineaire, angle: 'x' })).toBeNull();
  });
  it('première couleur, quel que soit le format', () => {
    expect(premiereCouleur({ from: '#123456', to: '#fff' })).toBe('#123456');
    expect(premiereCouleur(radial)).toBe('#ffffff');
  });
});

describe('remplissageKonva', () => {
  it('uni : la couleur, dégradé éteint', () => {
    expect(remplissageKonva(null, 100, 50, '#abc')).toEqual({ fill: '#abc', fillPriority: 'color', textureRemplissage: null });
  });
  it('radial : centre et rayon à la taille du cadre', () => {
    const p = remplissageKonva(radial, 100, 50, '#abc');
    expect(p.fillPriority).toBe('radial-gradient');
    expect(p.fillRadialGradientStartPoint).toEqual({ x: 50, y: 25 });
  });
  it('origine au centre (ellipse) : points décalés', () => {
    const p = remplissageKonva(radial, 100, 50, '#abc', true);
    expect(p.fillRadialGradientStartPoint).toEqual({ x: 0, y: 0 });
  });
});

describe('contourKonva', () => {
  it('uni : la couleur, et le dégradé de contour explicitement retiré', () => {
    expect(contourKonva(null, 100, 50, '#000')).toEqual({ stroke: '#000', strokeLinearGradientColorStops: null, textureContour: null });
  });
  it('linéaire : de bord à bord', () => {
    const p = contourKonva(lineaire, 100, 50, '#000');
    expect(p.strokeLinearGradientStartPoint.x).toBeCloseTo(0);
    expect(p.strokeLinearGradientEndPoint.x).toBeCloseTo(100);
    expect(p.strokeLinearGradientColorStops).toEqual([0, '#ff0000', 1, '#0000ff']);
  });
  it('un radial y est rendu en linéaire (Konva ne sait pas mieux)', () => {
    expect(contourKonva(radial, 100, 50, '#000').strokeLinearGradientColorStops).toHaveLength(4);
  });
});

import { DEFAULT_TEXTURE_PAINT, estPeinture, isGradient, isTexture, paintToCss } from './paint';

describe('peinture texture', () => {
  it('troisième format : validé, sans toucher aux deux dégradés', () => {
    const t = versPeinture(DEFAULT_TEXTURE_PAINT);
    expect(isTexture(t)).toBe(true);
    expect(isGradient(t)).toBe(false);
    expect(estPeinture(t)).toBe(true);
    expect(t.noise).toMatchObject({ type: 'perlin', seed: 1 });
    expect(sanitizeGradient({ ...DEFAULT_TEXTURE_PAINT, noise: { type: 'plasma' } })).toBeNull();
  });
  it('hors navigateur : repli sur la couleur (pas de motif)', () => {
    expect(remplissageKonva(DEFAULT_TEXTURE_PAINT, 100, 50, '#abc')).toMatchObject({ fill: '#abc', fillPriority: 'color' });
    expect(contourKonva(DEFAULT_TEXTURE_PAINT, 100, 50, '')).toMatchObject({ stroke: '#1e3a8a' });
    expect(paintToCss(DEFAULT_TEXTURE_PAINT)).toMatch(/^linear-gradient\(90deg/);
  });
});

import { composerCouleur, decomposerCouleur } from './paint';

describe('opacité des arrêts', () => {
  it('lit #rgb, #rrggbb, #rrggbbaa et rgba()', () => {
    expect(decomposerCouleur('#f00')).toEqual({ hex: '#ff0000', alpha: 1 });
    expect(decomposerCouleur('#EC489980').alpha).toBeCloseTo(0.502, 2);
    expect(decomposerCouleur('rgba(37, 99, 235, 0)')).toEqual({ hex: '#2563eb', alpha: 0 });
  });
  it('compose : opaque en #rrggbb, sinon #rrggbbaa', () => {
    expect(composerCouleur('#EC4899', 1)).toBe('#ec4899');
    expect(composerCouleur('#ec4899', 0.5)).toBe('#ec489980');
    expect(sanitizeGradient({ type: 'linear-gradient', angle: 0, stops: [
      { offset: 0, color: '#ec489980' }, { offset: 1, color: '#000000' },
    ] })?.stops[0].color).toBe('#ec489980');
  });
});
