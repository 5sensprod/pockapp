// Le tirage dans le store : ajout cumulatif, quantités, retrait, et
// `dataSource` dérivé des produits. Voir `PocketStick-docs/03-tirage.md`.
import { beforeEach, describe, expect, it } from 'vitest';
import { casesDuTirage } from '../lib/tirage';
import useLabelStore from './useLabelStore';

const etat = () => useLabelStore.getState();
const p = (id) => ({ _id: id, name: `Nom ${id}` });

beforeEach(() => {
  etat().setDataSource(null, null);
  etat().setQuantite(null, 1);
});

describe('tirage', () => {
  it('ajouter AJOUTE, et un produit déjà là gagne un exemplaire', () => {
    etat().ajouterAuTirage([p('a')]);
    etat().ajouterAuTirage([p('b'), p('a')]);
    expect(etat().selectedProductIds).toEqual(['a', 'b']);
    expect(etat().quantites).toEqual({ a: 2 });
    expect(casesDuTirage(etat()).map((c) => c.productId)).toEqual(['a', 'a', 'b']);
  });

  it('dataSource suit les produits, quelle que soit la source demandée', () => {
    expect(etat().dataSource).toBe('blank');
    etat().setDataSource('blank', [p('a')]);
    expect(etat().dataSource).toBe('data');
    etat().retirerDuTirage('a');
    expect(etat().dataSource).toBe('blank');
  });

  it('setQuantite borne, et null vise « sans produit »', () => {
    etat().ajouterAuTirage([p('a')]);
    etat().setQuantite('a', 0);
    expect(etat().quantites.a).toBe(1);
    etat().setQuantite('a', 12);
    expect(etat().quantites.a).toBe(12);
    etat().setQuantite('inconnu', 3);
    expect(etat().quantites.inconnu).toBeUndefined();
    etat().setQuantite(null, 5);
    expect(etat().quantiteSansProduit).toBe(5);
  });

  it('retirer garde le produit pointé et oublie sa quantité', () => {
    etat().ajouterAuTirage([p('a'), p('b'), p('c')]);
    etat().setQuantite('a', 4);
    etat().goToProductIndex(2);
    etat().retirerDuTirage('a');
    expect(etat().selectedProductIds).toEqual(['b', 'c']);
    expect(etat().quantites).toEqual({});
    expect(etat().selectedProduct?._id).toBe('c');
  });

  it('remplacer la sélection remet les quantités à 1', () => {
    etat().ajouterAuTirage([p('a')]);
    etat().setQuantite('a', 3);
    etat().setSelectedProducts([p('a')]);
    expect(etat().quantites).toEqual({});
  });
});

describe('le tirage survit au dessin', () => {
  it('vider le canvas (chargement de template) garde le tirage', () => {
    etat().ajouterAuTirage([p('a')]);
    etat().setQuantite('a', 3);
    etat().clearCanvas();
    expect(etat().selectedProductIds).toEqual(['a']);
    expect(etat().quantites).toEqual({ a: 3 });
  });

  it('« Nouveau » : garder ou vider, au choix', () => {
    etat().ajouterAuTirage([p('a')]);
    etat().setQuantite('a', 3);
    etat().startNewDocument({ garderProduits: true });
    expect(etat().quantites).toEqual({ a: 3 });
    etat().startNewDocument();
    expect(etat().selectedProductIds).toEqual([]);
    expect(etat().dataSource).toBe('blank');
  });
});
