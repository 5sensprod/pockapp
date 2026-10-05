// frontend/modules/stick/labels/components/templates/GenererImage.jsx
//
// GÉNÉRER UNE IMAGE depuis un texte (`lib/generer.ts`), en tête du sous-onglet
// « Génération » de l'onglet Images. Aucune image ne part : la consigne, une
// qualité, un format et une définition. Le résultat est RANGÉ dans la liste
// juste en dessous et n'est PAS posé : un clic sur sa vignette le pose, comme
// toute image.
//
// Le format proposé d'office est le plus proche des proportions de la page.
// Mêmes consigne, qualités, jauge et règle « une requête d'IA à la fois » que
// « Modifier par IA » ; aucun prix affiché.

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
import { CHAMP, LIGNE } from '../ui/styles';
import { usePocketBase } from '@/lib/use-pocketbase';
import { rafraichirCreditsPocketApp } from '@/lib/credits';
import { effacerMessageDetourage, useEtatDetourage } from '../../lib/detourage';
import { useReglagesRetouche } from '../../lib/retouche';
import { DEFINITIONS } from '../../lib/embellir';
import {
  FORMATS_NOMMES,
  IDEES_SUJET,
  formatNomme,
  lancerGeneration,
  peutGenerer,
  useReglagesGenerer,
} from '../../lib/generer';

const GenererImage = () => {
  const pb = usePocketBase();
  const canvasSize = useLabelStore((s) => s.canvasSize);
  const { enCours, erreur, info, tache } = useEtatDetourage();
  const { consigne, qualite } = useReglagesRetouche();
  const reglages = useReglagesGenerer();
  // Pas encore choisi : le format le plus proche de la page
  const format = formatNomme(reglages.format, canvasSize);
  const { definition } = reglages;

  const refus = peutGenerer(enCours, consigne);
  const lancer = () => {
    if (!refus.ok) return;
    lancerGeneration(
      { consigne, qualite, format, definition },
      {
        pb,
        store: useLabelStore,
        bibliotheque: presetImageService,
        apresDecompte: rafraichirCreditsPocketApp,
      }
    );
  };
  const message =
    tache !== 'generation'
      ? null
      : erreur
        ? { ton: 'erreur', texte: erreur.message }
        : info
          ? { ton: info.ton, texte: info.message }
          : null;

  return (
    <div className="space-y-1.5">
      <TitreGroupe titre="Générer une image" />
      <ConsigneIA
        placeholder="Décrivez l'image voulue (ex. : une guitare acoustique sur fond de bois clair)"
        idees={IDEES_SUJET}
        onValider={lancer}
      />
      <label className={LIGNE}>
        <span>Format</span>
        <select
          value={format}
          onChange={(e) => useReglagesGenerer.setState({ format: e.target.value })}
          className={`${CHAMP} flex-1 min-w-0`}
          title="Les proportions de l'image. D'office, le format le plus proche de la page. La qualité Soignée prend le format le plus proche qu'elle connaît."
        >
          {FORMATS_NOMMES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <Segments
        label="Définition"
        valeur={definition}
        onValeur={(d) => useReglagesGenerer.setState({ definition: d })}
        options={DEFINITIONS}
      />
      <Bouton
        icone={Sparkles}
        plein
        desactive={!refus.ok}
        titre={
          refus.ok
            ? "Génère une image et la range ci-dessous (service payant). Elle n'est pas posée : cliquez sa vignette pour la poser."
            : refus.raison
        }
        onClic={lancer}
      >
        {enCours && tache === 'generation' ? 'Génération en cours…' : "Générer l'image"}
      </Bouton>
      <JaugeDetourage tache="generation" />
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

export default GenererImage;
