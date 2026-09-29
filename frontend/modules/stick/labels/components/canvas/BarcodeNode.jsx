// src/features/labels/components/canvas/BarcodeNode.jsx
import React, { useEffect, useState, useRef } from 'react';
import { Group, Image as KonvaImage } from 'react-konva';
import { dessinerCodeBarres } from '../../utils/barcodeCanvas';

/**
 * BarcodeNode - Composant Konva pour afficher un code-barres
 * - L'ID + handlers restent sur le Group (pour le Transformer)
 * - L'ombre est appliquée sur le KonvaImage interne (car le Group ne dessine pas)
 */
const BarcodeNode = ({
  id,
  x,
  y,
  width = 200,
  height = 80,
  barcodeValue = '',
  format = 'CODE128',
  displayValue = true,
  fontSize = 14,
  textMargin = 2,
  margin = 10,
  // Hauteur des BARRES seules, en pixels. Sans elle, l'ancien calcul
  // s'applique : toute la hauteur du nœud moins la place du numéro.
  barHeight,
  // Largeur d'un module. JsBarcode la figeait à 2 ; vide ou 0 revient à cette
  // valeur automatique, comme `barHeight` revient à la hauteur du cadre.
  barWidth,
  // Groupement du numéro affiché — jamais de ce qui est ENCODÉ
  // (`utils/barcodeText.js`).
  textFormat = 'brut',
  background = '#FFFFFF',
  lineColor = '#000000',
  ...rest
}) => {
  const [imageObj, setImageObj] = useState(null);
  // Rapport hauteur/largeur du symbole RÉELLEMENT produit par JsBarcode.
  // Sans lui, le nœud imposait sa propre hauteur à une image dont la hauteur
  // naturelle venait de changer : les barres s'allongeaient, l'image était
  // écrasée pour tenir dans le cadre, et le numéro se déformait avec elle.
  const [ratio, setRatio] = useState(null);
  const imageRef = useRef(null);

  // --- extraire les props d'ombre pour les passer au KonvaImage ---
  const {
    shadowEnabled,
    shadowColor,
    shadowOpacity,
    shadowBlur,
    shadowOffsetX,
    shadowOffsetY,
    ...groupRest
  } = rest;

  useEffect(() => {
    let mounted = true;

    const generateBarcode = () => {
      try {
        const canvas = dessinerCodeBarres({
          barcodeValue,
          format,
          width,
          height,
          displayValue,
          fontSize,
          textMargin,
          margin,
          barHeight,
          barWidth,
          textFormat,
          background,
          lineColor,
        });

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (mounted) {
            setImageObj(img);
            setRatio(img.naturalHeight / img.naturalWidth);
            imageRef.current?.getLayer()?.batchDraw();
          }
        };
        img.onerror = (e) => {
          console.error('❌ Erreur chargement image code-barres:', e);
        };
        img.src = canvas.toDataURL('image/png');
      } catch (err) {
        console.error('❌ Erreur génération code-barres:', err);
      }
    };

    generateBarcode();
    return () => {
      mounted = false;
    };
  }, [
    barcodeValue,
    format,
    width,
    height,
    displayValue,
    fontSize,
    textMargin,
    margin,
    barHeight,
    barWidth,
    textFormat,
    background,
    lineColor,
  ]);

  return (
    <Group id={id} x={x} y={y} {...groupRest}>
      {imageObj && (
        <KonvaImage
          ref={imageRef}
          image={imageObj}
          width={width}
          // HOMOTHÉTIE : la hauteur découle de la largeur et du rapport réel du
          // symbole. C'est ce qui garantit que rien ne se déforme quand la
          // hauteur des barres ou leur largeur changent — le cadre suit le
          // dessin, jamais l'inverse.
          height={ratio ? width * ratio : height}
          // 🟣 Ombres sur l'image (pas sur le Group)
          shadowEnabled={shadowEnabled}
          shadowColor={shadowColor}
          shadowOpacity={shadowOpacity}
          shadowBlur={shadowBlur}
          shadowOffsetX={shadowOffsetX}
          shadowOffsetY={shadowOffsetY}
        />
      )}
    </Group>
  );
};

export default BarcodeNode;
