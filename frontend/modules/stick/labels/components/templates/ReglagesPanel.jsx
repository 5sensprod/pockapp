// frontend/modules/stick/labels/components/templates/ReglagesPanel.jsx
//
// LES RÉGLAGES DÉTAILLÉS de l'élément sélectionné, à plat — plus de menu
// déroulant ni d'ascenseur horizontal. Ce n'est PAS un onglet à part : ils
// prennent la place des propositions de base dans l'onglet du TYPE de
// l'élément (Texte, Assets, Dessin… — `ongletDe`, `ToolsSidebar`).
// Désélectionner y remet les propositions. La barre d'options au-dessus du
// canvas ne garde que le noyau.
//
// Ce qui s'affiche est décidé par `utils/reglagesParType.js` (une section n'est
// jamais aux deux endroits) ; ce fichier ne fait que relier un identifiant de
// section à son composant. Une section qui n'a pas encore de composant ici est
// restée dans la barre : `SECTIONS` grandit type par type.
//
// Comme la barre, le panneau règle l'élément PRINCIPAL de la sélection.

import React from 'react';
import useLabelStore from '../../store/useLabelStore';
import { ongletDe, reglagesDe } from '../../utils/reglagesParType';
import { redessiner } from '../../utils/dessin';
import { lissageDe, relisser } from '../../utils/formeLibre';
import { ReglagesContourStylise } from '../MenuContourStylise';
import { ReglagesMasque } from '../MenuMasque';
import Curseur from '../ui/Curseur';
import { TraceSelectionne } from './TraceSelectionne';
import * as Texte from './ReglagesTexte';
import * as Photo from './ReglagesImage';

const ARRONDI_MAX = 200;

const Trace = ({ el }) => <TraceSelectionne el={el} />;

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
      className="w-full px-2 py-1.5 text-xs rounded border bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
      title="Relier la fin au début : le tracé devient une forme, avec remplissage et contour. Sans retour, hors Ctrl+Z."
    >
      Fermer le tracé pour en faire une forme
    </button>
  );
};

const Arrondi = ({ el, maj }) => (
  <Curseur
    disposition="bloc"
    champ
    label="Arrondi des coins"
    max={ARRONDI_MAX}
    valeur={el.cornerRadius ?? 0}
    onValeur={(v) => maj({ cornerRadius: Number.isFinite(v) ? Math.min(ARRONDI_MAX, Math.max(0, v)) : 0 })}
  />
);

// Forme née d'un tracé fermé : son lissage rejoué sur le tracé d'origine gardé
const Lissage = ({ el, maj }) => (
  <div className="space-y-3">
    {[
      ['smoothing', 'Adoucir (%)'],
      ['stabilisation', 'Stabiliser (%)'],
    ].map(([cle, libelle]) => (
      <Curseur
        key={cle}
        disposition="bloc"
        champ
        label={libelle}
        valeur={Math.round(lissageDe(el)[cle] * 100)}
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
  police: { titre: 'Police', Composant: Texte.Police },
  styleTexte: { titre: 'Style', Composant: Texte.Style },
  alignementTexte: { titre: 'Alignement', Composant: Texte.Alignement },
  couleur: { titre: 'Couleur', Composant: Texte.Couleur },
  espacement: { titre: 'Espacement et courbure', Composant: Texte.Espacement },
  contour: { titre: 'Contour des lettres', Composant: Texte.Contour },
  ajustement: { titre: 'Ajustement et recadrage', Composant: Photo.Ajustement },
  miroir: { titre: 'Miroir', Composant: Photo.Miroir },
  opacite: { titre: 'Opacité', Composant: Photo.Opacite },
  dimensions: { titre: 'Taille du cadre', Composant: Photo.Dimensions },
  trace: { titre: 'Tracé', Composant: Trace },
  contourStylise: { titre: 'Contour à main levée', Composant: ContourStylise },
  fermerTrace: { titre: 'Forme', Composant: FermerTrace },
  arrondi: { titre: 'Coins', Composant: Arrondi },
  lissage: { titre: 'Lissage de la courbe', Composant: Lissage },
  masque: { titre: 'Masque', Composant: Masque },
};

/** Les sections de cet élément que le panneau sait afficher. */
export const sectionsAffichees = (el) =>
  ongletDe(el) ? reglagesDe(el).panneau.filter((id) => SECTIONS[id]) : [];

const NOMS = { dessin: 'Tracé', shape: 'Forme', text: 'Texte', image: 'Image', qrcode: 'QR code', barcode: 'Code-barres', fiche: 'Fiche' };

/** `nu` : sans marges ni titre, quand un autre panneau l'accueille (Dessin). */
export default function ReglagesPanel({ nu = false, docNode = null }) {
  const el = useLabelStore((s) => s.elements.find((e) => e.id === s.selectedId) ?? null);
  const nombre = useLabelStore((s) => (s.selectedId ? 1 + s.extraIds.length : 0));
  const updateElement = useLabelStore((s) => s.updateElement);

  if (!el) {
    return <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Sélectionnez un élément pour voir ses réglages.</p>;
  }
  const sections = sectionsAffichees(el);
  if (!sections.length) {
    return (
      <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
        Les réglages de cet élément sont dans la barre, au-dessus de la page.
      </p>
    );
  }
  const maj = (m) => updateElement(el.id, m);

  return (
    <div className={nu ? 'space-y-4' : 'p-3 space-y-4'}>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {NOMS[el.type] ?? 'Élément'} sélectionné
        {nombre > 1
          ? ` — ${nombre} éléments : ces réglages s'appliquent au premier.`
          : ' — désélectionnez-le pour retrouver les propositions.'}
      </div>
      {sections.map((id) => {
        const { titre, Composant } = SECTIONS[id];
        return (
          <section key={id} className="pt-3 border-t border-gray-200 dark:border-gray-700 first:border-t-0 first:pt-0">
            <h3 className="mb-2 text-xs font-medium text-gray-800 dark:text-gray-200">{titre}</h3>
            <Composant el={el} maj={maj} docNode={docNode} />
          </section>
        );
      })}
    </div>
  );
}
