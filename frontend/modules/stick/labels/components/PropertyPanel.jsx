// src/features/labels/components/PropertyPanel.jsx
import React from 'react';
import {
  Palette,
  Sparkles,
  SlidersHorizontal,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Trash2,
  FlipHorizontal2,
  FlipVertical2,
  Shapes,
  Expand,
  LetterText,
} from 'lucide-react';
import useLabelStore, { idsSelectionnes } from '../store/useLabelStore';
import { alignOffsets, distributeOffsets, unionBoxes } from '../utils/layout';
import FontSelector from './FontSelector';
import MenuGroupe from './MenuGroupe';
import GradientColorPicker from './GradientColorPicker';
import MenuContourStylise from './MenuContourStylise';
import Curseur from './ui/Curseur';
import { composerCouleur, decomposerCouleur } from '../utils/paint';
import MenuMasque from './MenuMasque';
import { TYPO_BORNES } from '../utils/typo';
import LiaisonProduit from './LiaisonProduit';
import { typeLiable } from '../utils/champsProduit';
import { estContenu } from '../utils/ajustementImage';
import { resolvePropForElement, texteCorrige, ficheChangeeDepuisCorrection } from '../utils/dataBinding';
import { resetCropAttrs } from '../utils/crop';
import { ongletDe } from '../utils/reglagesParType';
import { geometrieImage } from './canvas/CropOverlay';
import { SECTIONS_FICHE, sectionParId } from '../utils/ficheProduit';
import { FICHE_PAR_DEFAUT } from '../utils/ficheKonva';
import { FORMATS_TEXTE_CODE_BARRES } from '../utils/barcodeText';

// Comme PocketStick (`ui/Properties.jsx`, ALIGN_BUTTONS) : un élément seul
// s'aligne sur la PAGE ; plusieurs s'alignent sur leur cadre commun.
const BOUTONS_ALIGNEMENT = [
  ['left', 'Aligner à gauche', AlignStartVertical],
  ['center', 'Centrer horizontalement', AlignCenterVertical],
  ['right', 'Aligner à droite', AlignEndVertical],
  ['top', 'Aligner en haut', AlignStartHorizontal],
  ['middle', 'Centrer verticalement', AlignCenterHorizontal],
  ['bottom', 'Aligner en bas', AlignEndHorizontal],
];
const BOUTONS_TEXTE = [
  ['left', 'Texte à gauche', AlignLeft],
  ['center', 'Texte centré', AlignCenter],
  ['right', 'Texte à droite', AlignRight],
  ['justify', 'Texte justifié', AlignJustify],
];
const petitBouton = (actif) =>
  `p-1.5 rounded-lg transition-colors ${
    actif
      ? 'bg-blue-500 hover:bg-blue-600 text-white'
      : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
  }`;

const PropertyPanel = ({ selectedProduct, onOpenEffects, onOpenReglages, docNode }) => {
  const elements = useLabelStore((s) => s.elements);
  const selectedId = useLabelStore((s) => s.selectedId);
  const updateElement = useLabelStore((s) => s.updateElement);
  const dataSource = useLabelStore((s) => s.dataSource);
  // Le produit que le CANVAS affiche : c'est à lui qu'une correction de texte
  // est rattachée (`TextNode`, `textOverrides`).
  const canvasProduct = useLabelStore((s) => s.selectedProduct);
  const cropId = useLabelStore((s) => s.cropId);
  const startCrop = useLabelStore((s) => s.startCrop);
  const stopCrop = useLabelStore((s) => s.stopCrop);

  const extraIds = useLabelStore((s) => s.extraIds);
  const canvasSize = useLabelStore((s) => s.canvasSize);
  const deleteElements = useLabelStore((s) => s.deleteElements);
  const ajusterAuCanvas = useLabelStore((s) => s.ajusterAuCanvas);

  const selectedElement = elements.find((el) => el.id === selectedId);
  if (!selectedElement) return null;

  // ── Alignement et distribution ──────────────────────────────────────────
  // Les cadres sont MESURÉS sur le canvas (rotation, texte sans largeur, QR,
  // formes centrées), en coordonnées du document ; on déplace ensuite chaque
  // élément du décalage calculé, ce qui vaut quelle que soit son origine.
  const ids = idsSelectionnes({ selectedId, extraIds, elements }).filter(
    (id) => !elements.find((e) => e.id === id)?.locked
  );
  const cadre = (id) =>
    docNode?.findOne(`#${id}`)?.getClientRect({ skipShadow: true, relativeTo: docNode }) ?? null;
  const deplacer = (offsets, liste) =>
    offsets.forEach(({ dx, dy }, i) => {
      const el = elements.find((e) => e.id === liste[i]);
      if (el && (dx || dy)) updateElement(el.id, { x: (el.x ?? 0) + dx, y: (el.y ?? 0) + dy });
    });
  const aligner = (alignement) => {
    const liste = ids.filter((id) => cadre(id));
    const boites = liste.map(cadre);
    if (!boites.length) return;
    const reference =
      boites.length === 1
        ? { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height }
        : unionBoxes(boites);
    deplacer(alignOffsets(boites, reference, alignement), liste);
  };
  const distribuer = (axe) => {
    const liste = ids.filter((id) => cadre(id));
    deplacer(distributeOffsets(liste.map(cadre), axe), liste);
  };

  const isQRCode = selectedElement.type === 'qrcode';
  const isText = selectedElement.type === 'text';
  const isImage = selectedElement.type === 'image';
  const isBarcode = selectedElement.type === 'barcode';
  const isShape = selectedElement.type === 'shape';
  const isFiche = selectedElement.type === 'fiche';
  const isDessin = selectedElement.type === 'dessin';
  // Épaisseur de contour : sans couleur ni dégradé, le contour ne se dessine
  // pas, alors que le sélecteur affiche une couleur de repli. Donner une
  // épaisseur pose donc cette couleur — comme choisir une couleur pose 2 px.
  const epaisseurContour = (strokeWidth, couleurAffichee) => ({
    strokeWidth,
    ...(strokeWidth > 0 && !selectedElement.stroke && !selectedElement.strokeGradient
      ? { stroke: couleurAffichee }
      : {}),
  });

  const handleColorChange = (color) => updateElement(selectedId, { color });

  const handleQRValueChange = (value) => {
    // Valeur fixe quand pas de binding
    updateElement(selectedId, { qrValue: value });
  };

  const handleBarcodeColorChange = (value) => {
    updateElement(selectedId, { lineColor: value });
  };
  const handleBarcodeBgChange = (value) => {
    updateElement(selectedId, { background: value });
  };

  /** Opacité pour les images */
  const handleOpacityChange = (value) => {
    updateElement(selectedId, { opacity: parseFloat(value) });
  };

  /** 🔠 Taille de police (px). Bornée : 0 ou vide rendrait le texte invisible. */
  const handleFontSizeChange = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return;
    updateElement(selectedId, { fontSize: Math.min(400, Math.max(4, n)) });
  };

  // ✏️ Correction manuelle d'un texte lié, pour le produit affiché
  const correction = isText && selectedElement.dataBinding ? texteCorrige(selectedElement, canvasProduct) : undefined;
  // ⚠️ La fiche a changé depuis la correction (prix, nom… modifiés ailleurs)
  const ficheChangee =
    correction !== undefined ? ficheChangeeDepuisCorrection(selectedElement, canvasProduct) : undefined;
  const resetCorrection = () => {
    const id = canvasProduct?._id;
    if (!id) return;
    const { [id]: _retire, ...reste } = selectedElement.textOverrides || {};
    const { [id]: _source, ...resteSource } = selectedElement.textOverridesSource || {};
    updateElement(selectedId, { textOverrides: reste, textOverridesSource: resteSource });
  };

  /** 🎨 Changement de police pour les textes */
  const handleFontFamilyChange = (fontFamily) => {
    updateElement(selectedId, { fontFamily });
  };

  // --- Gras / Italique (fontStyle Konva: 'normal' | 'bold' | 'italic' | 'italic bold')
  const isBold = (selectedElement.fontStyle || '').includes('bold');
  const isItalic = (selectedElement.fontStyle || '').includes('italic');

  const setFontStyle = (bold, italic) => {
    let value = 'normal';
    if (bold && italic) value = 'italic bold';
    else if (bold) value = 'bold';
    else if (italic) value = 'italic';
    updateElement(selectedId, { fontStyle: value });
  };

  const toggleBold = () => setFontStyle(!isBold, isItalic);
  const toggleItalic = () => setFontStyle(isBold, !isItalic);

  // --- Souligné / Barré (textDecoration Konva: '' | 'underline' | 'line-through' | 'underline line-through')
  const decoTokens = (selectedElement.textDecoration || '').split(' ').filter(Boolean);
  const isUnderline = decoTokens.includes('underline');
  const isStrike = decoTokens.includes('line-through');

  const setTextDecoration = (underline, strike) => {
    const tokens = [];
    if (underline) tokens.push('underline');
    if (strike) tokens.push('line-through');
    updateElement(selectedId, { textDecoration: tokens.join(' ') });
  };

  const toggleUnderline = () => setTextDecoration(!isUnderline, isStrike);
  const toggleStrike = () => setTextDecoration(isUnderline, !isStrike);

  // --- Surlignage type stabilo
  const isHighlighted = !!selectedElement.highlightEnabled;
  const toggleHighlight = () => {
    updateElement(selectedId, {
      highlightEnabled: !isHighlighted,
      highlightColor: selectedElement.highlightColor || '#FFFF00',
    });
  };
  const handleHighlightColorChange = (color) => {
    updateElement(selectedId, { highlightColor: color, highlightEnabled: true });
  };

  return (
    <div className="">
      <div className="flex flex-nowrap items-center gap-3 whitespace-nowrap">
        {/* Plus aucun réglage PROPRE à un type ici : ils sont dans l'onglet du
            type, barre latérale (`ReglagesPanel`). Reste le commun, ci-dessous. */}

        {dataSource === 'data' && selectedProduct && (typeLiable(selectedElement.type) || isFiche) && (
            <>
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
              <div className="flex items-center gap-2 min-w-0">
                <LiaisonProduit
                  element={selectedElement}
                  product={canvasProduct}
                  onUpdate={(patch) => updateElement(selectedId, patch)}
                />
                {isText && correction !== undefined && (
                  <button
                    onClick={resetCorrection}
                    className="px-2 py-1 text-xs border border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors whitespace-nowrap"
                    title="Texte corrigé à la main pour ce produit. Cliquer pour revenir au texte de la fiche."
                  >
                    Texte d'origine
                  </button>
                )}
                {isText && ficheChangee !== undefined && (
                  <span
                    className="px-2 py-1 text-xs rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 max-w-[16rem] truncate"
                    title={`La fiche a changé depuis la correction. Elle dit maintenant : « ${ficheChangee} ». La correction reste affichée.`}
                  >
                    ⚠ Fiche modifiée : « {ficheChangee} »
                  </span>
                )}
              </div>
            </>
          )}

        {/* Position : sur la page (un élément) ou entre eux (plusieurs) */}
        {docNode && ids.length > 0 && (
          <>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
            <MenuGroupe
              icone={AlignCenterVertical}
              titre={ids.length === 1 ? 'Position sur la page' : `Aligner ${ids.length} éléments`}
            >
            <div
              className="flex items-center gap-1"
              role="group"
              aria-label={ids.length === 1 ? 'Aligner sur la page' : 'Aligner les éléments'}
            >
              {BOUTONS_ALIGNEMENT.map(([valeur, label, Icone]) => (
                <button
                  key={valeur}
                  onClick={() => aligner(valeur)}
                  className={petitBouton(false)}
                  title={ids.length === 1 ? `${label} (sur la page)` : `${label} (entre les éléments)`}
                >
                  <Icone className="h-4 w-4" />
                </button>
              ))}
              {ids.length > 2 && (
                <>
                  <button
                    onClick={() => distribuer('horizontal')}
                    className={petitBouton(false)}
                    title="Espaces horizontaux égaux"
                  >
                    <AlignHorizontalSpaceAround className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => distribuer('vertical')}
                    className={petitBouton(false)}
                    title="Espaces verticaux égaux"
                  >
                    <AlignVerticalSpaceAround className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
              <div className="mt-1.5 text-[11px] text-gray-400">
                {ids.length === 1
                  ? 'Maj+clic ou lasso : plusieurs éléments'
                  : ids.length === 2
                    ? 'Trois éléments ou plus pour répartir les espaces'
                    : 'Les deux derniers boutons répartissent les espaces'}
              </div>
            </MenuGroupe>
          </>
        )}

        {ids.length > 0 && (
          <>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
            {/* Remplir le canvas (`cadreDuCanvas`, utils/placement.js) */}
            {ids.length === 1 && (
              <button
                onClick={() => ajusterAuCanvas(selectedId)}
                className="p-1.5 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                title="Remplir le canvas : l'élément prend toute la taille du canvas"
              >
                <Expand className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => deleteElements(ids)}
              className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              title={ids.length > 1 ? `Supprimer les ${ids.length} éléments (Suppr)` : 'Supprimer (Suppr)'}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}

        {/* Les réglages détaillés de ce type vivent dans la barre latérale */}
        {onOpenReglages && ongletDe(selectedElement) && (
          <>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
            <button
              onClick={onOpenReglages}
              className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors flex items-center gap-2 shrink-0"
              title="Tous les réglages de cet élément, dans la barre latérale"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Réglages
            </button>
          </>
        )}

        {onOpenEffects && (
          <>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
            <button
              onClick={onOpenEffects}
              className="px-3 py-1.5 text-sm font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg transition-colors flex items-center gap-2 shrink-0"
              title="Ouvrir le panneau Effets"
            >
              <Sparkles className="h-4 w-4" />
              Effets
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default PropertyPanel;
