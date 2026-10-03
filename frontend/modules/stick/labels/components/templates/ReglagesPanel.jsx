// frontend/modules/stick/labels/components/templates/ReglagesPanel.jsx
//
// LES RÉGLAGES DÉTAILLÉS de l'élément sélectionné, à plat — plus de menu
// déroulant ni d'ascenseur horizontal. Ce n'est PAS un onglet à part : ils
// prennent la place des propositions de base dans l'onglet du TYPE de
// l'élément (Texte, Assets, Dessin… — `ongletDe`, `ToolsSidebar`).
// Désélectionner y remet les propositions. La barre d'options au-dessus du
// canvas ne porte plus aucun réglage : deux raccourcis (Réglages, Effets),
// l'œil et le zoom.
//
// Ce qui s'affiche est décidé par `utils/reglagesParType.js` (une section n'est
// jamais aux deux endroits) ; ce fichier ne fait que relier un identifiant de
// section à son composant. Une section qui n'a pas encore de composant ici est
// restée dans la barre : `SECTIONS` grandit type par type.
//
// Le panneau montre les valeurs de l'élément PRINCIPAL de la sélection, et
// applique chaque réglage à tous les éléments sélectionnés du même type.

import React from 'react';
import useLabelStore from '../../store/useLabelStore';
import { ongletDe, reglagesDe, sectionActive, sectionOuverte } from '../../utils/reglagesParType';
import { CONTOUR_STYLISE_DEFAUT, reglagesContour } from '../../utils/contourStylise';
import { useMajSelection } from '../useMajSelection';
import { redessiner } from '../../utils/dessin';
import { lissageDe, relisser } from '../../utils/formeLibre';
import ReglagesContourStylise from '../ReglagesContourStylise';
import ReglagesMasque from '../ReglagesMasque';
import Curseur from '../ui/Curseur';
import Section from '../ui/Section';
import { BOUTON_ACTION } from '../ui/styles';
import { NoyauTrace, TraitTrace } from './TraceSelectionne';
import * as Texte from './ReglagesTexte';
import * as Photo from './ReglagesImage';
import * as Codes from './ReglagesCodes';
import * as Fiche from './ReglagesFiche';
import ReglagesCommuns from './ReglagesCommuns';

const ContourStylise = ({ el, maj }) =>
  el.type === 'dessin' ? (
    // Tremblé et ondulation d'un tracé : rejoués sur ses points gardés par
    // `redessiner`, qui recalcule le cadre — l'ondulation déborde
    <ReglagesContourStylise dessin element={el} onChange={(m) => maj(redessiner(el, m) ?? m)} />
  ) : (
    <ReglagesContourStylise texte={el.type === 'text'} element={el} onChange={maj} />
  );

const FermerTrace = ({ el }) => {
  const fermerDessin = useLabelStore((s) => s.fermerDessin);
  return (
    <button
      type="button"
      onClick={() => fermerDessin(el.id)}
      className={`${BOUTON_ACTION} w-full`}
      title="Relier la fin au début : le tracé devient une forme, avec remplissage et contour. Sans retour, hors Ctrl+Z."
    >
      Fermer en forme
    </button>
  );
};

// Forme née d'un tracé fermé : son lissage rejoué sur le tracé d'origine gardé
const Lissage = ({ el, maj }) => (
  <div className="space-y-2">
    {[
      ['smoothing', 'Adoucir'],
      ['stabilisation', 'Stabiliser'],
    ].map(([cle, libelle]) => (
      <Curseur
        key={cle}
        label={libelle}
        largeurLabel="w-20"
        valeur={Math.round(lissageDe(el)[cle] * 100)}
        affichage={(v) => `${v} %`}
        onValeur={(v) => {
          if (!Number.isFinite(v)) return;
          const m = relisser(el, { [cle]: Math.min(100, Math.max(0, v)) / 100 });
          if (m) maj(m);
        }}
      />
    ))}
  </div>
);

const Masque = ({ el, maj }) => <ReglagesMasque element={el} onChange={maj} />;

/** Identifiant de section (`reglagesParType.js`) → titre et composant. */
const SECTIONS = {
  // Les NOYAUX : pas de titre, pas de pli — ce qu'on règle à chaque affiche
  noyauTexte: { nu: true, Composant: Texte.Noyau },
  noyauImage: { nu: true, Composant: Photo.Noyau },
  noyauForme: { nu: true, Composant: Codes.NoyauForme },
  noyauQr: { nu: true, Composant: Codes.NoyauQr },
  noyauBarres: { nu: true, Composant: Codes.NoyauBarres },
  noyauTrace: { nu: true, Composant: NoyauTrace },
  contenuFiche: { nu: true, Composant: Fiche.Contenu },
  fermerTrace: { nu: true, Composant: FermerTrace },
  // Les sections ; les rares sont repliées (`SECTIONS_RARES`, `reglagesParType.js`)
  espacement: { titre: 'Espacement', Composant: Texte.Espacement },
  traitTrace: { titre: 'Forme du trait', Composant: TraitTrace },
  lissage: { titre: 'Lissage de la courbe', Composant: Lissage },
  styleTableau: { titre: 'Style du tableau', Composant: Fiche.StyleTableau },
  // L'interrupteur est dans l'en-tête ; pour un tracé, il passe par `redessiner`
  contourStylise: {
    titre: 'Contour à main levée',
    Composant: ContourStylise,
    actif: (el) => !!reglagesContour(el),
    onActif: (el, maj, v) => {
      const m = { contourStyle: v ? { ...CONTOUR_STYLISE_DEFAUT } : null };
      maj(el.type === 'dessin' ? (redessiner(el, m) ?? m) : m);
    },
    aide: 'Donne au contour un trait tremblé, comme tracé à la main.',
  },
  masque: { titre: 'Masque', Composant: Masque },
};

/** Les sections de cet élément que le panneau sait afficher. */
export const sectionsAffichees = (el) =>
  ongletDe(el) ? reglagesDe(el).panneau.filter((id) => SECTIONS[id]) : [];

const NOMS = { dessin: 'Tracé', shape: 'Forme', text: 'Texte', image: 'Image', qrcode: 'QR code', barcode: 'Code-barres', fiche: 'Fiche' };

/** `nu` : sans marges ni titre, quand un autre panneau l'accueille (Dessin). */
export default function ReglagesPanel({ nu = false, docNode = null }) {
  // L'élément principal, et LE chemin d'écriture : toute la sélection de ce
  // type, en un pas d'historique (`useMajSelection`, partagé avec la barre du haut)
  const { el, maj, nombre, autres } = useMajSelection();

  if (!el) {
    return <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Sélectionnez un élément pour voir ses réglages.</p>;
  }
  const sections = sectionsAffichees(el);

  return (
    <div className={nu ? '' : 'px-3 pb-3'}>
      {/* Rien à dire pour un élément seul : le titre de l'onglet suffit */}
      {(nombre > 1 || autres > 0) && (
        <div className="pt-2 text-[11px] text-gray-500 dark:text-gray-400">
          {nombre > 1 && `${nombre} éléments réglés ensemble`}
          {autres > 0 && `${nombre > 1 ? ' · ' : ''}${autres} non touché${autres > 1 ? 's' : ''} (autre type ou verrouillé)`}
        </div>
      )}
      {/* Ce qui vaut pour tout élément : position, remplir, dupliquer, supprimer, liaison produit */}
      <div className="py-2">
        <ReglagesCommuns el={el} docNode={docNode} />
      </div>
      <div className="border-t border-gray-200 dark:border-gray-700">
        {sections.map((id) => {
          const { titre, Composant, nu: sansTitre, actif, onActif, aide } = SECTIONS[id];
          const contenu = <Composant el={el} maj={maj} docNode={docNode} />;
          if (sansTitre) {
            return (
              <div key={id} className="py-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                {contenu}
              </div>
            );
          }
          return (
            // `key` avec l'élément : l'état du pli se recalcule à chaque sélection
            <Section
              key={`${id}:${el.id}`}
              titre={titre}
              ouvertParDefaut={sectionOuverte(id, el)}
              marque={sectionActive(id, el)}
              aide={aide}
              {...(onActif ? { actif: actif(el), onActif: (v) => onActif(el, maj, v) } : {})}
            >
              {contenu}
            </Section>
          );
        })}
      </div>
    </div>
  );
}
