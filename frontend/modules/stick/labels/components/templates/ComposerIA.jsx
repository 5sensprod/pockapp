// frontend/modules/stick/labels/components/templates/ComposerIA.jsx
//
// COMPOSER PAR IA (`lib/composer.ts`), dans le panneau de réglages d'une
// sélection MULTIPLE : les éléments sélectionnés (2 à 4 images, formes ou
// dessins) servent d'ingrédients à une nouvelle image. Elle revient comme un
// NOUVEAU CALQUE au-dessus de tout (Ctrl+Z le retire) et reste rangée dans
// « Génération ». Les ingrédients ne sont ni modifiés ni retirés.
//
// Rien pour un élément seul, rien en planche. Une sélection refusée (un texte,
// un élément verrouillé, plus de 4 éléments) laisse le bloc visible et le
// bouton désactivé, la raison en infobulle : rien n'est jamais tronqué.
// Mêmes consigne, qualités, formats, jauge et règle « une requête d'IA à la
// fois » que « Embellir la page » ; aucun prix affiché.

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
import { DEFINITIONS, FORMATS, useReglagesEmbellir } from '../../lib/embellir';
import {
  INGREDIENTS_MAX,
  composerPropose,
  elementsSelectionnes,
  lancerComposition,
  peutComposer,
} from '../../lib/composer';
import { rendreElement } from '../../utils/renduPage';

const ComposerIA = ({ docNode }) => {
  const pb = usePocketBase();
  const etat = useLabelStore();
  const { enCours, erreur, info, tache } = useEtatDetourage();
  const { consigne, qualite } = useReglagesRetouche();
  // Format et définition : les mêmes choix, et le même état, que « Embellir »
  const { format, definition } = useReglagesEmbellir();

  const message =
    tache !== 'composition'
      ? null
      : erreur
        ? { ton: 'erreur', texte: erreur.message }
        : info
          ? { ton: info.ton, texte: info.message }
          : null;
  // Le bloc reste le temps de SA requête et de son message, même si la sélection change
  const sienne = tache === 'composition' && (enCours || !!message);
  if (!composerPropose(etat) && !sienne) return null;

  const ingredients = elementsSelectionnes(etat);
  const refus = !docNode
    ? { ok: false, raison: "La page n'est pas encore disponible." }
    : peutComposer(etat, ingredients, enCours, consigne);
  const ferme = !peutComposer(etat, ingredients, false).ok;
  const lancer = () => {
    if (!refus.ok) return;
    lancerComposition(
      { consigne, qualite, format, definition },
      ingredients.map((e) => e.id),
      {
        pb,
        store: useLabelStore,
        bibliotheque: presetImageService,
        apresDecompte: rafraichirCreditsPocketApp,
        rendreSeul: (id, coteMax) => {
          const { canvasSize, elements } = useLabelStore.getState();
          return rendreElement(docNode, id, {
            width: canvasSize.width,
            height: canvasSize.height,
            coteMax,
            ids: elements.map((e) => e.id),
          });
        },
      }
    );
  };

  return (
    <div className="space-y-1.5 py-3 border-t border-gray-200 dark:border-gray-700">
      <TitreGroupe titre="Composer par IA" compte={ingredients.length || undefined} />
      <p className={AIDE}>
        Les éléments sélectionnés ({INGREDIENTS_MAX} au plus : images, formes, dessins) servent d'ingrédients à une
        nouvelle image. Ils restent sur la page.
      </p>
      <ConsigneIA
        placeholder="Décrivez l'image à composer (ex. : ces instruments sur une scène, lumière chaude)"
        desactive={ferme}
        onValider={lancer}
      />
      <label className={LIGNE}>
        <span>Format</span>
        <select
          value={format}
          onChange={(e) => useReglagesEmbellir.setState({ format: e.target.value })}
          className={`${CHAMP} flex-1 min-w-0`}
          title="Les proportions de l'image rendue. « Celui de la page » prend le format le plus proche des proportions de la page."
        >
          {FORMATS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
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
            ? 'Ajoute un calque généré au-dessus de la page (service payant). Ctrl+Z le retire ; il reste dans « Génération ».'
            : refus.raison
        }
        onClic={lancer}
      >
        {enCours && tache === 'composition' ? 'Composition en cours…' : 'Composer'}
      </Bouton>
      <JaugeDetourage tache="composition" />
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

export default ComposerIA;
