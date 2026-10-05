// frontend/modules/stick/labels/components/templates/FormatPanel.jsx
//
// LA TAILLE DE LA PAGE : deux champs, les quatre formats de papier, et les
// autres formats repliés (`utils/formatsPage.js`).
//
// Refait le 3 octobre 2026 :
// - **les deux champs SONT la taille de la page** (`canvasSize`), validés à
//   Entrée ou en sortant. Avant, un état local pris au montage et un bouton
//   « Appliquer » : charger un modèle changeait la page, pas les champs ;
// - **en millimètres**, à la saisie comme à l'affichage. Le store garde des
//   points entiers : on écrit `enPt(mm)`. Les formats d'écran (Instagram…)
//   gardent leurs pixels sur leur tuile, c'est ainsi qu'on les connaît ;
// - la taille n'est plus dite trois fois (encadré, carte surlignée, champs) ;
// - chaque tuile porte une MINIATURE aux proportions du format
//   (`miniatureFormat`) — on reconnaît un portrait d'un paysage, une story
//   d'une bannière, sans lire — et, pour un format de réseau social, le logo
//   du réseau, à sa couleur. C'est du contenu, pas un accent de l'interface.
//
// Page pilotée par la planche (`lockCanvasToSheetCell`) : tout est désactivé,
// et un lien mène à l'onglet Produits, où se coupe l'option.
import React from 'react';
import { Facebook, Instagram } from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
import { FORMATS_PAGE, enMm, enPt, formatDeLaPage, miniatureFormat, mmAffiche } from '../../utils/formatsPage';
import Bouton from '../ui/Bouton';
import CarteProposition from '../ui/CarteProposition';
import ChampValide from '../ui/ChampValide';
import GrilleVignettes from '../ui/GrilleVignettes';
import Note from '../ui/Note';
import Section from '../ui/Section';
import { LIGNE } from '../ui/styles';

// De 1 mm à 5000 points — le maximum qu'annonçaient les anciens champs
const MM_MIN = 1;
const MM_MAX = enMm(5000);

const PAPIER = FORMATS_PAGE.filter((f) => f.papier);
const AUTRES = FORMATS_PAGE.filter((f) => !f.papier);

// Le logo de X n'est pas dans lucide (qui a gardé l'oiseau de Twitter)
const LogoX = ({ style }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={style} aria-hidden="true">
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
  </svg>
);

const LOGOS = {
  instagram: { Logo: Instagram, couleur: '#E4405F' },
  facebook: { Logo: Facebook, couleur: '#1877F2' },
  x: { Logo: LogoX, couleur: '#0f172a' },
};

/** La page en petit, à ses proportions ; dedans, le logo du réseau ou « A4 ». */
const Miniature = ({ format, actif }) => {
  const { width, height } = miniatureFormat(format);
  const reseau = LOGOS[format.reseau];
  const cote = Math.min(16, Math.min(width, height) - 4);
  return (
    <span className="h-8 flex items-center justify-center">
      <span
        className={`flex items-center justify-center rounded-[2px] bg-white ring-1 ${
          actif ? 'ring-blue-500' : 'ring-gray-300 dark:ring-gray-500'
        }`}
        style={{ width, height }}
      >
        {reseau ? (
          <reseau.Logo style={{ width: cote, height: cote, color: reseau.couleur }} />
        ) : (
          format.papier && <span className="text-[8px] font-semibold leading-none text-gray-400">{format.label.slice(0, 2)}</span>
        )}
      </span>
    </span>
  );
};

const FormatPanel = ({ onOpenTool }) => {
  const canvasSize = useLabelStore((state) => state.canvasSize);
  const setCanvasSize = useLabelStore((state) => state.setCanvasSize);
  const lockCanvasToSheetCell = useLabelStore((s) => s.lockCanvasToSheetCell);

  const courant = formatDeLaPage(canvasSize);

  const tuile = (format, detail) => (
    <CarteProposition
      key={format.id}
      titre={format.label}
      detail={detail}
      haute
      apercu={<Miniature format={format} actif={courant?.id === format.id} />}
      actif={courant?.id === format.id}
      desactive={lockCanvasToSheetCell}
      onAjout={() => setCanvasSize(format.width, format.height)}
    />
  );

  const champ = (cote, titre) => (
    <ChampValide
      valeur={mmAffiche(canvasSize[cote])}
      onValeur={(mm) => setCanvasSize(...(cote === 'width' ? [enPt(mm), canvasSize.height] : [canvasSize.width, enPt(mm)]))}
      min={MM_MIN}
      max={MM_MAX}
      titre={titre}
      desactive={lockCanvasToSheetCell}
      className="w-14"
    />
  );

  return (
    <div className="space-y-3">
      {lockCanvasToSheetCell && (
        <Note
          action={
            onOpenTool && (
              <Bouton variante="discret" onClic={() => onOpenTool('sheet')}>
                Voir Produits
              </Bouton>
            )
          }
        >
          Taille fixée par la planche.
        </Note>
      )}

      <div className={LIGNE}>
        <span>Taille</span>
        <div className="flex items-center gap-1.5">
          {champ('width', 'Largeur de la page, en mm')}
          <span className="text-gray-400">×</span>
          {champ('height', 'Hauteur de la page, en mm')}
          <span className="text-gray-500 dark:text-gray-400">mm</span>
        </div>
      </div>

      <GrilleVignettes colonnes={2}>
        {PAPIER.map((f) => tuile(f, `${enMm(f.width)} × ${enMm(f.height)} mm`))}
      </GrilleVignettes>

      {/* `key` : la section s'ouvre d'elle-même quand la page prend un de ces formats */}
      <Section key={String(!!courant && !courant.papier)} titre="Autres formats" ouvertParDefaut={!!courant && !courant.papier}>
        <GrilleVignettes colonnes={2}>{AUTRES.map((f) => tuile(f, `${f.width} × ${f.height} px`))}</GrilleVignettes>
      </Section>
    </div>
  );
};

export default FormatPanel;
