// frontend/modules/stick/labels/components/templates/ReglagesImage.jsx
//
// Les réglages d'une IMAGE, section par section, pour `ReglagesPanel` (onglet
// Médias, à la place de la bibliothèque quand une image est sélectionnée).
// Repris de la barre d'options (`PropertyPanel`) : mêmes clés écrites — seul
// l'emplacement change. Chaque section reçoit `{ el, maj }`.

import React from 'react';
import { FlipHorizontal2, FlipVertical2 } from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
import Curseur from '../ui/Curseur';
import { geometrieImage } from '../canvas/CropOverlay';
import { estContenu } from '../../utils/ajustementImage';
import { resetCropAttrs } from '../../utils/crop';
import { resolvePropForElement } from '../../utils/dataBinding';

const choix = (actif) =>
  `flex-1 px-2 py-1.5 text-xs rounded border ${
    actif
      ? 'bg-blue-500 text-white border-blue-500'
      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700'
  }`;
const action =
  'flex-1 px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * Ajustement (`utils/ajustementImage.js`) et recadrage. Contenir montre la
 * photo entière : il n'y a alors rien à recadrer.
 */
export const Ajustement = ({ el, maj }) => {
  const cropId = useLabelStore((s) => s.cropId);
  const startCrop = useLabelStore((s) => s.startCrop);
  const stopCrop = useLabelStore((s) => s.stopCrop);
  const produit = useLabelStore((s) => s.selectedProduct);

  if (cropId === el.id) {
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
        <p className="text-[11px] text-gray-500 dark:text-gray-400">Recadrage en cours : déplacez l'image dans son cadre.</p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={stopCrop}
            className="flex-1 px-2 py-1.5 text-xs rounded bg-teal-600 hover:bg-teal-700 text-white"
            title="Entrée ou Échap"
          >
            Valider le recadrage
          </button>
          <button type="button" onClick={reinitialiser} className={action} title="Revenir à l'image entière">
            Réinitialiser
          </button>
        </div>
      </div>
    );
  }

  const contenu = estContenu(el);
  return (
    <div className="space-y-2">
      <div className="flex gap-1" role="group" aria-label="Ajustement de l'image">
        {[
          [false, 'Remplir', "L'image couvre le cadre ; le recadrage choisit la partie visible"],
          [true, 'Contenir', "L'image entière, centrée dans le cadre — pour une photo liée au produit"],
        ].map(([contenir, libelle, aide]) => (
          <button
            key={libelle}
            type="button"
            onClick={() => maj({ fit: contenir ? 'contain' : 'cover' })}
            className={choix(contenu === contenir)}
            title={aide}
            aria-pressed={contenu === contenir}
          >
            {libelle}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => startCrop(el.id)}
          disabled={contenu}
          className={action}
          title={contenu ? '' : "Recadrer (ou double-clic sur l'image)"}
        >
          Recadrer
        </button>
      </div>
      {contenu && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          En Contenir, l'image est entière : passez en Remplir pour la recadrer.
        </p>
      )}
    </div>
  );
};

/** Miroir horizontal et vertical (`utils/imageForme.js`). */
export const Miroir = ({ el, maj }) => (
  <div className="flex gap-1">
    {[
      ['flipX', FlipHorizontal2, 'Horizontal'],
      ['flipY', FlipVertical2, 'Vertical'],
    ].map(([cle, Icone, libelle]) => (
      <button
        key={cle}
        type="button"
        onClick={() => maj({ [cle]: !el[cle] })}
        className={`${choix(!!el[cle])} flex items-center justify-center gap-1.5`}
        title={`Miroir ${libelle.toLowerCase()}`}
        aria-pressed={!!el[cle]}
      >
        <Icone className="h-4 w-4" />
        {libelle}
      </button>
    ))}
  </div>
);

/** Opacité de l'image, 0 à 1 par pas de 0,1 (comme dans la barre). */
export const Opacite = ({ el, maj }) => (
  <Curseur
    disposition="bloc"
    label="Opacité"
    min={0}
    max={1}
    step={0.1}
    valeur={el.opacity ?? 1}
    affichage={(v) => `${Math.round(v * 100)} %`}
    onValeur={(opacity) => maj({ opacity })}
  />
);

/** Taille du cadre, en lecture seule. */
export const Dimensions = ({ el }) => (
  <p className="text-xs text-gray-600 dark:text-gray-400 tabular-nums">
    {Math.round(el.width ?? 160)} × {Math.round(el.height ?? 160)} px
  </p>
);
