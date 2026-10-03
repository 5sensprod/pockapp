// frontend/modules/stick/labels/components/ReglagesRapides.jsx
//
// LES OPTIONS RAPIDES de la barre du haut : ce qu'on touche à chaque affiche,
// à portée de main même quand le panneau de réglages n'est pas à l'écran
// (barre latérale repliée, onglet Calques ou Effets ouvert). Quelques
// contrôles, jamais d'ascenseur : la barre d'avant en portait seize et
// défilait sur 1 500 px — on n'y revient pas.
//
// Ce sont les MÊMES atomes que le panneau (`ReglagesTexte.jsx`) et le MÊME
// `maj` (`useMajSelection`) : un réglage visible en haut et à gauche ne peut
// pas diverger. Quels atomes pour quel type : `RAPIDES_PAR_TYPE`
// (`utils/reglagesParType.js`).
//
// Masqué sous 1280 px de fenêtre (`xl:`) : la barre ne doit jamais déborder.

import React from 'react';
import { AlignCenterHorizontal, AlignCenterVertical, Copy, Trash2 } from 'lucide-react';
import useLabelStore from '../store/useLabelStore';
import { rapidesDe } from '../utils/reglagesParType';
import { useAlignementPage } from './useAlignementPage';
import { useMajSelection } from './useMajSelection';
import { CouleurTexte, GrasItalique, Taille } from './templates/ReglagesTexte';
import { BOUTON_ICONE as bouton } from './ui/styles';

/** Identifiant de réglage rapide → atome. */
const ATOMES = {
  taille: Taille,
  grasItalique: GrasItalique,
  couleurTexte: CouleurTexte,
};

const Filet = () => <span className="h-5 w-px flex-none bg-gray-200 dark:bg-gray-700 mx-1" />;

const ReglagesRapides = ({ docNode }) => {
  const { el, maj } = useMajSelection();
  const deleteElements = useLabelStore((s) => s.deleteElements);
  const duplicateElement = useLabelStore((s) => s.duplicateElement);
  const { ids, aligner, pret } = useAlignementPage(docNode);
  if (!el) return null;
  const rapides = rapidesDe(el).filter((id) => ATOMES[id]);
  const seul = ids.length === 1;
  const ou = seul ? 'sur la page' : 'entre les éléments';

  return (
    <div className="hidden xl:flex flex-none items-center gap-1">
      {rapides.length > 0 && (
        <>
          <Filet />
          {rapides.map((id) => {
            const Atome = ATOMES[id];
            return <Atome key={id} el={el} maj={maj} docNode={docNode} />;
          })}
        </>
      )}
      {pret && ids.length > 0 && (
        <>
          <Filet />
          <button type="button" onClick={() => aligner('center')} className={bouton} title={`Centrer horizontalement (${ou})`}>
            <AlignCenterVertical className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => aligner('middle')} className={bouton} title={`Centrer verticalement (${ou})`}>
            <AlignCenterHorizontal className="h-4 w-4" />
          </button>
        </>
      )}
      {ids.length > 0 && (
        <>
          <Filet />
          {seul && (
            <button type="button" onClick={() => duplicateElement(el.id)} className={bouton} title="Dupliquer">
              <Copy className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => deleteElements(ids)}
            className={`${bouton} text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20`}
            title={seul ? 'Supprimer (Suppr)' : `Supprimer les ${ids.length} éléments (Suppr)`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
};

export default ReglagesRapides;
