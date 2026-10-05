// frontend/modules/stick/labels/components/templates/RetoucherElement.jsx
//
// MODIFIER PAR IA une FORME ou un DESSIN seul (`lib/retouche-seul.ts`), dans le
// panneau de réglages d'un élément sélectionné. Son rendu seul part à la même
// porte que « Modifier par IA » d'une image, avec la même consigne et la même
// qualité ; le résultat revient en NOUVEAU CALQUE image juste au-dessus de
// l'élément, qui reste dessous, intact (Ctrl+Z retire le calque ; il reste rangé
// dans « Génération »). Jamais en planche ; aucun prix affiché ; une seule
// requête d'IA à la fois.

import React from 'react';
import { Wand2 } from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
import presetImageService from '../../services/presetImageService';
import Bouton from '../ui/Bouton';
import Note from '../ui/Note';
import TitreGroupe from '../ui/TitreGroupe';
import JaugeDetourage from '../ui/JaugeDetourage';
import ConsigneIA from './ConsigneIA';
import { DetournerEnsuite } from './ReglagesImage';
import { AIDE } from '../ui/styles';
import { usePocketBase } from '@/lib/use-pocketbase';
import { rafraichirCreditsPocketApp } from '@/lib/credits';
import { effacerMessageDetourage, useEtatDetourage } from '../../lib/detourage';
import { useReglagesRetouche } from '../../lib/retouche';
import { lancerRetoucheSeul, peutRetoucherSeul, retoucheSeulPropose } from '../../lib/retouche-seul';
import { rendreElement } from '../../utils/renduPage';

const RetoucherElement = ({ el, docNode }) => {
  const pb = usePocketBase();
  const etat = useLabelStore();
  const nombre = etat.selectedId ? 1 + etat.extraIds.length : 0;
  const { enCours, erreur, info, tache } = useEtatDetourage();
  const { consigne, qualite, detourerEnsuite } = useReglagesRetouche();

  const message =
    tache !== 'retouche'
      ? null
      : erreur
        ? { ton: 'erreur', texte: erreur.message }
        : info
          ? { ton: info.ton, texte: info.message }
          : null;
  // Une seule forme ou un seul dessin sélectionné
  const propose = retoucheSeulPropose(el) && nombre === 1;
  if (!propose) return null;

  const refus = !docNode
    ? { ok: false, raison: "La page n'est pas encore disponible." }
    : peutRetoucherSeul(el, nombre, etat, enCours, consigne);
  const ferme = !peutRetoucherSeul(el, nombre, etat, false).ok;
  const lancer = () => {
    if (!refus.ok) return;
    lancerRetoucheSeul(
      el,
      { consigne, qualite, detourerEnsuite },
      {
        pb,
        store: useLabelStore,
        bibliotheque: presetImageService,
        apresDecompte: rafraichirCreditsPocketApp,
        rendreSeul: (id, coteMax, surZone) => {
          const { canvasSize, elements } = useLabelStore.getState();
          return rendreElement(docNode, id, {
            width: canvasSize.width,
            height: canvasSize.height,
            coteMax,
            ids: elements.map((e) => e.id),
            surZone,
          });
        },
      }
    );
  };

  return (
    <div className="space-y-1.5 py-3 border-t border-gray-200 dark:border-gray-700">
      <TitreGroupe titre="Modifier par IA" />
      <p className={AIDE}>
        L'élément est rendu seul, puis modifié : le résultat est une nouvelle image posée au-dessus. L'élément reste
        dessous.
      </p>
      <ConsigneIA
        placeholder="Décrivez le changement (ex. : donne-lui un effet or brossé)"
        desactive={ferme}
        onValider={lancer}
      />
      <DetournerEnsuite desactive={ferme} />
      <Bouton
        icone={Wand2}
        plein
        desactive={!refus.ok}
        titre={
          refus.ok
            ? 'Ajoute une image modifiée au-dessus de cet élément (service payant). Ctrl+Z la retire ; elle reste dans « Génération ».'
            : refus.raison
        }
        onClic={lancer}
      >
        {enCours && tache === 'retouche' ? 'Modification en cours…' : 'Modifier par IA'}
      </Bouton>
      <JaugeDetourage tache="retouche" />
      {message && (
        <Note
          ton={message.ton}
          action={
            <Bouton variante="discret" onClic={effacerMessageDetourage}>
              Fermer
            </Bouton>
          }
        >
          {message.texte}
        </Note>
      )}
    </div>
  );
};

export default RetoucherElement;
