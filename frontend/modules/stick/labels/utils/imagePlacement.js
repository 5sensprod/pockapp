// frontend/modules/stick/labels/utils/imagePlacement.js
//
// Où poser une image qu'on ajoute : à la taille du CANVAS, entière (contenue,
// jamais rognée ni déformée), centrée. Avant, elle arrivait à 160 px de large
// quel que soit le format — sa résolution n'était pas réduite (Konva dessine
// toujours l'image source entière), mais elle paraissait minuscule.

export const cadreSurCanvas = (aspectRatio, canvas) => {
  const ratio = aspectRatio > 0 ? aspectRatio : 1;
  const cw = canvas?.width || 800;
  const ch = canvas?.height || 600;
  const width = Math.min(cw, ch * ratio);
  const height = width / ratio;
  return {
    x: Math.round((cw - width) / 2),
    y: Math.round((ch - height) / 2),
    width: Math.round(width),
    height: Math.round(height),
  };
};
