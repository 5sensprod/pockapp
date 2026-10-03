import { describe, it, expect } from 'vitest';
import {
  ACTIONS_BARRE,
  SECTIONS_COMMUNES,
  TYPES_REGLABLES,
  ongletApresSelection,
  ongletDe,
  rapidesDe,
  reglagesDe,
  sectionActive,
  sectionOuverte,
} from './reglagesParType';
import { TYPO_BORNES } from './typo';

describe('reglagesDe', () => {
  it('un réglage n’est jamais à la fois dans la barre et dans le panneau', () => {
    for (const type of TYPES_REGLABLES) {
      for (const shape of [undefined, 'rectangle', 'line', 'libre']) {
        const { barre, panneau } = reglagesDe({ type, shape, traceLibre: { points: [] } });
        const communs = barre.filter((s) => panneau.includes(s));
        // « contour » d'une forme : couleur et épaisseur en barre ; rien en double
        expect(communs, `${type}/${shape}`).toEqual([]);
        expect(new Set(barre).size).toBe(barre.length);
        expect(new Set(panneau).size).toBe(panneau.length);
      }
    }
  });

  it('la barre garde un noyau court : 5 sections au plus, plus les actions', () => {
    for (const type of TYPES_REGLABLES) expect(reglagesDe({ type }).barre.length).toBeLessThanOrEqual(5);
    expect(ACTIONS_BARRE).toContain('reglages');
  });

  it('texte : tout est descendu dans l’onglet, la barre n’en garde rien', () => {
    const { barre, panneau } = reglagesDe({ type: 'text' });
    expect(barre).toEqual([]);
    expect(panneau.slice(0, 4)).toEqual(['noyauTexte', 'espacement', 'contourStylise', 'masque']);
  });

  it('les sections qui dépendent de la forme', () => {
    const p = (el) => reglagesDe({ type: 'shape', ...el }).panneau;
    expect(p({})).toContain('arrondi'); // rectangle par défaut
    expect(p({ shape: 'circle' })).not.toContain('arrondi');
    expect(p({ shape: 'line' })).toContain('masque'); // il l'avait dans la barre
    expect(p({ shape: 'libre', traceLibre: {} })).toContain('lissage');
    expect(p({ shape: 'libre' })).not.toContain('lissage'); // fermée avant `traceLibre`
    expect(p({ shape: 'circle' })).not.toContain('lissage');
  });

  it('tout élément finit par le commun ; un type inconnu n’a que lui', () => {
    for (const type of TYPES_REGLABLES) expect(reglagesDe({ type }).panneau.slice(-2)).toEqual(SECTIONS_COMMUNES);
    expect(reglagesDe({ type: 'inconnu' })).toEqual({ barre: [], panneau: SECTIONS_COMMUNES });
    expect(reglagesDe(null)).toEqual({ barre: [], panneau: SECTIONS_COMMUNES });
  });
});

describe('l’onglet suit la sélection', () => {
  const trace = { type: 'dessin' };
  const forme = { type: 'shape' };

  it('chaque type a son onglet', () => {
    expect(ongletDe({ type: 'text' })).toBe('text');
    expect(ongletDe({ type: 'image' })).toBe('image');
    expect(ongletDe(trace)).toBe('dessin');
    expect(ongletDe(forme)).toBe('shape');
    expect(ongletDe({ type: 'qrcode' })).toBe('shape');
    expect(ongletDe({ type: 'barcode' })).toBe('donnees');
    expect(ongletDe({ type: 'fiche' })).toBe('donnees');
    expect(ongletDe({ type: 'inconnu' })).toBeNull();
    expect(ongletDe(null)).toBeNull();
  });

  it('panneau vide ou onglet de type : on affiche l’onglet de l’élément', () => {
    expect(ongletApresSelection(null, forme)).toBe('shape');
    expect(ongletApresSelection('dessin', forme)).toBe('shape');
    expect(ongletApresSelection('shape', trace)).toBe('dessin');
  });

  it('Calques, Effets et Données produit restent : on y sélectionne pour travailler', () => {
    for (const o of ['layers', 'effects', 'donnees']) expect(ongletApresSelection(o, forme)).toBe(o);
  });

  it('tous les autres suivent : après un template, cliquer un élément montre ses réglages', () => {
    for (const o of ['templates', 'format', 'sheet']) expect(ongletApresSelection(o, forme)).toBe('shape');
  });

  it('Données produit ne se quitte pas d’office : on y ajoute plusieurs éléments liés d’affilée', () => {
    expect(ongletApresSelection('donnees', { type: 'text' })).toBe('donnees');
    expect(ongletApresSelection('donnees', { type: 'image' })).toBe('donnees');
    // mais on y arrive : un code-barres sélectionné depuis l'onglet Texte
    expect(ongletApresSelection('text', { type: 'barcode' })).toBe('donnees');
  });

  it('désélectionner, ou sélectionner un type sans onglet, ne change rien', () => {
    expect(ongletApresSelection('shape', null)).toBe('shape');
    expect(ongletApresSelection('text', { type: 'inconnu' })).toBe('text');
    expect(ongletApresSelection('shape', { type: 'text' })).toBe('text');
  });
});

describe('sections rares : repliées, sauf si l’élément y a un réglage', () => {
  it('un texte neuf : les trois sections rares sont repliées, le noyau ne l’est jamais', () => {
    const el = { type: 'text' };
    for (const id of ['espacement', 'contourStylise', 'masque']) expect(sectionOuverte(id, el), id).toBe(false);
    expect(sectionOuverte('noyauTexte', el)).toBe(true);
    expect(sectionOuverte('arrondi', { type: 'shape' })).toBe(true);
  });
  it('s’ouvre quand un réglage y est actif', () => {
    expect(sectionActive('espacement', { curve: 30 })).toBe(true);
    expect(sectionActive('espacement', { letterSpacing: 0, lineHeight: 1, charHeight: 100, curve: 0 })).toBe(false);
    expect(sectionActive('contourStylise', { contourStyle: { tremble: 0.3 } })).toBe(true);
    expect(sectionActive('contourStylise', { contourStyle: null })).toBe(false);
    expect(sectionActive('masque', { mask: 'star' })).toBe(true);
    expect(sectionActive('masque', { maskFeather: 10 })).toBe(true);
    expect(sectionActive('masque', {})).toBe(false);
  });
  it('les valeurs neutres de l’espacement sont celles de `TYPO_BORNES`', () => {
    const neutre = Object.fromEntries(Object.entries(TYPO_BORNES).map(([cle, b]) => [cle, b.defaut]));
    expect(sectionActive('espacement', neutre)).toBe(false);
    for (const cle of Object.keys(neutre)) expect(sectionActive('espacement', { ...neutre, [cle]: neutre[cle] + 1 }), cle).toBe(true);
  });
});

describe('options rapides de la barre du haut', () => {
  it('texte : taille, gras et italique, couleur — ni police, ni alignement', () => {
    expect(rapidesDe({ type: 'text' })).toEqual(['taille', 'grasItalique', 'couleurTexte']);
  });
  it('quatre au plus par type : la barre ne défile jamais', () => {
    for (const type of TYPES_REGLABLES) expect(rapidesDe({ type }).length).toBeLessThanOrEqual(4);
    expect(rapidesDe(null)).toEqual([]);
  });
});
