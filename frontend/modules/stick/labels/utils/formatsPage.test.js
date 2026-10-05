import { describe, it, expect } from 'vitest';
import { FORMATS_PAGE, enMm, enPt, formatDeLaPage, miniatureFormat, mmAffiche } from './formatsPage';

describe('points ↔ millimètres', () => {
  it('une feuille A4 fait 210 × 297 mm', () => {
    expect(enMm(595)).toBe(210);
    expect(enMm(842)).toBe(297);
  });
  it('et 210 × 297 mm redonnent les points du store', () => {
    expect(enPt(210)).toBe(595);
    expect(enPt(297)).toBe(842);
    expect(enPt(148)).toBe(420);
  });
  it('les marges d’une planche : 0 à 50 pt, soit 0 à 17,6 mm', () => {
    expect(enMm(50, 1)).toBe(17.6);
    expect(enMm(0, 1)).toBe(0);
    expect(enPt(5)).toBe(14);
  });
  it('une marge entière en points survit à l’aller-retour par le dixième de mm', () => {
    for (let pt = 0; pt <= 50; pt += 1) expect(enPt(enMm(pt, 1))).toBe(pt);
  });
  it('à l’écran, une feuille A4 ou A5 se lit en millimètres ronds', () => {
    expect([595, 842, 420].map(mmAffiche)).toEqual([210, 297, 148]);
  });
  it('une taille libre garde son dixième, et ce qu’on lit redonne les mêmes points', () => {
    expect(mmAffiche(285)).toBe(100.5);
    for (const pt of [189, 285, 500, 1080]) expect(enPt(mmAffiche(pt))).toBe(pt);
  });
  it('rien de saisi : rien', () => {
    expect(enMm(null)).toBeNull();
    expect(enPt('')).toBeNull();
  });
});

describe('formats de page', () => {
  it('douze formats, aux dimensions d’avant', () => {
    expect(FORMATS_PAGE).toHaveLength(12);
    expect(FORMATS_PAGE.find((f) => f.id === 'instagram-story')).toMatchObject({ width: 1080, height: 1920 });
    expect(FORMATS_PAGE.filter((f) => f.papier).map((f) => f.id)).toEqual(['a4-portrait', 'a4-landscape', 'a5-portrait', 'a5-landscape']);
  });
  it('retrouve le format de la page, ou rien pour une taille libre', () => {
    expect(formatDeLaPage({ width: 842, height: 595 })?.id).toBe('a4-landscape');
    expect(formatDeLaPage({ width: 300, height: 200 })).toBeNull();
    expect(formatDeLaPage(undefined)).toBeNull();
  });
  it('la miniature a les proportions du format', () => {
    const de = (id) => miniatureFormat(FORMATS_PAGE.find((f) => f.id === id));
    expect(de('a4-portrait')).toEqual({ width: 23, height: 32 });
    expect(de('a4-landscape')).toEqual({ width: 32, height: 23 });
    expect(de('instagram-post')).toEqual({ width: 32, height: 32 });
    expect(de('instagram-story')).toEqual({ width: 18, height: 32 });
    expect(de('banner')).toEqual({ width: 32, height: 11 });
  });
  it('quatre formats portent le logo de leur réseau', () => {
    expect(FORMATS_PAGE.filter((f) => f.reseau).map((f) => f.reseau)).toEqual(['instagram', 'instagram', 'facebook', 'x']);
  });
});
