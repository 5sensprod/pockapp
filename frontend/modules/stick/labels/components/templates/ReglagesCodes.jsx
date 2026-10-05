// frontend/modules/stick/labels/components/templates/ReglagesCodes.jsx
//
// Les réglages d'un QR CODE, d'un CODE-BARRES et d'une FORME. Des ATOMES en
// `({ el, maj })`, composés par un `Noyau*` par type (les réglages courants,
// en rangées serrées sans titre de section) et, pour la forme, par la barre
// du haut (`ReglagesRapides`). Mêmes clés écrites, mêmes bornes qu'avant.

import React from 'react';
import GradientColorPicker from '../GradientColorPicker';
import { FORMATS_TEXTE_CODE_BARRES } from '../../utils/barcodeText';
import ChampValide from '../ui/ChampValide';
import Curseur from '../ui/Curseur';
import PastilleCouleur from '../ui/PastilleCouleur';
import { CHAMP } from '../ui/styles';

const rangee = 'flex items-center justify-between gap-2 min-h-7';
const groupe = 'flex items-center gap-1.5';
const etiquette = 'text-xs text-gray-500 dark:text-gray-400';

// ── QR code ─────────────────────────────────────────────────────────────────

/** Couleur des modules (unie ou dégradé, `utils/qrImage.js`) et contenu encodé. */
export const NoyauQr = ({ el, maj }) => (
  <div className="space-y-2">
    <div className={rangee}>
      <span className={etiquette}>Couleur</span>
      <GradientColorPicker
        color={el.color || '#000000'}
        gradient={el.fillGradient ?? null}
        onColorChange={(color) => maj({ color })}
        onGradientChange={(g) => maj({ fillGradient: g })}
        title="Couleur des modules"
      />
    </div>
    <input
      type="text"
      value={el.qrValue || ''}
      onChange={(e) => maj({ qrValue: e.target.value })}
      placeholder="Texte, adresse, référence…"
      className={`${CHAMP} w-full`}
      disabled={!!el.dataBinding}
      title="Ce que le QR code encode"
      aria-label="Contenu du QR code"
    />
    {el.dataBinding && (
      <p className="text-[11px] text-gray-500 dark:text-gray-400">Lié au produit : son contenu vient de la fiche.</p>
    )}
  </div>
);

// ── Code-barres ─────────────────────────────────────────────────────────────

/**
 * Couleurs ; hauteur des BARRES, indépendante du cadre, et épaisseur d'un
 * module — c'est elle qui décide de la largeur du symbole et de sa
 * lisibilité au scanner ; présentation du numéro AFFICHÉ (ce qui est encodé
 * ne change pas : un scanner lit les barres).
 * Vide ou 0 valent « auto » : on efface le réglage au lieu d'écrire une
 * largeur nulle, qui ne produirait aucune barre.
 */
export const NoyauBarres = ({ el, maj }) => (
  <div className="space-y-2">
    <div className={rangee}>
      <div className={groupe}>
        <span className={etiquette}>Barres</span>
        <PastilleCouleur couleur={el.lineColor || '#000000'} onCouleur={(lineColor) => maj({ lineColor })} label="Couleur des barres" />
      </div>
      <div className={groupe}>
        <span className={etiquette}>Fond</span>
        <PastilleCouleur couleur={el.background || '#FFFFFF'} onCouleur={(background) => maj({ background })} label="Couleur du fond" />
      </div>
    </div>
    <div className={rangee}>
      <div className={groupe}>
        <span className={etiquette}>Hauteur</span>
        <ChampValide
          valeur={el.barHeight ?? ''}
          min={1}
          max={400}
          placeholder="auto"
          vide={undefined}
          titre="Hauteur des barres (px). Vide : elle suit le cadre. Le numéro garde sa taille."
          className="w-14"
          onValeur={(barHeight) => maj({ barHeight })}
        />
      </div>
      <div className={groupe}>
        <span className={etiquette}>Barre fine</span>
        <ChampValide
          valeur={el.barWidth ?? ''}
          min={0}
          max={6}
          pas={0.5}
          placeholder="auto"
          vide={undefined}
          titre="Largeur d'une barre fine (px). Vide ou 0 : automatique. Plus grande, le symbole est plus large."
          className="w-14"
          onValeur={(v) => maj({ barWidth: v > 0 ? v : undefined })}
        />
      </div>
    </div>
    <label className={rangee}>
      <span className={etiquette}>Numéro</span>
      <select
        value={el.textFormat || 'brut'}
        onChange={(e) => maj({ textFormat: e.target.value })}
        className={`${CHAMP} flex-1 min-w-0`}
        title="Présentation du numéro sous les barres"
      >
        {FORMATS_TEXTE_CODE_BARRES.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
    </label>
  </div>
);

// ── Forme ───────────────────────────────────────────────────────────────────

const estTrait = (el) => (el.shape ?? 'rectangle') === 'line';
const ARRONDI_MAX = 200;

/** Remplissage d'une forme. Un trait n'a pas de surface : couleur unie, opacité gardée. */
export const Remplissage = ({ el, maj }) =>
  estTrait(el) ? (
    <PastilleCouleur couleur={el.fill || '#3b82f6'} onCouleur={(fill) => maj({ fill })} label="Couleur du trait" opacite />
  ) : (
    <GradientColorPicker
      color={el.fill || '#3b82f6'}
      gradient={el.fillGradient ?? null}
      onColorChange={(c) => maj({ fill: c })}
      onGradientChange={(g) => maj({ fillGradient: g })}
      title="Remplissage"
    />
  );

/**
 * Contour d'une forme : couleur (ou dégradé linéaire, Konva ne sait pas
 * mieux) et épaisseur. Sans couleur ni dégradé le contour ne se dessine pas,
 * alors que le sélecteur affiche une couleur de repli : donner une épaisseur
 * pose donc cette couleur.
 */
export const ContourForme = ({ el, maj }) => (
  <div className="flex-none flex items-center gap-1">
    <GradientColorPicker
      color={el.stroke || '#0f172a'}
      gradient={el.strokeGradient ?? null}
      onColorChange={(c) => maj({ stroke: c })}
      onGradientChange={(g) => maj({ strokeGradient: g })}
      title="Couleur du contour"
      lineaireSeulement
    />
    <ChampValide
      valeur={el.strokeWidth ?? 0}
      min={0}
      max={40}
      titre="Épaisseur du contour (px) — 0 : pas de contour"
      className="w-12"
      onValeur={(strokeWidth) =>
        maj({ strokeWidth, ...(strokeWidth > 0 && !el.stroke && !el.strokeGradient ? { stroke: '#0f172a' } : {}) })
      }
    />
  </div>
);

/** Remplissage et contour ; l'arrondi des coins, pour un rectangle seulement. */
export const NoyauForme = ({ el, maj }) => (
  <div className="space-y-2">
    <div className={rangee}>
      <div className={groupe}>
        <span className={etiquette}>{estTrait(el) ? 'Couleur' : 'Fond'}</span>
        <Remplissage el={el} maj={maj} />
      </div>
      <div className={groupe}>
        <span className={etiquette}>Contour</span>
        <ContourForme el={el} maj={maj} />
      </div>
    </div>
    {(el.shape ?? 'rectangle') === 'rectangle' && (
      <Curseur
        label="Arrondi"
        largeurLabel="w-20"
        max={ARRONDI_MAX}
        valeur={el.cornerRadius ?? 0}
        affichage={(v) => `${v}`}
        defaut={0}
        onValeur={(cornerRadius) => maj({ cornerRadius })}
      />
    )}
  </div>
);
