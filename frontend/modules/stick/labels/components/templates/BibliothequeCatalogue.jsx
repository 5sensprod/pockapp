// frontend/modules/stick/labels/components/templates/BibliothequeCatalogue.jsx
//
// La bibliothèque « PocketStock » de l'onglet Médias : le logo de
// l'entreprise, les logos des marques et les images des catégories, à poser
// sur l'affiche comme des images FIXES (`ajouterImageFixe`) — elles ne
// suivent aucun produit. Pour le logo de LA marque du produit affiché, c'est
// l'onglet « Données produit ».
//
// Les données viennent des requêtes vivantes du dépôt
// (`lib/use-images-catalogue.ts`) ; rien n'est copié dans le poste.

import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { useImagesCatalogue } from '../../lib/use-images-catalogue';
import { filtrerImages } from '../../lib/images-catalogue';
import { ajouterImageFixe } from '../../utils/ajoutsProduit';

// Au-delà, la grille ne montre que le début : on affine par la recherche
const PLAFOND = 60;

const Vignette = ({ image }) => (
  <button
    type="button"
    onClick={() => ajouterImageFixe(image)}
    className="group flex flex-col items-center gap-1 p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-400 bg-white dark:bg-gray-900"
    title={`Ajouter « ${image.nom} » à l'affiche`}
  >
    <span className="w-full aspect-square flex items-center justify-center overflow-hidden rounded bg-gray-50 dark:bg-gray-800">
      <img src={image.src} alt="" className="max-w-full max-h-full object-contain" loading="lazy" />
    </span>
    <span className="w-full text-[11px] leading-tight text-center text-gray-700 dark:text-gray-300 truncate">{image.nom}</span>
  </button>
);

const Rayon = ({ titre, images, total, vide }) => (
  <section>
    <h3 className="mb-2 text-xs font-medium text-gray-800 dark:text-gray-200">
      {titre} <span className="font-normal text-gray-500 dark:text-gray-400">· {total}</span>
    </h3>
    {images.length ? (
      <>
        <div className="grid grid-cols-3 gap-2">
          {images.slice(0, PLAFOND).map((image) => (
            <Vignette key={image.id} image={image} />
          ))}
        </div>
        {images.length > PLAFOND && (
          <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
            {PLAFOND} affichées sur {images.length} : précisez la recherche pour voir les autres.
          </p>
        )}
      </>
    ) : (
      <p className="text-xs text-gray-500 dark:text-gray-400">{vide}</p>
    )}
  </section>
);

const BibliothequeCatalogue = () => {
  const { marques, categories, entreprise, chargement } = useImagesCatalogue();
  const [terme, setTerme] = useState('');
  const marquesFiltrees = filtrerImages(marques, terme);
  const categoriesFiltrees = filtrerImages(categories, terme);
  const cherche = terme.trim() !== '';

  return (
    <div className="p-3 space-y-4 overflow-y-auto h-full">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Images fixes, tirées de PocketStock. Pour le logo de la marque du produit affiché, qui change avec lui : onglet{' '}
        <span className="text-orange-600 dark:text-orange-400">Données produit</span>.
      </p>

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="search"
          value={terme}
          onChange={(e) => setTerme(e.target.value)}
          placeholder="Chercher une marque, une catégorie…"
          className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>

      {chargement && <p className="text-xs text-gray-500 dark:text-gray-400">Chargement…</p>}

      {!cherche && (
        <section>
          <h3 className="mb-2 text-xs font-medium text-gray-800 dark:text-gray-200">Entreprise</h3>
          {entreprise ? (
            <div className="grid grid-cols-3 gap-2">
              <Vignette image={entreprise} />
            </div>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              L'entreprise n'a pas de logo. Il se dépose dans les réglages de l'entreprise.
            </p>
          )}
        </section>
      )}

      <Rayon
        titre="Marques"
        images={marquesFiltrees}
        total={cherche ? `${marquesFiltrees.length} sur ${marques.length}` : marques.length}
        vide={cherche ? 'Aucune marque avec un logo ne correspond.' : 'Aucune marque ne porte de logo.'}
      />
      <Rayon
        titre="Catégories"
        images={categoriesFiltrees}
        total={cherche ? `${categoriesFiltrees.length} sur ${categories.length}` : categories.length}
        vide={cherche ? 'Aucune catégorie avec une image ne correspond.' : 'Aucune catégorie ne porte d’image.'}
      />
    </div>
  );
};

export default BibliothequeCatalogue;
