// frontend/modules/stick/labels/components/canvas/CropOverlay.jsx
//
// MODE RECADRAGE, repris de PocketStick (`src/editor/canvas/CropOverlay.jsx`),
// sans MobX : l'image entière estompée, la zone gardée nette, et un rectangle
// que l'on déplace ou redimensionne. À chaque geste, `applyCropRect` écrit la
// nouvelle géométrie de l'élément. Le pincement tactile de la référence n'est
// pas repris.
//
// Rendu HORS du groupe du document : l'export PDF clone ce groupe, et la
// surcouche ne doit jamais s'imprimer.

import React, { useEffect, useRef } from 'react';
import { Group, Rect, Image as KonvaImage, Transformer } from 'react-konva';
import { cropFrame, clampCropRect, applyCropRect } from '../../utils/crop';
import { recadrage, tailleNaturelle, useImageChargee } from './ImageNode';

const CROP_COLOR = '#0b8f9c';

/** L'élément sous la forme que lit `crop.js`. */
export const geometrieImage = (el) => ({
  x: el.x ?? 0,
  y: el.y ?? 0,
  width: (el.width ?? 160) * (el.scaleX ?? 1),
  height: (el.height ?? 160) * (el.scaleY ?? 1),
  rotation: el.rotation ?? 0,
  type: 'image',
  ...recadrage(el),
});

export const CropOverlay = ({ element, src, scale, onChange }) => {
  const image = useImageChargee(src);
  if (!element || !image) return null;

  const el = geometrieImage(element);
  // cadre = image entière, à partir de la partie réellement affichée
  const frame = cropFrame(el, tailleNaturelle(image));
  const { rect } = frame;

  const commit = (node) => {
    const next = {
      x: node.x(),
      y: node.y(),
      width: node.width() * node.scaleX(),
      height: node.height() * node.scaleY(),
    };
    node.scale({ x: 1, y: 1 });
    // L'échelle éventuelle d'un ancien élément est absorbée dans sa taille.
    onChange({ ...applyCropRect(el, frame, next), scaleX: 1, scaleY: 1 });
  };

  return (
    <Group x={frame.x} y={frame.y} rotation={frame.rotation} name="crop-overlay">
      <KonvaImage image={image} width={frame.width} height={frame.height} opacity={0.35} listening={false} />
      <Group clipX={rect.x} clipY={rect.y} clipWidth={rect.width} clipHeight={rect.height} listening={false}>
        <KonvaImage image={image} width={frame.width} height={frame.height} />
      </Group>
      <Rect
        name="crop-rect"
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        fill="rgba(0,0,0,0.001)"
        stroke={CROP_COLOR}
        strokeWidth={2 / scale}
        dash={[8 / scale, 6 / scale]}
        draggable
        onDragMove={(e) => {
          const node = e.target;
          node.position(
            clampCropRect(frame, { x: node.x(), y: node.y(), width: node.width(), height: node.height() })
          );
        }}
        onDragEnd={(e) => commit(e.target)}
        onTransformEnd={(e) => commit(e.target)}
      />
    </Group>
  );
};

// Poignées du rectangle de recadrage (hors du groupe mis à l'échelle, pour
// garder leur taille).
export const CropTransformer = ({ element }) => {
  const ref = useRef(null);
  const cle = element ? JSON.stringify(geometrieImage(element)) : '';

  useEffect(() => {
    const tr = ref.current;
    if (!tr) return undefined;
    let timer;
    const attacher = () => {
      const node = tr.getLayer()?.findOne('.crop-rect');
      tr.nodes(node ? [node] : []);
      tr.getLayer()?.batchDraw();
      // l'image se charge : on réessaie jusqu'à ce que le rectangle existe
      if (!node && element) timer = setTimeout(attacher, 16);
    };
    attacher();
    return () => clearTimeout(timer);
  }, [cle]);

  if (!element) return null;
  return (
    <Transformer
      ref={ref}
      rotateEnabled={false}
      keepRatio={false}
      flipEnabled={false}
      borderStroke={CROP_COLOR}
      anchorStroke={CROP_COLOR}
      anchorFill="#ffffff"
      anchorSize={12}
      anchorCornerRadius={2}
      ignoreStroke
    />
  );
};
