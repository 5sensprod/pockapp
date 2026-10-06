// Les produits ÉPINGLÉS (`el.produitId`, 6 octobre 2026) : un élément nomme son
// produit, qui n'entre PAS au tirage — une affiche de pack tient sur une page.
// Voir `PocketStick-docs/04-donnees-produit.md`.
import { beforeEach, describe, expect, it } from 'vitest';
import useLabelStore, { idsSuivis } from './useLabelStore';
import { casesDuTirage } from '../lib/tirage';
import { idsEpingles, miseAJourLiaison } from '../utils/champsProduit';
import { resolvePropForElement } from '../utils/dataBinding';
import { estVivant } from '../lib/embellir';

const etat = () => useLabelStore.getState();
const p = (id, extra = {}) => ({ _id: id, name: `Nom ${id}`, price: 10, ...extra });
const lie = (id, produitId) => ({ id, type: 'text', text: '', dataBinding: 'name', ...(produitId ? { produitId } : {}) });

beforeEach(() => {
  etat().startNewDocument();
  etat().setFormatTirage('page');
});

describe('un produit épinglé n\'ajoute aucune page', () => {
  it('épingler ne touche pas au tirage : une seule case', () => {
    etat().choisirProduitCible(p('a'));
    etat().addElement(lie('e1', 'a'));
    etat().choisirProduitCible(p('b'));
    etat().addElement(lie('e2', 'b'));

    expect(etat().selectedProductIds).toEqual([]);
    expect(casesDuTirage(etat())).toHaveLength(1);
    expect(idsEpingles(etat().elements)).toEqual(['a', 'b']);
    expect(etat().produitsParId.a.name).toBe('Nom a');
    expect(etat().produitsParId.b.name).toBe('Nom b');
  });

  it('A au tirage, B épinglé : une page, et la synchro suit les deux', () => {
    etat().ajouterAuTirage([p('a')]);
    etat().choisirProduitCible(p('b'));
    etat().addElement(lie('e2', 'b'));
    expect(casesDuTirage(etat())).toHaveLength(1);
    expect(idsSuivis(etat())).toEqual(['a', 'b']);

    etat().synchroniserProduits([p('a', { price: 11 }), p('b', { price: 22 })]);
    expect(etat().selectedProduct.price).toBe(11);
    expect(etat().produitsParId.b.price).toBe(22);
  });

  it('la cible revient au produit de la page avec `null`', () => {
    etat().choisirProduitCible(p('b'));
    expect(etat().produitCible).toBe('b');
    etat().choisirProduitCible(null);
    expect(etat().produitCible).toBeNull();
  });
});

describe('retirer un produit du tirage ne vide pas un pack', () => {
  it('épinglé sur l\'affiche, il reste dans le cache', () => {
    etat().ajouterAuTirage([p('a'), p('b')]);
    etat().addElement(lie('e2', 'b'));
    etat().retirerDuTirage('b');

    expect(etat().selectedProductIds).toEqual(['a']);
    expect(casesDuTirage(etat())).toHaveLength(1);
    expect(etat().produitsParId.b.name).toBe('Nom b');
  });

  it('non épinglé, il quitte le cache comme avant', () => {
    etat().ajouterAuTirage([p('a'), p('b')]);
    etat().retirerDuTirage('b');
    expect(etat().produitsParId.b).toBeUndefined();
  });

  it('remplacer la sélection garde les produits épinglés', () => {
    etat().choisirProduitCible(p('b'));
    etat().addElement(lie('e2', 'b'));
    etat().setSelectedProducts([p('a')]);
    expect(etat().produitsParId.b.name).toBe('Nom b');
  });
});

describe('produit épinglé supprimé du catalogue', () => {
  it('signalé, dernière valeur gardée ; « Les retirer » ne touche pas au dessin', () => {
    etat().ajouterAuTirage([p('a')]);
    etat().choisirProduitCible(p('b'));
    etat().addElement(lie('e2', 'b'));
    etat().choisirProduitCible(null);

    etat().synchroniserProduits([p('a')], ['b']);
    expect(etat().produitsDisparus).toEqual(['b']);
    expect(etat().produitsParId.b.name).toBe('Nom b');

    etat().retirerProduitsDisparus();
    expect(etat().elements.map((e) => e.id)).toEqual(['e2']);
    expect(etat().produitsDisparus).toEqual(['b']); // toujours épinglé : toujours signalé
    expect(etat().selectedProductIds).toEqual(['a']);
  });

  it('remplacé, il n\'est plus signalé au retrait suivant', () => {
    etat().choisirProduitCible(p('b'));
    etat().addElement(lie('e2', 'b'));
    etat().choisirProduitCible(null);
    etat().synchroniserProduits([], ['b']);
    etat().remplacerProduitEpingle('b', p('c'));
    etat().retirerProduitsDisparus();
    expect(etat().produitsDisparus).toEqual([]);
  });
});

describe('remplacer un produit épinglé', () => {
  it('tous ses éléments changent, en UN pas d\'historique', () => {
    etat().choisirProduitCible(p('b'));
    etat().addElement(lie('e1'));
    etat().addElement(lie('e2', 'b'));
    etat().addElement(lie('e3', 'b'));
    const pas = etat().historyPast.length;

    etat().remplacerProduitEpingle('b', p('c'));
    expect(etat().elements.map((e) => e.produitId)).toEqual([undefined, 'c', 'c']);
    expect(etat().historyPast.length).toBe(pas + 1);
    expect(etat().produitCible).toBe('c');
    expect(etat().produitsParId.c.name).toBe('Nom c');

    etat().undo();
    expect(etat().elements.map((e) => e.produitId)).toEqual([undefined, 'b', 'b']);
  });
});

describe('ce qui entoure la liaison', () => {
  it('délier retire l\'épingle ; un élément sans épingle garde son patch d\'avant', () => {
    const avec = { type: 'text', text: '', dataBinding: 'name', produitId: 'b' };
    expect(miseAJourLiaison(avec, null, p('b'), resolvePropForElement)).toEqual({
      dataBinding: null,
      text: 'Nom b',
      produitId: null,
    });
    const sans = { type: 'text', text: '', dataBinding: 'name' };
    expect(miseAJourLiaison(sans, null, p('a'), resolvePropForElement)).toEqual({ dataBinding: null, text: 'Nom a' });
  });

  it('une épingle sur un élément délié ne compte plus', () => {
    expect(idsEpingles([{ id: 'x', type: 'text', produitId: 'b' }])).toEqual([]);
    expect(idsEpingles([{ id: 'f', type: 'fiche', section: 'specs', produitId: 'b' }])).toEqual(['b']);
  });

  it('un élément épinglé est « vivant » : il ne part pas en décor (embellir)', () => {
    expect(estVivant({ type: 'image', src: '', dataBinding: 'product_image', produitId: 'b' })).toBe(true);
    expect(estVivant({ type: 'fiche', section: 'specs', produitId: 'b' })).toBe(true);
  });

  it('le style copié n\'emporte pas le produit', () => {
    etat().addElement({ id: 's1', type: 'text', text: 'x', dataBinding: 'name', produitId: 'b', color: '#ff0000' });
    etat().copierStyle('s1');
    expect(etat().styleCopie.props.produitId).toBeUndefined();
    expect(etat().styleCopie.props.color).toBe('#ff0000');
  });
});
