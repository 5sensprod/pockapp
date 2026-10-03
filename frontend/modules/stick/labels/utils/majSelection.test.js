import { describe, it, expect } from 'vitest';
import { ciblesDe, majDeSelection, majPourAutre, partStyle } from './majSelection';
import { cleGeste } from './gesteHistorique';

const t1 = { id: 't1', type: 'text' };
const t2 = { id: 't2', type: 'text' };
const t3 = { id: 't3', type: 'text', locked: true };
const f1 = { id: 'f1', type: 'shape' };
const d1 = { id: 'd1', type: 'dessin' };
const d2 = { id: 'd2', type: 'dessin' };
const etat = { elements: [t1, t2, t3, f1, d1, d2], selectedId: 't1', extraIds: ['t2', 't3', 'f1'] };

describe('ciblesDe', () => {
  it('même type : la sélection de ce type, verrouillés exclus, le principal en premier', () => {
    expect(ciblesDe(etat, t1).map((e) => e.id)).toEqual(['t1', 't2']);
  });
  it('tout type (les effets) : toute la sélection non verrouillée', () => {
    expect(ciblesDe(etat, t1, false).map((e) => e.id)).toEqual(['t1', 't2', 'f1']);
  });
  it('un élément seul, ou hors sélection : lui seul', () => {
    expect(ciblesDe({ elements: [t1, t2], selectedId: 't1', extraIds: [] }, t1).map((e) => e.id)).toEqual(['t1']);
    expect(ciblesDe(etat, null)).toEqual([]);
  });
});

describe('ce qui se partage : le style, pas la géométrie ni le contenu', () => {
  it('partStyle retire position, taille, texte, points…', () => {
    expect(partStyle({ align: 'center', width: 240, x: 3, text: 'a', fontSize: 20 })).toEqual({ align: 'center', fontSize: 20 });
    expect(partStyle({ x: 1, y: 2, points: [], pointsLibres: [], traceLibre: {} })).toEqual({});
  });
  it('le principal reçoit tout ; les autres la part de style', () => {
    const parId = majDeSelection(etat, t1, { align: 'center', width: 240 });
    expect(parId).toEqual({ t1: { align: 'center', width: 240 }, t2: { align: 'center' } });
  });
  it('une mise à jour de pure géométrie ne touche que le principal', () => {
    expect(majDeSelection(etat, t1, { width: undefined, x: 4 })).toEqual({ t1: { width: undefined, x: 4 } });
  });
  it('les effets vont à tous les types sélectionnés', () => {
    const parId = majDeSelection(etat, t1, { shadowOffsetX: 4, shadowOffsetY: 4 }, { memeType: false });
    expect(Object.keys(parId)).toEqual(['t1', 't2', 'f1']);
  });
});

describe('un tracé est REDESSINÉ pour lui-même', () => {
  const sel = { elements: [d1, d2], selectedId: 'd1', extraIds: ['d2'] };
  // ce que rend `redessiner` pour le principal : le réglage, plus SON cadre et SES points
  const majPrincipal = { strokeWidth: 9, x: 10, y: 20, width: 100, height: 50, points: [0, 0, 5, 5] };
  const redessiner = (el, m) => ({ ...m, x: 1, y: 2, width: 3, height: 4, points: [`points de ${el.id}`] });

  it('l’autre tracé reçoit le réglage rejoué sur ses propres points, jamais ceux du principal', () => {
    const parId = majDeSelection(sel, d1, majPrincipal, { redessiner });
    expect(parId.d1).toBe(majPrincipal);
    expect(parId.d2).toEqual({ strokeWidth: 9, x: 1, y: 2, width: 3, height: 4, points: ['points de d2'] });
  });
  it('les clés d’un geste restent les mêmes d’un appel à l’autre (un curseur tenu = un pas)', () => {
    const a = majDeSelection(sel, d1, majPrincipal, { redessiner });
    const b = majDeSelection(sel, d1, { ...majPrincipal, strokeWidth: 10 }, { redessiner });
    expect(cleGeste('d2', a.d2)).toBe(cleGeste('d2', b.d2));
  });
  it('sans `redessiner`, ou tracé trop court : la part de style seule', () => {
    expect(majPourAutre(d2, majPrincipal)).toEqual({ strokeWidth: 9 });
    expect(majPourAutre(d2, majPrincipal, () => null)).toEqual({ strokeWidth: 9 });
    expect(majPourAutre(d2, { x: 1 }, redessiner)).toBeNull();
  });
});
