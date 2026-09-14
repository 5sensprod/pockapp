import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Text, Rect } from 'react-konva';
import useLabelStore from '../../store/useLabelStore';
import { loadGoogleFont } from '../../utils/loadGoogleFont'; // 🎨 Import de la fonction de chargement

/**
 * Text Konva avec édition inline au double-clic (overlay <textarea>).
 * - Désactivé si el.dataBinding est défini (car la valeur vient des données).
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
    if (!node || !highlightEnabled) return;

    const raf = requestAnimationFrame(() => {
      setBox({ width: node.width(), height: node.height() });
    });
    return () => cancelAnimationFrame(raf);
  }, [text, fontSize, fontFamily, fontStyle, width, highlightEnabled]);

  // 🎨 Charger la police Google Font et forcer le redraw quand elle change
  useEffect(() => {
    const loadAndDraw = async () => {
      const node = textRef.current;
      if (!node) return;

      // Charger la police si c'est une Google Font (sans italic forcé)
      await loadGoogleFont(fontFamily, { weights: '400;700' });

      // Forcer le redraw du Layer après chargement
      const layer = node.getLayer();
      if (layer) {
        // Petit délai pour s'assurer que la police est bien chargée
        setTimeout(() => {
          layer.batchDraw();
        }, 50);
      }
    };

    loadAndDraw();
  }, [fontFamily]); // Se déclenche à chaque changement de fontFamily

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
      updateElement(id, { text: value });
    },
    [id, updateElement]
  );

  const startEditing = useCallback(
    (e) => {
      if (locked) return;
      if (dataBinding) return; // contenu piloté par les données → pas d'édition manuelle

      const node = textRef.current;
      const stage = node.getStage();
      const layer = node.getLayer();
      if (!stage || !layer) return;

      // Position absolue du Text dans le stage (tient compte du zoom via Group)
      const absPos = node.getAbsolutePosition();
      const scale = node.getAbsoluteScale().x; // on suppose scaleX=scaleY
      const stageBox = stage.container().getBoundingClientRect();

      // Crée le textarea
      const textarea = document.createElement('textarea');
      textarea.value = node.text();
      textarea.style.position = 'absolute';
      textarea.style.top = `${stageBox.top + absPos.y}px`;
      textarea.style.left = `${stageBox.left + absPos.x}px`;
      textarea.style.padding = '0';
      textarea.style.margin = '0';
      textarea.style.border = '1px solid rgba(0,0,0,0.2)';
      textarea.style.outline = 'none';
      textarea.style.resize = 'none';
      textarea.style.background = 'white';
      textarea.style.opacity = '1';
      textarea.style.fontSize = `${fontSize * scale}px`;
      textarea.style.fontFamily = fontFamily; // 🎨 Appliquer la police
      textarea.style.lineHeight = '1.2';
      textarea.style.color = fill;
      textarea.style.transformOrigin = 'left top';
      textarea.style.transform = `rotate(${rotation}deg)`;
      textarea.style.zIndex = '9999';
      textarea.style.fontWeight =
        fontStyle === 'bold' || fontStyle?.includes('bold') ? 'bold' : 'normal';
      textarea.style.fontStyle =
        fontStyle === 'italic' || fontStyle?.includes('italic') ? 'italic' : 'normal';
      textarea.style.textDecoration = textDecoration || 'none';
      textarea.style.backgroundColor = highlightEnabled ? highlightColor : 'white';

      // Largeur/hauteur approximatives : on peut partir de la bbox du node
      const nodeBox = node.getClientRect({ relativeTo: stage });
      const minWidth = 50 * scale;
      textarea.style.width = `${Math.max(nodeBox.width, minWidth)}px`;
      textarea.style.height = `${Math.max(nodeBox.height, fontSize * 1.4)}px`;

      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      // Masquer temporairement le node pour que le textarea le remplace visuellement
      node.visible(false);
      layer.draw();

      const end = (save) => {
        if (save) {
          commit(textarea.value);
        }
        textarea.parentNode && textarea.parentNode.removeChild(textarea);
        node.visible(true);
        layer.draw();
      };

      textarea.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter' && !evt.shiftKey) {
          evt.preventDefault();
          end(true);
        } else if (evt.key === 'Escape') {
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
        fill={fill}
        rotation={rotation}
        scaleX={scaleX}
        scaleY={scaleY}
        opacity={opacity}
        width={width} // Support du width pour redimensionnement
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
