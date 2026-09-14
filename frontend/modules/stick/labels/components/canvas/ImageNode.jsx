//AppTools\src\features\labels\components\canvas\ImageNode.jsx
import React, { useEffect, useState } from 'react';
import { Image as KonvaImage } from 'react-konva';

const ImageNode = ({ id, x, y, width = 160, height = 160, src = '', ...rest }) => {
  const [image, setImage] = useState(null);

  useEffect(() => {
    if (!src) return;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
    img.src = src;
  }, [src]);

  // ✅ on pose id/x/y/...rest sur le nœud Konva racine (KonvaImage)
  return <KonvaImage id={id} x={x} y={y} image={image} width={width} height={height} {...rest} />;
};

export default ImageNode;
