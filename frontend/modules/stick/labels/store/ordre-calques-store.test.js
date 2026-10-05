// GLISSER UN CALQUE = UN PAS D'HISTORIQUE. `LayersPanel` appelle `moveElement`
// à chaque rangée franchie : sans regroupement, cinq crans demandaient cinq
// Ctrl+Z.
import { beforeEach, describe, expect, it } from 'vitest';
import useLabelStore from './useLabelStore';

const etat = () => useLabelStore.getState();
const ordre = () => etat().elements.map((e) => e.id).join('');

beforeEach(() => {
  etat().resetHistory();
  useLabelStore.setState({
    elements: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, type: 'shape' })),
    selectedId: null,
  });
});

/** Fait monter le calque du rang `de` au rang `a`, cran par cran, comme le glisser. */
const glisser = (de, a, geste) => {
  const pas = a > de ? 1 : -1;
  for (let i = de; i !== a; i += pas) etat().moveElement(i, i + pas, { geste });
};

describe('glisser un calque', () => {
  it('cinq crans font UN pas : un seul Ctrl+Z ramène l’ordre de départ', () => {
    glisser(0, 5, 1);
    expect(ordre()).toBe('bcdefa');
    expect(etat().historyPast).toHaveLength(1);
    etat().undo();
    expect(ordre()).toBe('abcdef');
    expect(etat().canUndo).toBe(false);
    etat().redo();
    expect(ordre()).toBe('bcdefa');
  });

  it('un calque revenu à sa place ne laisse aucun pas, et rend ce qu’on pouvait rétablir', () => {
    etat().moveElement(0, 1); // un pas ordinaire…
    etat().undo(); // …annulé : il y a quelque chose à rétablir
    expect(etat().canRedo).toBe(true);

    glisser(0, 3, 1);
    expect(etat().historyPast).toHaveLength(1);
    glisser(3, 0, 1);
    expect(ordre()).toBe('abcdef');
    expect(etat().historyPast).toHaveLength(0);
    expect(etat().canUndo).toBe(false);
    expect(etat().canRedo).toBe(true);

    // Reparti dans le même geste : le pas revient, une seule fois
    glisser(0, 2, 1);
    expect(etat().historyPast).toHaveLength(1);
    etat().undo();
    expect(ordre()).toBe('abcdef');
  });

  it('deux glissers font deux pas, même sans rien entre les deux', () => {
    glisser(0, 2, 1);
    glisser(2, 4, 2);
    expect(etat().historyPast).toHaveLength(2);
    etat().undo();
    expect(ordre()).toBe('bcadef');
  });

  it('une autre modification pendant le geste le termine', () => {
    glisser(0, 2, 1);
    etat().deleteElement('f');
    glisser(2, 3, 1);
    expect(etat().historyPast).toHaveLength(3);
  });

  it('sans geste, un déplacement reste un pas à lui seul', () => {
    etat().moveElement(0, 1);
    etat().moveElement(1, 2);
    expect(etat().historyPast).toHaveLength(2);
  });
});
