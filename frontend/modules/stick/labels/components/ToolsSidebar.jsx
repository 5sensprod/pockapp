// frontend/modules/stick/labels/components/ToolsSidebar.jsx
//
// LA BARRE LATÉRALE : dix onglets à icône, et le panneau de l'onglet ouvert.
// Sélectionner un élément affiche, dans l'onglet de SON type, ses réglages à
// la place des propositions (`ReglagesPanel`) ; désélectionner les ramène.
//
// L'ordre suit le geste du vendeur (3 octobre 2026), en quatre groupes séparés
// d'un filet : partir de quelque chose (Modèles, Page) ; le produit, en orange
// (Produits, Infos) ; ajouter (Texte, Images, Formes, Dessin) ; finir (Effets,
// Calques). Les `id` n'ont pas changé : `ongletDe` et `ONGLETS_FIXES`
// (`utils/reglagesParType.js`) n'y voient rien.
import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  Type,
  Image as ImageIcon,
  Shapes,
  Layers,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Palette,
  PaintBucket,
  Package,
  Database,
  PenTool,
} from 'lucide-react';

import TextTemplates from './templates/TextTemplates';
import AssetsPanel from './templates/AssetsPanel';
import LayersPanel from './templates/LayersPanel';
import PagePanel from './templates/PagePanel';
import SheetPanel from './templates/SheetPanel';
import MediasPanel from './templates/MediasPanel';
import EffectsTemplates from './templates/EffectsTemplates';
import ModelesPanel from './templates/ModelesPanel';
import DonneesProduitPanel from './templates/DonneesProduitPanel';
import DessinPanel from './templates/DessinPanel';
import ReglagesPanel, { sectionsAffichees } from './templates/ReglagesPanel';
import useLabelStore from '../store/useLabelStore';
import { ongletDe } from '../utils/reglagesParType';
import { BOUTON_ACTION } from './ui/styles';

const boutonEntete =
  'h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700';

// `label` : l'en-tête du panneau ; `court` : sous l'icône, quand il diffère.
// `groupe` : un filet sépare deux groupes.
const TOOLS = [
  // Modèles du poste et modèles prêts, réunis (`ModelesPanel`)
  { id: 'templates', label: 'Modèles', icon: Palette, component: ModelesPanel, groupe: 'depart' },
  // La page : sa taille puis son fond (`PagePanel`)
  { id: 'format', label: 'Page', icon: PaintBucket, component: PagePanel, groupe: 'depart' },
  // Ce qui vient de PocketStock, en orange.
  // Produits : le tirage (liste, quantités, format page ou planche).
  { id: 'sheet', label: 'Produits', icon: Package, component: SheetPanel, produit: true, groupe: 'produit' },
  // Infos produit (ex-« Données produit ») : tout ce qui s'ajoute lié à la fiche, et les liaisons.
  { id: 'donnees', label: 'Infos produit', court: 'Infos', icon: Database, component: DonneesProduitPanel, produit: true, groupe: 'produit' },
  { id: 'text', label: 'Texte', icon: Type, component: TextTemplates, groupe: 'ajout' },
  // Images (ex-« Médias ») : celles du poste, et celles de PocketStock (`MediasPanel`)
  { id: 'image', label: 'Images', icon: ImageIcon, component: MediasPanel, groupe: 'ajout' },
  // Formes (ex-« Assets ») : formes et QR code statique, une seule grille (`AssetsPanel`)
  { id: 'shape', label: 'Formes et QR code', court: 'Formes', icon: Shapes, component: AssetsPanel, groupe: 'ajout' },
  // Dessin à main levée (`utils/dessin.js`), porté de PocketStick
  { id: 'dessin', label: 'Dessin', icon: PenTool, component: DessinPanel, groupe: 'ajout' },
  { id: 'effects', label: 'Effets', icon: Sparkles, component: EffectsTemplates, groupe: 'finition' },
  { id: 'layers', label: 'Calques', icon: Layers, component: LayersPanel, groupe: 'finition' },
];

const ToolsSidebar = ({
  isCollapsed,
  onToggleCollapse,
  dataSource,
  selectedProduct,
  docNode,
  selectedTool: externalSelectedTool,
  onToolChange,
  stageRef, // Pour TemplateManager
  reglagesDemandes = 0, // compteur : le bouton « Réglages » de la barre fine a été cliqué
}) => {
  const [internalSelectedTool, setInternalSelectedTool] = useState(null);
  // L'élément sélectionné : dans l'onglet de SON type, ses réglages détaillés
  // remplacent les propositions de base (désélectionner les ramène). L'onglet
  // Dessin le fait lui-même, il garde ses boutons d'outil.
  const selection = useLabelStore((s) => s.elements.find((e) => e.id === s.selectedId) ?? null);

  const selectedTool =
    externalSelectedTool !== undefined ? externalSelectedTool : internalSelectedTool;

  // « + AJOUTER » : revoir les propositions de l'onglet sans désélectionner —
  // un second texte, une autre forme. Jusqu'à la prochaine sélection, au
  // changement d'onglet, ou au bouton « Réglages ».
  const [ajout, setAjout] = useState(false);
  useEffect(() => setAjout(false), [selection?.id, selectedTool, reglagesDemandes]);

  const handleToolClick = (toolId) => {
    const newTool = toolId === selectedTool ? null : toolId;

    if (onToolChange) {
      onToolChange(newTool);
    } else {
      setInternalSelectedTool(newTool);
    }
  };

  // Ouvrir un onglet depuis un panneau : sans la bascule d'un clic sur l'icône
  const ouvrirOutil = (toolId) => (onToolChange ? onToolChange(toolId) : setInternalSelectedTool(toolId));

  // L'onglet qui porte les réglages de l'élément sélectionné
  const ongletDesReglages = sectionsAffichees(selection).length > 0 ? ongletDe(selection) : null;

  // LA BARRE D'ICÔNES, la même repliée ou dépliée : icône et libellé court
  // dessous (on trouve un onglet sans survoler chaque icône). L'aplat de
  // couleur est réservé à l'onglet OUVERT ; orange = ce qui vient de la fiche
  // produit, bleu = le reste.
  const barreIcones = (onClic) => (
    <nav
      aria-label="Outils"
      className="w-16 flex-none border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-2 gap-0.5 overflow-y-auto"
    >
      {TOOLS.map((tool, i) => {
        const ouvert = !isCollapsed && selectedTool === tool.id;
        // Les réglages de l'élément sélectionné sont ICI, et l'onglet n'est pas
        // ouvert : un point le dit (depuis Calques, Effets, Infos, qui ne
        // suivent pas la sélection)
        const repere = !ouvert && ongletDesReglages === tool.id;
        return (
          <React.Fragment key={tool.id}>
            {i > 0 && TOOLS[i - 1].groupe !== tool.groupe && (
              <span className="my-1 h-px w-8 flex-none bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
            )}
            <button
              type="button"
              onClick={() => onClic(tool.id)}
              aria-pressed={ouvert}
              title={repere ? `${tool.label} — les réglages de l’élément sélectionné` : tool.label}
              className={`relative w-14 py-1.5 flex-none flex flex-col items-center gap-0.5 rounded-lg transition-colors ${
                ouvert
                  ? tool.produit
                    ? 'bg-orange-500 text-white'
                    : 'bg-blue-600 text-white'
                  : tool.produit
                    ? 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <tool.icon className="h-5 w-5" />
              <span className="text-[10px] leading-tight">{tool.court ?? tool.label}</span>
              {repere && <span className="absolute top-1 right-2.5 h-1.5 w-1.5 rounded-full bg-blue-500" />}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );

  // Repliée : la barre d'icônes seule ; un clic déplie et ouvre l'onglet
  if (isCollapsed) {
    return (
      <div className="bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex">
        {barreIcones((id) => {
          onToggleCollapse();
          ouvrirOutil(id);
        })}
      </div>
    );
  }

  const outil = TOOLS.find((t) => t.id === selectedTool);
  const SelectedComponent = outil?.component;
  // Cet onglet montrerait les réglages de l'élément sélectionné
  const reglagesIci = selectedTool !== 'templates' && selectedTool !== 'dessin' && ongletDesReglages === selectedTool;

  return (
    <div className="w-[400px] flex-none bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex overflow-hidden">
      {barreIcones(handleToolClick)}

      <div className="flex-1 min-h-0 flex flex-col overflow-x-hidden">
        {selectedTool ? (
          <>
            {/* En-tête : le nom de l'onglet, le même que sous l'icône */}
            <div className="flex-none h-10 px-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-white truncate">{outil?.label}</h2>
              <div className="flex-none flex items-center gap-1">
                {reglagesIci && (
                  <button
                    type="button"
                    onClick={() => setAjout((a) => !a)}
                    className={BOUTON_ACTION.replace('h-7', 'h-6')}
                    title={ajout ? 'Revenir aux réglages de l’élément sélectionné' : 'Ajouter un autre élément, sans désélectionner'}
                  >
                    {ajout ? <SlidersHorizontal className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    {ajout ? 'Réglages' : 'Ajouter'}
                  </button>
                )}
                {/* Refermer le panneau : recliquer l'icône de l'onglet */}
                <button type="button" onClick={onToggleCollapse} className={boutonEntete} title="Replier la barre latérale">
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {SelectedComponent && (
                <>
                  {selectedTool === 'templates' ? (
                    <ModelesPanel
                      stageRef={stageRef}
                      docNode={docNode}
                      onClose={() => handleToolClick(null)}
                    />
                  ) : reglagesIci && !ajout ? (
                    <ReglagesPanel docNode={docNode} />
                  ) : (
                    <SelectedComponent
                      dataSource={dataSource}
                      selectedProduct={selectedProduct}
                      docNode={docNode}
                      onOpenTool={ouvrirOutil}
                    />
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Aucun onglet ouvert */}
            <div className="flex-none h-10 px-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Outils</h2>
              <button type="button" onClick={onToggleCollapse} className={boutonEntete} title="Replier la barre latérale">
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 flex items-center justify-center p-6">
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">Choisissez un outil à gauche.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ToolsSidebar;
