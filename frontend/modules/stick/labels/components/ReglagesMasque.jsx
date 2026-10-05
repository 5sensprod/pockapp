// frontend/modules/stick/labels/components/ReglagesMasque.jsx
//
// Les réglages du « Masque » (forme, retrait, fondu, texture), partagés par
// l'IMAGE, la FORME et le TEXTE, affichés à plat dans `ReglagesPanel`. Le
// rendu diffère : `sceneFunc` pour une image (`utils/imageForme.js`), filtre
// sur le cache pour une forme ou un texte (`utils/effetsKonva.js`) — mais le
// masque est construit par la même fonction, `dessinerMasque`.

import React from 'react';
import Curseur from './ui/Curseur';
import MasqueTexture from './MasqueTexture';
import { TUILE } from './ui/styles';
import { FONDU_MAX, MASQUES, RETRAIT_MAX } from '../utils/imageForme';

const ReglagesMasque = ({ element, onChange }) => (
  <>
    <div className="grid grid-cols-3 gap-1.5 p-1">
      <button
        type="button"
        onClick={() => onChange({ mask: null })}
        className={`${TUILE} h-12 text-[11px] text-gray-600 dark:text-gray-300 ${!element.mask ? 'ring-2 ring-blue-500' : ''}`}
      >
        Aucun
      </button>
      {MASQUES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange({ mask: m.id })}
          className={`${TUILE} h-12 p-1.5 ${element.mask === m.id ? 'ring-2 ring-blue-500' : ''}`}
          title={m.label}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <path d={m.d} className="fill-gray-700 dark:fill-gray-200" />
          </svg>
        </button>
      ))}
    </div>
    {/* Retrait (rétrécit la forme dans le cadre) et fondu de son bord */}
    {[
      ['maskPadding', 'Retrait', RETRAIT_MAX],
      ['maskFeather', 'Fondu', FONDU_MAX],
    ].map(([cle, libelle, max]) => (
      <Curseur
        key={cle}
        label={libelle}
        largeurLabel="w-14"
        className="px-1 pt-2"
        max={max}
        valeur={element[cle] ?? 0}
        affichage={(v) => `${v}%`}
        onValeur={(v) => onChange({ [cle]: v })}
      />
    ))}
    <MasqueTexture
      valeur={element.maskTexture ?? null}
      onChange={(maskTexture) => onChange({ maskTexture })}
    />
  </>
);

export default ReglagesMasque;
