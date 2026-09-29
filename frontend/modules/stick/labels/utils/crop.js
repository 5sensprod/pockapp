// frontend/modules/stick/labels/utils/crop.js
//
// COPIÉ TEL QUEL de PocketStick (`src/editor/canvas/crop.js`), avec ses tests
// (`crop.test.js`). Ne pas diverger : corriger là-bas, recopier ici.

// Géométrie du recadrage d’image (fonctions pures).
//
// L’élément affiche la zone (cropX, cropY, cropWidth, cropHeight) de l’image d’origine, en fractions,
// dans un rectangle width × height tourné de `rotation` autour de (x, y). Pendant le recadrage, on
// affiche l’image entière (le « cadre ») et la zone gardée (le « rectangle ») dans le repère du cadre.

const MIN_SIZE = 5;
const round = (v) => Math.round(v * 100) / 100;
const round6 = (v) => Math.round(v * 1e6) / 1e6;

const plain = (el) => ({ x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation, flipX: el.flipX, flipY: el.flipY, type: el.type, stretchEnabled: el.stretchEnabled, cropX: el.cropX, cropY: el.cropY, cropWidth: el.cropWidth, cropHeight: el.cropHeight });

const rotate = ({ x, y }, degrees) => {
  const a = (degrees * Math.PI) / 180;
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
};

// Position affichée de la zone : un miroir inverse le côté du recadrage.
const displayedOffset = (el) => ({
  x: el.flipX ? 1 - el.cropX - el.cropWidth : el.cropX,
  y: el.flipY ? 1 - el.cropY - el.cropHeight : el.cropY,
});

// `natural` (facultatif) : taille de l’image, pour partir de la partie réellement affichée.
export const cropFrame = (source, natural) => {
  const el = natural ? { ...plain(source), ...visibleCrop(source, natural) } : source;
  const fullWidth = el.width / el.cropWidth;
  const fullHeight = el.height / el.cropHeight;
  const offset = displayedOffset(el);
  const shift = rotate({ x: -offset.x * fullWidth, y: -offset.y * fullHeight }, el.rotation);
  return {
    x: el.x + shift.x,
    y: el.y + shift.y,
    rotation: el.rotation,
    width: fullWidth,
    height: fullHeight,
    rect: { x: offset.x * fullWidth, y: offset.y * fullHeight, width: el.width, height: el.height },
  };
};

// Garde le rectangle dans le cadre, avec une taille minimale.
export const clampCropRect = (frame, rect) => {
  const width = Math.min(frame.width, Math.max(MIN_SIZE, rect.width));
  const height = Math.min(frame.height, Math.max(MIN_SIZE, rect.height));
  return {
    x: Math.min(frame.width - width, Math.max(0, rect.x)),
    y: Math.min(frame.height - height, Math.max(0, rect.y)),
    width,
    height,
  };
};

// Nouveaux attributs de l’élément pour un rectangle donné dans le repère du cadre.
export const applyCropRect = (el, frame, rawRect) => {
  const rect = clampCropRect(frame, rawRect);
  const origin = rotate({ x: rect.x, y: rect.y }, frame.rotation);
  const dx = rect.x / frame.width;
  const dy = rect.y / frame.height;
  const cropWidth = rect.width / frame.width;
  const cropHeight = rect.height / frame.height;
  return {
    x: round(frame.x + origin.x),
    y: round(frame.y + origin.y),
    width: round(rect.width),
    height: round(rect.height),
    cropX: round6(el.flipX ? 1 - dx - cropWidth : dx),
    cropY: round6(el.flipY ? 1 - dy - cropHeight : dy),
    cropWidth: round6(cropWidth),
    cropHeight: round6(cropHeight),
  };
};

// Annule le recadrage : l’image entière, à la même échelle, à la place du cadre.
export const resetCropAttrs = (el, natural) => {
  const frame = cropFrame(el, natural);
  return applyCropRect(el, frame, { x: 0, y: 0, width: frame.width, height: frame.height });
};

// ——— Affichage sans déformation et redimensionnement ———

// « Étirer » (stretchEnabled) : seule une image peut être déformée ; une vidéo ne l’est jamais.
export const isStretched = (el) => el.type === "image" && !!el.stretchEnabled;

// Partie du recadrage réellement affichée, en fractions : le recadrage ramené aux proportions du
// cadre depuis son coin haut-gauche (jamais d’étirement), sauf image « étirée ».
export const visibleCrop = (el, natural) => {
  const crop = { cropX: el.cropX, cropY: el.cropY, cropWidth: el.cropWidth, cropHeight: el.cropHeight };
  if (isStretched(el) || !(natural?.width > 0 && natural?.height > 0) || !(el.width > 0 && el.height > 0)) return crop;
  const cropW = natural.width * el.cropWidth;
  const cropH = natural.height * el.cropHeight;
  const frameRatio = el.width / el.height;
  const shownW = frameRatio >= cropW / cropH ? cropW : cropH * frameRatio;
  const shownH = frameRatio >= cropW / cropH ? cropW / frameRatio : cropH;
  // tolérance : les tailles arrondies au centième ne doivent pas rogner un recadrage déjà ajusté
  const near = (shown, full) => (Math.abs(shown - full) <= full * 1e-3 ? full : round6(shown));
  return { ...crop, cropWidth: near(shownW / natural.width, el.cropWidth), cropHeight: near(shownH / natural.height, el.cropHeight) };
};

// Zone de l’image d’origine à dessiner, en pixels (attribut `crop` de Konva.Image).
export const konvaCrop = (el, natural) => {
  const c = visibleCrop(el, natural);
  return { x: c.cropX * natural.width, y: c.cropY * natural.height, width: c.cropWidth * natural.width, height: c.cropHeight * natural.height };
};

// Poignée de coin ou de côté (noms d’ancres Konva).
export const isCornerAnchor = (anchor = "") => !(anchor.includes("middle") || anchor.includes("center"));

// Un pas de redimensionnement (scaleX/scaleY : facteurs de ce pas).
// Modèle « zoom constant, l’image couvre le cadre » :
// - coin : tout grandit ensemble, le recadrage ne change pas ;
// - côté : l’image garde son échelle à l’écran, le cadre en montre plus ou moins, depuis le même
//   coin de l’image. S’il n’y a plus d’image à découvrir, elle zoome juste assez pour couvrir le cadre ;
// - image « étirée » : elle se déforme, le recadrage ne change pas.
export const resizeStep = (el, { scaleX, scaleY, anchor }, natural) => {
  const unit = (s) => (Math.abs(s - 1) < 1e-7 ? 1 : s);
  const width = el.width * unit(scaleX);
  const height = el.height * unit(scaleY);
  const known = natural?.width > 0 && natural?.height > 0 && el.width > 0 && el.height > 0;
  const same = { cropX: el.cropX, cropY: el.cropY, cropWidth: el.cropWidth, cropHeight: el.cropHeight };
  if (isCornerAnchor(anchor) || isStretched(el) || !known) return { width, height, ...same };
  const shown = visibleCrop(el, natural);
  const cropX = Math.min(1 - shown.cropWidth, Math.max(0, el.cropX));
  const cropY = Math.min(1 - shown.cropHeight, Math.max(0, el.cropY));
  // zoom = pixels du cadre par pixel de l’image, relevé si l’image restante ne couvre plus le cadre
  const zoom = Math.max(
    el.width / (shown.cropWidth * natural.width),
    width / ((1 - cropX) * natural.width),
    height / ((1 - cropY) * natural.height),
  );
  return {
    width,
    height,
    cropX: round6(cropX),
    cropY: round6(cropY),
    cropWidth: round6(fitTo(1 - cropX, width / (zoom * natural.width))),
    cropHeight: round6(fitTo(1 - cropY, height / (zoom * natural.height))),
  };
};

// Borne haute, collée quand l’écart n’est qu’une erreur d’arrondi (sinon 1 devient 0,999999).
const fitTo = (max, v) => (max - v < 1e-5 ? max : v); // 1e-5 : moins de 0,05 px sur 4000 px

// Fin du geste : on enregistre exactement la partie affichée.
export const settleCrop = (el, natural) => (isStretched(el) ? {} : visibleCrop(el, natural));

// Pincement à deux doigts en mode recadrage : écarter les doigts (ratio > 1) zoome dans l’image,
// donc le rectangle gardé rétrécit autour du point pincé ; ses proportions ne changent pas.
export const pinchCropRect = (frame, rect, center, ratio) => {
  if (!(ratio > 0)) return rect;
  let k = 1 / ratio;
  k = Math.min(k, frame.width / rect.width, frame.height / rect.height);
  k = Math.max(k, MIN_SIZE / rect.width, MIN_SIZE / rect.height);
  const width = rect.width * k;
  const height = rect.height * k;
  return clampCropRect(frame, { x: center.x - (center.x - rect.x) * k, y: center.y - (center.y - rect.y) * k, width, height });
};
