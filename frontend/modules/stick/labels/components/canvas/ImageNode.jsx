// frontend/modules/stick/labels/components/canvas/ImageNode.jsx
//
// Une image SANS DÉFORMATION, comme dans PocketStick : l'élément porte un
// recadrage (`cropX`, `cropY`, `cropWidth`, `cropHeight`, fractions de l'image
// d'origine, 0/0/1/1 par défaut) et Konva ne dessine que la partie qui tient
// dans le cadre à ses proportions (`konvaCrop`, `utils/crop.js`). Un cadre plus
// large que l'image la rogne en haut et en bas, il ne l'écrase plus.

import React, { useEffect, useMemo, useState } from 'react';
import { Image as KonvaImage } from 'react-konva';
import { konvaCrop } from '../../utils/crop';
import { sceneImage } from '../../utils/imageForme';

/** Recadrage d'un élément, valeurs par défaut comprises. */
export const recadrage = (el) => ({
  cropX: el.cropX ?? 0,
  cropY: el.cropY ?? 0,
  cropWidth: el.cropWidth ?? 1,
  cropHeight: el.cropHeight ?? 1,
});

/** Taille d'origine d'une image chargée. */
export const tailleNaturelle = (img) =>
  img ? { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height } : null;

/** Charge une image (crossOrigin, pour l'export). */
export const useImageChargee = (src) => {
  const [image, setImage] = useState(null);
  useEffect(() => {
    if (!src) {
      setImage(null);
      return undefined;
    }
    let actif = true;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => actif && setImage(img);
    img.src = src;
    return () => {
      actif = false;
    };
  }, [src]);
  return image;
};

const ImageNode = ({
  id,
  x,
  y,
  width = 160,
  height = 160,
  src = '',
  cropX,
  cropY,
  cropWidth,
  cropHeight,
  flipX = false,
  flipY = false,
  mask = null,
  ...rest
}) => {
  const image = useImageChargee(src);
  // Miroir et masque : un DESSIN particulier, pas un autre nœud (`utils/imageForme.js`)
  const sceneFunc = useMemo(() => sceneImage({ flipX, flipY, mask }), [flipX, flipY, mask]);
  const naturel = tailleNaturelle(image);
  // MÉMOÏSÉ sur des nombres, et c'est ce qui rend le redimensionnement fluide :
  // pendant le geste, le canvas pose le recadrage directement sur le nœud
  // (`KonvaCanvas`, `resizeStep`). Un nouvel objet `crop` à chaque rendu
  // serait réappliqué par react-konva et remettrait l'ANCIEN recadrage du
  // store sous la souris, à chaque mouvement.
  const nw = naturel?.width;
  const nh = naturel?.height;
  const crop = useMemo(
    () =>
      nw && nh
        ? konvaCrop(
            { width, height, ...recadrage({ cropX, cropY, cropWidth, cropHeight }) },
            { width: nw, height: nh }
          )
        : undefined,
    [nw, nh, width, height, cropX, cropY, cropWidth, cropHeight]
  );

  // ✅ on pose id/x/y/...rest sur le nœud Konva racine (KonvaImage)
  return (
    <KonvaImage
      id={id}
      x={x}
      y={y}
      image={image}
      width={width}
      height={height}
      crop={crop}
      sceneFunc={sceneFunc}
      {...rest}
    />
  );
};

export default ImageNode;
