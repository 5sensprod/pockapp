// frontend/modules/stick/labels/components/canvas/DessinCalque.jsx
//
// Calque de saisie de l'outil Dessin, porté de PocketStick
// (`canvas/DrawingLayer.jsx`) À L'IDENTIQUE — lot 0 : même saisie souris et
// tactile, même aperçu recalculé à chaque mouvement (les défauts de perf sont
// l'objet du lot 1, voir PocketStick-docs/05-dessin.md).
//
// Posé HORS du groupe du document : l'export clone ce groupe, l'aperçu et la
// surface de capture ne doivent pas s'imprimer. La surface couvre toute la
// scène et intercepte la souris avant le lasso et les éléments.

import React, { useEffect, useRef, useState } from 'react';
import { Group, Path, Rect } from 'react-konva';
import useLabelStore from '../../store/useLabelStore';
import { brushCursor, outlineToPathData, strokeOutline } from '../../utils/dessin';

export default function DessinCalque({ scale, offsetX, offsetY, stageWidth, stageHeight }) {
  const groupRef = useRef(null);
  const [points, setPoints] = useState([]);
  const pointsRef = useRef(null); // tracé en cours (null = pas de bouton enfoncé)
  const active = useLabelStore((s) => s.outilDessin);
  const { stroke, strokeWidth, opacity, smoothing, thinning } = useLabelStore((s) => s.reglagesDessin);

  const pointer = () => groupRef.current?.getRelativePointerPosition();
  const start = (e) => {
    e.cancelBubble = true;
    const p = pointer();
    if (!p) return;
    pointsRef.current = [p];
    setPoints([p]);
  };
  const move = (e) => {
    if (!pointsRef.current) return;
    e.cancelBubble = true;
    const p = pointer();
    if (!p) return;
    pointsRef.current = [...pointsRef.current, p];
    setPoints(pointsRef.current);
  };

  // Relâchement n'importe où (même hors de la scène) : fin du tracé.
  useEffect(() => {
    if (!active) return undefined;
    const end = () => {
      const pts = pointsRef.current;
      if (!pts) return;
      pointsRef.current = null;
      setPoints([]);
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
      {points.length > 0 && (
        // même calcul que l'élément créé au relâchement : l'aperçu est le résultat final
        <Path
          name="drawing-preview"
          data={outlineToPathData(strokeOutline(points, { strokeWidth, smoothing, thinning, last: false }))}
          fill={stroke}
          opacity={opacity}
          listening={false}
        />
      )}
    </Group>
  );
}
