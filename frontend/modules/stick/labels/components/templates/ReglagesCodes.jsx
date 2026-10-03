// frontend/modules/stick/labels/components/templates/ReglagesCodes.jsx
//
// Les réglages d'un QR CODE, d'un CODE-BARRES et d'une FORME, section par
// section, pour `ReglagesPanel`. Repris de la barre d'options
// (`PropertyPanel`) : mêmes clés écrites, mêmes bornes — seul l'emplacement
// change. Chaque section reçoit `{ el, maj }`.

import React from 'react';
import GradientColorPicker from '../GradientColorPicker';
import { composerCouleur, decomposerCouleur } from '../../utils/paint';
import { FORMATS_TEXTE_CODE_BARRES } from '../../utils/barcodeText';
import { CHAMP as champ, LIGNE as ligne, PASTILLE as pastille } from '../ui/styles';


// ── QR code ─────────────────────────────────────────────────────────────────

/** Couleur des modules : unie ou dégradé (`utils/qrImage.js`). */
export const CouleurQr = ({ el, maj }) => (
  <div className={ligne}>
    <span>Couleur des modules</span>
    <GradientColorPicker
      color={el.color || '#000000'}
      gradient={el.fillGradient ?? null}
      onColorChange={(color) => maj({ color })}
      onGradientChange={(g) => maj({ fillGradient: g })}
      title="Couleur des modules"
    />
  </div>
);

/** Ce que le QR encode. Lié à un produit, il vient de la fiche. */
export const ContenuQr = ({ el, maj }) => (
  <div>
    <input
      type="text"
      value={el.qrValue || ''}
      onChange={(e) => maj({ qrValue: e.target.value })}
      placeholder="Texte, URL, SKU..."
      className={`${champ} w-full`}
      disabled={!!el.dataBinding}
    />
    {el.dataBinding && (
      <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
        Ce QR code est lié au produit : son contenu vient de la fiche.
      </p>
    )}
  </div>
);

// ── Code-barres ─────────────────────────────────────────────────────────────

export const CouleursBarres = ({ el, maj }) => (
  <div className="space-y-2">
    <label className={ligne}>
      <span>Barres</span>
      <input type="color" value={el.lineColor || '#000000'} onChange={(e) => maj({ lineColor: e.target.value })} className={pastille} />
    </label>
    <label className={ligne}>
      <span>Fond</span>
      <input type="color" value={el.background || '#FFFFFF'} onChange={(e) => maj({ background: e.target.value })} className={pastille} />
    </label>
  </div>
);

/**
 * Hauteur des BARRES, indépendante du cadre (vide : elle suit le cadre), et
 * épaisseur d'un module — c'est elle qui décide de la largeur du symbole et
 * de sa lisibilité au scanner. Vide ou 0 valent « auto » : on efface le
 * réglage au lieu d'écrire une largeur nulle, qui ne produirait aucune barre.
 */
export const Barres = ({ el, maj }) => (
  <div className="space-y-2">
    <label className={ligne}>
      <span>Hauteur des barres (px)</span>
      <input
        type="number"
        min={1}
        max={400}
        step={1}
        placeholder="auto"
        value={el.barHeight ?? ''}
        onChange={(e) => maj({ barHeight: e.target.value === '' ? undefined : Number(e.target.value) })}
        className={`${champ} w-20 text-right`}
        title="Vide : elle suit le cadre. Le numéro sous les barres garde sa taille."
      />
    </label>
    <label className={ligne}>
      <span>Largeur d'une barre fine (px)</span>
      <input
        type="number"
        min={0}
        max={6}
        step={0.5}
        placeholder="auto"
        value={el.barWidth ?? ''}
        onChange={(e) => {
          const saisie = Number(e.target.value);
          maj({ barWidth: e.target.value === '' || saisie <= 0 ? undefined : saisie });
        }}
        className={`${champ} w-20 text-right`}
        title="Vide ou 0 : largeur automatique. Plus elle est grande, plus le symbole est large et trapu."
      />
    </label>
    <p className="text-[11px] text-gray-500 dark:text-gray-400">Vide : automatique.</p>
  </div>
);

/** Groupement du numéro AFFICHÉ. Ce qui est encodé ne change pas : un scanner lit les barres. */
export const Numero = ({ el, maj }) => (
  <label className={ligne}>
    <span>Présentation</span>
    <select value={el.textFormat || 'brut'} onChange={(e) => maj({ textFormat: e.target.value })} className={champ}>
      {FORMATS_TEXTE_CODE_BARRES.map((f) => (
        <option key={f.id} value={f.id}>
          {f.label}
        </option>
      ))}
    </select>
  </label>
);

// ── Forme ───────────────────────────────────────────────────────────────────

/** Remplissage d'une forme. Un trait n'a pas de surface : couleur unie, opacité gardée. */
export const Remplissage = ({ el, maj }) => (
  <div className={ligne}>
    <span>{(el.shape ?? 'rectangle') === 'line' ? 'Couleur du trait' : 'Remplissage'}</span>
    {(el.shape ?? 'rectangle') === 'line' ? (
      <input
        type="color"
        value={decomposerCouleur(el.fill || '#3b82f6').hex}
        onChange={(e) => maj({ fill: composerCouleur(e.target.value, decomposerCouleur(el.fill || '#3b82f6').alpha) })}
        className={pastille}
      />
    ) : (
      <GradientColorPicker
        color={el.fill || '#3b82f6'}
        gradient={el.fillGradient ?? null}
        onColorChange={(c) => maj({ fill: c })}
        onGradientChange={(g) => maj({ fillGradient: g })}
        title="Remplissage"
      />
    )}
  </div>
);

/**
 * Contour d'une forme : couleur (ou dégradé linéaire, Konva ne sait pas
 * mieux) et épaisseur. Sans couleur ni dégradé le contour ne se dessine pas,
 * alors que le sélecteur affiche une couleur de repli : donner une épaisseur
 * pose donc cette couleur.
 */
export const ContourForme = ({ el, maj }) => (
  <div className="space-y-2">
    <div className={ligne}>
      <span>Couleur du contour</span>
      <GradientColorPicker
        color={el.stroke || '#0f172a'}
        gradient={el.strokeGradient ?? null}
        onColorChange={(c) => maj({ stroke: c })}
        onGradientChange={(g) => maj({ strokeGradient: g })}
        title="Contour"
        lineaireSeulement
      />
    </div>
    <label className={ligne}>
      <span>Épaisseur (px)</span>
      <input
        type="number"
        min={0}
        max={40}
        step={1}
        value={el.strokeWidth ?? 0}
        onChange={(e) => {
          const strokeWidth = Number(e.target.value);
          maj({ strokeWidth, ...(strokeWidth > 0 && !el.stroke && !el.strokeGradient ? { stroke: '#0f172a' } : {}) });
        }}
        className={`${champ} w-20 text-right`}
      />
    </label>
  </div>
);
