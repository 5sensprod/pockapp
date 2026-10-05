// frontend/modules/stick/labels/components/templates/ReglagesFiche.jsx
//
// Les réglages d'une FICHE produit (tableau des caractéristiques, points
// forts…), pour `ReglagesPanel`. Repris de la barre d'options
// (`PropertyPanel`) : mêmes clés écrites. `StyleTableau` est le contenu de
// l'ancien menu « Style du tableau » ; il est passé sur les contrôles communs
// le 3 octobre 2026 (interrupteurs, curseur, champs validés), sans changer une
// clé ni une borne appliquée.

import React from 'react';
import FontSelector from '../FontSelector';
import { SECTIONS_FICHE, sectionParId } from '../../utils/ficheProduit';
import { FICHE_PAR_DEFAUT } from '../../utils/ficheKonva';
import ChampValide from '../ui/ChampValide';
import Curseur from '../ui/Curseur';
import Interrupteur from '../ui/Interrupteur';
import PastilleCouleur from '../ui/PastilleCouleur';
import TitreGroupe from '../ui/TitreGroupe';
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
      <ChampValide
        valeur={Math.round(el.fontSize ?? FICHE_PAR_DEFAUT.fontSize)}
        onValeur={(fontSize) => maj({ fontSize })}
        min={4}
        max={200}
        titre="Taille du texte de la fiche"
        className="w-14"
      />
    </label>
    <label className={ligne}>
      <span title="Au-delà, la suite est coupée">Lignes max</span>
      <ChampValide
        valeur={el.maxLines ?? FICHE_PAR_DEFAUT.maxLines}
        onValeur={(n) => maj({ maxLines: Math.round(n) })}
        min={1}
        max={50}
        titre="Nombre de lignes au plus : au-delà, la suite est coupée"
        className="w-14"
      />
    </label>
  </div>
);

/** Couleurs, lignes alternées, colonne des noms, cadre, ligne mise en avant. */
export const StyleTableau = ({ el, maj }) => {
  const tableau = (el.section ?? 'specs') === 'specs';
  const cadre = el.frame ?? FICHE_PAR_DEFAUT.frame;
  const ligneForte = el.highlightRow ?? FICHE_PAR_DEFAUT.highlightRow;
  return (
    <div className="space-y-2">
      {[
        ['titleColor', 'Titre'],
        ['labelColor', tableau ? 'Noms' : 'Puces'],
        ['color', 'Texte'],
        ['lineColor', 'Traits'],
      ].map(([cle, label]) => (
        <label key={cle} className={ligne}>
          <span>{label}</span>
          <PastilleCouleur couleur={el[cle] ?? FICHE_PAR_DEFAUT[cle]} onCouleur={(v) => maj({ [cle]: v })} label={label} />
        </label>
      ))}
      {tableau && (
        <>
          <div className={ligne}>
            <span>Lignes alternées</span>
            <span className="flex items-center gap-2">
              <PastilleCouleur
                couleur={el.stripeColor ?? FICHE_PAR_DEFAUT.stripeColor}
                onCouleur={(stripeColor) => maj({ stripeColor })}
                label="Couleur des lignes alternées"
              />
              <Interrupteur
                actif={el.stripe ?? FICHE_PAR_DEFAUT.stripe}
                onActif={(stripe) => maj({ stripe })}
                label="Lignes alternées"
              />
            </span>
          </div>
          <Curseur
            disposition="bloc"
            label="Colonne des noms"
            min={0.15}
            max={0.8}
            step={0.01}
            valeur={el.colRatio ?? FICHE_PAR_DEFAUT.colRatio}
            affichage={(v) => `${Math.round(v * 100)} %`}
            onValeur={(colRatio) => maj({ colRatio })}
          />

          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <TitreGroupe titre="Cadre" />
          </div>
          <label className={ligne}>
            <span>Bordure</span>
            <select value={cadre} onChange={(e) => maj({ frame: e.target.value })} className={champ}>
              <option value="none">Aucune</option>
              <option value="outer">Encadré</option>
              <option value="grid">Grille</option>
            </select>
          </label>
          {cadre !== 'none' && (
            <>
              <label className={ligne}>
                <span>Couleur</span>
                <PastilleCouleur
                  couleur={el.borderColor ?? FICHE_PAR_DEFAUT.borderColor}
                  onCouleur={(borderColor) => maj({ borderColor })}
                  label="Couleur de la bordure"
                />
              </label>
              <label className={ligne}>
                <span>Épaisseur</span>
                <ChampValide
                  valeur={el.borderWidth ?? FICHE_PAR_DEFAUT.borderWidth}
                  onValeur={(borderWidth) => maj({ borderWidth })}
                  min={0}
                  pas={0.5}
                  titre="Épaisseur de la bordure"
                  className="w-14"
                />
              </label>
              <label className={ligne}>
                <span>Arrondi</span>
                <ChampValide
                  valeur={el.radius ?? FICHE_PAR_DEFAUT.radius}
                  onValeur={(radius) => maj({ radius })}
                  min={0}
                  titre="Arrondi du cadre"
                  className="w-14"
                />
              </label>
            </>
          )}
          <div className={ligne}>
            <span>Fond des noms</span>
            <span className="flex items-center gap-2">
              {el.labelBg && <PastilleCouleur couleur={el.labelBg} onCouleur={(labelBg) => maj({ labelBg })} label="Fond des noms" />}
              <Interrupteur actif={!!el.labelBg} onActif={(v) => maj({ labelBg: v ? '#e5e7eb' : '' })} label="Fond des noms" />
            </span>
          </div>

          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <TitreGroupe titre="Ligne mise en avant" />
          </div>
          <label className={ligne}>
            <span>N° de ligne (0 : aucune)</span>
            <ChampValide
              valeur={ligneForte}
              onValeur={(n) => maj({ highlightRow: Math.round(n) })}
              min={0}
              titre="Numéro de la ligne mise en avant, 0 pour aucune"
              className="w-14"
            />
          </label>
          {ligneForte > 0 && (
            <>
              <label className={ligne}>
                <span>Couleur</span>
                <PastilleCouleur
                  couleur={el.highlightColor ?? FICHE_PAR_DEFAUT.highlightColor}
                  onCouleur={(highlightColor) => maj({ highlightColor })}
                  label="Couleur de la ligne mise en avant"
                />
              </label>
              <div className={ligne}>
                <span>Valeur en gras</span>
                <Interrupteur
                  actif={el.highlightBold ?? FICHE_PAR_DEFAUT.highlightBold}
                  onActif={(highlightBold) => maj({ highlightBold })}
                  label="Valeur en gras"
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};
