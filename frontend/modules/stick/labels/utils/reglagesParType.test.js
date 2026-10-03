import { describe, it, expect } from 'vitest';
import { ACTIONS_BARRE, SECTIONS_COMMUNES, TYPES_REGLABLES, reglagesDe } from './reglagesParType';

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

  it('texte : police, taille, style, alignement et couleur restent dans la barre', () => {
    expect(reglagesDe({ type: 'text' }).barre).toEqual(['police', 'taille', 'styleTexte', 'alignementTexte', 'couleur']);
  });

  it('les sections qui dépendent de la forme', () => {
    const p = (el) => reglagesDe({ type: 'shape', ...el }).panneau;
    expect(p({})).toContain('arrondi'); // rectangle par défaut
    expect(p({ shape: 'circle' })).not.toContain('arrondi');
    expect(p({ shape: 'line' })).not.toContain('masque');
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
