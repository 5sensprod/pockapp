// frontend/modules/stick/labels/components/templates/FondPanel.jsx
//
// LE FOND du document : un élément `role: 'fond'`, premier calque, verrouillé,
// à la taille du canvas (store : `poserFond`, `mettreEnFond`, `retirerFond`,
// `ajusterAuCanvas`). Une couleur ou un dégradé crée un rectangle de fond ;
// n'importe quel élément sélectionné — une image, le plus souvent — peut
// devenir le fond. Le fond ne suit PAS seul un changement de format :
// « Réajuster au format ».

import React from 'react';
import useLabelStore from '../../store/useLabelStore';
import { fondDe } from '../../utils/placement';
import GradientColorPicker from '../GradientColorPicker';

const bouton =
  'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:hover:bg-transparent';

const FondPanel = () => {
  const { elements, selectedId, poserFond, mettreEnFond, retirerFond, ajusterAuCanvas } = useLabelStore();
  const fond = fondDe(elements);
  const selection = elements.find((e) => e.id === selectedId);
  const rectangle = !fond || (fond.type === 'shape' && fond.shape === 'rectangle');

  return (
    <div className="space-y-4 p-1">
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Couleur de fond</h3>
        {rectangle ? (
          <div className="flex items-center gap-3">
            <GradientColorPicker
              color={fond?.fill || '#ffffff'}
              gradient={fond?.fillGradient ?? null}
              onColorChange={(c) => poserFond({ fill: c, fillGradient: null })}
              onGradientChange={(g) => poserFond({ fillGradient: g })}
              title="Fond"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {fond ? 'Couleur unie ou dégradé' : 'Choisir une couleur crée le fond'}
            </span>
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Le fond est une image (ou un autre élément) : retirez-le pour poser une couleur.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <button
          type="button"
          className={bouton}
          disabled={!selection || selection.role === 'fond'}
          onClick={() => mettreEnFond(selectedId)}
          title="L'élément sélectionné couvre tout le canvas, passe au premier calque et se verrouille"
        >
          Mettre la sélection en fond
        </button>
        <button type="button" className={bouton} disabled={!fond} onClick={() => ajusterAuCanvas(fond.id)}>
          Réajuster au format
        </button>
        <button type="button" className={bouton} disabled={!fond} onClick={retirerFond}>
          Retirer le fond
        </button>
      </div>
    </div>
  );
};

export default FondPanel;
