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
// Ni Dupliquer ni Supprimer ici (décision du propriétaire) : ils sont dans
// le bandeau du panneau, et Suppr au clavier.
// Aucune couleur ici : la fenêtre du sélecteur déborde depuis la barre, les
// couleurs restent dans la barre latérale.
// Masqué sous 1280 px de fenêtre (`xl:`) : la barre ne doit jamais déborder.

import React from 'react';
import { AlignCenterHorizontal, AlignCenterVertical } from 'lucide-react';
import { rapidesDe } from '../utils/reglagesParType';
import { useAlignementPage } from './useAlignementPage';
import { useMajSelection } from './useMajSelection';
import { Ajustement, Miroirs } from './templates/ReglagesImage';
import { Casse, GrasItalique, Taille } from './templates/ReglagesTexte';
import { BOUTON_ICONE as bouton } from './ui/styles';

/** Identifiant de réglage rapide → atome. */
const ATOMES = {
  taille: Taille,
  grasItalique: GrasItalique,
  // Le contrôle segmenté s'étire : on lui donne sa largeur
  ajustementImage: (props) => (
    <div className="w-36 flex-none">
      <Ajustement {...props} />
    </div>
  ),
  miroirs: Miroirs,
  casse: (props) => (
    <div className="w-40 flex-none">
      <Casse {...props} />
    </div>
  ),
};

const Filet = () => <span className="h-5 w-px flex-none bg-gray-200 dark:bg-gray-700 mx-1" />;

const ReglagesRapides = ({ docNode }) => {
  const { el, maj } = useMajSelection();
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
    </div>
  );
};

export default ReglagesRapides;
