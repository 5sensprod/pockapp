// frontend/modules/stick/labels/utils/champsProduit.test.js
//
// Ce que garde ce fichier : les clés des templates déjà enregistrés restent
// comprises, et la photo du produit n'a qu'une identité, quelle que soit la
// clé qui l'a écrite.
import { describe, expect, it } from 'vitest';
import {
  CHAMPS_PRODUIT,
  champProduit,
  champsPourType,
  cleCanonique,
  libelleLiaison,
  elementsLies,
  memeChamp,
  miseAJourLiaison,
  photosGalerie,
} from './champsProduit';
import { getProductField, resolvePropForElement } from './dataBinding';

describe('champsProduit', () => {
  it('les deux clés de la photo désignent la même donnée', () => {
    expect(memeChamp('product_image', 'product_image_src')).toBe(true);
    expect(cleCanonique('product_image_src')).toBe('product_image');
    expect(memeChamp('price', 'sale_price')).toBe(false);
    expect(memeChamp(null, 'price')).toBe(false);
  });

  it('une clé hors registre reste lisible, telle quelle', () => {
    expect(champProduit('brand_ref.name')).toBeNull();
    expect(cleCanonique('brand_ref.name')).toBe('brand_ref.name');
    expect(libelleLiaison({ type: 'text', dataBinding: 'brand_ref.name' })).toBe('brand_ref.name');
  });

  it('chaque type ne reçoit que des champs qu\'il sait rendre', () => {
    expect(champsPourType('qrcode').map((c) => c.cle)).toEqual(['website_url']);
    expect(champsPourType('image').map((c) => c.cle)).toEqual(['product_image', 'brand_image', 'category_image']);
    expect(champsPourType('barcode').map((c) => c.cle)).toEqual(['sku', 'barcode']);
    expect(champsPourType('text')).toHaveLength(10);
  });

  it('libellé : lié, non lié, fiche', () => {
    expect(libelleLiaison({ type: 'text', dataBinding: 'sale_price' })).toBe('Prix promo');
    expect(libelleLiaison({ type: 'image', dataBinding: 'product_image_src' })).toBe('Photo du produit');
    expect(libelleLiaison({ type: 'text' })).toBeNull();
    expect(libelleLiaison({ type: 'fiche', section: 'specs' })).toBe('Description');
  });

  it('toute clé et tout alias du registre sont résolus par getProductField', () => {
    const p = {
      name: 'N', price: 1, sale_price: 1, description: 'D', sku: 'S', stock: 2,
      brand_ref: { name: 'B', image: 'logo' }, category_image: 'cat', supplier_ref: { name: 'F' }, website_url: 'https://x',
      meta_data: [{ key: 'barcode', value: '123' }], image: { src: 'i', url: 'i' },
    };
    for (const c of CHAMPS_PRODUIT) {
      for (const cle of [c.cle, ...(c.alias ?? [])]) {
        expect(getProductField(p, cle), cle).not.toBe('');
      }
    }
  });
});

describe('miseAJourLiaison', () => {
  const produit = {
    _id: 'p1', name: 'Guitare', price: 39.9, website_url: 'https://s/g',
    meta_data: [], image: { src: 'photo.jpg' },
  };
  const maj = (el, cle) => miseAJourLiaison(el, cle, produit, resolvePropForElement);

  it('lie avec la clé canonique, refuse un champ incompatible', () => {
    expect(maj({ type: 'image' }, 'product_image_src')).toEqual({ dataBinding: 'product_image' });
    expect(maj({ type: 'qrcode' }, 'description')).toBeNull();
    expect(maj({ type: 'shape' }, 'name')).toBeNull();
  });

  it('délier fige la valeur affichée', () => {
    expect(maj({ type: 'text', text: 'x', dataBinding: 'price' }, null)).toEqual({
      dataBinding: null, text: '39,90 €',
    });
    expect(maj({ type: 'image', src: '{{product_image}}', dataBinding: 'product_image_src' }, null))
      .toEqual({ dataBinding: null, src: 'photo.jpg' });
    expect(maj({ type: 'text', text: 'x', dataBinding: 'name', textOverrides: { p1: 'Corrigé' } }, null))
      .toEqual({ dataBinding: null, text: 'Corrigé' });
  });

  it('délier un élément non lié ne fait rien', () => {
    expect(maj({ type: 'text', text: 'x' }, null)).toBeNull();
  });
});

describe('elementsLies', () => {
  it('garde les liés et la fiche, dans l’ordre du document', () => {
    const els = [
      { id: 'a', type: 'text', dataBinding: 'price' },
      { id: 'b', type: 'shape' },
      { id: 'c', type: 'fiche', section: 'specs' },
      { id: 'd', type: 'text', text: 'fixe' },
      { id: 'e', type: 'image', dataBinding: 'product_image_src' },
    ];
    expect(elementsLies(els).map((e) => e.id)).toEqual(['a', 'c', 'e']);
    expect(elementsLies(undefined)).toEqual([]);
  });
});

describe('galerie', () => {
  const produit = {
    image: { src: 'a.jpg' },
    gallery_images: [{ src: 'a.jpg' }, { src: 'b.jpg' }, { src: 'c.jpg' }],
  };
  it('les photos de la galerie, sans l’image principale, avec leur index réel', () => {
    expect(photosGalerie(produit).map((p) => [p.cle, p.src])).toEqual([
      ['product_gallery_1', 'b.jpg'],
      ['product_gallery_2', 'c.jpg'],
    ]);
  });
  it('une clé de galerie est un champ image, résolu par getProductField', () => {
    expect(champProduit('product_gallery_2')).toMatchObject({ libelle: 'Galerie, photo 3', types: ['image'] });
    expect(getProductField(produit, 'product_gallery_2')).toBe('c.jpg');
    expect(getProductField(produit, 'product_gallery_9')).toBe('');
    expect(maj2({ type: 'image' }, 'product_gallery_1')).toEqual({ dataBinding: 'product_gallery_1' });
  });
});
const maj2 = (el, cle) => miseAJourLiaison(el, cle, {}, resolvePropForElement);
