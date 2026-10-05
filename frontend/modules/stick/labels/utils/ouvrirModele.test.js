// OUVRIR UN MODÈLE, contre le vrai store. « Modèles prêts » le faisait sans
// confirmation, sans remettre l'historique à zéro, sans nom de modèle courant.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useLabelStore from '../store/useLabelStore';
import { CONFIRMATION_OUVERTURE, identiteModele, ouvrirModele } from './ouvrirModele';

const etat = () => useLabelStore.getState();
const sansAttente = () => Promise.resolve();

const modele = {
  id: 'template-1',
  name: 'Étiquette prix',
  canvasSize: { width: 200, height: 100 },
  sheetSettings: { selectedSheetId: 'a4-landscape', rows: 3, cols: 4, margin: 8, spacing: 2 },
  lockCanvasToSheetCell: true,
  elements: [
    { id: 'm1', type: 'text', text: 'Prix', x: 5, y: 6 },
    { id: 'm2', type: 'shape', shape: 'rectangle' },
  ],
};
// Un modèle d'usine porte ses données dans `preset_data`
const usine = { id: 'usine-1', name: 'Affiche A4', is_factory: true, preset_data: { ...modele, id: undefined, name: undefined } };

beforeEach(() => {
  etat().resetHistory();
  useLabelStore.setState({
    elements: [],
    selectedId: null,
    canvasSize: { width: 800, height: 600 },
    lockCanvasToSheetCell: false,
    currentTemplateName: null,
    currentTemplateId: null,
  });
});

describe('ouvrir un modèle', () => {
  it('page vide : pas de question, la page devient le modèle', async () => {
    const confirm = vi.fn();
    const ouvert = await ouvrirModele(modele, { store: etat(), confirm, attendre: sansAttente });
    expect(ouvert).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(etat().elements.map((e) => e.id)).toEqual(['m1', 'm2']);
    expect(etat().elements[0]).toMatchObject({ x: 5, y: 6 });
    expect(etat().canvasSize).toEqual({ width: 200, height: 100 });
    expect(etat().sheetSettings).toMatchObject({ rows: 3, cols: 4 });
    expect(etat().lockCanvasToSheetCell).toBe(true);
  });

  it('page occupée : la question est posée, et « Annuler » ne touche à rien', async () => {
    etat().addElement({ id: 'mien', type: 'text' });
    const confirm = vi.fn().mockResolvedValue(false);
    const ouvert = await ouvrirModele(usine, { store: etat(), confirm, attendre: sansAttente });
    expect(ouvert).toBe(false);
    expect(confirm).toHaveBeenCalledWith(CONFIRMATION_OUVERTURE);
    expect(CONFIRMATION_OUVERTURE).toMatchObject({ title: 'Ouvrir ce modèle ?', message: 'L’affiche en cours sera remplacée.' });
    expect(etat().elements.map((e) => e.id)).toEqual(['mien']);
    expect(etat().currentTemplateName).toBeNull();
  });

  it('l’historique repart de zéro : Ctrl+Z ne ramène pas l’affiche remplacée', async () => {
    etat().addElement({ id: 'mien', type: 'text' });
    await ouvrirModele(usine, { store: etat(), confirm: async () => true, attendre: sansAttente });
    expect(etat().elements.map((e) => e.id)).toEqual(['m1', 'm2']);
    expect(etat().historyPast).toHaveLength(0);
    expect(etat().canUndo).toBe(false);
    expect(etat().canRedo).toBe(false);
  });

  it('un modèle d’usine donne son NOM, jamais son identifiant', async () => {
    await ouvrirModele(usine, { store: etat(), attendre: sansAttente });
    expect(etat().currentTemplateName).toBe('Affiche A4');
    // « Enregistrer » écrit sur `currentTemplateId` : null = « enregistrer sous »
    expect(etat().currentTemplateId).toBeNull();
  });

  it('un modèle du poste donne son nom et son identifiant', async () => {
    await ouvrirModele(modele, { store: etat(), attendre: sansAttente });
    expect(etat().currentTemplateName).toBe('Étiquette prix');
    expect(etat().currentTemplateId).toBe('template-1');
    expect(identiteModele({})).toEqual({ nom: 'Modèle sans nom', id: null });
  });

  it('un modèle sans taille de page est refusé AVANT de vider la page', async () => {
    etat().addElement({ id: 'mien', type: 'text' });
    await expect(
      ouvrirModele({ id: 'x', name: 'Cassé', elements: [] }, { store: etat(), confirm: async () => true, attendre: sansAttente })
    ).rejects.toThrow(/invalide/);
    expect(etat().elements.map((e) => e.id)).toEqual(['mien']);
  });
});
