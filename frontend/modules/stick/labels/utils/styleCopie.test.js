import { beforeEach, describe, expect, it } from 'vitest';
import useLabelStore from '../store/useLabelStore';
import { extraireStyle, reordonner, styleApplicable } from './styleCopie';

const texte = {
  id: 't', type: 'text', x: 10, y: 20, width: 100, text: 'Bonjour', dataBinding: 'name',
  fontSize: 30, fontFamily: 'Roboto', color: '#ff0000', stroke: '#000', strokeWidth: 2,
  opacity: 0.5, shadowEnabled: true, shadowBlur: 4, visible: true, locked: false,
};
const forme = { id: 'f', type: 'shape', shape: 'rectangle', x: 0, y: 0, width: 50, height: 50, fill: '#00f' };
const image = { id: 'i', type: 'image', x: 0, y: 0, width: 50, height: 50, src: 'a.png', opacity: 1 };

describe('extraireStyle', () => {
  it('garde le style, jamais la géométrie, le contenu ni le lien au produit', () => {
    const { type, props } = extraireStyle(texte);
    expect(type).toBe('text');
    expect(props).toMatchObject({ fontSize: 30, fontFamily: 'Roboto', color: '#ff0000', opacity: 0.5 });
    for (const cle of ['id', 'x', 'y', 'width', 'text', 'dataBinding', 'visible', 'locked']) {
      expect(props).not.toHaveProperty(cle);
    }
  });
});

describe('styleApplicable', () => {
  it('même type : tout le style', () => {
    expect(styleApplicable(extraireStyle(texte), { ...texte, id: 't2' })).toMatchObject({
      fontSize: 30,
      fontFamily: 'Roboto',
    });
  });
  it('texte → forme : peinture et réglages communs, pas la police', () => {
    const maj = styleApplicable(extraireStyle(texte), forme);
    expect(maj).toMatchObject({ fill: '#ff0000', stroke: '#000', strokeWidth: 2, opacity: 0.5, shadowBlur: 4 });
    expect(maj).not.toHaveProperty('fontSize');
    expect(maj).not.toHaveProperty('color');
  });
  it('forme → texte : la couleur de remplissage devient la couleur du texte', () => {
    const maj = styleApplicable(extraireStyle(forme), texte);
    expect(maj.color).toBe('#00f');
    expect(maj).not.toHaveProperty('fill');
  });
  it('texte → image : seulement les réglages communs', () => {
    const maj = styleApplicable(extraireStyle(texte), image);
    expect(maj).toEqual({ opacity: 0.5, shadowEnabled: true, shadowBlur: 4 });
  });
});

describe('reordonner', () => {
  const els = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  const ordre = (r) => r.map((e) => e.id).join('');
  it('avancer et reculer d’un cran', () => {
    expect(ordre(reordonner(els, ['b'], 'avant'))).toBe('acbd');
    expect(ordre(reordonner(els, ['c'], 'arriere'))).toBe('acbd');
  });
  it('premier plan et arrière-plan gardent l’ordre relatif', () => {
    expect(ordre(reordonner(els, ['a', 'c'], 'devant'))).toBe('bdac');
    expect(ordre(reordonner(els, ['b', 'd'], 'derriere'))).toBe('bdac');
  });
  it('plusieurs éléments collés avancent ensemble', () => {
    expect(ordre(reordonner(els, ['b', 'c'], 'avant'))).toBe('adbc');
  });
  it('rien ne bouge au bord : même tableau', () => {
    expect(reordonner(els, ['d'], 'avant')).toBe(els);
    expect(reordonner(els, ['a'], 'arriere')).toBe(els);
  });
});

describe('store : coller le style et la profondeur', () => {
  beforeEach(() => {
    useLabelStore.setState({ elements: [texte, forme, { ...forme, id: 'v', locked: true }], styleCopie: null });
  });
  it('colle en une étape, épargne le verrouillé', () => {
    const s = useLabelStore.getState();
    const avant = s.historyPast.length;
    s.copierStyle('t');
    s.collerStyle(['f', 'v']);
    const els = useLabelStore.getState().elements;
    expect(els.find((e) => e.id === 'f').fill).toBe('#ff0000');
    expect(els.find((e) => e.id === 'v').fill).toBe('#00f');
    expect(useLabelStore.getState().historyPast.length).toBe(avant + 1);
  });
  it('premier plan', () => {
    useLabelStore.getState().deplacerEnProfondeur(['t'], 'devant');
    expect(useLabelStore.getState().elements.at(-1).id).toBe('t');
  });
});
