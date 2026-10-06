// frontend/modules/stick/labels/components/ChoixProduit.jsx
//
// DE QUEL PRODUIT PARLE-T-ON ? (6 octobre 2026, `04-donnees-produit.md`)
// Le même choix en tête de l'onglet « Infos produit » (le produit des éléments
// qu'on va ajouter) et dans le bloc « Lié à » d'un élément (le sien) :
//
// - « Produit de la page » : l'élément suit la page, comme toujours ;
// - un produit connu (au tirage, ou déjà épinglé sur l'affiche) ;
// - « Autre produit… » : le sélecteur du catalogue. Le produit entre dans le
//   cache du store, PAS au tirage : aucune page n'est ajoutée.
//
// `valeur` : l'id du produit épinglé, ou null. `onRemplacer` (facultatif)
// ajoute « Remplacer ce produit par… », pour refaire un pack avec un autre.
// Orange : la couleur de PocketStock, d'où viennent ces données.
import React, { useState } from 'react';
import { Package } from 'lucide-react';
import useLabelStore, { idsSuivis } from '../store/useLabelStore';
import ProductSelector from './ProductSelector';

const PAGE = '';
const AUTRE = '__autre__';
const REMPLACER = '__remplacer__';

const ChoixProduit = ({ valeur = null, onValeur, onRemplacer = null }) => {
  const produitPage = useLabelStore((s) => s.selectedProduct);
  const parId = useLabelStore((s) => s.produitsParId);
  // Une chaîne : la liste ne bouge que si un id bouge (`elements` change à chaque glisser)
  const connus = useLabelStore((s) => idsSuivis(s).join(','));
  const memoriserProduit = useLabelStore((s) => s.memoriserProduit);
  const [selecteur, setSelecteur] = useState(null); // null | 'choisir' | 'remplacer'

  const ids = connus ? connus.split(',') : [];
  const absent = valeur && !ids.includes(valeur);
  const nom = (id) => parId[id]?.name || 'Produit introuvable';

  const changer = (v) => {
    if (v === AUTRE) setSelecteur('choisir');
    else if (v === REMPLACER) setSelecteur('remplacer');
    else onValeur(v || null);
  };

  const choisi = (product) => {
    const mode = selecteur;
    setSelecteur(null);
    if (!product?._id) return;
    if (mode === 'remplacer') {
      onRemplacer?.(product);
      return;
    }
    memoriserProduit(product);
    onValeur(product._id);
  };

  return (
    <div className="flex items-center gap-2 min-w-0 text-xs">
      <span
        className={`flex-none whitespace-nowrap flex items-center gap-1 ${
          valeur ? 'text-orange-600 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        <Package className="h-3.5 w-3.5" />
        Produit
      </span>
      <select
        value={valeur ?? PAGE}
        onChange={(e) => changer(e.target.value)}
        className={`flex-1 min-w-0 h-7 px-2 text-xs rounded-md border bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none ${
          valeur ? 'border-orange-400 dark:border-orange-500' : 'border-transparent focus:border-blue-500'
        }`}
        title={
          valeur
            ? 'Ce produit, quelle que soit la page : il ne s’ajoute pas à la liste « À imprimer ».'
            : 'Le produit que la page affiche (onglet « Produits »).'
        }
      >
        <option value={PAGE}>{produitPage ? `Produit de la page · ${produitPage.name}` : 'Produit de la page'}</option>
        {ids.map((id) => (
          <option key={id} value={id}>
            {nom(id)}
          </option>
        ))}
        {absent && <option value={valeur}>{nom(valeur)}</option>}
        <option value={AUTRE}>Autre produit…</option>
        {onRemplacer && valeur && <option value={REMPLACER}>Remplacer ce produit par…</option>}
      </select>

      {selecteur && <ProductSelector onSelect={choisi} onClose={() => setSelecteur(null)} />}
    </div>
  );
};

export default ChoixProduit;
