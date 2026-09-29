// src/features/labels/components/PropertyPanel.jsx
import React from 'react';
import {
  Palette,
  Link,
  Unlink,
  Sparkles,
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
import { FONDU_MAX, MASQUES, RETRAIT_MAX } from '../utils/imageForme';
import MasqueTexture from './MasqueTexture';
import { TYPO_BORNES } from '../utils/typo';
import { resolvePropForElement, texteCorrige, ficheChangeeDepuisCorrection } from '../utils/dataBinding';
import { resetCropAttrs } from '../utils/crop';
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

const PropertyPanel = ({ selectedProduct, onOpenEffects, docNode }) => {
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

  const dataFields = selectedProduct
    ? [
        { key: 'name', label: 'Nom du produit', value: selectedProduct.name },
        { key: 'price', label: 'Prix', value: `${selectedProduct.price}€` },
        {
          key: 'sale_price',
          label: 'Prix promo',
          value:
            selectedProduct.sale_price != null && selectedProduct.sale_price !== ''
              ? `${selectedProduct.sale_price}€`
              : `${selectedProduct.price}€`,
        },
        { key: 'description', label: 'Description', value: selectedProduct.description ?? '' },
        { key: 'brand', label: 'Marque', value: selectedProduct.brand_ref?.name ?? '' },
        { key: 'sku', label: 'Référence', value: selectedProduct.sku },
        { key: 'stock', label: 'Stock', value: `Stock: ${selectedProduct.stock}` },
        { key: 'supplier', label: 'Fournisseur', value: selectedProduct.supplier_ref?.name ?? '' },
        { key: 'website_url', label: 'URL produit', value: selectedProduct.website_url ?? '' },
        {
          key: 'barcode',
          label: 'Code-barres',
          value: selectedProduct?.meta_data?.find?.((m) => m.key === 'barcode')?.value ?? '',
        },
      ]
    : [];

  const handleColorChange = (color) => updateElement(selectedId, { color });

  // ✅ Ne plus "figer" la valeur : on n'écrit que dataBinding
  const handleFieldChange = (fieldKey) => {
    const field = dataFields.find((f) => f.key === fieldKey);
    if (!field) return;

    if (isText) {
      updateElement(selectedId, { dataBinding: field.key });
      return;
    }
    if (isQRCode) {
      updateElement(selectedId, { dataBinding: field.key });
      return;
    }
    if (isBarcode) {
      updateElement(selectedId, { dataBinding: field.key });
      return;
    }
  };

  const handleQRValueChange = (value) => {
    // Valeur fixe quand pas de binding
    updateElement(selectedId, { qrValue: value });
  };

  const handleUnbind = () => {
    updateElement(selectedId, { dataBinding: null });
  };

  // Un QR lié l'est à l'URL web, et à rien d'autre : sans URL il ne s'affiche
  // pas, plutôt que d'encoder un code-barres que personne ne peut ouvrir.
  const getDefaultQRBindingKey = () => 'website_url';

  /** Lier/Délier un QR au produit (toggle) */
  const handleQRBinding = () => {
    if (!selectedProduct) return;
    if (selectedElement.dataBinding) {
      updateElement(selectedId, { dataBinding: null });
      return;
    }
    const key = getDefaultQRBindingKey();
    if (key) updateElement(selectedId, { dataBinding: key });
  };

  /** Lier/Délier une image au produit */
  const handleImageBinding = () => {
    if (selectedElement.dataBinding) {
      updateElement(selectedId, { dataBinding: null });
    } else {
      updateElement(selectedId, { dataBinding: 'product_image' });
    }
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
        {/* 🎨 Sélecteur de police pour les textes */}
        {isText && (
          <>
            <FontSelector
              value={selectedElement.fontFamily || 'Arial'}
              onChange={handleFontFamilyChange}
              apiKey={import.meta.env.VITE_GOOGLE_FONTS_KEY} // optionnel si ton FontSelector lit déjà l'env
            />
            <input
              type="number"
              min={4}
              max={400}
              step={1}
              value={Math.round(selectedElement.fontSize ?? 16)}
              onChange={(e) => handleFontSizeChange(e.target.value)}
              className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              title="Taille de la police, en pixels"
            />
            {/* Espacement des lettres, interligne, hauteur des lettres (`utils/typo.js`) */}
            <MenuGroupe
              icone={LetterText}
              titre="Espacement"
              actif={['letterSpacing', 'lineHeight', 'charHeight'].some(
                (c) => selectedElement[c] != null && selectedElement[c] !== TYPO_BORNES[c].defaut
              )}
              largeur="15rem"
            >
              <div className="p-1 space-y-2">
                {[
                  ['letterSpacing', 'Lettres', 1, (v) => `${v}px`],
                  ['lineHeight', 'Interligne', 0.05, (v) => `×${v}`],
                  ['charHeight', 'Hauteur', 5, (v) => `${v}%`],
                ].map(([cle, libelle, step, fmt]) => {
                  const b = TYPO_BORNES[cle];
                  const v = selectedElement[cle] ?? b.defaut;
                  return (
                    <label key={cle} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <span className="w-16">{libelle}</span>
                      <input
                        type="range"
                        min={b.min}
                        max={b.max}
                        step={step}
                        value={v}
                        onChange={(e) => updateElement(selectedId, { [cle]: Number(e.target.value) })}
                        onDoubleClick={() => updateElement(selectedId, { [cle]: b.defaut })}
                        className="flex-1"
                        title="Double-clic : valeur normale"
                      />
                      <span className="w-10 text-right">{fmt(Math.round(v * 100) / 100)}</span>
                    </label>
                  );
                })}
              </div>
            </MenuGroupe>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />

            {/* Style : gras, italique, souligné, barré, surlignage — un menu */}
            <MenuGroupe
              icone={Bold}
              titre="Style du texte"
              actif={isBold || isItalic || isUnderline || isStrike || isHighlighted}
            >
              <div className="flex items-center gap-1">
            {/* Gras / Italique / Souligné / Barré */}
            <div className="flex items-center gap-1">
              <button
                onClick={toggleBold}
                className={`p-1.5 rounded-lg transition-colors ${
                  isBold
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}
                title="Gras"
              >
                <Bold className="h-4 w-4" />
              </button>
              <button
                onClick={toggleItalic}
                className={`p-1.5 rounded-lg transition-colors ${
                  isItalic
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}
                title="Italique"
              >
                <Italic className="h-4 w-4" />
              </button>
              <button
                onClick={toggleUnderline}
                className={`p-1.5 rounded-lg transition-colors ${
                  isUnderline
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}
                title="Souligné"
              >
                <Underline className="h-4 w-4" />
              </button>
              <button
                onClick={toggleStrike}
                className={`p-1.5 rounded-lg transition-colors ${
                  isStrike
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}
                title="Barré"
              >
                <Strikethrough className="h-4 w-4" />
              </button>
            </div>

            {/* Surlignage type stabilo */}
            <div className="flex items-center gap-1">
              <button
                onClick={toggleHighlight}
                className={`p-1.5 rounded-lg transition-colors ${
                  isHighlighted
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}
                title="Surligner"
              >
                <Highlighter className="h-4 w-4" />
              </button>
              {isHighlighted && (
                <input
                  type="color"
                  value={selectedElement.highlightColor || '#FFFF00'}
                  onChange={(e) => handleHighlightColorChange(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
                  title="Couleur du surlignage"
                />
              )}
            </div>

              </div>
            </MenuGroupe>

            {/* Alignement dans le bloc — l'icône du bouton montre l'actuel */}
            <MenuGroupe
              icone={(BOUTONS_TEXTE.find(([v]) => v === (selectedElement.align ?? 'left')) ?? BOUTONS_TEXTE[0])[2]}
              titre="Alignement du texte"
            >
            {/* Alignement du texte DANS son bloc. Sans largeur fixée, le bloc
                épouse le texte : on lui en donne une pour que ça se voie. */}
            <div className="flex items-center gap-1">
              {BOUTONS_TEXTE.map(([valeur, label, Icone]) => (
                <button
                  key={valeur}
                  onClick={() => {
                    const maj = { align: valeur };
                    if (selectedElement.width == null) {
                      const w = cadre(selectedId)?.width;
                      if (w) maj.width = Math.round(w);
                    }
                    updateElement(selectedId, maj);
                  }}
                  className={petitBouton((selectedElement.align ?? 'left') === valeur)}
                  title={label}
                >
                  <Icone className="h-4 w-4" />
                </button>
              ))}
            </div>

            </MenuGroupe>

            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
          </>
        )}

        {isText && (
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <GradientColorPicker
              color={selectedElement.color || '#000000'}
              gradient={selectedElement.fillGradient ?? null}
              onColorChange={handleColorChange}
              onGradientChange={(g) => updateElement(selectedId, { fillGradient: g })}
              title="Couleur"
            />
            {/* Contour des lettres (`contourTexte`) : couleur ou dégradé
                linéaire, et épaisseur — sans épaisseur, rien ne se voit. */}
            <GradientColorPicker
              color={selectedElement.stroke || '#000000'}
              gradient={selectedElement.strokeGradient ?? null}
              onColorChange={(c) =>
                updateElement(selectedId, {
                  stroke: c,
                  ...(selectedElement.strokeWidth > 0 ? {} : { strokeWidth: 2 }),
                })
              }
              onGradientChange={(g) =>
                updateElement(selectedId, {
                  strokeGradient: g,
                  ...(g && !(selectedElement.strokeWidth > 0) ? { strokeWidth: 2 } : {}),
                })
              }
              title="Contour du texte"
              lineaireSeulement
            />
            <input
              type="number"
              min={0}
              max={40}
              step={0.5}
              value={selectedElement.strokeWidth ?? 0}
              onChange={(e) => updateElement(selectedId, { strokeWidth: Number(e.target.value) })}
              className="w-14 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              title="Épaisseur du contour du texte, en pixels"
            />
          </div>
        )}

        {isQRCode && (
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            {/* Dégradé : sur les modules du QR (`utils/qrImage.js`) */}
            <GradientColorPicker
              color={selectedElement.color || '#000000'}
              gradient={selectedElement.fillGradient ?? null}
              onColorChange={handleColorChange}
              onGradientChange={(g) => updateElement(selectedId, { fillGradient: g })}
              title="Couleur des modules"
            />
          </div>
        )}

        {isQRCode && (
          <>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Contenu:
              </span>
              <input
                type="text"
                value={selectedElement.qrValue || ''}
                onChange={(e) => handleQRValueChange(e.target.value)}
                placeholder="Texte, URL, SKU..."
                className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-[220px]"
                disabled={!!selectedElement.dataBinding}
              />
            </div>
          </>
        )}

        {isBarcode && (
          <>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Couleur:
              </span>
              <input
                type="color"
                value={selectedElement.lineColor || '#000000'}
                onChange={(e) => handleBarcodeColorChange(e.target.value)}
                className="w-10 h-8 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Fond:
              </span>
              <input
                type="color"
                value={selectedElement.background || '#FFFFFF'}
                onChange={(e) => handleBarcodeBgChange(e.target.value)}
                className="w-10 h-8 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
              />
            </div>

            {/* Hauteur des BARRES, indépendante de la hauteur du cadre. Vide =
                l'ancien calcul (tout le cadre moins la place du numéro). */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Hauteur barres:
              </span>
              <input
                type="number"
                min={1}
                max={400}
                step={1}
                placeholder="auto"
                value={selectedElement.barHeight ?? ''}
                onChange={(e) =>
                  updateElement(selectedId, {
                    barHeight: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                title="Hauteur des barres, en pixels. Vide : elle suit le cadre. Le numéro sous les barres garde sa taille."
              />
            </div>

            {/* Épaisseur d'un module : c'est elle qui décide de la largeur
                totale du symbole, et de sa lisibilité au scanner. */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Largeur barres:
              </span>
              <input
                type="number"
                min={0}
                max={6}
                step={0.5}
                placeholder="auto"
                value={selectedElement.barWidth ?? ''}
                onChange={(e) => {
                  // Vide ou 0 valent « auto », exactement comme pour la hauteur :
                  // on efface le réglage au lieu d'écrire une largeur nulle, qui
                  // ne produirait aucune barre.
                  const saisie = Number(e.target.value);
                  updateElement(selectedId, {
                    barWidth: e.target.value === '' || saisie <= 0 ? undefined : saisie,
                  });
                }}
                className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                title="Largeur d'une barre fine, en pixels. Vide ou 0 : largeur automatique. Plus elle est grande, plus le symbole est large et trapu."
              />
            </div>

            {/* Groupement du numéro AFFICHÉ. Ce qui est encodé ne change pas :
                un scanner lit les barres, jamais le texte. */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Numéro:
              </span>
              <select
                value={selectedElement.textFormat || 'brut'}
                onChange={(e) => updateElement(selectedId, { textFormat: e.target.value })}
                className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                title="Présentation du numéro sous les barres"
              >
                {FORMATS_TEXTE_CODE_BARRES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {isShape && (
          <>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Remplissage:
              </span>
              {(selectedElement.shape ?? 'rectangle') === 'line' ? (
                // Un trait n'a pas de remplissage : pas de dégradé.
                <input
                  type="color"
                  value={selectedElement.fill || '#3b82f6'}
                  onChange={(e) => updateElement(selectedId, { fill: e.target.value })}
                  className="w-10 h-8 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
                />
              ) : (
                <GradientColorPicker
                  color={selectedElement.fill || '#3b82f6'}
                  gradient={selectedElement.fillGradient ?? null}
                  onColorChange={(c) => updateElement(selectedId, { fill: c })}
                  onGradientChange={(g) => updateElement(selectedId, { fillGradient: g })}
                  title="Remplissage"
                />
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Contour:
              </span>
              {/* Dégradé de contour : linéaire seulement (Konva) */}
              <GradientColorPicker
                color={selectedElement.stroke || '#0f172a'}
                gradient={selectedElement.strokeGradient ?? null}
                onColorChange={(c) => updateElement(selectedId, { stroke: c })}
                onGradientChange={(g) => updateElement(selectedId, { strokeGradient: g })}
                title="Contour"
                lineaireSeulement
              />
              {/* Sans épaisseur, la couleur de contour ne se voit pas : les deux
                  réglages vont ensemble. */}
              <input
                type="number"
                min={0}
                max={40}
                step={1}
                value={selectedElement.strokeWidth ?? 0}
                onChange={(e) =>
                  updateElement(selectedId, { strokeWidth: Number(e.target.value) })
                }
                className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                title="Épaisseur du contour, en pixels"
              />
            </div>

            {/* L'arrondi n'a de sens que pour un rectangle. */}
            {(selectedElement.shape ?? 'rectangle') === 'rectangle' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  Arrondi:
                </span>
                <input
                  type="number"
                  min={0}
                  max={200}
                  step={1}
                  value={selectedElement.cornerRadius ?? 0}
                  onChange={(e) =>
                    updateElement(selectedId, { cornerRadius: Number(e.target.value) })
                  }
                  className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            )}
          </>
        )}

        {isFiche && (
          <>
            {/* Section : l'ancien titre par défaut suit le changement ; un
                titre retouché à la main est gardé. */}
            <select
              value={selectedElement.section ?? 'specs'}
              onChange={(e) => {
                const avant = sectionParId(selectedElement.section);
                const apres = sectionParId(e.target.value);
                const maj = { section: apres.id };
                if ((selectedElement.title ?? '') === avant.titre) maj.title = apres.titre;
                updateElement(selectedId, maj);
              }}
              className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              title="Section de la fiche produit"
            >
              {SECTIONS_FICHE.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={selectedElement.title ?? ''}
              onChange={(e) => updateElement(selectedId, { title: e.target.value })}
              placeholder="Sans titre"
              className="w-44 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              title="Titre affiché au-dessus (vide : pas de titre)"
            />
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
            <FontSelector
              value={selectedElement.fontFamily || 'Arial'}
              onChange={(fontFamily) => updateElement(selectedId, { fontFamily })}
            />
            <input
              type="number"
              min={4}
              max={200}
              value={Math.round(selectedElement.fontSize ?? FICHE_PAR_DEFAUT.fontSize)}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n > 0) updateElement(selectedId, { fontSize: Math.min(200, Math.max(4, n)) });
              }}
              className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              title="Taille de la police, en pixels"
            />
            <label className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
              Lignes max
              <input
                type="number"
                min={1}
                max={50}
                value={selectedElement.maxLines ?? FICHE_PAR_DEFAUT.maxLines}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value));
                  if (n > 0) updateElement(selectedId, { maxLines: Math.min(50, n) });
                }}
                className="w-14 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                title="Au-delà, la suite est coupée"
              />
            </label>
            <MenuGroupe icone={Palette} titre="Style du tableau" largeur="16rem">
              <div className="space-y-2 text-xs text-gray-600 dark:text-gray-300">
                {[
                  ['titleColor', 'Titre'],
                  ['labelColor', (selectedElement.section ?? 'specs') === 'specs' ? 'Noms' : 'Puces'],
                  ['color', 'Texte'],
                  ['lineColor', 'Traits'],
                ].map(([cle, label]) => (
                  <label key={cle} className="flex items-center justify-between gap-2">
                    {label}
                    <input
                      type="color"
                      value={selectedElement[cle] ?? FICHE_PAR_DEFAUT[cle]}
                      onChange={(e) => updateElement(selectedId, { [cle]: e.target.value })}
                      className="w-9 h-7 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
                    />
                  </label>
                ))}
                {(selectedElement.section ?? 'specs') === 'specs' && (
                  <>
                    <label className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={selectedElement.stripe ?? FICHE_PAR_DEFAUT.stripe}
                          onChange={(e) => updateElement(selectedId, { stripe: e.target.checked })}
                        />
                        Lignes alternées
                      </span>
                      <input
                        type="color"
                        value={selectedElement.stripeColor ?? FICHE_PAR_DEFAUT.stripeColor}
                        onChange={(e) => updateElement(selectedId, { stripeColor: e.target.value })}
                        className="w-9 h-7 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
                      />
                    </label>
                    <label className="block">
                      <span className="flex justify-between">
                        Colonne des noms
                        <span>{Math.round((selectedElement.colRatio ?? FICHE_PAR_DEFAUT.colRatio) * 100)} %</span>
                      </span>
                      <input
                        type="range"
                        min={0.15}
                        max={0.8}
                        step={0.01}
                        value={selectedElement.colRatio ?? FICHE_PAR_DEFAUT.colRatio}
                        onChange={(e) => updateElement(selectedId, { colRatio: Number(e.target.value) })}
                        className="w-full"
                      />
                    </label>

                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700 font-medium">Cadre</div>
                    <label className="flex items-center justify-between gap-2">
                      Bordure
                      <select
                        value={selectedElement.frame ?? FICHE_PAR_DEFAUT.frame}
                        onChange={(e) => updateElement(selectedId, { frame: e.target.value })}
                        className="px-1.5 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="none">Aucune</option>
                        <option value="outer">Encadré</option>
                        <option value="grid">Grille</option>
                      </select>
                    </label>
                    {(selectedElement.frame ?? FICHE_PAR_DEFAUT.frame) !== 'none' && (
                      <>
                        <label className="flex items-center justify-between gap-2">
                          Couleur
                          <input
                            type="color"
                            value={selectedElement.borderColor ?? FICHE_PAR_DEFAUT.borderColor}
                            onChange={(e) => updateElement(selectedId, { borderColor: e.target.value })}
                            className="w-9 h-7 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
                          />
                        </label>
                        <label className="flex items-center justify-between gap-2">
                          Épaisseur
                          <input
                            type="number"
                            min={0}
                            max={12}
                            step={0.5}
                            value={selectedElement.borderWidth ?? FICHE_PAR_DEFAUT.borderWidth}
                            onChange={(e) => updateElement(selectedId, { borderWidth: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-14 px-1.5 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                        </label>
                        <label className="flex items-center justify-between gap-2">
                          Arrondi
                          <input
                            type="number"
                            min={0}
                            max={60}
                            value={selectedElement.radius ?? FICHE_PAR_DEFAUT.radius}
                            onChange={(e) => updateElement(selectedId, { radius: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-14 px-1.5 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                        </label>
                      </>
                    )}
                    <label className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={!!selectedElement.labelBg}
                          onChange={(e) => updateElement(selectedId, { labelBg: e.target.checked ? '#e5e7eb' : '' })}
                        />
                        Fond des noms
                      </span>
                      {selectedElement.labelBg && (
                        <input
                          type="color"
                          value={selectedElement.labelBg}
                          onChange={(e) => updateElement(selectedId, { labelBg: e.target.value })}
                          className="w-9 h-7 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
                        />
                      )}
                    </label>

                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700 font-medium">Ligne mise en avant</div>
                    <label className="flex items-center justify-between gap-2">
                      N° de ligne (0 : aucune)
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={selectedElement.highlightRow ?? FICHE_PAR_DEFAUT.highlightRow}
                        onChange={(e) => updateElement(selectedId, { highlightRow: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                        className="w-14 px-1.5 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </label>
                    {(selectedElement.highlightRow ?? FICHE_PAR_DEFAUT.highlightRow) > 0 && (
                      <>
                        <label className="flex items-center justify-between gap-2">
                          Couleur
                          <input
                            type="color"
                            value={selectedElement.highlightColor ?? FICHE_PAR_DEFAUT.highlightColor}
                            onChange={(e) => updateElement(selectedId, { highlightColor: e.target.value })}
                            className="w-9 h-7 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
                          />
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={selectedElement.highlightBold ?? FICHE_PAR_DEFAUT.highlightBold}
                            onChange={(e) => updateElement(selectedId, { highlightBold: e.target.checked })}
                          />
                          Valeur en gras
                        </label>
                      </>
                    )}
                  </>
                )}
              </div>
            </MenuGroupe>
          </>
        )}

        {isImage && (
          <>
            {/* Recadrage, comme PocketStick (double-clic sur l'image aussi) */}
            {cropId === selectedId ? (
              <>
                <button
                  onClick={stopCrop}
                  className="px-3 py-1 text-sm rounded-lg bg-teal-600 hover:bg-teal-700 text-white"
                  title="Entrée ou Échap"
                >
                  Valider le recadrage
                </button>
                <button
                  onClick={() => {
                    // Taille d'origine lue sur le nœud affiché : l'image
                    // entière revient, à la même échelle.
                    const img = document.createElement('img');
                    img.onload = () =>
                      updateElement(selectedId, {
                        ...resetCropAttrs(geometrieImage(selectedElement), {
                          width: img.naturalWidth,
                          height: img.naturalHeight,
                        }),
                        scaleX: 1,
                        scaleY: 1,
                      });
                    img.src = resolvePropForElement(selectedElement.src, selectedElement, canvasProduct);
                  }}
                  className="px-3 py-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                  title="Revenir à l'image entière"
                >
                  Réinitialiser
                </button>
              </>
            ) : (
              <button
                onClick={() => startCrop(selectedId)}
                className="px-3 py-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                title="Recadrer (ou double-clic sur l'image)"
              >
                Recadrer
              </button>
            )}
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
            {/* Miroir et masque (`utils/imageForme.js`) */}
            <div className="flex items-center gap-1">
              {[
                ['flipX', FlipHorizontal2, 'Miroir horizontal'],
                ['flipY', FlipVertical2, 'Miroir vertical'],
              ].map(([cle, Icone, titre]) => (
                <button
                  key={cle}
                  type="button"
                  onClick={() => updateElement(selectedId, { [cle]: !selectedElement[cle] })}
                  className={`p-1.5 rounded ${
                    selectedElement[cle]
                      ? 'bg-blue-500 text-white'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                  title={titre}
                  aria-pressed={!!selectedElement[cle]}
                >
                  <Icone className="h-4 w-4" />
                </button>
              ))}
              <MenuGroupe
                icone={Shapes}
                titre="Masque"
                actif={!!(selectedElement.mask || selectedElement.maskTexture || selectedElement.maskPadding)}
                largeur="16rem"
              >
                <div className="grid grid-cols-3 gap-1.5 p-1">
                  <button
                    type="button"
                    onClick={() => updateElement(selectedId, { mask: null })}
                    className={`h-12 rounded border text-[10px] text-gray-600 dark:text-gray-300 ${
                      !selectedElement.mask ? 'ring-2 ring-blue-500 border-transparent' : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    Aucun
                  </button>
                  {MASQUES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => updateElement(selectedId, { mask: m.id })}
                      className={`h-12 p-1.5 rounded border ${
                        selectedElement.mask === m.id
                          ? 'ring-2 ring-blue-500 border-transparent'
                          : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                      title={m.label}
                    >
                      <svg viewBox="0 0 100 100" className="w-full h-full">
                        <path d={m.d} className="fill-gray-700 dark:fill-gray-200" />
                      </svg>
                    </button>
                  ))}
                </div>
                {/* Retrait (rétrécit la forme dans le cadre) et fondu de son bord */}
                {[
                  ['maskPadding', 'Retrait', RETRAIT_MAX],
                  ['maskFeather', 'Fondu', FONDU_MAX],
                ].map(([cle, libelle, max]) => (
                  <label key={cle} className="flex items-center gap-2 px-1 pt-2 text-xs text-gray-600 dark:text-gray-300">
                    <span className="w-14">{libelle}</span>
                    <input
                      type="range"
                      min={0}
                      max={max}
                      step={1}
                      value={selectedElement[cle] ?? 0}
                      onChange={(e) => updateElement(selectedId, { [cle]: Number(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="w-8 text-right">{selectedElement[cle] ?? 0}%</span>
                  </label>
                ))}
                <MasqueTexture
                  valeur={selectedElement.maskTexture ?? null}
                  onChange={(maskTexture) => updateElement(selectedId, { maskTexture })}
                />
              </MenuGroupe>
            </div>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Opacité:
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={selectedElement.opacity ?? 1}
                onChange={(e) => handleOpacityChange(e.target.value)}
                className="w-24"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400 w-8">
                {Math.round((selectedElement.opacity ?? 1) * 100)}%
              </span>
            </div>

            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {Math.round(selectedElement.width ?? 160)}×{Math.round(selectedElement.height ?? 160)}px
              </span>
            </div>

            {dataSource === 'data' && selectedProduct && (
              <>
                <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
                <button
                  onClick={handleImageBinding}
                  className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-2 transition-colors ${
                    selectedElement.dataBinding
                      ? 'bg-blue-500 hover:bg-blue-600 text-white'
                      : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                  }`}
                  title={
                    selectedElement.dataBinding
                      ? 'Image liée au produit'
                      : "Lier à l'image du produit"
                  }
                >
                  {selectedElement.dataBinding ? (
                    <>
                      <Link className="h-4 w-4" />
                      Liée
                    </>
                  ) : (
                    <>
                      <Unlink className="h-4 w-4" />
                      Lier
                    </>
                  )}
                </button>
              </>
            )}
          </>
        )}

        {dataSource === 'data' &&
          selectedProduct &&
          selectedElement.dataBinding &&
          (isText || isQRCode || isBarcode) && (
            <>
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  Champ:
                </span>
                <select
                  value={selectedElement.dataBinding}
                  onChange={(e) => handleFieldChange(e.target.value)}
                  className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white max-w-[180px]"
                >
                  {dataFields.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleUnbind}
                  className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="Utiliser une valeur fixe"
                >
                  Délier
                </button>
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

        {onOpenEffects && (
          <>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 ml-auto" />
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
