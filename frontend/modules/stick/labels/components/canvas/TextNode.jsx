import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Text, Rect } from 'react-konva';
import useLabelStore from '../../store/useLabelStore';
import { loadGoogleFont } from '../../utils/loadGoogleFont'; // 🎨 Import de la fonction de chargement
import { remplissage } from '../../utils/fillStyle';
import { premiereCouleur } from '../../utils/paint';
import { texteDeLaFiche } from '../../utils/dataBinding';

/**
 * Text Konva avec édition inline au double-clic (overlay <textarea>).
 * - Si el.dataBinding est défini, l'édition écrit une CORRECTION pour le
 *   produit affiché (`textOverrides[correctionKey]`) et non `text` : la fiche
 *   produit n'est pas touchée. Sans produit (`correctionKey` vide), pas d'édition.
 * - Support de width pour le redimensionnement et wrap="word"
 * - Support de fontFamily pour Google Fonts
 * - Support gras/italique (fontStyle), souligné/barré (textDecoration),
 *   et surlignage type stabilo (highlightEnabled + highlightColor)
 */
const TextNode = ({
  id,
  x,
  y,
  text,
  fontSize = 16,
  fontStyle = 'normal',
  fontFamily = 'Arial', // 🎨 Nouvelle prop pour la police
  textDecoration = '', // '' | 'underline' | 'line-through' | 'underline line-through'
  highlightEnabled = false, // 🖍️ Surlignage type stabilo
  highlightColor = '#FFFF00',
  highlightOpacity = 0.5,
  fill = '#000000',
  rotation = 0,
  scaleX = 1,
  scaleY = 1,
  opacity = 1,
  width, // Nouvelle prop pour supporter le redimensionnement
  draggable = true,
  locked = false,
  dataBinding = null,
  correctionKey = null, // _id du produit affiché, pour corriger un texte lié
  fillGradient = null, // 🌈 dégradé (`utils/paint.js`, ancien { from, to, angle } lu aussi) ou null
  align = 'left', // alignement DANS le bloc : left | center | right | justify
  shadowEnabled,
  shadowColor,
  shadowOpacity,
  shadowBlur,
  shadowOffsetX,
  shadowOffsetY,
  onClick,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTransform,
  onTransformStart,
  onTransformEnd,
}) => {
  const textRef = useRef(null);
  const updateElement = useLabelStore((s) => s.updateElement);

  // 🖍️ Dimensions mesurées du texte, pour positionner le rectangle de surlignage
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = textRef.current;
    if (!node || !(highlightEnabled || fillGradient)) return;

    const raf = requestAnimationFrame(() => {
      setBox({ width: node.width(), height: node.height() });
    });
    return () => cancelAnimationFrame(raf);
  }, [text, fontSize, fontFamily, fontStyle, width, highlightEnabled, fillGradient]);

  // 📐 RE-MESURER le texte et recaler le cadre de sélection. Konva mesure un
  // texte au moment où ses attributs changent : une police Google qui arrive
  // APRÈS (chargement réseau) laissait l'ancienne mesure, et le Transformer
  // ne se recale que sur un changement de largeur explicite — un texte sans
  // largeur fixée gardait donc le cadre de l'ancienne police.
  const remesurer = useCallback(() => {
    const node = textRef.current;
    if (!node) return;
    node._setTextData?.(); // mesure interne de Konva.Text
    if (highlightEnabled || fillGradient) setBox({ width: node.width(), height: node.height() });
    node.getStage()?.find('Transformer').forEach((tr) => tr.forceUpdate());
    node.getLayer()?.batchDraw();
  }, [highlightEnabled, fillGradient]);

  // Toute retouche qui change la taille du texte (police, taille, style,
  // contenu, largeur, alignement) : re-mesure à l'image suivante.
  useEffect(() => {
    const raf = requestAnimationFrame(remesurer);
    return () => cancelAnimationFrame(raf);
  }, [remesurer, text, fontSize, fontFamily, fontStyle, width, align]);

  // 🎨 Charger la police Google Font, puis re-mesurer quand elle est là
  useEffect(() => {
    let actif = true;
    loadGoogleFont(fontFamily, { weights: '400;700' }).then(() => actif && remesurer());
    // `document.fonts.load` peut répondre avant que la feuille de style de
    // Google soit arrivée : on re-mesure aussi à chaque fin de chargement.
    const fonts = document.fonts;
    const fin = () => actif && remesurer();
    fonts?.addEventListener?.('loadingdone', fin);
    return () => {
      actif = false;
      fonts?.removeEventListener?.('loadingdone', fin);
    };
  }, [fontFamily, remesurer]);

  // Empêche la sélection de texte par le navigateur pendant le drag
  useEffect(() => {
    const node = textRef.current;
    if (!node) return;
    const stage = node.getStage();
    if (!stage) return;
    const container = stage.container();
    container.style.userSelect = 'none';
    container.style.webkitUserSelect = 'none';
  }, []);

  const commit = useCallback(
    (value) => {
      if (!dataBinding) {
        updateElement(id, { text: value });
        return;
      }
      // Texte lié : rien n'est écrit si le vendeur n'a rien changé, sinon une
      // simple ouverture/fermeture figerait la valeur de la fiche.
      if (value === text) return;
      const { elements, selectedProduct } = useLabelStore.getState();
      const el = elements.find((e) => e.id === id);
      // On mémorise le texte de la fiche au moment de la correction : s'il
      // change ensuite (temps réel), le panneau le signale sans rien écraser.
      const source = texteDeLaFiche(el, selectedProduct);
      updateElement(id, {
        textOverrides: { ...(el?.textOverrides || {}), [correctionKey]: value },
        ...(source !== undefined && {
          textOverridesSource: { ...(el?.textOverridesSource || {}), [correctionKey]: source },
        }),
      });
    },
    [id, updateElement, dataBinding, correctionKey, text]
  );

  const startEditing = useCallback(
    (e) => {
      if (locked) return;
      if (dataBinding && !correctionKey) return; // lié, mais aucun produit à qui rattacher la correction

      const node = textRef.current;
      const stage = node.getStage();
      const layer = node.getLayer();
      if (!stage || !layer) return;

      // Position absolue du Text dans le stage (tient compte du zoom via Group)
      const absPos = node.getAbsolutePosition();
      const scale = node.getAbsoluteScale().x; // on suppose scaleX=scaleY
      const stageBox = stage.container().getBoundingClientRect();

      // Édition EN PLACE, reprise de PocketStick (`src/editor/canvas/TextEditor.jsx`) :
      // un textarea transparent, sans bordure ni marge, aux MÊMES métriques
      // que le Konva.Text (police, taille × zoom, interligne, largeur). Le mot
      // reste où il est, dans son cadre ; seul un pointillé signale l'édition.
      const largeurFixe = width != null;
      const couleur = premiereCouleur(fillGradient) || fill;

      const textarea = document.createElement('textarea');
      textarea.value = node.text();
      textarea.rows = 1;
      textarea.spellcheck = true;
      Object.assign(textarea.style, {
        position: 'fixed',
        left: `${stageBox.left + absPos.x}px`,
        top: `${stageBox.top + absPos.y}px`,
        width: `${node.width() * scale}px`,
        margin: '0',
        padding: '0',
        border: 'none',
        outline: '1px dashed rgba(59, 130, 246, 0.9)',
        background: 'transparent',
        resize: 'none',
        overflow: 'hidden',
        // Largeur fixée : le texte passe à la ligne comme dans Konva (wrap
        // "word"). Largeur libre : le champ s'élargit avec la saisie.
        whiteSpace: largeurFixe ? 'pre-wrap' : 'pre',
        overflowWrap: 'break-word',
        fontFamily,
        fontSize: `${fontSize * scale}px`,
        fontWeight: fontStyle?.includes('bold') ? 'bold' : 'normal',
        fontStyle: fontStyle?.includes('italic') ? 'italic' : 'normal',
        lineHeight: String(node.lineHeight()),
        textDecoration: textDecoration || 'none',
        textAlign: node.align(),
        color: couleur,
        caretColor: couleur,
        opacity: String(opacity),
        transformOrigin: 'left top',
        transform: rotation ? `rotate(${rotation}deg)` : 'none',
        zIndex: '9999',
      });

      // Le cadre suit le contenu, recalculé à chaque frappe
      const ajuster = () => {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
        if (!largeurFixe) {
          textarea.style.width = 'auto';
          textarea.style.width = `${Math.max(node.width() * scale, textarea.scrollWidth + 2)}px`;
        }
      };
      textarea.addEventListener('input', ajuster);

      document.body.appendChild(textarea);
      ajuster();
      textarea.focus();
      textarea.select();

      // Masquer temporairement le node pour que le textarea le remplace visuellement
      node.visible(false);
      layer.draw();

      // Une seule fin : retirer le champ déclenche `blur`, qui validerait
      // sinon un Échap.
      let fini = false;
      const end = (save) => {
        if (fini) return;
        fini = true;
        if (save) {
          commit(textarea.value);
        }
        textarea.parentNode && textarea.parentNode.removeChild(textarea);
        node.visible(true);
        layer.draw();
      };

      textarea.addEventListener('keydown', (evt) => {
        // Comme PocketStick : Entrée = retour à la ligne ; Ctrl/Cmd+Entrée ou
        // clic ailleurs = valider ; Échap = annuler.
        evt.stopPropagation(); // Suppr / flèches ne doivent pas agir sur le canvas
        if (evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey)) {
          evt.preventDefault();
          end(true);
        } else if (evt.key === 'Escape') {
          evt.preventDefault();
          end(false);
        }
      });
      textarea.addEventListener('blur', () => end(true));
    },
    [
      commit,
      fill,
      fontSize,
      fontFamily,
      fontStyle,
      textDecoration,
      highlightEnabled,
      highlightColor,
      locked,
      rotation,
      dataBinding,
      correctionKey,
      width,
      opacity,
      fillGradient,
    ]
  );

  return (
    <>
      {/* 🖍️ Rectangle de surlignage (stabilo), positionné derrière le texte */}
      {highlightEnabled && box.width > 0 && box.height > 0 && (
        <Rect
          x={x}
          y={y}
          width={box.width}
          height={box.height}
          rotation={rotation}
          scaleX={scaleX}
          scaleY={scaleY}
          fill={highlightColor}
          opacity={highlightOpacity * opacity}
          listening={false}
        />
      )}
      <Text
        ref={textRef}
        id={id}
        x={x}
        y={y}
        text={text}
        fontSize={fontSize}
        fontStyle={fontStyle}
        fontFamily={fontFamily} // 🎨 Appliquer la police Google Font
        textDecoration={textDecoration} // souligné / barré
        {...remplissage(fillGradient, box.width, box.height, fill)}
        rotation={rotation}
        scaleX={scaleX}
        scaleY={scaleY}
        opacity={opacity}
        width={width} // Support du width pour redimensionnement
        align={align}
        wrap="word" // Wrap automatique des mots
        draggable={draggable && !locked}
        shadowEnabled={shadowEnabled}
        shadowColor={shadowColor}
        shadowOpacity={shadowOpacity}
        shadowBlur={shadowBlur}
        shadowOffsetX={shadowOffsetX}
        shadowOffsetY={shadowOffsetY}
        onDblClick={startEditing}
        onClick={onClick}
        onTap={startEditing} // bonus mobile (tap prolongé non géré ici)
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onTransformStart={onTransformStart}
        onTransform={onTransform}
        onTransformEnd={onTransformEnd}
      />
    </>
  );
};

export default TextNode;
