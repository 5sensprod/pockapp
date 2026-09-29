// Le FOND dans le store : un seul, premier calque, verrouillé, à la taille du
// canvas ; et « Remplir le canvas » pour tout élément.
import { beforeEach, describe, expect, it } from 'vitest';
import useLabelStore from './useLabelStore';

const etat = () => useLabelStore.getState();

beforeEach(() => {
  useLabelStore.setState({
    elements: [{ id: 'img', type: 'image', x: 10, y: 10, width: 50, height: 50, rotation: 15 }],
    canvasSize: { width: 400, height: 300 },
    selectedId: null,
  });
});

describe('fond', () => {
  it('une couleur crée un rectangle de fond, sous tout le reste', () => {
    etat().poserFond({ fill: '#ff0000' });
    const [fond] = etat().elements;
    expect(fond).toMatchObject({ role: 'fond', shape: 'rectangle', fill: '#ff0000', x: 0, y: 0, width: 400, height: 300, locked: true });
    etat().poserFond({ fill: '#00ff00' });
    expect(etat().elements.filter((e) => e.role === 'fond')).toHaveLength(1);
    expect(etat().elements[0].fill).toBe('#00ff00');
  });
  it('un élément devient le fond, l’ancien redevient ordinaire', () => {
    etat().poserFond({ fill: '#ff0000' });
    etat().mettreEnFond('img');
    const [fond, ancien] = etat().elements;
    expect(fond).toMatchObject({ id: 'img', role: 'fond', width: 400, height: 300, rotation: 0 });
    expect(ancien.role).toBeUndefined();
    expect(ancien.locked).toBe(false);
  });
  it('remplir le canvas', () => {
    etat().ajusterAuCanvas('img');
    expect(etat().elements[0]).toMatchObject({ x: 0, y: 0, width: 400, height: 300, rotation: 0 });
    etat().retirerFond();
    expect(etat().elements).toHaveLength(1);
  });
});
