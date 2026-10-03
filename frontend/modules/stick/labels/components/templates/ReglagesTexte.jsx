// frontend/modules/stick/labels/components/templates/ReglagesTexte.jsx
//
// Les réglages d'un TEXTE, section par section, pour `ReglagesPanel` (onglet
// Texte, à la place des propositions quand un texte est sélectionné). Repris
// de la barre d'options (`PropertyPanel`) : MÊMES clés écrites, mêmes bornes —
// seul l'emplacement change. Chaque section reçoit `{ el, maj, docNode }`.

import React from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Highlighter,
  Italic,
  Strikethrough,
  Underline,
} from 'lucide-react';
import FontSelector from '../FontSelector';
import GradientColorPicker from '../GradientColorPicker';
import Curseur from '../ui/Curseur';
import { TYPO_BORNES } from '../../utils/typo';
import PastilleCouleur from '../ui/PastilleCouleur';
import Segments from '../ui/Segments';
import { CHAMP, LIGNE as ligne, boutonBascule as bouton } from '../ui/styles';

const champ = `${CHAMP} w-16 text-right`;

const TAILLE_MIN = 4;
const TAILLE_MAX = 400;
const CONTOUR_MAX = 40;


/** Police et taille (px). Taille bornée : 0 ou vide rendrait le texte invisible. */
export const Police = ({ el, maj }) => (
  <div className="space-y-2">
    <div className={ligne}>
      <span>Police</span>
      <FontSelector
        value={el.fontFamily || 'Arial'}
        onChange={(fontFamily) => maj({ fontFamily })}
        apiKey={import.meta.env.VITE_GOOGLE_FONTS_KEY}
      />
    </div>
    <label className={ligne}>
      <span>Taille (px)</span>
      <input
        type="number"
        min={TAILLE_MIN}
        max={TAILLE_MAX}
        step={1}
        value={Math.round(el.fontSize ?? 16)}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n > 0) maj({ fontSize: Math.min(TAILLE_MAX, Math.max(TAILLE_MIN, n)) });
        }}
        className={champ}
      />
    </label>
  </div>
);

/** Gras, italique, souligné, barré, surlignage — tous en un clic. */
export const Style = ({ el, maj }) => {
  // fontStyle Konva : 'normal' | 'bold' | 'italic' | 'italic bold'
  const gras = (el.fontStyle || '').includes('bold');
  const italique = (el.fontStyle || '').includes('italic');
  const style = (g, i) => maj({ fontStyle: g && i ? 'italic bold' : g ? 'bold' : i ? 'italic' : 'normal' });
  // textDecoration Konva : '' | 'underline' | 'line-through' | 'underline line-through'
  const deco = (el.textDecoration || '').split(' ').filter(Boolean);
  const souligne = deco.includes('underline');
  const barre = deco.includes('line-through');
  const decoration = (s, b) => maj({ textDecoration: [s && 'underline', b && 'line-through'].filter(Boolean).join(' ') });
  const surligne = !!el.highlightEnabled;

  const boutons = [
    ['Gras', Bold, gras, () => style(!gras, italique)],
    ['Italique', Italic, italique, () => style(gras, !italique)],
    ['Souligné', Underline, souligne, () => decoration(!souligne, barre)],
    ['Barré', Strikethrough, barre, () => decoration(souligne, !barre)],
    [
      'Surligner',
      Highlighter,
      surligne,
      () => maj({ highlightEnabled: !surligne, highlightColor: el.highlightColor || '#FFFF00' }),
    ],
  ];
  return (
    <div className="flex items-center gap-1">
      {boutons.map(([label, Icone, actif, basculer]) => (
        <button key={label} type="button" onClick={basculer} className={bouton(actif)} title={label} aria-pressed={actif}>
          <Icone className="h-4 w-4" />
        </button>
      ))}
      {/* La couleur du surlignage : toujours là, la choisir l'active */}
      <span className="ml-1">
        <PastilleCouleur
          couleur={el.highlightColor || '#FFFF00'}
          onCouleur={(highlightColor) => maj({ highlightColor, highlightEnabled: true })}
          label="Couleur du surlignage"
        />
      </span>
    </div>
  );
};

const ALIGNEMENTS = [
  ['left', 'Texte à gauche', AlignLeft],
  ['center', 'Texte centré', AlignCenter],
  ['right', 'Texte à droite', AlignRight],
  ['justify', 'Texte justifié', AlignJustify],
];

/**
 * Alignement du texte DANS son bloc. Sans largeur fixée, le bloc épouse le
 * texte et l'alignement ne se verrait pas : on lui donne sa largeur actuelle.
 */
export const Alignement = ({ el, maj, docNode }) => {
  const largeurMesuree = () => {
    const w = docNode?.findOne(`#${el.id}`)?.getClientRect({ skipShadow: true, relativeTo: docNode })?.width;
    return w ? Math.round(w) : null;
  };
  const fixe = el.width != null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {ALIGNEMENTS.map(([valeur, label, Icone]) => (
          <button
            key={valeur}
            type="button"
            onClick={() => {
              const m = { align: valeur };
              // Sans largeur fixée, le bloc épouse le texte : on lui en donne une
              if (!fixe) {
                const w = largeurMesuree();
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
      {/* La largeur du bloc, visible et réversible : choisir un alignement la
          fixait sans le dire, et rien ne permettait de revenir en arrière */}
      <div className={ligne}>
        <span>Largeur du bloc</span>
        <div className="w-40">
          <Segments
            label="Largeur du bloc"
            valeur={fixe}
            onValeur={(v) => {
              if (v === fixe) return;
              if (!v) return maj({ width: undefined });
              const w = largeurMesuree();
              if (w) maj({ width: w });
            }}
            options={[
              { id: false, label: 'Auto', titre: 'Le bloc épouse le texte' },
              { id: true, label: fixe ? `${Math.round(el.width)} px` : 'Fixe', titre: 'Le texte se range dans une largeur fixe, et passe à la ligne' },
            ]}
          />
        </div>
      </div>
    </div>
  );
};

/** Couleur du texte : unie, dégradé ou texture. */
export const Couleur = ({ el, maj }) => (
  <div className={ligne}>
    <span>Couleur du texte</span>
    <GradientColorPicker
      color={el.color || '#000000'}
      gradient={el.fillGradient ?? null}
      onColorChange={(color) => maj({ color })}
      onGradientChange={(g) => maj({ fillGradient: g })}
      title="Couleur"
    />
  </div>
);

/** Lettres, interligne, hauteur des lettres, courbure (`utils/typo.js`). */
export const Espacement = ({ el, maj }) => (
  <div className="space-y-3">
    {[
      ['letterSpacing', 'Entre les lettres', 1, (v) => `${v}px`],
      ['lineHeight', 'Interligne', 0.05, (v) => `×${v}`],
      ['charHeight', 'Hauteur des lettres', 5, (v) => `${v}%`],
      ['curve', 'Courbure', 1, (v) => `${v}`],
    ].map(([cle, libelle, step, fmt]) => {
      const b = TYPO_BORNES[cle];
      return (
        <Curseur
          key={cle}
          disposition="bloc"
          label={libelle}
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

/**
 * Contour des lettres : couleur (ou dégradé linéaire) et épaisseur. Les deux
 * vont ensemble — sans épaisseur rien ne se voit, sans couleur non plus :
 * choisir l'une pose l'autre.
 */
export const Contour = ({ el, maj }) => (
  <div className="space-y-2">
    <div className={ligne}>
      <span>Couleur du contour</span>
      <GradientColorPicker
        color={el.stroke || '#000000'}
        gradient={el.strokeGradient ?? null}
        onColorChange={(c) => maj({ stroke: c, ...(el.strokeWidth > 0 ? {} : { strokeWidth: 2 }) })}
        onGradientChange={(g) => maj({ strokeGradient: g, ...(g && !(el.strokeWidth > 0) ? { strokeWidth: 2 } : {}) })}
        title="Contour du texte"
        lineaireSeulement
      />
    </div>
    <label className={ligne}>
      <span>Épaisseur (px)</span>
      <input
        type="number"
        min={0}
        max={CONTOUR_MAX}
        step={0.5}
        value={el.strokeWidth ?? 0}
        onChange={(e) => {
          const strokeWidth = Number(e.target.value);
          maj({ strokeWidth, ...(strokeWidth > 0 && !el.stroke && !el.strokeGradient ? { stroke: '#000000' } : {}) });
        }}
        className={champ}
      />
    </label>
  </div>
);
