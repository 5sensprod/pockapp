// frontend/modules/stick/labels/components/templates/FondPanel.jsx
//
// LE FOND du document : un élément `role: 'fond'`, premier calque, verrouillé,
// à la taille du canvas (store : `poserFond`, `mettreEnFond`, `retirerFond`,
// `ajusterAuCanvas`). Une couleur ou un dégradé crée un rectangle de fond ;
// n'importe quel élément sélectionné — une image, le plus souvent — peut
// devenir le fond. Le fond ne suit PAS seul un changement de format :
// « Réajuster à la page ».
//
// Une seule rangée depuis le 3 octobre 2026 : la pastille, puis trois actions.

import React from 'react';
import { Maximize2, X } from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
import { fondDe } from '../../utils/placement';
import GradientColorPicker from '../GradientColorPicker';
import Bouton from '../ui/Bouton';
import Note from '../ui/Note';
import { BOUTON_ICONE, LIGNE } from '../ui/styles';

const FondPanel = () => {
  const { elements, selectedId, poserFond, mettreEnFond, retirerFond, ajusterAuCanvas } = useLabelStore();
  const fond = fondDe(elements);
  const selection = elements.find((e) => e.id === selectedId);
  const rectangle = !fond || (fond.type === 'shape' && fond.shape === 'rectangle');

  return (
    <div className="space-y-2">
      <div className={LIGNE}>
        <span>Fond</span>
        <div className="flex items-center gap-1.5">
          {/* Choisir une couleur crée le fond ; couleur unie ou dégradé */}
          {rectangle && (
            <GradientColorPicker
              color={fond?.fill || '#ffffff'}
              gradient={fond?.fillGradient ?? null}
              onColorChange={(c) => poserFond({ fill: c, fillGradient: null })}
              onGradientChange={(g) => poserFond({ fillGradient: g })}
              title="Couleur du fond"
            />
          )}
          <Bouton
            desactive={!selection || selection.role === 'fond'}
            onClic={() => mettreEnFond(selectedId)}
            titre="L'élément sélectionné couvre toute la page, passe au premier calque et se verrouille"
          >
            Sélection en fond
          </Bouton>
          <button
            type="button"
            className={`${BOUTON_ICONE} disabled:opacity-40 disabled:pointer-events-none`}
            disabled={!fond}
            onClick={() => ajusterAuCanvas(fond.id)}
            title="Réajuster le fond à la page"
            aria-label="Réajuster le fond à la page"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <Bouton variante="destructif" icone={X} desactive={!fond} onClic={retirerFond} titre="Retirer le fond" />
        </div>
      </div>
      {!rectangle && <Note>Le fond est une image : retirez-le pour poser une couleur.</Note>}
    </div>
  );
};

export default FondPanel;
