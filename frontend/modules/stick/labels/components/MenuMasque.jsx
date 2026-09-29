// frontend/modules/stick/labels/components/MenuMasque.jsx
//
// Le menu « Masque » (forme, retrait, fondu, texture), partagé par l'IMAGE et
// la FORME dans PropertyPanel. Le rendu diffère : `sceneFunc` pour une image
// (`utils/imageForme.js`), filtre sur le cache pour une forme
// (`utils/effetsKonva.js`) — mais le masque est construit par la même
// fonction, `dessinerMasque`.

import React from 'react';
import { Shapes } from 'lucide-react';
import MenuGroupe from './MenuGroupe';
import MasqueTexture from './MasqueTexture';
import { FONDU_MAX, MASQUES, RETRAIT_MAX } from '../utils/imageForme';

const MenuMasque = ({ element, onChange }) => (
  <MenuGroupe
    icone={Shapes}
    titre="Masque"
    actif={!!(element.mask || element.maskTexture || element.maskPadding || element.maskFeather)}
    largeur="16rem"
  >
    <div className="grid grid-cols-3 gap-1.5 p-1">
      <button
        type="button"
        onClick={() => onChange({ mask: null })}
        className={`h-12 rounded border text-[10px] text-gray-600 dark:text-gray-300 ${
          !element.mask ? 'ring-2 ring-blue-500 border-transparent' : 'border-gray-300 dark:border-gray-600'
        }`}
      >
        Aucun
      </button>
      {MASQUES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange({ mask: m.id })}
          className={`h-12 p-1.5 rounded border ${
            element.mask === m.id
              ? 'ring-2 ring-blue-500 border-transparent'
              : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
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
      <label key={cle} className="flex items-center gap-2 px-1 pt-2 text-xs text-gray-600 dark:text-gray-300">
        <span className="w-14">{libelle}</span>
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={element[cle] ?? 0}
          onChange={(e) => onChange({ [cle]: Number(e.target.value) })}
          className="flex-1"
        />
        <span className="w-8 text-right">{element[cle] ?? 0}%</span>
      </label>
    ))}
    <MasqueTexture
      valeur={element.maskTexture ?? null}
      onChange={(maskTexture) => onChange({ maskTexture })}
    />
  </MenuGroupe>
);

export default MenuMasque;
