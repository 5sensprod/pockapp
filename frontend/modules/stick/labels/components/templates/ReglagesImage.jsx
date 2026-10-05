// frontend/modules/stick/labels/components/templates/ReglagesImage.jsx
//
// Les réglages d'une IMAGE (onglet Médias, à la place de la bibliothèque
// quand une image est sélectionnée). Des ATOMES en `({ el, maj })`, composés
// par `Noyau` (les réglages courants, en quatre rangées sans titre) et par la
// barre du haut (`ReglagesRapides`). Mêmes clés écrites qu'avant.

import React from 'react';
import { Crop, FlipHorizontal2, FlipVertical2, Scissors } from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
import Curseur from '../ui/Curseur';
import { geometrieImage } from '../canvas/CropOverlay';
import { estContenu } from '../../utils/ajustementImage';
import { resetCropAttrs } from '../../utils/crop';
import { resolvePropForElement } from '../../utils/dataBinding';
import Segments from '../ui/Segments';
import Bouton from '../ui/Bouton';
import Note from '../ui/Note';
import presetImageService from '../../services/presetImageService';
import JaugeDetourage from '../ui/JaugeDetourage';
import { usePocketBase } from '@/lib/use-pocketbase';
import { rafraichirCreditsPocketApp } from '@/lib/credits';
import {
  effacerMessageDetourage,
  lancerDetourage,
  peutDetourer,
  useEtatDetourage,
} from '../../lib/detourage';
import { BOUTON_ACTION, BOUTON_PRINCIPAL, boutonBascule } from '../ui/styles';

// ── Atomes ──────────────────────────────────────────────────────────────────

/**
 * Ajustement (`utils/ajustementImage.js`) : Remplir couvre le cadre et se
 * recadre ; Contenir montre la photo entière, quelles que soient ses proportions.
 */
export const Ajustement = ({ el, maj }) => (
  <Segments
    label="Ajustement de l'image"
    valeur={estContenu(el)}
    onValeur={(contenir) => maj({ fit: contenir ? 'contain' : 'cover' })}
    options={[
      { id: false, label: 'Remplir', titre: "L'image couvre le cadre ; le recadrage choisit la partie visible" },
      { id: true, label: 'Contenir', titre: "L'image entière, centrée dans le cadre — pour une photo liée au produit" },
    ]}
  />
);

/** Recadrer : en Contenir l'image est entière, il n'y a rien à recadrer. */
export const Recadrer = ({ el }) => {
  const startCrop = useLabelStore((s) => s.startCrop);
  const contenu = estContenu(el);
  return (
    <button
      type="button"
      onClick={() => startCrop(el.id)}
      disabled={contenu}
      className={`${BOUTON_ACTION} flex-none`}
      title={contenu ? "En Contenir, l'image est entière : passez en Remplir pour la recadrer" : "Recadrer (ou double-clic sur l'image)"}
    >
      <Crop className="h-4 w-4" />
      Recadrer
    </button>
  );
};

/** Miroir horizontal et vertical (`utils/imageForme.js`). */
export const Miroirs = ({ el, maj }) => (
  <div className="flex-none flex items-center gap-0.5">
    {[
      ['flipX', FlipHorizontal2, 'Miroir horizontal'],
      ['flipY', FlipVertical2, 'Miroir vertical'],
    ].map(([cle, Icone, titre]) => (
      <button
        key={cle}
        type="button"
        onClick={() => maj({ [cle]: !el[cle] })}
        className={boutonBascule(!!el[cle])}
        title={titre}
        aria-pressed={!!el[cle]}
      >
        <Icone className="h-4 w-4" />
      </button>
    ))}
  </div>
);

/**
 * Détourer (`lib/detourage.ts`) : le détourage IA remplace la photo, sans
 * aperçu ; Ctrl+Z rend l'originale, et l'image détourée reste rangée dans
 * « Génération ». Bouton SECONDAIRE : l'aplat bleu est pris par la validation.
 * Désactivé, la raison en infobulle. Le résultat et les erreurs sont dans une
 * Note, pas un message fugitif. Pendant l'attente, `JaugeDetourage` dit l'étape
 * — ici et dans la barre du haut, qui reste visible si la sélection change.
 */
export const Detourer = ({ el }) => {
  const pb = usePocketBase();
  // La sélection entière, pas seulement les images : `nombre` de `useMajSelection` n'en compte que du même type
  const nombre = useLabelStore((s) => (s.selectedId ? 1 + s.extraIds.length : 0));
  const { enCours, erreur, info } = useEtatDetourage();
  const refus = peutDetourer(el, nombre, enCours);
  const message = erreur
    ? { ton: 'erreur', texte: erreur.message }
    : info
      ? { ton: info.ton, texte: info.message }
      : null;
  return (
    <div className="space-y-1.5">
      <Bouton
        icone={Scissors}
        plein
        desactive={!refus.ok}
        titre={refus.ok ? "Retire le fond de l'image (service payant). Ctrl+Z rend la photo d'origine." : refus.raison}
        onClic={() =>
          lancerDetourage(el, nombre, {
            pb,
            store: useLabelStore,
            bibliotheque: presetImageService,
            // Le solde de l'en-tête ne se relit que toutes les 5 minutes
            apresDecompte: rafraichirCreditsPocketApp,
          })
        }
      >
        {enCours ? 'Détourage en cours…' : 'Détourer'}
      </Bouton>
      <JaugeDetourage />
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

// Pendant un recadrage : valider, ou revenir à l'image entière
const RecadrageEnCours = ({ el, maj }) => {
  const stopCrop = useLabelStore((s) => s.stopCrop);
  const produit = useLabelStore((s) => s.selectedProduct);
  // Taille d'origine lue sur l'image elle-même : l'image entière revient, à la même échelle
  const reinitialiser = () => {
    const img = document.createElement('img');
    img.onload = () =>
      maj({
        ...resetCropAttrs(geometrieImage(el), { width: img.naturalWidth, height: img.naturalHeight }),
        scaleX: 1,
        scaleY: 1,
      });
    img.src = resolvePropForElement(el.src, el, produit);
  };
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-500 dark:text-gray-400">Recadrage : déplacez l'image dans son cadre.</p>
      <div className="flex gap-1">
        <button type="button" onClick={stopCrop} className={`${BOUTON_PRINCIPAL} flex-1`} title="Entrée ou Échap">
          Valider
        </button>
        <button type="button" onClick={reinitialiser} className={`${BOUTON_ACTION} flex-1`} title="Revenir à l'image entière">
          Réinitialiser
        </button>
      </div>
    </div>
  );
};

// ── Le noyau de l'onglet Médias ─────────────────────────────────────────────

const rangee = 'flex items-center justify-between gap-2 min-h-7';

/**
 * LES RÉGLAGES COURANTS d'une image, en quatre rangées : ajustement et
 * recadrage ; miroirs et taille du cadre ; opacité ; détourage.
 */
export const Noyau = ({ el, maj }) => {
  const cropId = useLabelStore((s) => s.cropId);
  if (cropId === el.id) return <RecadrageEnCours el={el} maj={maj} />;
  return (
    <div className="space-y-2">
      <div className={rangee}>
        <div className="flex-1 min-w-0">
          <Ajustement el={el} maj={maj} />
        </div>
        <Recadrer el={el} />
      </div>
      <div className={rangee}>
        <Miroirs el={el} maj={maj} />
        {/* La taille du cadre, pour information */}
        <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
          {Math.round(el.width ?? 160)} × {Math.round(el.height ?? 160)} px
        </span>
      </div>
      {/* Opacité, 0 à 1 par pas de 0,1 (comme avant) */}
      <Curseur
        label="Opacité"
        largeurLabel="w-20"
        min={0}
        max={1}
        step={0.1}
        valeur={el.opacity ?? 1}
        affichage={(v) => `${Math.round(v * 100)} %`}
        defaut={1}
        onValeur={(opacity) => maj({ opacity })}
      />
      <Detourer el={el} />
    </div>
  );
};
