import { describe, it, expect } from "vitest";
import { cropFrame, applyCropRect, resetCropAttrs, clampCropRect, konvaCrop, visibleCrop, isCornerAnchor, resizeStep, settleCrop, pinchCropRect } from "./crop";

const base = { x: 100, y: 50, width: 200, height: 100, rotation: 0, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1, flipX: false, flipY: false };

const close = (actual, expected) => Object.entries(expected).forEach(([k, v]) => expect(actual[k]).toBeCloseTo(v, 2));

describe("recadrage", () => {
  it("sans recadrage, le cadre est l’élément", () => {
    const frame = cropFrame(base);
    close(frame, { x: 100, y: 50, width: 200, height: 100 });
    close(frame.rect, { x: 0, y: 0, width: 200, height: 100 });
  });

  it("recadre à droite sans bouger l’image à l’écran", () => {
    const frame = cropFrame(base);
    const attrs = applyCropRect(base, frame, { x: 50, y: 25, width: 100, height: 50 });
    close(attrs, { x: 150, y: 75, width: 100, height: 50, cropX: 0.25, cropY: 0.25, cropWidth: 0.5, cropHeight: 0.5 });
    // Le cadre de l’élément recadré est le même que celui d’origine.
    const again = cropFrame({ ...base, ...attrs });
    close(again, { x: 100, y: 50, width: 200, height: 100 });
    close(again.rect, { x: 50, y: 25, width: 100, height: 50 });
  });

  it("tient compte de la rotation", () => {
    const el = { ...base, rotation: 90 };
    const attrs = applyCropRect(el, cropFrame(el), { x: 50, y: 0, width: 150, height: 100 });
    // à 90°, l’axe x du cadre pointe vers le bas de la page
    close(attrs, { x: 100, y: 100, cropX: 0.25, cropWidth: 0.75 });
    close(cropFrame({ ...el, ...attrs }), { x: 100, y: 50 });
  });

  it("tient compte du miroir horizontal", () => {
    const el = { ...base, flipX: true };
    const attrs = applyCropRect(el, cropFrame(el), { x: 0, y: 0, width: 50, height: 100 });
    // on garde le quart gauche affiché = le quart droit de l’image d’origine
    close(attrs, { x: 100, width: 50, cropX: 0.75, cropWidth: 0.25 });
    close(cropFrame({ ...el, ...attrs }).rect, { x: 0, width: 50 });
  });

  it("garde le rectangle dans le cadre avec une taille minimale", () => {
    const frame = { width: 200, height: 100 };
    expect(clampCropRect(frame, { x: -20, y: 90, width: 500, height: 1 })).toEqual({ x: 0, y: 90, width: 200, height: 5 });
  });

  it("réinitialise en restituant l’image entière à la même échelle", () => {
    const cropped = { ...base, ...applyCropRect(base, cropFrame(base), { x: 50, y: 25, width: 100, height: 50 }) };
    close(resetCropAttrs(cropped), { x: 100, y: 50, width: 200, height: 100, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 });
  });

  it("convertit en pixels pour Konva", () => {
    expect(konvaCrop({ cropX: 0.25, cropY: 0.5, cropWidth: 0.5, cropHeight: 0.25 }, { width: 800, height: 400 }))
      .toEqual({ x: 200, y: 200, width: 400, height: 100 });
  });
});

describe("affichage sans déformation et redimensionnement", () => {
  // image 400 × 200, entière, dans un cadre 200 × 100 (mêmes proportions)
  const natural = { width: 400, height: 200 };
  const base = { type: "image", x: 0, y: 0, rotation: 0, width: 200, height: 100, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1, flipX: false, flipY: false };

  it("affiche tout le recadrage quand les proportions correspondent", () => {
    expect(visibleCrop(base, natural)).toEqual({ cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 });
  });

  it("rogne au lieu d’étirer quand le cadre est plus large ou plus haut", () => {
    expect(visibleCrop({ ...base, width: 400, height: 100 }, natural)).toEqual({ cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 0.5 });
    expect(visibleCrop({ ...base, width: 100, height: 100 }, natural)).toEqual({ cropX: 0, cropY: 0, cropWidth: 0.5, cropHeight: 1 });
    expect(konvaCrop({ ...base, width: 100, height: 100 }, natural)).toEqual({ x: 0, y: 0, width: 200, height: 200 });
  });

  it("image « étirée » : le recadrage est affiché tel quel ; une vidéo n’est jamais étirée", () => {
    expect(visibleCrop({ ...base, width: 400, height: 100, stretchEnabled: true }, natural).cropHeight).toBe(1);
    expect(visibleCrop({ ...base, type: "video", width: 400, height: 100, stretchEnabled: true }, natural).cropHeight).toBe(0.5);
  });

  it("ignore les écarts d’arrondi (taille au centième)", () => {
    expect(visibleCrop({ ...base, width: 300.01, height: 150 }, natural)).toMatchObject({ cropWidth: 1, cropHeight: 1 });
  });

  it("reconnaît coins et côtés", () => {
    expect(isCornerAnchor("top-left")).toBe(true);
    expect(isCornerAnchor("middle-right")).toBe(false);
    expect(isCornerAnchor("bottom-center")).toBe(false);
  });

  it("coin : taille proportionnelle, recadrage inchangé", () => {
    const next = resizeStep(base, { scaleX: 1.5, scaleY: 1.5, anchor: "bottom-right" }, natural);
    expect(next).toMatchObject({ width: 300, height: 150, cropWidth: 1, cropHeight: 1 });
  });

  it("côté vers l’intérieur : on coupe l’image au lieu de la comprimer", () => {
    const next = resizeStep(base, { scaleX: 0.5, scaleY: 1, anchor: "middle-right" }, natural);
    expect(next).toMatchObject({ width: 100, height: 100, cropWidth: 0.5, cropHeight: 1 });
    expect(visibleCrop({ ...base, ...next }, natural)).toMatchObject({ cropWidth: 0.5, cropHeight: 1 });
  });

  it("côté vers l’extérieur : on découvre l’image, puis elle zoome juste assez pour couvrir le cadre", () => {
    const cropped = { ...base, width: 100, cropWidth: 0.5 };
    const wider = resizeStep(cropped, { scaleX: 1.5, scaleY: 1, anchor: "middle-right" }, natural);
    expect(wider).toMatchObject({ width: 150, cropWidth: 0.75, cropHeight: 1 });
    // 400 px de large : toute la largeur de l’image ne suffit plus à l’échelle 0,5 → zoom ×2
    const beyond = resizeStep(cropped, { scaleX: 4, scaleY: 1, anchor: "middle-right" }, natural);
    expect(beyond).toMatchObject({ width: 400, cropWidth: 1, cropHeight: 0.5 });
    expect(settleCrop({ ...cropped, ...beyond }, natural)).toMatchObject({ cropWidth: 1, cropHeight: 0.5 });
  });

  it("côté vers l’intérieur d’un cadre déjà rogné : le zoom ne change pas", () => {
    // cadre large : affiché 1 × 0,5 de l’image, à l’échelle 1
    const wide = { ...base, width: 400, height: 100 };
    const next = resizeStep(wide, { scaleX: 0.75, scaleY: 1, anchor: "middle-left" }, natural);
    expect(next).toMatchObject({ width: 300, cropWidth: 0.75, cropHeight: 0.5 });
  });

  it("le recadrage affiché garde toujours les proportions du cadre", () => {
    const next = resizeStep({ ...base, cropX: 0.2, cropWidth: 0.6 }, { scaleX: 1, scaleY: 1.7, anchor: "bottom-center" }, natural);
    expect((next.cropWidth * natural.width) / (next.cropHeight * natural.height)).toBeCloseTo(next.width / next.height, 4);
    expect(next.cropX + next.cropWidth).toBeLessThanOrEqual(1);
  });

  it("image étirée : les côtés déforment, le recadrage ne bouge pas", () => {
    const stretched = { ...base, stretchEnabled: true };
    expect(resizeStep(stretched, { scaleX: 2, scaleY: 1, anchor: "middle-right" }, natural)).toMatchObject({ width: 400, cropWidth: 1 });
    expect(settleCrop(stretched, natural)).toEqual({});
  });

  it("le cadre de recadrage part de la partie affichée", () => {
    const frame = cropFrame({ ...base, width: 100, height: 100 }, natural);
    expect([frame.width, frame.height]).toEqual([200, 100]);
    expect(frame.rect).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it("pincement : écarter zoome autour du point pincé, sans changer les proportions ni sortir de l’image", () => {
    const frame = { width: 400, height: 200 };
    const rect = { x: 100, y: 50, width: 200, height: 100 };
    expect(pinchCropRect(frame, rect, { x: 200, y: 100 }, 2)).toEqual({ x: 150, y: 75, width: 100, height: 50 });
    expect(pinchCropRect(frame, rect, { x: 200, y: 100 }, 0.25)).toEqual({ x: 0, y: 0, width: 400, height: 200 });
    expect(pinchCropRect(frame, rect, { x: 200, y: 100 }, 1000).width).toBeCloseTo(10);
  });
});
