// frontend/modules/stick/labels/components/LiaisonProduit.jsx
//
// LE bloc « Lié à » (donnée produit) du panneau de réglages, le même pour tous les types
// d'élément. Il remplace le bouton Lier/Délier propre à l'image et le
// sélecteur « Champ » qui n'apparaissait que sur un élément DÉJÀ lié.
//
// Ne propose que les champs que le type sait rendre (`champsPourType`) — sauf
// une clé ancienne hors registre, gardée dans la liste pour ne pas la perdre
// à l'affichage. Orange : la couleur de PocketStock, d'où viennent ces données.
//
// Sous le champ, DE QUEL PRODUIT (`ChoixProduit`, 6 octobre 2026) : celui de la
// page, ou un produit épinglé (`el.produitId`). `product` est déjà le produit
// de CET élément (`produitDe`) : l'appelant le résout.
import React from 'react';
import { Link } from 'lucide-react';
import {
  champProduit,
  champsPourType,
  cleCanonique,
  libelleLiaison,
  miseAJourLiaison,
  photosGalerie,
  typeLiable,
} from '../utils/champsProduit';
import { resolvePropForElement } from '../utils/dataBinding';
import ChoixProduit from './ChoixProduit';

const FIXE = '';

const LiaisonProduit = ({ element, product, onUpdate }) => {
  if (!element) return null;

  // Une fiche est liée par construction : on le dit, sans rien à changer.
  const choixProduit = (
    <ChoixProduit valeur={element.produitId || null} onValeur={(id) => onUpdate({ produitId: id })} />
  );

  if (element.type === 'fiche') {
    return (
      <div className="space-y-1.5">
        <span
          className="px-2 py-1 text-xs rounded-lg bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 inline-flex items-center gap-1 whitespace-nowrap"
          title="Une fiche affiche toujours une section de la description du produit"
        >
          <Link className="h-3.5 w-3.5" />
          {libelleLiaison(element)}
        </span>
        {choixProduit}
      </div>
    );
  }
  if (!typeLiable(element.type)) return null;

  const lie = !!element.dataBinding;
  const valeur = lie ? cleCanonique(element.dataBinding) : FIXE;
  // Image : la photo principale, puis la galerie du produit affiché
  const champs = [
    ...champsPourType(element.type),
    ...(element.type === 'image' ? photosGalerie(product) : []),
  ];
  // Une clé de galerie au-delà de ce produit reste choisie et affichée
  const absente = lie && !champs.some((c) => c.cle === valeur);

  const changer = (cle) => {
    const patch = miseAJourLiaison(element, cle || null, product, resolvePropForElement);
    if (patch) onUpdate(patch);
  };

  return (
    <div className="space-y-1.5">
    <div className="flex items-center gap-2 min-w-0 text-xs">
      <span
        className={`flex-none whitespace-nowrap flex items-center gap-1 ${
          lie ? 'text-orange-600 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        <Link className="h-3.5 w-3.5" />
        Lié à
      </span>
      <select
        value={valeur}
        onChange={(e) => changer(e.target.value)}
        className={`flex-1 min-w-0 h-7 px-2 text-xs rounded-md border bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none ${
          lie ? 'border-orange-400 dark:border-orange-500' : 'border-transparent focus:border-blue-500'
        }`}
        title={
          lie
            ? 'Valeur lue dans la fiche produit. « Valeur fixe » garde ce qui est affiché.'
            : "Lier l'élément à une donnée de la fiche produit"
        }
      >
        {/* Rien de la fiche : ce que l'on a tapé ou choisi à la main */}
        <option value={FIXE}>{element.type === 'text' ? 'Texte libre' : 'Valeur fixe'}</option>
        {champs.map((c) => (
          <option key={c.cle} value={c.cle}>
            {c.libelle}
          </option>
        ))}
        {absente && (
          <option value={valeur}>{champProduit(valeur)?.libelle ?? element.dataBinding}</option>
        )}
      </select>
    </div>
    {/* Le produit n'a de sens que pour un élément lié */}
    {lie && choixProduit}
    </div>
  );
};

export default LiaisonProduit;
