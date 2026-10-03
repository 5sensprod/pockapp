// frontend/modules/stick/labels/components/templates/ReglagesCommuns.jsx
//
// Ce qui vaut pour TOUT élément sélectionné, en tête de `ReglagesPanel` :
// position sur la page (ou alignement entre éléments), remplir le canvas,
// supprimer, et la liaison à la fiche produit. Repris de l'ancienne barre
// d'options (`PropertyPanel`, supprimée le 3 octobre 2026). Les Effets ont
// leur bouton dans la barre fine (`CanvasArea`).
//
// Position et suppression agissent sur TOUTE la sélection, verrouillés
// exclus ; le reste du panneau règle l'élément principal.

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
  Expand,
  Trash2,
} from 'lucide-react';
import useLabelStore, { idsSelectionnes } from '../../store/useLabelStore';
import LiaisonProduit from '../LiaisonProduit';
import { typeLiable } from '../../utils/champsProduit';
import { ficheChangeeDepuisCorrection, texteCorrige } from '../../utils/dataBinding';
import { alignOffsets, distributeOffsets, unionBoxes } from '../../utils/layout';

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

const bouton =
  'p-1.5 rounded-lg transition-colors bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300';
const action =
  'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700';

const ReglagesCommuns = ({ el, docNode }) => {
  const elements = useLabelStore((s) => s.elements);
  const selectedId = useLabelStore((s) => s.selectedId);
  const extraIds = useLabelStore((s) => s.extraIds);
  const canvasSize = useLabelStore((s) => s.canvasSize);
  const dataSource = useLabelStore((s) => s.dataSource);
  // Le produit que le CANVAS affiche : c'est à lui qu'une correction de texte
  // est rattachée (`TextNode`, `textOverrides`).
  const produit = useLabelStore((s) => s.selectedProduct);
  const updateElement = useLabelStore((s) => s.updateElement);
  const deleteElements = useLabelStore((s) => s.deleteElements);
  const ajusterAuCanvas = useLabelStore((s) => s.ajusterAuCanvas);

  // Les cadres sont MESURÉS sur le canvas (rotation, texte sans largeur, QR,
  // formes centrées), en coordonnées du document ; on déplace ensuite chaque
  // élément du décalage calculé, ce qui vaut quelle que soit son origine.
  const ids = idsSelectionnes({ selectedId, extraIds, elements }).filter((id) => !elements.find((e) => e.id === id)?.locked);
  const cadre = (id) => docNode?.findOne(`#${id}`)?.getClientRect({ skipShadow: true, relativeTo: docNode }) ?? null;
  const deplacer = (offsets, liste) =>
    offsets.forEach(({ dx, dy }, i) => {
      const e = elements.find((x) => x.id === liste[i]);
      if (e && (dx || dy)) updateElement(e.id, { x: (e.x ?? 0) + dx, y: (e.y ?? 0) + dy });
    });
  const aligner = (alignement) => {
    const liste = ids.filter((id) => cadre(id));
    const boites = liste.map(cadre);
    if (!boites.length) return;
    const reference =
      boites.length === 1 ? { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height } : unionBoxes(boites);
    deplacer(alignOffsets(boites, reference, alignement), liste);
  };
  const distribuer = (axe) => {
    const liste = ids.filter((id) => cadre(id));
    deplacer(distributeOffsets(liste.map(cadre), axe), liste);
  };

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
    <div className="space-y-3">
      {docNode && ids.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-medium text-gray-800 dark:text-gray-200">
            {ids.length === 1 ? 'Position sur la page' : `Aligner les ${ids.length} éléments`}
          </div>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Alignement">
            {ALIGNEMENTS.map(([valeur, label, Icone]) => (
              <button
                key={valeur}
                type="button"
                onClick={() => aligner(valeur)}
                className={bouton}
                title={ids.length === 1 ? `${label} (sur la page)` : `${label} (entre les éléments)`}
              >
                <Icone className="h-4 w-4" />
              </button>
            ))}
            {ids.length > 2 && (
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
        </div>
      )}

      <div className="flex gap-1">
        {/* Remplir le canvas (`cadreDuCanvas`, utils/placement.js) */}
        {ids.length === 1 && (
          <button
            type="button"
            onClick={() => ajusterAuCanvas(selectedId)}
            className={action}
            title="L'élément prend toute la taille du canvas"
          >
            <Expand className="h-4 w-4" />
            Remplir
          </button>
        )}
        {ids.length > 0 && (
          <button
            type="button"
            onClick={() => deleteElements(ids)}
            className={`${action} text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20`}
            title={ids.length > 1 ? `Supprimer les ${ids.length} éléments (Suppr)` : 'Supprimer (Suppr)'}
          >
            <Trash2 className="h-4 w-4" />
            Supprimer
          </button>
        )}
      </div>

      {liable && (
        <div className="space-y-1.5">
          <LiaisonProduit element={el} product={produit} onUpdate={(patch) => updateElement(el.id, patch)} />
          {correction !== undefined && (
            <button
              type="button"
              onClick={resetCorrection}
              className="px-2 py-1 text-xs border border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20"
              title="Texte corrigé à la main pour ce produit. Cliquer pour revenir au texte de la fiche."
            >
              Revenir au texte de la fiche
            </button>
          )}
          {ficheChangee !== undefined && (
            <p className="px-2 py-1 text-xs rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              ⚠ La fiche a changé depuis la correction. Elle dit maintenant : « {ficheChangee} ». La correction reste affichée.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ReglagesCommuns;
