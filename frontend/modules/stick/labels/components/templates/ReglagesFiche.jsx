// frontend/modules/stick/labels/components/templates/ReglagesFiche.jsx
//
// Les réglages d'une FICHE produit (tableau des caractéristiques, points
// forts…), pour `ReglagesPanel`. Repris de la barre d'options
// (`PropertyPanel`) : mêmes clés écrites. `StyleTableau` est le contenu de
// l'ancien menu « Style du tableau », déplacé TEL QUEL.

import React from 'react';
import FontSelector from '../FontSelector';
import { SECTIONS_FICHE, sectionParId } from '../../utils/ficheProduit';
import { FICHE_PAR_DEFAUT } from '../../utils/ficheKonva';
import PastilleCouleur from '../ui/PastilleCouleur';
import { CHAMP as champ, LIGNE as ligne } from '../ui/styles';


/** Section, titre, police, taille, nombre de lignes. */
export const Contenu = ({ el, maj }) => (
  <div className="space-y-2">
    <label className={ligne}>
      <span>Section</span>
      {/* L'ancien titre par défaut suit le changement ; un titre retouché à la main est gardé. */}
      <select
        value={el.section ?? 'specs'}
        onChange={(e) => {
          const avant = sectionParId(el.section);
          const apres = sectionParId(e.target.value);
          const m = { section: apres.id };
          if ((el.title ?? '') === avant.titre) m.title = apres.titre;
          maj(m);
        }}
        className={champ}
      >
        {SECTIONS_FICHE.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
    <label className="block text-xs text-gray-700 dark:text-gray-300">
      <span>Titre</span>
      <input
        type="text"
        value={el.title ?? ''}
        onChange={(e) => maj({ title: e.target.value })}
        placeholder="Sans titre"
        className={`${champ} w-full mt-1`}
      />
    </label>
    <div className={ligne}>
      <span>Police</span>
      <FontSelector value={el.fontFamily || 'Arial'} onChange={(fontFamily) => maj({ fontFamily })} />
    </div>
    <label className={ligne}>
      <span>Taille</span>
      <input
        type="number"
        min={4}
        max={200}
        value={Math.round(el.fontSize ?? FICHE_PAR_DEFAUT.fontSize)}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (n > 0) maj({ fontSize: Math.min(200, Math.max(4, n)) });
        }}
        className={`${champ} w-20 text-right`}
      />
    </label>
    <label className={ligne}>
      <span title="Au-delà, la suite est coupée">Lignes max</span>
      <input
        type="number"
        min={1}
        max={50}
        value={el.maxLines ?? FICHE_PAR_DEFAUT.maxLines}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (n > 0) maj({ maxLines: Math.min(50, n) });
        }}
        className={`${champ} w-20 text-right`}
      />
    </label>
  </div>
);

/** Couleurs, lignes alternées, colonne des noms, cadre, ligne mise en avant. */
export const StyleTableau = ({ el, maj }) => (
  <div className="space-y-2 text-xs text-gray-600 dark:text-gray-300">
    {[
      ['titleColor', 'Titre'],
      ['labelColor', (el.section ?? 'specs') === 'specs' ? 'Noms' : 'Puces'],
      ['color', 'Texte'],
      ['lineColor', 'Traits'],
    ].map(([cle, label]) => (
      <label key={cle} className="flex items-center justify-between gap-2">
        {label}
        <PastilleCouleur couleur={el[cle] ?? FICHE_PAR_DEFAUT[cle]} onCouleur={(v) => maj({ [cle]: v })} label={label} />
      </label>
    ))}
    {(el.section ?? 'specs') === 'specs' && (
      <>
        <label className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={el.stripe ?? FICHE_PAR_DEFAUT.stripe}
              onChange={(e) => maj({ stripe: e.target.checked })}
            />
            Lignes alternées
          </span>
          <PastilleCouleur
            couleur={el.stripeColor ?? FICHE_PAR_DEFAUT.stripeColor}
            onCouleur={(stripeColor) => maj({ stripeColor })}
            label="Couleur des lignes alternées"
          />
        </label>
        <label className="block">
          <span className="flex justify-between">
            Colonne des noms
            <span>{Math.round((el.colRatio ?? FICHE_PAR_DEFAUT.colRatio) * 100)} %</span>
          </span>
          <input
            type="range"
            min={0.15}
            max={0.8}
            step={0.01}
            value={el.colRatio ?? FICHE_PAR_DEFAUT.colRatio}
            onChange={(e) => maj({ colRatio: Number(e.target.value) })}
            className="w-full"
          />
        </label>

        <div className="pt-2 border-t border-gray-200 dark:border-gray-700 font-medium">Cadre</div>
        <label className="flex items-center justify-between gap-2">
          Bordure
          <select
            value={el.frame ?? FICHE_PAR_DEFAUT.frame}
            onChange={(e) => maj({ frame: e.target.value })}
            className="px-1.5 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="none">Aucune</option>
            <option value="outer">Encadré</option>
            <option value="grid">Grille</option>
          </select>
        </label>
        {(el.frame ?? FICHE_PAR_DEFAUT.frame) !== 'none' && (
          <>
            <label className="flex items-center justify-between gap-2">
              Couleur
              <PastilleCouleur
                couleur={el.borderColor ?? FICHE_PAR_DEFAUT.borderColor}
                onCouleur={(borderColor) => maj({ borderColor })}
                label="Couleur de la bordure"
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              Épaisseur
              <input
                type="number"
                min={0}
                max={12}
                step={0.5}
                value={el.borderWidth ?? FICHE_PAR_DEFAUT.borderWidth}
                onChange={(e) => maj({ borderWidth: Math.max(0, Number(e.target.value) || 0) })}
                className="w-14 px-1.5 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              Arrondi
              <input
                type="number"
                min={0}
                max={60}
                value={el.radius ?? FICHE_PAR_DEFAUT.radius}
                onChange={(e) => maj({ radius: Math.max(0, Number(e.target.value) || 0) })}
                className="w-14 px-1.5 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </label>
          </>
        )}
        <label className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={!!el.labelBg}
              onChange={(e) => maj({ labelBg: e.target.checked ? '#e5e7eb' : '' })}
            />
            Fond des noms
          </span>
          {el.labelBg && (
            <PastilleCouleur couleur={el.labelBg} onCouleur={(labelBg) => maj({ labelBg })} label="Fond des noms" />
          )}
        </label>

        <div className="pt-2 border-t border-gray-200 dark:border-gray-700 font-medium">Ligne mise en avant</div>
        <label className="flex items-center justify-between gap-2">
          N° de ligne (0 : aucune)
          <input
            type="number"
            min={0}
            max={50}
            value={el.highlightRow ?? FICHE_PAR_DEFAUT.highlightRow}
            onChange={(e) => maj({ highlightRow: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
            className="w-14 px-1.5 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </label>
        {(el.highlightRow ?? FICHE_PAR_DEFAUT.highlightRow) > 0 && (
          <>
            <label className="flex items-center justify-between gap-2">
              Couleur
              <PastilleCouleur
                couleur={el.highlightColor ?? FICHE_PAR_DEFAUT.highlightColor}
                onCouleur={(highlightColor) => maj({ highlightColor })}
                label="Couleur de la ligne mise en avant"
              />
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={el.highlightBold ?? FICHE_PAR_DEFAUT.highlightBold}
                onChange={(e) => maj({ highlightBold: e.target.checked })}
              />
              Valeur en gras
            </label>
          </>
        )}
      </>
    )}
  </div>
);
