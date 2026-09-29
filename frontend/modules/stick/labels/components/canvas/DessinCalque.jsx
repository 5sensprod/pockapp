// frontend/modules/stick/labels/components/canvas/DessinCalque.jsx
//
// Calque de saisie de l'outil Dessin, porté de PocketStick
// (`canvas/DrawingLayer.jsx`), voir PocketStick-docs/05-dessin.md.
//
// Lot 1 (perf) : PocketStick recopiait le tableau et relançait un rendu React
// à chaque mouvement, puis recalculait tout le contour — coût quadratique.
// Ici les points sont ajoutés EN PLACE dans une ref, et l'aperçu est redessiné
// au plus une fois par image (`requestAnimationFrame`), directement sur le nœud
// Konva : aucun rendu React pendant le tracé. Le calcul reste le même
// (`strokeOutline`, `last: false`) : l'aperçu est toujours le résultat final.
//
// Posé HORS du groupe du document : l'export clone ce groupe, l'aperçu et la
// surface de capture ne doivent pas s'imprimer. La surface couvre toute la
// scène et intercepte la souris avant le lasso et les éléments.

import React, { useEffect, useRef } from 'react';
import { Group, Path, Rect } from 'react-konva';
import useLabelStore from '../../store/useLabelStore';
import { brushCursor, outlineToPathData, strokeOutline } from '../../utils/dessin';

export default function DessinCalque({ scale, offsetX, offsetY, stageWidth, stageHeight }) {
  const groupRef = useRef(null);
  const apercuRef = useRef(null);
  const pointsRef = useRef(null); // tracé en cours (null = pas de bouton enfoncé)
  const imageRef = useRef(0); // requestAnimationFrame en attente (0 = aucun)
  const active = useLabelStore((s) => s.outilDessin);
  const reglages = useLabelStore((s) => s.reglagesDessin);
  const reglagesRef = useRef(reglages);
  reglagesRef.current = reglages;
  const { stroke, strokeWidth, opacity } = reglages;

  // Une image : le contour du tracé en cours, posé sur le nœud d'aperçu.
  const dessiner = () => {
    imageRef.current = 0;
    const apercu = apercuRef.current;
    const pts = pointsRef.current;
    if (!apercu || !pts) return;
    const { strokeWidth: w, smoothing, thinning } = reglagesRef.current;
    apercu.data(outlineToPathData(strokeOutline(pts, { strokeWidth: w, smoothing, thinning, last: false })));
    apercu.visible(true);
    apercu.getLayer()?.batchDraw();
  };
  const planifier = () => {
    if (!imageRef.current) imageRef.current = requestAnimationFrame(dessiner);
  };
  const effacerApercu = () => {
    if (imageRef.current) cancelAnimationFrame(imageRef.current);
    imageRef.current = 0;
    const apercu = apercuRef.current;
    if (!apercu) return;
    apercu.visible(false);
    apercu.data('');
    apercu.getLayer()?.batchDraw();
  };

  const pointer = () => groupRef.current?.getRelativePointerPosition();
  const start = (e) => {
    e.cancelBubble = true;
    const p = pointer();
    if (!p) return;
    pointsRef.current = [p];
    planifier();
  };
  const move = (e) => {
    if (!pointsRef.current) return;
    e.cancelBubble = true;
    const p = pointer();
    if (!p) return;
    pointsRef.current.push(p);
    planifier();
  };

  // Relâchement n'importe où (même hors de la scène) : fin du tracé.
  useEffect(() => {
    if (!active) return undefined;
    const end = () => {
      const pts = pointsRef.current;
      if (!pts) return;
      pointsRef.current = null;
      effacerApercu();
      try {
        useLabelStore.getState().ajouterDessin(pts);
      } catch (error) {
        console.error('Tracé non créé :', error);
      }
    };
    window.addEventListener('mouseup', end);
    window.addEventListener('touchend', end);
    return () => {
      window.removeEventListener('mouseup', end);
      window.removeEventListener('touchend', end);
      pointsRef.current = null;
      if (imageRef.current) cancelAnimationFrame(imageRef.current);
      imageRef.current = 0;
    };
  }, [active]);

  // Curseur : rond de la taille et de la couleur du pinceau (croix si trop petit ou trop grand).
  useEffect(() => {
    const container = groupRef.current?.getStage()?.container();
    if (!active || !container) return undefined;
    container.style.cursor = brushCursor(strokeWidth * scale, stroke, opacity);
    return () => {
      container.style.cursor = '';
    };
  }, [active, stroke, strokeWidth, opacity, scale]);

  if (!active) return null;
  return (
    <Group ref={groupRef} name="drawing-layer" x={offsetX} y={offsetY} scaleX={scale} scaleY={scale}>
      <Rect
        x={-offsetX / scale}
        y={-offsetY / scale}
        width={stageWidth / scale}
        height={stageHeight / scale}
        fill="transparent"
        onMouseDown={start}
        onMouseMove={move}
        onTouchStart={start}
        onTouchMove={move}
      />
      {/* Toujours monté, caché hors tracé : `dessiner` en pose la géométrie */}
      <Path ref={apercuRef} name="drawing-preview" visible={false} fill={stroke} opacity={opacity} listening={false} />
    </Group>
  );
}
