// frontend/modules/stick/labels/components/templates/ReglagesCommuns.jsx
//
// Ce qui vaut pour TOUT élément sélectionné, en tête de `ReglagesPanel` : UNE
// rangée d'icônes — position sur la page (ou alignement entre éléments),
// remplir, dupliquer, supprimer — puis la liaison à la fiche produit.
// Des icônes à infobulle, sans titre ni libellé : ce bandeau passe avant les
// réglages propres à l'élément, il doit prendre le moins de place possible.
//
// Position et suppression agissent sur TOUTE la sélection, verrouillés
// exclus (`useAlignementPage`) ; remplir et dupliquer, sur un élément seul.

import React from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  Copy,
  Expand,
  Trash2,
} from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
import LiaisonProduit from '../LiaisonProduit';
import { useAlignementPage } from '../useAlignementPage';
import { typeLiable } from '../../utils/champsProduit';
import { ficheChangeeDepuisCorrection, texteCorrige } from '../../utils/dataBinding';
import { BOUTON_ACTION, BOUTON_ICONE as bouton } from '../ui/styles';

// Comme PocketStick (`ui/Properties.jsx`, ALIGN_BUTTONS) : un élément seul
// s'aligne sur la PAGE ; plusieurs s'alignent sur leur cadre commun.
const ALIGNEMENTS = [
  ['left', 'Aligner à gauche', AlignStartVertical],
  ['center', 'Centrer horizontalement', AlignCenterVertical],
  ['right', 'Aligner à droite', AlignEndVertical],
  ['top', 'Aligner en haut', AlignStartHorizontal],
  ['middle', 'Centrer verticalement', AlignCenterHorizontal],
  ['bottom', 'Aligner en bas', AlignEndHorizontal],
];

const ReglagesCommuns = ({ el, docNode }) => {
  const selectedId = useLabelStore((s) => s.selectedId);
  const dataSource = useLabelStore((s) => s.dataSource);
  // Le produit que le CANVAS affiche : c'est à lui qu'une correction de texte
  // est rattachée (`TextNode`, `textOverrides`).
  const produit = useLabelStore((s) => s.selectedProduct);
  const updateElement = useLabelStore((s) => s.updateElement);
  const deleteElements = useLabelStore((s) => s.deleteElements);
  const duplicateElement = useLabelStore((s) => s.duplicateElement);
  const ajusterAuCanvas = useLabelStore((s) => s.ajusterAuCanvas);
  const { ids, aligner, distribuer, pret } = useAlignementPage(docNode);
  const seul = ids.length === 1;
  const ou = seul ? 'sur la page' : 'entre les éléments';

  // ✏️ Correction manuelle d'un texte lié, pour le produit affiché
  const correction = el.type === 'text' && el.dataBinding ? texteCorrige(el, produit) : undefined;
  // ⚠️ La fiche a changé depuis la correction (prix, nom… modifiés ailleurs)
  const ficheChangee = correction !== undefined ? ficheChangeeDepuisCorrection(el, produit) : undefined;
  const resetCorrection = () => {
    const id = produit?._id;
    if (!id) return;
    const { [id]: _retire, ...reste } = el.textOverrides || {};
    const { [id]: _source, ...resteSource } = el.textOverridesSource || {};
    updateElement(el.id, { textOverrides: reste, textOverridesSource: resteSource });
  };
  const liable = dataSource === 'data' && produit && (typeLiable(el.type) || el.type === 'fiche');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-0.5" role="group" aria-label={seul ? 'Position sur la page' : 'Aligner les éléments'}>
          {pret &&
            ids.length > 0 &&
            ALIGNEMENTS.map(([valeur, label, Icone]) => (
              <button key={valeur} type="button" onClick={() => aligner(valeur)} className={bouton} title={`${label} (${ou})`}>
                <Icone className="h-4 w-4" />
              </button>
            ))}
          {pret && ids.length > 2 && (
            <>
              <button type="button" onClick={() => distribuer('horizontal')} className={bouton} title="Espaces horizontaux égaux">
                <AlignHorizontalSpaceAround className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => distribuer('vertical')} className={bouton} title="Espaces verticaux égaux">
                <AlignVerticalSpaceAround className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {seul && (
            <>
              {/* Remplir le canvas (`cadreDuCanvas`, utils/placement.js) */}
              <button type="button" onClick={() => ajusterAuCanvas(selectedId)} className={bouton} title="Remplir la page">
                <Expand className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => duplicateElement(selectedId)} className={bouton} title="Dupliquer">
                <Copy className="h-4 w-4" />
              </button>
            </>
          )}
          {ids.length > 0 && (
            <button
              type="button"
              onClick={() => deleteElements(ids)}
              className={`${bouton} text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20`}
              title={seul ? 'Supprimer (Suppr)' : `Supprimer les ${ids.length} éléments (Suppr)`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {liable && (
        <>
          <LiaisonProduit element={el} product={produit} onUpdate={(patch) => updateElement(el.id, patch)} />
          {correction !== undefined && (
            <button
              type="button"
              onClick={resetCorrection}
              className={`${BOUTON_ACTION} w-full border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400`}
              title="Texte corrigé à la main pour ce produit. Cliquer pour revenir au texte de la fiche."
            >
              Revenir au texte de la fiche
            </button>
          )}
          {ficheChangee !== undefined && (
            <p className="px-2 py-1 text-xs rounded-md bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              ⚠ La fiche dit maintenant « {ficheChangee} ».
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default ReglagesCommuns;
