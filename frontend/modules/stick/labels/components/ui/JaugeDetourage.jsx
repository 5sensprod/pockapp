// frontend/modules/stick/labels/components/ui/JaugeDetourage.jsx
//
// LA JAUGE des tâches d'IA sur une image : le détourage (`lib/detourage.ts`) et
// la retouche par consigne (`lib/retouche.ts`), et l'embellissement de la page
// (`lib/embellir.ts`) — une seule à la fois. Le serveur ne rend aucun
// avancement pendant le calcul : elle dit l'ÉTAPE en cours (quatre segments),
// jamais un pourcentage. Pendant l'étape « détourage », un temps restant
// ESTIMÉ depuis les détourages précédents du poste ; passé la durée habituelle,
// une phrase rassurante, jamais de compte à rebours négatif.
//
// L'état vit dans `useEtatDetourage` (zustand) : la jauge se monte où l'on veut
// — sous le bouton « Détourer », et dans la barre du haut (`compact`), qui
// reste visible quand la sélection change et que le panneau est remplacé.
// `tache` : ne se montrer que pour cette tâche (sous SON bouton) ; sans elle,
// pour celle qui est en cours, quelle qu'elle soit (barre du haut).

import React, { useEffect, useState } from 'react';
import { Scissors, Wand2 } from 'lucide-react';
import { ETAPES_DETOURAGE, libellesDe, messageJauge, useEtatDetourage } from '../../lib/detourage';
import { AIDE } from './styles';

const JaugeDetourage = ({ compact = false, tache }) => {
  const enCours = useEtatDetourage((s) => s.enCours);
  const tacheEnCours = useEtatDetourage((s) => s.tache);
  const etape = useEtatDetourage((s) => s.etape);
  const debutEtape = useEtatDetourage((s) => s.debutEtape);
  const habituelMs = useEtatDetourage((s) => s.habituelMs);
  // Une seconde suffit : l'estimation se dit par pas de 5 s
  const [, battre] = useState(0);
  useEffect(() => {
    if (!enCours) return undefined;
    const minuterie = setInterval(() => battre((n) => n + 1), 1000);
    return () => clearInterval(minuterie);
  }, [enCours]);

  if (!enCours || !etape || (tache && tache !== tacheEnCours)) return null;
  const retouche = tacheEnCours !== 'detourage';
  const Icone = retouche ? Wand2 : Scissors;
  const message = messageJauge(etape, habituelMs, Date.now() - debutEtape, libellesDe(tacheEnCours));
  const rang = ETAPES_DETOURAGE.indexOf(etape);
  const segments = (
    <div className="flex gap-0.5" aria-hidden="true">
      {ETAPES_DETOURAGE.map((e, i) => (
        <span
          key={e}
          className={`h-1 flex-1 rounded-full ${
            i < rang
              ? 'bg-blue-600 dark:bg-blue-500'
              : i === rang
                ? 'bg-blue-600 dark:bg-blue-500 animate-pulse'
                : 'bg-gray-200 dark:bg-gray-600'
          }`}
        />
      ))}
    </div>
  );

  if (compact) {
    // Barre du haut : l'étape et, s'il y en a une, l'estimation courte. La phrase
    // longue (attente prolongée) passe en infobulle.
    const court = message.prolongee ? 'plus long que d’habitude' : message.detail;
    return (
      <div
        role="status"
        aria-live="polite"
        title={message.prolongee ? message.detail : `${retouche ? 'Modification' : 'Détourage'} en cours : vous pouvez continuer à travailler.`}
        className="w-44 text-[11px] leading-snug text-gray-600 dark:text-gray-300"
      >
        <div className="flex items-center gap-1.5 mb-1 min-w-0">
          <Icone className="h-3.5 w-3.5 flex-none text-blue-600 dark:text-blue-400" />
          <span className="truncate">
            {message.etape}
            {court ? ` · ${court}` : '…'}
          </span>
        </div>
        {segments}
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className="space-y-1">
      {segments}
      <p className={AIDE}>
        <span className="text-gray-700 dark:text-gray-200">
          {message.etape}
          {message.detail && !message.prolongee ? ` · ${message.detail}` : '…'}
        </span>
        {message.prolongee && <span className="block">{message.detail}</span>}
      </p>
    </div>
  );
};

export default JaugeDetourage;
