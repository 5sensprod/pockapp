import { describe, it, expect } from 'vitest';
import { categorieUsine, filtrerModeles } from './modeles';

const modeles = [
  { name: 'Étiquette prix', category: 'product', tags: ['Prix', 'petit'] },
  { name: 'Affiche promo', category: 'poster', description: 'Soldes d’été' },
  { name: 'Planche 3×8', category: 'sheet' },
  { category: 'poster' },
];

describe('filtre des modèles', () => {
  it('sans filtre : tout, dans l’ordre', () => {
    expect(filtrerModeles(modeles)).toEqual(modeles);
    expect(filtrerModeles(null)).toEqual([]);
  });
  it('par catégorie', () => {
    expect(filtrerModeles(modeles, { categorie: 'poster' })).toHaveLength(2);
  });
  it('par nom, description ou étiquette, sans casse', () => {
    expect(filtrerModeles(modeles, { terme: 'PROMO' }).map((m) => m.name)).toEqual(['Affiche promo']);
    expect(filtrerModeles(modeles, { terme: 'soldes' }).map((m) => m.name)).toEqual(['Affiche promo']);
    expect(filtrerModeles(modeles, { terme: 'prix' }).map((m) => m.name)).toEqual(['Étiquette prix']);
  });
  it('catégorie ET recherche ; un modèle sans nom ne casse rien', () => {
    expect(filtrerModeles(modeles, { terme: 'a', categorie: 'poster' }).map((m) => m.name)).toEqual(['Affiche promo']);
  });
  it('un design d’usine range sa catégorie dans `metadata`', () => {
    const usine = [{ name: 'A', metadata: { category: 'sheet' } }, { name: 'B' }];
    expect(filtrerModeles(usine, { categorie: 'sheet', categorieDe: categorieUsine }).map((m) => m.name)).toEqual(['A']);
  });
});
