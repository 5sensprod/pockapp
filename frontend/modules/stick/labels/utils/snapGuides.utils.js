// src/features/labels/utils/snapGuides.utils.js

/**
 * Calcule les bounds d'un élément à partir du node Konva si disponible
 * Inspiré de Polotno SDK pour plus de précision
 */
export const getElementBounds = (element, konvaNode = null) => {
  const x = element.x || 0;
  const y = element.y || 0;

  // 🔥 Si on a le node Konva, TOUJOURS l'utiliser (méthode Polotno)
  if (konvaNode) {
    try {
      // ✅ getClientRect avec skipTransform: false pour avoir les vraies dimensions
      const box = konvaNode.getClientRect({
        skipTransform: false, // Prendre en compte toutes les transformations
        skipStroke: false,
        skipShadow: true, // Ignorer l'ombre pour le snap
        relativeTo: konvaNode.getParent(),
      });

      // 🎯 Retourner les bounds EXACTES du node
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        centerX: box.x + box.width / 2,
        centerY: box.y + box.height / 2,
        right: box.x + box.width,
        bottom: box.y + box.height,
      };
    } catch (err) {
      console.warn('Erreur getClientRect pour', element.id, err);
      // Fallback sur l'estimation
    }
  }

  // 🆘 Fallback : estimation manuelle si pas de node
  const scaleX = element.scaleX || 1;
  const scaleY = element.scaleY || 1;
  const rotation = element.rotation || 0;

  let width = 0;
  let height = 0;

  switch (element.type) {
    case 'text': {
      const fontSize = element.fontSize || 16;
      const text = element.text || '';
      width = text.length * fontSize * 0.55;
      height = fontSize;
      break;
    }
    case 'qrcode':
      width = element.size || 160;
      height = element.size || 160;
      break;
    case 'image':
      width = element.width || 160;
      height = element.height || 160;
      break;
    case 'barcode':
      width = element.width || 200;
      height = element.height || 80;
      break;
    default:
      width = 100;
      height = 100;
  }

  // Appliquer les scales
  width *= scaleX;
  height *= scaleY;

  // Gérer la rotation (si nécessaire)
  if (rotation !== 0) {
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const rotatedWidth = width * cos + height * sin;
    const rotatedHeight = width * sin + height * cos;

    return {
      x,
      y,
      width: rotatedWidth,
      height: rotatedHeight,
      centerX: x + rotatedWidth / 2,
      centerY: y + rotatedHeight / 2,
      right: x + rotatedWidth,
      bottom: y + rotatedHeight,
    };
  }

  return {
    x,
    y,
    width,
    height,
    centerX: x + width / 2,
    centerY: y + height / 2,
    right: x + width,
    bottom: y + height,
  };
};

/**
 * Génère les guides d'alignement (approche Polotno/Figma)
 * - Snap uniquement entre éléments + centre du canvas
 * - Guides uniquement si distance < threshold
 * - Priorité aux alignements les plus proches
 */
export const calculateSnapGuides = (
  movingElement,
  movingNode,
  otherElements,
  canvasSize,
  snapThreshold = 5,
  findNodeById = null
) => {
  if (!movingElement) return { guides: [], snapX: null, snapY: null };

  // 🎯 Récupérer les bounds de l'élément en mouvement
  const movingBounds = getElementBounds(movingElement, movingNode);

  const guides = [];
  let snapX = null;
  let snapY = null;
  let minDistX = snapThreshold;
  let minDistY = snapThreshold;

  // Points de référence pour l'élément en mouvement
  const movingPoints = {
    left: movingBounds.x,
    centerX: movingBounds.centerX,
    right: movingBounds.right,
    top: movingBounds.y,
    centerY: movingBounds.centerY,
    bottom: movingBounds.bottom,
  };

  // 🆕 Références du canvas : centre + bords
  const canvasCenterRef = {
    type: 'canvas-center',
    centerX: canvasSize.width / 2,
    centerY: canvasSize.height / 2,
  };

  const canvasEdgesRef = {
    type: 'canvas-edges',
    left: 0,
    right: canvasSize.width,
    top: 0,
    bottom: canvasSize.height,
    centerX: canvasSize.width / 2,
    centerY: canvasSize.height / 2,
  };

  // ✅ Snap avec : autres éléments + centre canvas + bords canvas
  const allReferences = [...otherElements, canvasCenterRef, canvasEdgesRef];

  allReferences.forEach((ref) => {
    let refPoints;

    if (ref.type === 'canvas-center') {
      // Pour le centre du canvas : uniquement le point central
      refPoints = {
        centerX: ref.centerX,
        centerY: ref.centerY,
      };
    } else if (ref.type === 'canvas-edges') {
      // Pour les bords du canvas : tous les points sauf le centre (déjà géré par canvas-center)
      refPoints = {
        left: ref.left,
        right: ref.right,
        top: ref.top,
        bottom: ref.bottom,
      };
    } else {
      // Pour les autres éléments : tous les points d'alignement
      const refNode = findNodeById && ref.id ? findNodeById(ref.id) : null;
      const refBounds = getElementBounds(ref, refNode);

      refPoints = {
        left: refBounds.x,
        centerX: refBounds.centerX,
        right: refBounds.right,
        top: refBounds.y,
        centerY: refBounds.centerY,
        bottom: refBounds.bottom,
      };
    }

    // Vérifier alignement horizontal (X)
    Object.entries(movingPoints).forEach(([movingKey, movingVal]) => {
      if (!['left', 'centerX', 'right'].includes(movingKey)) return;

      Object.entries(refPoints).forEach(([refKey, refVal]) => {
        if (!['left', 'centerX', 'right'].includes(refKey)) return;

        const dist = Math.abs(movingVal - refVal);

        // 🎯 Uniquement si c'est le plus proche ET en dessous du threshold
        if (dist <= minDistX) {
          minDistX = dist;
          snapX = refVal - (movingVal - movingBounds.x);

          // Supprimer les anciens guides X et ajouter le nouveau
          const existingIndex = guides.findIndex((g) => g.type === 'vertical');
          if (existingIndex >= 0) {
            guides.splice(existingIndex, 1);
          }

          guides.push({
            type: 'vertical',
            x: refVal,
            y1: 0,
            y2: canvasSize.height,
          });
        }
      });
    });

    // Vérifier alignement vertical (Y)
    Object.entries(movingPoints).forEach(([movingKey, movingVal]) => {
      if (!['top', 'centerY', 'bottom'].includes(movingKey)) return;

      Object.entries(refPoints).forEach(([refKey, refVal]) => {
        if (!['top', 'centerY', 'bottom'].includes(refKey)) return;

        const dist = Math.abs(movingVal - refVal);

        // 🎯 Uniquement si c'est le plus proche ET en dessous du threshold
        if (dist <= minDistY) {
          minDistY = dist;
          snapY = refVal - (movingVal - movingBounds.y);

          // Supprimer les anciens guides Y et ajouter le nouveau
          const existingIndex = guides.findIndex((g) => g.type === 'horizontal');
          if (existingIndex >= 0) {
            guides.splice(existingIndex, 1);
          }

          guides.push({
            type: 'horizontal',
            y: refVal,
            x1: 0,
            x2: canvasSize.width,
          });
        }
      });
    });
  });

  return {
    guides, // Déjà dédupliqués par le remplacement ci-dessus
    snapX: minDistX < snapThreshold ? snapX : null,
    snapY: minDistY < snapThreshold ? snapY : null,
  };
};
