// frontend/modules/stick/labels/components/templates/ReglagesTexte.jsx
//
// Les réglages d'un TEXTE. Des ATOMES (`Taille`, `GrasItalique`,
// `CouleurTexte`…), tous en `({ el, maj, docNode })`, que composent :
// - `Noyau` : les réglages COURANTS, en quatre rangées serrées en tête de
//   l'onglet Texte, sans titre de section ni libellé redondant ;
// - `ReglagesRapides` : les mêmes atomes dans la barre du haut.
// Un même atome aux deux endroits, donc une seule écriture : MÊMES clés,
// mêmes bornes qu'avant — seul l'emplacement change.

import React from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Highlighter,
  Italic,
  Minus,
  Plus,
  Strikethrough,
  Underline,
} from 'lucide-react';
import FontSelector from '../FontSelector';
import GradientColorPicker from '../GradientColorPicker';
import Curseur from '../ui/Curseur';
import { CASSES, TYPO_BORNES, casseDe } from '../../utils/typo';
import ChampValide from '../ui/ChampValide';
import PastilleCouleur from '../ui/PastilleCouleur';
import Segments from '../ui/Segments';
import { BOUTON_ICONE, boutonBascule as bouton } from '../ui/styles';

const TAILLE_MIN = 4;
const TAILLE_MAX = 400;
const CONTOUR_MAX = 40;
const borner = (v, min, max) => Math.min(max, Math.max(min, v));

// ── Atomes ──────────────────────────────────────────────────────────────────

/** Taille de la police (px), 4 à 400 : − champ +. */
export const Taille = ({ el, maj }) => {
  const taille = Math.round(el.fontSize ?? 16);
  const poser = (n) => maj({ fontSize: borner(n, TAILLE_MIN, TAILLE_MAX) });
  return (
    <div className="flex-none flex items-center" role="group" aria-label="Taille de la police">
      <button type="button" onClick={(e) => poser(taille - (e.shiftKey ? 10 : 1))} className={`${BOUTON_ICONE} w-6`} title="Plus petit (Maj : −10)">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <ChampValide valeur={taille} onValeur={poser} min={TAILLE_MIN} max={TAILLE_MAX} titre="Taille de la police (px)" className="w-11 px-1" />
      <button type="button" onClick={(e) => poser(taille + (e.shiftKey ? 10 : 1))} className={`${BOUTON_ICONE} w-6`} title="Plus grand (Maj : +10)">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

// fontStyle Konva : 'normal' | 'bold' | 'italic' | 'italic bold'
const styleDe = (el) => ({ gras: (el.fontStyle || '').includes('bold'), italique: (el.fontStyle || '').includes('italic') });
const fontStyle = (g, i) => (g && i ? 'italic bold' : g ? 'bold' : i ? 'italic' : 'normal');
// textDecoration Konva : '' | 'underline' | 'line-through' | 'underline line-through'
const decoDe = (el) => {
  const d = (el.textDecoration || '').split(' ').filter(Boolean);
  return { souligne: d.includes('underline'), barre: d.includes('line-through') };
};
const textDecoration = (s, b) => [s && 'underline', b && 'line-through'].filter(Boolean).join(' ');

const Bascules = ({ boutons }) => (
  <div className="flex-none flex items-center gap-0.5">
    {boutons.map(([label, Icone, actif, basculer]) => (
      <button key={label} type="button" onClick={basculer} className={bouton(actif)} title={label} aria-pressed={actif}>
        <Icone className="h-4 w-4" />
      </button>
    ))}
  </div>
);

/** Gras et italique. */
export const GrasItalique = ({ el, maj }) => {
  const { gras, italique } = styleDe(el);
  return (
    <Bascules
      boutons={[
        ['Gras', Bold, gras, () => maj({ fontStyle: fontStyle(!gras, italique) })],
        ['Italique', Italic, italique, () => maj({ fontStyle: fontStyle(gras, !italique) })],
      ]}
    />
  );
};

/** Souligné et barré. */
export const Decorations = ({ el, maj }) => {
  const { souligne, barre } = decoDe(el);
  return (
    <Bascules
      boutons={[
        ['Souligné', Underline, souligne, () => maj({ textDecoration: textDecoration(!souligne, barre) })],
        ['Barré', Strikethrough, barre, () => maj({ textDecoration: textDecoration(souligne, !barre) })],
      ]}
    />
  );
};

/** Couleur du texte : unie, dégradé ou texture. */
export const CouleurTexte = ({ el, maj }) => (
  <GradientColorPicker
    color={el.color || '#000000'}
    gradient={el.fillGradient ?? null}
    onColorChange={(color) => maj({ color })}
    onGradientChange={(g) => maj({ fillGradient: g })}
    title="Couleur du texte"
  />
);

/**
 * Contour des lettres : couleur (ou dégradé linéaire) et épaisseur. Les deux
 * vont ensemble — sans épaisseur rien ne se voit, sans couleur non plus :
 * choisir l'une pose l'autre.
 */
export const ContourSimple = ({ el, maj }) => (
  <div className="flex-none flex items-center gap-1">
    <GradientColorPicker
      color={el.stroke || '#000000'}
      gradient={el.strokeGradient ?? null}
      onColorChange={(c) => maj({ stroke: c, ...(el.strokeWidth > 0 ? {} : { strokeWidth: 2 }) })}
      onGradientChange={(g) => maj({ strokeGradient: g, ...(g && !(el.strokeWidth > 0) ? { strokeWidth: 2 } : {}) })}
      title="Couleur du contour"
      lineaireSeulement
    />
    <ChampValide
      valeur={el.strokeWidth ?? 0}
      min={0}
      max={CONTOUR_MAX}
      pas={0.5}
      titre="Épaisseur du contour (px) — 0 : pas de contour"
      className="w-10 px-1"
      onValeur={(strokeWidth) =>
        maj({ strokeWidth, ...(strokeWidth > 0 && !el.stroke && !el.strokeGradient ? { stroke: '#000000' } : {}) })
      }
    />
  </div>
);

/** Surlignage (stabilo) : la bascule, et sa couleur — la choisir l'active. */
export const Surlignage = ({ el, maj }) => {
  const actif = !!el.highlightEnabled;
  return (
    <div className="flex-none flex items-center gap-1">
      <button
        type="button"
        onClick={() => maj({ highlightEnabled: !actif, highlightColor: el.highlightColor || '#FFFF00' })}
        className={bouton(actif)}
        title="Surligner"
        aria-pressed={actif}
      >
        <Highlighter className="h-4 w-4" />
      </button>
      <PastilleCouleur
        couleur={el.highlightColor || '#FFFF00'}
        onCouleur={(highlightColor) => maj({ highlightColor, highlightEnabled: true })}
        label="Couleur du surlignage"
      />
    </div>
  );
};

const ALIGNEMENTS = [
  ['left', 'Texte à gauche', AlignLeft],
  ['center', 'Texte centré', AlignCenter],
  ['right', 'Texte à droite', AlignRight],
  ['justify', 'Texte justifié', AlignJustify],
];
const largeurMesuree = (el, docNode) => {
  const w = docNode?.findOne(`#${el.id}`)?.getClientRect({ skipShadow: true, relativeTo: docNode })?.width;
  return w ? Math.round(w) : null;
};

/**
 * Alignement du texte DANS son bloc. Sans largeur fixée, le bloc épouse le
 * texte et l'alignement ne se verrait pas : on lui donne sa largeur actuelle
 * — `LargeurBloc`, juste dessous, le montre et permet d'y revenir.
 */
export const Alignement = ({ el, maj, docNode }) => (
  <div className="flex-none flex items-center gap-0.5">
    {ALIGNEMENTS.map(([valeur, label, Icone]) => (
      <button
        key={valeur}
        type="button"
        onClick={() => {
          const m = { align: valeur };
          if (el.width == null) {
            const w = largeurMesuree(el, docNode);
            if (w) m.width = w;
          }
          maj(m);
        }}
        className={bouton((el.align ?? 'left') === valeur)}
        title={label}
        aria-pressed={(el.align ?? 'left') === valeur}
      >
        <Icone className="h-4 w-4" />
      </button>
    ))}
  </div>
);

/** La largeur du bloc : automatique (il épouse le texte) ou fixe (le texte passe à la ligne). */
export const LargeurBloc = ({ el, maj, docNode }) => {
  const fixe = el.width != null;
  return (
    <Segments
      label="Largeur du bloc"
      valeur={fixe}
      onValeur={(v) => {
        if (v === fixe) return;
        if (!v) return maj({ width: undefined });
        const w = largeurMesuree(el, docNode);
        if (w) maj({ width: w });
      }}
      options={[
        { id: false, label: 'Auto', titre: 'Le bloc épouse le texte' },
        { id: true, label: fixe ? `${Math.round(el.width)} px` : 'Fixe', titre: 'Le texte se range dans une largeur fixe, et passe à la ligne' },
      ]}
    />
  );
};

/** La casse : normale, MAJUSCULES, minuscules, Une Majuscule Par Mot (`utils/typo.js`). */
export const Casse = ({ el, maj }) => (
  <Segments label="Casse du texte" options={CASSES} valeur={casseDe(el)} onValeur={(casse) => maj({ casse })} />
);

// ── Le noyau de l'onglet Texte ──────────────────────────────────────────────

const rangee = 'flex items-center justify-between gap-2 min-h-7';
const etiquette = 'text-xs text-gray-500 dark:text-gray-400';

/**
 * LES RÉGLAGES COURANTS d'un texte, en cinq rangées : police et taille ;
 * style et alignement ; couleur, contour, surlignage ; casse ; largeur du bloc.
 * 150 px au lieu de quatre sections dépliées sur 550.
 */
export const Noyau = ({ el, maj, docNode }) => (
  <div className="space-y-2">
    <div className={rangee}>
      <div className="flex-1 min-w-0">
        <FontSelector
          value={el.fontFamily || 'Arial'}
          onChange={(fontFamily) => maj({ fontFamily })}
          apiKey={import.meta.env.VITE_GOOGLE_FONTS_KEY}
          largeur="w-full"
        />
      </div>
      <Taille el={el} maj={maj} />
    </div>
    <div className={rangee}>
      <div className="flex items-center gap-0.5">
        <GrasItalique el={el} maj={maj} />
        <Decorations el={el} maj={maj} />
      </div>
      <Alignement el={el} maj={maj} docNode={docNode} />
    </div>
    <div className={rangee}>
      <div className="flex items-center gap-1.5">
        <span className={etiquette}>Couleur</span>
        <CouleurTexte el={el} maj={maj} />
      </div>
      <div className="flex items-center gap-1.5">
        <span className={etiquette}>Contour</span>
        <ContourSimple el={el} maj={maj} />
      </div>
      <Surlignage el={el} maj={maj} />
    </div>
    <div className={rangee}>
      <span className={etiquette}>Casse</span>
      <div className="w-44">
        <Casse el={el} maj={maj} />
      </div>
    </div>
    <div className={rangee}>
      <span className={etiquette}>Largeur</span>
      <div className="w-44">
        <LargeurBloc el={el} maj={maj} docNode={docNode} />
      </div>
    </div>
  </div>
);

/** Lettres, interligne, hauteur des lettres, courbure (`utils/typo.js`). */
export const Espacement = ({ el, maj }) => (
  <div className="space-y-2">
    {[
      ['letterSpacing', 'Lettres', 1, (v) => `${v}px`],
      ['lineHeight', 'Interligne', 0.05, (v) => `×${v}`],
      ['charHeight', 'Hauteur', 5, (v) => `${v}%`],
      ['curve', 'Courbure', 1, (v) => `${v}`],
    ].map(([cle, libelle, step, fmt]) => {
      const b = TYPO_BORNES[cle];
      return (
        <Curseur
          key={cle}
          label={libelle}
          largeurLabel="w-20"
          min={b.min}
          max={b.max}
          step={step}
          valeur={el[cle] ?? b.defaut}
          defaut={b.defaut}
          affichage={(x) => fmt(Math.round(x * 100) / 100)}
          onValeur={(x) => maj({ [cle]: x })}
        />
      );
    })}
  </div>
);
