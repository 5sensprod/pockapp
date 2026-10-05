// frontend/modules/stick/labels/components/templates/EmbellirPage.jsx
//
// EMBELLIR LA PAGE PAR IA (`lib/embellir.ts`), dans l'onglet « Page ». Le
// rendu de la page part au service ; l'image revient comme un NOUVEAU CALQUE
// sur la même page (Ctrl+Z le retire) et reste rangée dans « Génération ».
// Rien de la page n'est modifié.
//
// - « Décor seul » : textes, codes et données produit ne partent pas et
//   restent par-dessus ; le format est celui de la page.
// - « Page entière » : tout part, au format choisi ; l'image revient à plat.
//
// Absent en planche (décision du propriétaire). Mêmes consigne, qualités,
// jauge et règle « une requête d'IA à la fois » que « Modifier par IA ».

import React from 'react';
import { Sparkles } from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
import presetImageService from '../../services/presetImageService';
import Bouton from '../ui/Bouton';
import Note from '../ui/Note';
import Segments from '../ui/Segments';
import TitreGroupe from '../ui/TitreGroupe';
import JaugeDetourage from '../ui/JaugeDetourage';
import ConsigneIA from './ConsigneIA';
import { AIDE, CHAMP, LIGNE } from '../ui/styles';
import { usePocketBase } from '@/lib/use-pocketbase';
import { rafraichirCreditsPocketApp } from '@/lib/credits';
import { effacerMessageDetourage, useEtatDetourage } from '../../lib/detourage';
import { useReglagesRetouche } from '../../lib/retouche';
import {
  DEFINITIONS,
  FORMATS,
  MODES,
  lancerEmbellissement,
  peutEmbellir,
  useReglagesEmbellir,
} from '../../lib/embellir';
import { rendrePage } from '../../utils/renduPage';

const EmbellirPage = ({ docNode }) => {
  const pb = usePocketBase();
  const etat = useLabelStore();
  const { enCours, erreur, info, tache } = useEtatDetourage();
  const { consigne, qualite } = useReglagesRetouche();
  const { mode, format, definition } = useReglagesEmbellir();

  // Pas en planche : la page y est une case d'étiquette
  if (etat.formatTirage === 'planche' || etat.lockCanvasToSheetCell) return null;

  const refus = !docNode
    ? { ok: false, raison: "La page n'est pas encore disponible." }
    : peutEmbellir(etat, enCours, consigne);
  const ferme = !peutEmbellir(etat, false).ok;
  const lancer = () => {
    if (!refus.ok) return;
    lancerEmbellissement(
      { consigne, qualite, mode, format, definition },
      {
        pb,
        store: useLabelStore,
        bibliotheque: presetImageService,
        apresDecompte: rafraichirCreditsPocketApp,
        rendre: (masques, coteMax) => {
          const { width, height } = useLabelStore.getState().canvasSize;
          return rendrePage(docNode, { width, height, coteMax, masques });
        },
      }
    );
  };
  const message =
    tache !== 'embellir'
      ? null
      : erreur
        ? { ton: 'erreur', texte: erreur.message }
        : info
          ? { ton: info.ton, texte: info.message }
          : null;

  return (
    <div className="space-y-1.5">
      <TitreGroupe titre="Embellir par IA" />
      <Segments
        label="Ce que l'IA transforme"
        valeur={mode}
        onValeur={(m) => useReglagesEmbellir.setState({ mode: m })}
        options={MODES}
      />
      <p className={AIDE}>
        {mode === 'decor'
          ? 'Textes, codes et données produit restent tels quels, par-dessus le nouveau décor.'
          : "Toute la page devient une image : l'IA peut modifier un texte, un prix ou un code. Vérifiez-les."}
      </p>
      <ConsigneIA
        placeholder={
          mode === 'decor'
            ? 'Décrivez le décor voulu (ex. : ambiance de Noël, tons chauds)'
            : 'Décrivez le rendu voulu (ex. : affiche vintage)'
        }
        desactive={ferme}
        onValider={lancer}
      />
      {mode === 'entiere' && (
        <label className={LIGNE}>
          <span>Format</span>
          <select
            value={format}
            onChange={(e) => useReglagesEmbellir.setState({ format: e.target.value })}
            className={`${CHAMP} flex-1 min-w-0`}
            title="Les proportions de l'image rendue. La qualité Soignée prend le format le plus proche qu'elle connaît."
          >
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <Segments
        label="Définition"
        valeur={definition}
        onValeur={(d) => useReglagesEmbellir.setState({ definition: d })}
        options={DEFINITIONS}
      />
      <Bouton
        icone={Sparkles}
        plein
        desactive={!refus.ok}
        titre={
          refus.ok
            ? 'Ajoute un calque généré sur cette page (service payant). Ctrl+Z le retire ; il reste dans « Génération ».'
            : refus.raison
        }
        onClic={lancer}
      >
        {enCours && tache === 'embellir' ? 'Embellissement en cours…' : 'Embellir la page'}
      </Bouton>
      <JaugeDetourage tache="embellir" />
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

export default EmbellirPage;
