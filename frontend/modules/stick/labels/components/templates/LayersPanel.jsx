// frontend/modules/stick/labels/components/templates/LayersPanel.jsx
//
// L'onglet « Calques » : les éléments de la page, du dessus vers le dessous.
// On y retrouve, on masque, on verrouille, on réordonne en glissant.
//
// Refait le 3 octobre 2026 (`ui/LigneListe`, `utils/calques.js`) :
// - **un calque masqué ou verrouillé LE MONTRE sans survol** — les quatre
//   actions n'apparaissaient qu'au survol, on ne voyait donc pas pourquoi un
//   élément ne se sélectionnait plus ;
// - l'icône dit l'ÉTAT (cadenas fermé = verrouillé), l'infobulle dit l'action ;
// - la sélection est en bleu LÉGER, et toute la sélection l'est (`extraIds`) ;
// - les noms sont en français (`nomCalque`) : plus de « Barcode » ;
// - **le fond est épinglé en bas**, hors de la liste qu'on réordonne : il doit
//   rester le premier calque (`poserFond`, store), et rien n'empêchait de
//   glisser un élément dessous.
//
// Le glisser-déposer est en HTML5 : `moveElement` à chaque rangée franchie,
// pour que l'ordre suive la souris. Tous les crans d'un glisser portent le
// même numéro de geste (`nouveauGeste`, pris à `onDragStart`) : le store en
// fait UN pas d'historique, et aucun si le calque revient à sa place.

import React, { useRef, useState } from 'react';
import {
  Lock,
  Unlock,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Layers,
  Link2,
  ListChecks,
  PenTool,
  Type as TypeIcon,
  Image as ImageIcon,
  Shapes as ShapesIcon,
  QrCode as QrCodeIcon,
  Barcode,
} from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
import { etatsCalque, iconeCalque, nomCalque } from '../../utils/calques';
import { nouveauGeste } from '../../utils/gesteHistorique';
import EtatVide from '../ui/EtatVide';
import LigneListe from '../ui/LigneListe';
import { AIDE } from '../ui/styles';

const ICONES = {
  texte: TypeIcon,
  image: ImageIcon,
  forme: ShapesIcon,
  qr: QrCodeIcon,
  'code-barres': Barcode,
  trace: PenTool,
  fiche: ListChecks,
};

// 24 px, dans une rangée de 32 ; le survol se voit aussi sur la rangée active
const BOUTON = 'h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10';
// Un état par défaut (visible, déverrouillé) ne se montre qu'au survol, mais
// GARDE SA PLACE : le nom ne saute pas.
const auSurvol = 'invisible group-hover:visible group-focus-within:visible';

const LayersPanel = () => {
  const elements = useLabelStore((s) => s.elements);
  const selectedId = useLabelStore((s) => s.selectedId);
  const extraIds = useLabelStore((s) => s.extraIds);
  const selectElement = useLabelStore((s) => s.selectElement);
  const updateElement = useLabelStore((s) => s.updateElement);
  const deleteElement = useLabelStore((s) => s.deleteElement);
  const duplicateElement = useLabelStore((s) => s.duplicateElement);
  const moveElement = useLabelStore((s) => s.moveElement);

  const [draggedIndex, setDraggedIndex] = useState(null);
  // Le glisser en cours : un numéro par geste, pas par cran
  const geste = useRef(null);

  const onDragStart = (e, i) => {
    geste.current = nouveauGeste();
    setDraggedIndex(i);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e, i) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== i) {
      moveElement(draggedIndex, i, { geste: geste.current });
      setDraggedIndex(i);
    }
  };
  const onDragEnd = () => setDraggedIndex(null);

  if (!elements.length) {
    return <EtatVide icone={Layers} titre="La page est vide." />;
  }

  const selection = new Set([selectedId, ...(extraIds || [])]);
  // Avec leur rang dans le store : c'est lui que `moveElement` attend
  const rangs = elements.map((el, index) => ({ el, index }));
  const fonds = rangs.filter(({ el }) => el.role === 'fond');
  const calques = rangs.filter(({ el }) => el.role !== 'fond').reverse();

  const sansBulle = (action) => (e) => {
    e.stopPropagation();
    action();
  };

  const rangee = ({ el, index }, { deplacable }) => {
    const { verrouille, masque, lie } = etatsCalque(el);
    const glisse = deplacable && !verrouille;
    return (
      <LigneListe
        key={el.id}
        icone={ICONES[iconeCalque(el)]}
        titre={nomCalque(el)}
        actif={selection.has(el.id)}
        attenue={masque}
        onClic={() => !verrouille && selectElement(el.id)}
        className={draggedIndex === index ? 'opacity-60 ring-1 ring-blue-400' : ''}
        draggable={glisse}
        onDragStart={glisse ? (e) => onDragStart(e, index) : undefined}
        onDragOver={deplacable ? (e) => onDragOver(e, index) : undefined}
        onDragEnd={onDragEnd}
        avant={
          glisse ? (
            <GripVertical className="h-3 w-3 flex-none text-gray-300 dark:text-gray-500 cursor-grab active:cursor-grabbing" />
          ) : (
            <span className="w-3 flex-none" />
          )
        }
        actions={
          <>
            <button type="button" onClick={sansBulle(() => duplicateElement(el.id))} className={BOUTON} title="Dupliquer">
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={sansBulle(() => deleteElement(el.id))}
              className={`${BOUTON} text-red-600 dark:text-red-400`}
              title="Supprimer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        }
        etats={
          <>
            {lie && <Link2 className="h-3 w-3 mx-1 flex-none text-orange-500" aria-label="Lié à la fiche produit" />}
            <button
              type="button"
              onClick={sansBulle(() => updateElement(el.id, { visible: masque }))}
              className={`${BOUTON} ${masque ? '' : auSurvol}`}
              title={masque ? 'Masqué — afficher' : 'Masquer'}
              aria-pressed={masque}
            >
              {masque ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={sansBulle(() => updateElement(el.id, { locked: !verrouille }))}
              className={`${BOUTON} ${verrouille ? '' : auSurvol}`}
              title={verrouille ? 'Verrouillé — déverrouiller' : 'Verrouiller'}
              aria-pressed={verrouille}
            >
              {verrouille ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            </button>
          </>
        }
      />
    );
  };

  return (
    <div className="px-3 pb-3 w-full max-w-full overflow-x-hidden">
      <div className={`sticky top-0 z-10 h-7 flex items-center justify-between bg-white dark:bg-gray-800 ${AIDE}`}>
        <span>
          {elements.length} élément{elements.length > 1 ? 's' : ''}
        </span>
        <span>Glisser pour changer l’ordre</span>
      </div>

      <div className="space-y-0.5">{calques.map((r) => rangee(r, { deplacable: true }))}</div>

      {/* Le fond : toujours dessous, hors de la liste qu'on réordonne */}
      {fonds.length > 0 && (
        <div className="mt-1 pt-1 border-t border-gray-200 dark:border-gray-700">
          {fonds.map((r) => rangee(r, { deplacable: false }))}
        </div>
      )}
    </div>
  );
};

export default LayersPanel;
