import { describe, expect, it, vi } from 'vitest';
import { MASQUES, dessinParticulier, masqueDe, sceneImage } from './imageForme';
import { contourTexte } from './fillStyle';
import { extraireStyle } from './styleCopie';

describe('miroir et masque', () => {
  it('les huit formes de PocketStick', () => {
    expect(MASQUES.map((m) => m.id)).toEqual([
      'circle', 'rounded', 'triangle', 'star', 'heart', 'hexagon', 'arch', 'diamond',
    ]);
  });
  it('sans miroir ni masque : dessin normal de Konva', () => {
    expect(sceneImage({})).toBeUndefined();
    expect(dessinParticulier({ type: 'image' })).toBe(false);
    expect(masqueDe({ mask: 'inconnu' })).toBeNull();
  });
  it('miroir : le repère est retourné, puis Konva dessine', () => {
    const ctx = { save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn() };
    const shape = { width: () => 100, height: () => 40, _sceneFunc: vi.fn() };
    sceneImage({ flipX: true })(ctx, shape);
    expect(ctx.translate).toHaveBeenCalledWith(100, 0);
    expect(ctx.scale).toHaveBeenCalledWith(-1, 1);
    expect(shape._sceneFunc).toHaveBeenCalledWith(ctx);
    expect(ctx.restore).toHaveBeenCalled();
  });
  it('le miroir n’est pas un style à copier, le masque si', () => {
    const { props } = extraireStyle({ id: 'i', type: 'image', flipX: true, mask: 'star' });
    expect(props).toEqual({ mask: 'star' });
  });
});

describe('contourTexte', () => {
  it('sans épaisseur : pas de contour, dégradé retiré', () => {
    expect(contourTexte('#000', 0, null, 100, 20)).toEqual({
      strokeEnabled: false,
      strokeLinearGradientColorStops: null,
    });
  });
  it('avec épaisseur : trait autour des lettres, remplissage par-dessus', () => {
    expect(contourTexte('#f00', 2, null, 100, 20)).toMatchObject({
      strokeEnabled: true,
      strokeWidth: 2,
      stroke: '#f00',
      fillAfterStrokeEnabled: true,
    });
  });
});
