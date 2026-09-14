// src/features/labels/components/canvas/BarcodeNode.jsx
import React, { useEffect, useState, useRef } from 'react';
import { Group, Image as KonvaImage } from 'react-konva';
import JsBarcode from 'jsbarcode';
import { formaterTexteCodeBarres } from '../../utils/barcodeText';

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
        const canvas = document.createElement('canvas');
        const value = barcodeValue || '000000000000';

        // `textFormat: 'aucun'` masque le numéro : c'est un réglage de texte,
        // il n'a pas à passer par une seconde case à cocher.
        const numeroVisible = displayValue && textFormat !== 'aucun';
        const hauteurBarres =
          barHeight != null && barHeight > 0
            ? barHeight
            : height - (numeroVisible ? fontSize + textMargin * 2 : 0);

        const largeurBarres = barWidth != null && barWidth > 0 ? barWidth : 2;

        // ── RÉSOLUTION ────────────────────────────────────────────────────
        // JsBarcode rend un BITMAP à sa taille naturelle, que Konva étire
        // ensuite jusqu'à la largeur du cadre. Un symbole naturel de 200 px
        // posé sur 600 px est donc agrandi trois fois : bords de barres
        // adoucis à l'écran, et surtout au PDF, qui capture ce même bitmap.
        // Un scanner lit mal des bords flous.
        //
        // On dessine donc à une échelle ENTIÈRE — un multiple exact, pour que
        // chaque barre reste un nombre entier de pixels et qu'aucune ne soit
        // rendue plus large que sa voisine par un arrondi.
        const dessiner = (echelle) => {
          JsBarcode(canvas, value, {
            format,
            width: largeurBarres * echelle,
            height: Math.max(1, hauteurBarres * echelle),
            displayValue: numeroVisible,
            text: numeroVisible ? formaterTexteCodeBarres(value, textFormat) : undefined,
            fontSize: fontSize * echelle,
            textMargin: textMargin * echelle,
            margin: margin * echelle,
            background,
            lineColor,
            valid: (valid) => {
              if (!valid) {
                console.warn('⚠️ Code-barres invalide:', value, 'format:', format);
              }
            },
          });
        };

        // Première passe : elle donne la largeur naturelle, qui dépend de la
        // valeur encodée et du format — impossible à connaître d'avance.
        dessiner(1);

        // Deuxième passe si le cadre est plus large que le dessin. ×2 au
        // minimum, pour rester net sur un écran à forte densité et au zoom ;
        // plafonné pour ne pas fabriquer un bitmap démesuré sur une planche.
        const naturelle = canvas.width || 1;
        const souhaitee = (width || naturelle) * 2;
        const echelle = Math.min(8, Math.max(1, Math.ceil(souhaitee / naturelle)));
        if (echelle > 1) dessiner(echelle);

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
