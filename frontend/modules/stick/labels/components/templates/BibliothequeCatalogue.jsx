// frontend/modules/stick/labels/components/templates/BibliothequeCatalogue.jsx
//
// La bibliothèque « PocketStock » de l'onglet Médias : le logo de
// l'entreprise, les logos des marques et les images des catégories, à poser
// sur l'affiche comme des images FIXES (`ajouterImageFixe`) — elles ne
// suivent aucun produit. Pour le logo de LA marque du produit affiché, c'est
// l'onglet « Données produit » : le lien orange du bas y mène.
//
// Les données viennent des requêtes vivantes du dépôt
// (`lib/use-images-catalogue.ts`) ; rien n'est copié dans le poste.
//
// Allégé le 3 octobre 2026 : la recherche d'abord, le logo de l'entreprise en
// UNE rangée (il occupait ~140 px pour une image) — le premier logo de marque
// remonte de ~350 à ~190 px.

import React, { useState } from 'react';
import { useImagesCatalogue } from '../../lib/use-images-catalogue';
import { filtrerImages } from '../../lib/images-catalogue';
import { ajouterImageFixe } from '../../utils/ajoutsProduit';
import ChampRecherche from '../ui/ChampRecherche';
import EtatVide from '../ui/EtatVide';
import GrilleVignettes from '../ui/GrilleVignettes';
import LienProduit from '../ui/LienProduit';
import LigneListe from '../ui/LigneListe';
import Note from '../ui/Note';
import TitreGroupe from '../ui/TitreGroupe';
import Vignette from '../ui/Vignette';
import { AIDE, PANNEAU } from '../ui/styles';

// Au-delà, la grille ne montre que le début : on affine par la recherche
const PLAFOND = 60;

const Rayon = ({ titre, images, total, vide }) => (
  <section className="space-y-2">
    <TitreGroupe titre={titre} compte={total} />
    {images.length ? (
      <>
        <GrilleVignettes colonnes={3}>
          {images.slice(0, PLAFOND).map((image) => (
            <Vignette key={image.id} src={image.src} nom={image.nom} montrerNom onClic={() => ajouterImageFixe(image)} />
          ))}
        </GrilleVignettes>
        {images.length > PLAFOND && (
          <p className={AIDE}>
            {PLAFOND} sur {images.length} — cherchez pour voir les autres.
          </p>
        )}
      </>
    ) : (
      <p className={AIDE}>{vide}</p>
    )}
  </section>
);

const BibliothequeCatalogue = ({ onOpenTool }) => {
  const { marques, categories, entreprise, chargement } = useImagesCatalogue();
  const [terme, setTerme] = useState('');
  const marquesFiltrees = filtrerImages(marques, terme);
  const categoriesFiltrees = filtrerImages(categories, terme);
  const cherche = terme.trim() !== '';

  return (
    <div className={`${PANNEAU} overflow-y-auto h-full`}>
      <ChampRecherche valeur={terme} onValeur={setTerme} placeholder="Chercher une marque, une catégorie…" />

      {chargement && <EtatVide chargement />}

      {!cherche &&
        (entreprise ? (
          <LigneListe
            avant={<img src={entreprise.src} alt="" className="h-6 w-6 flex-none rounded bg-white object-contain" loading="lazy" />}
            titre="Logo de l’entreprise"
            onClic={() => ajouterImageFixe(entreprise)}
            title="Ajouter le logo de l’entreprise à l’affiche"
          />
        ) : (
          <Note>Pas de logo d’entreprise (Réglages).</Note>
        ))}

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

      {onOpenTool && <LienProduit onClic={() => onOpenTool('donnees')}>Logo de la marque du produit</LienProduit>}
    </div>
  );
};

export default BibliothequeCatalogue;
