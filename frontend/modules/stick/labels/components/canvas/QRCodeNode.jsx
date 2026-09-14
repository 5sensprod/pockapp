// src/features/labels/components/canvas/QRCodeNode.jsx
import React, { useEffect, useState, useRef } from 'react';
import { Group, Image as KonvaImage } from 'react-konva';
import QRCode from 'qrcode';

/**
 * QRCodeNode - Composant Konva pour afficher un QR code
 * - L'ID + handlers restent sur le Group (pour le Transformer)
 * - L'ombre est appliquée sur le KonvaImage interne (car le Group ne dessine pas)
 */
const QRCodeNode = ({
  id,
  x,
  y,
  size = 160,
  color = '#000',
  bgColor = '#FFFFFF00',
  qrValue = '',
  ...rest
}) => {
  const [imageObj, setImageObj] = useState(null);
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

    const generateQR = async () => {
      try {
        const displayResolution = Math.max(256, Math.floor(size * 2));
        const dataUrl = await QRCode.toDataURL(qrValue || ' ', {
          width: displayResolution,
          margin: 2,
          color: { dark: color, light: bgColor },
          errorCorrectionLevel: 'H',
          type: 'image/png',
          rendererOpts: { quality: 1.0 },
        });

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (mounted) {
            setImageObj(img);
            imageRef.current?.getLayer()?.batchDraw();
          }
        };
        img.onerror = (e) => {
          console.error('QR image loading failed', e);
        };
        img.src = dataUrl;
      } catch (e) {
        console.error('QR generation failed', e);
      }
    };

    generateQR();
    return () => {
      mounted = false;
    };
  }, [qrValue, size, color, bgColor]);

  return (
    <Group id={id} x={x} y={y} {...groupRest}>
      {imageObj && (
        <KonvaImage
          ref={imageRef}
          image={imageObj}
          width={size}
          height={size}
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

export default QRCodeNode;
