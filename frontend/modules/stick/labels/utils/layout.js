// frontend/modules/stick/labels/utils/layout.js
//
// COPIÉ TEL QUEL de PocketStick (`src/editor/canvas/layout.js`), avec ses tests
// (`layout.test.js`). Ici on s'en sert pour aligner et distribuer.

// Géométrie pure du confort d’édition : cadres englobants, aimantation, alignement,
// distribution et lasso. Toutes les coordonnées sont celles de la page (document).

const round = (v) => Math.round(v * 100) / 100;

// Cadre englobant (non tourné) d’un élément : rotation autour du coin haut-gauche, comme le rendu.
// Un groupe englobe ses enfants.
export const getElementBox = (el) => {
  if (el.type === "group") return unionBoxes(el.children.map(getElementBox));
  const w = el.width || 0;
  const h = el.height || 0;
  const rad = ((el.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [[0, 0], [w, 0], [0, h], [w, h]].map(([px, py]) => ({
    x: el.x + px * cos - py * sin,
    y: el.y + px * sin + py * cos,
  }));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

export const unionBoxes = (boxes) => {
  const list = boxes.filter(Boolean);
  if (!list.length) return null;
  const x = Math.min(...list.map((b) => b.x));
  const y = Math.min(...list.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...list.map((b) => b.x + b.width)) - x,
    height: Math.max(...list.map((b) => b.y + b.height)) - y,
  };
};

export const translateBox = (box, dx, dy) => ({ ...box, x: box.x + dx, y: box.y + dy });

// Lignes d’aimantation d’un cadre : bords et centre sur chaque axe.
const verticalLines = (box) => [box.x, box.x + box.width / 2, box.x + box.width];
const horizontalLines = (box) => [box.y, box.y + box.height / 2, box.y + box.height];

// Cibles d’aimantation : la page puis les autres éléments (chaque ligne garde son cadre pour dessiner le repère).
export const getSnapTargets = (page, boxes) => {
  const pageBox = { x: 0, y: 0, width: page.width, height: page.height };
  const all = [pageBox, ...boxes];
  return {
    vertical: all.flatMap((box) => verticalLines(box).map((value) => ({ value, box }))),
    horizontal: all.flatMap((box) => horizontalLines(box).map((value) => ({ value, box }))),
  };
};

// Meilleur écart (le plus petit, sous le seuil) entre des lignes mobiles et des lignes cibles.
const bestOffset = (lines, targets, threshold) => {
  let best = null;
  for (const line of lines) {
    for (const target of targets) {
      const diff = target.value - line;
      if (Math.abs(diff) > threshold) continue;
      if (!best || Math.abs(diff) < Math.abs(best.diff) - 1e-9) best = { diff, matches: [] };
    }
  }
  if (!best) return null;
  // Toutes les lignes alignées avec cet écart deviennent des repères.
  for (const line of lines) {
    for (const target of targets) {
      if (Math.abs(target.value - line - best.diff) < 1e-6) best.matches.push(target);
    }
  }
  return best;
};

// Repère vertical à x (ou horizontal à y), étendu du cadre mobile aux cadres cibles.
const makeGuides = (orientation, matches, box) => {
  const byValue = new Map();
  for (const { value, box: target } of matches) {
    const key = round(value);
    const union = unionBoxes([byValue.get(key) || box, target]);
    byValue.set(key, union);
  }
  return [...byValue.entries()].map(([value, span]) =>
    orientation === "vertical"
      ? { orientation, x: value, y1: span.y, y2: span.y + span.height }
      : { orientation, y: value, x1: span.x, x2: span.x + span.width },
  );
};

// Aimantation d’un cadre déplacé : décalage à appliquer et repères à afficher.
export const snapBox = (box, targets, threshold) => {
  const vx = bestOffset(verticalLines(box), targets.vertical, threshold);
  const hy = bestOffset(horizontalLines(box), targets.horizontal, threshold);
  const dx = vx ? vx.diff : 0;
  const dy = hy ? hy.diff : 0;
  const snapped = translateBox(box, dx, dy);
  return {
    dx,
    dy,
    guides: [
      ...(vx ? makeGuides("vertical", vx.matches, snapped) : []),
      ...(hy ? makeGuides("horizontal", hy.matches, snapped) : []),
    ],
  };
};

// Aimantation d’un point (poignée de redimensionnement) sur les axes demandés.
export const snapPoint = (point, targets, threshold, { snapX = true, snapY = true } = {}) => {
  const pointBox = { x: point.x, y: point.y, width: 0, height: 0 };
  const vx = snapX ? bestOffset([point.x], targets.vertical, threshold) : null;
  const hy = snapY ? bestOffset([point.y], targets.horizontal, threshold) : null;
  const snapped = { x: point.x + (vx ? vx.diff : 0), y: point.y + (hy ? hy.diff : 0) };
  const box = { ...pointBox, ...snapped };
  return {
    ...snapped,
    guides: [
      ...(vx ? makeGuides("vertical", vx.matches, box) : []),
      ...(hy ? makeGuides("horizontal", hy.matches, box) : []),
    ],
  };
};

// Axes concernés par une poignée du Transformer.
export const anchorAxes = (anchor = "") => ({
  snapX: /left|right/.test(anchor),
  snapY: /top|bottom/.test(anchor),
});

export const ALIGNMENTS = ["left", "center", "right", "top", "middle", "bottom"];

// Décalages pour aligner des cadres sur une référence (la page, ou le cadre commun de la sélection).
export const alignOffsets = (boxes, reference, alignment) =>
  boxes.map((box) => {
    switch (alignment) {
      case "left": return { dx: reference.x - box.x, dy: 0 };
      case "center": return { dx: reference.x + reference.width / 2 - (box.x + box.width / 2), dy: 0 };
      case "right": return { dx: reference.x + reference.width - (box.x + box.width), dy: 0 };
      case "top": return { dx: 0, dy: reference.y - box.y };
      case "middle": return { dx: 0, dy: reference.y + reference.height / 2 - (box.y + box.height / 2) };
      case "bottom": return { dx: 0, dy: reference.y + reference.height - (box.y + box.height) };
      default: return { dx: 0, dy: 0 };
    }
  });

// Distribution : extrémités fixes, espaces égaux entre les cadres (au moins 3).
export const distributeOffsets = (boxes, axis) => {
  const offsets = boxes.map(() => ({ dx: 0, dy: 0 }));
  if (boxes.length < 3) return offsets;
  const pos = axis === "horizontal" ? "x" : "y";
  const size = axis === "horizontal" ? "width" : "height";
  const delta = axis === "horizontal" ? "dx" : "dy";
  const order = boxes.map((box, i) => ({ box, i })).sort((a, b) => a.box[pos] - b.box[pos]);
  const first = order[0].box;
  const end = Math.max(...boxes.map((b) => b[pos] + b[size]));
  const total = boxes.reduce((sum, b) => sum + b[size], 0);
  const gap = (end - first[pos] - total) / (boxes.length - 1);
  let cursor = first[pos];
  for (const { box, i } of order) {
    offsets[i][delta] = round(cursor - box[pos]);
    cursor += box[size] + gap;
  }
  return offsets;
};

// Rectangle normalisé à partir de deux points (lasso).
export const rectFromPoints = (a, b) => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
});

export const boxesIntersect = (a, b) =>
  a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;

// Éléments visibles touchés par le lasso.
export const elementsInRect = (elements, rect) =>
  elements.filter((el) => el.visible && boxesIntersect(getElementBox(el), rect)).map((el) => el.id);

export const LASSO_MIN_DRAG = 3; // en pixels écran : en dessous, c’est un simple clic
