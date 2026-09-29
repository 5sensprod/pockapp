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
// Lot 2 (pression) : Pointer Events au lieu de souris + tactile. Un trait
// appartient à UN pointeur (`pointerId`) ; tracé au stylet en mode
// « stylet », il relève la pression réelle (`pressionReelle`). Les
// événements regroupés par le navigateur (`getCoalescedEvents`) sont tous
// relevés : un stylet en émet bien plus qu'un par image.
//
// Lot 3 (courbe assistée) : un point à moins de `DISTANCE_MIN_ECRAN` pixels
// écran du précédent n'est pas gardé (`pointUtile`) ; Maj tenue fait du
// tracé un segment droit depuis son premier point ; la simplification
// (Ramer-Douglas-Peucker) s'applique au relâchement, dans `elementDessin`.
//
// Posé HORS du groupe du document : l'export clone ce groupe, l'aperçu et la
// surface de capture ne doivent pas s'imprimer. La surface couvre toute la
// scène et intercepte la souris avant le lasso et les éléments.

import React, { useEffect, useRef } from 'react';
import { Group, Path, Rect } from 'react-konva';
import useLabelStore from '../../store/useLabelStore';
import {
  brushCursor,
  DISTANCE_MIN_ECRAN,
  outlineToPathData,
  pointUtile,
  pressionReelle,
  strokeOutline,
} from '../../utils/dessin';

export default function DessinCalque({ scale, offsetX, offsetY, stageWidth, stageHeight }) {
  const groupRef = useRef(null);
  const apercuRef = useRef(null);
  const pointsRef = useRef(null); // tracé en cours (null = pas de bouton enfoncé)
  const traitRef = useRef(null); // { pointerId, pression } du tracé en cours
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
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
    const pression = !!traitRef.current?.pression;
    // Mêmes réglages que l'élément créé au relâchement (effilement compris)
    apercu.data(outlineToPathData(strokeOutline(pts, { ...reglagesRef.current, pression, last: false })));
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

  // Événement DOM → point dans le repère du document, pression comprise.
  const pointDe = (evt) => {
    const groupe = groupRef.current;
    const cadre = groupe?.getStage()?.container().getBoundingClientRect();
    if (!cadre) return null;
    const p = groupe
      .getAbsoluteTransform()
      .copy()
      .invert()
      .point({ x: evt.clientX - cadre.left, y: evt.clientY - cadre.top });
    return { x: p.x, y: p.y, pressure: evt.pressure };
  };
  const start = (e) => {
    const evt = e.evt;
    e.cancelBubble = true;
    if (pointsRef.current || evt.button !== 0) return;
    // Pas d'événements souris de compatibilité (lasso, glisser) derrière
    evt.preventDefault();
    const p = pointDe(evt);
    if (!p) return;
    traitRef.current = {
      pointerId: evt.pointerId,
      pression: pressionReelle(evt.pointerType, reglagesRef.current.variation),
    };
    pointsRef.current = [p];
    planifier();
  };
  const move = (e) => {
    const evt = e.evt;
    if (!pointsRef.current || evt.pointerId !== traitRef.current?.pointerId) return;
    e.cancelBubble = true;
    const pts = pointsRef.current;
    // Maj : un segment droit, du premier point au pointeur
    if (evt.shiftKey) {
      const p = pointDe(evt);
      if (p) pts.splice(1, pts.length - 1, p);
      planifier();
      return;
    }
    const distanceMin = DISTANCE_MIN_ECRAN / (scaleRef.current || 1);
    const lot = evt.getCoalescedEvents?.() ?? [];
    for (const ev of lot.length ? lot : [evt]) {
      const p = pointDe(ev);
      if (p && pointUtile(pts[pts.length - 1], p, distanceMin)) pts.push(p);
    }
    planifier();
  };

  // Relâchement n'importe où (même hors de la scène) : fin du tracé.
  useEffect(() => {
    if (!active) return undefined;
    const end = (evt) => {
      const pts = pointsRef.current;
      const trait = traitRef.current;
      if (!pts || evt.pointerId !== trait?.pointerId) return;
      pointsRef.current = null;
      traitRef.current = null;
      effacerApercu();
      try {
        useLabelStore.getState().ajouterDessin(pts, { pression: trait.pression });
      } catch (error) {
        console.error('Tracé non créé :', error);
      }
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    // Le doigt et le stylet dessinent au lieu de faire défiler la page
    const container = groupRef.current?.getStage()?.container();
    const toucheAvant = container?.style.touchAction ?? '';
    if (container) container.style.touchAction = 'none';
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (container) container.style.touchAction = toucheAvant;
      pointsRef.current = null;
      traitRef.current = null;
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
        onPointerDown={start}
        onPointerMove={move}
      />
      {/* Toujours monté, caché hors tracé : `dessiner` en pose la géométrie */}
      <Path ref={apercuRef} name="drawing-preview" visible={false} fill={stroke} opacity={opacity} listening={false} />
    </Group>
  );
}
