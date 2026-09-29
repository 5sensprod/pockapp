import { describe, it, expect } from "vitest";
import { EFFECTS, sanitizeFilters, effectFilter, effectFilters } from "./effetsImage";

const pixels = (...values) => ({ data: new Uint8ClampedArray(values) });

describe("filtres avancés", () => {
  it("garde les filtres connus, borne l’intensité, ignore le reste", () => {
    expect(sanitizeFilters({ shadows: { intensity: 0.71 }, warm: { intensity: 4 }, magie: { intensity: 1 }, cold: {} })).toEqual({
      shadows: { intensity: 0.71 },
      warm: { intensity: 1 },
    });
    expect(sanitizeFilters([])).toBeNull();
    expect(sanitizeFilters("x")).toBeNull();
    expect(EFFECTS).toHaveLength(10);
  });

  it("ombres : courbe lisse, éclaircit surtout les tons sombres, garde noir et blanc", () => {
    const img = pixels(0, 0, 0, 255, 40, 40, 40, 255, 200, 200, 200, 255, 255, 255, 255, 255);
    effectFilter("shadows", 0.5)(img);
    const [black, dark, light, white] = [0, 4, 8, 12].map((i) => img.data[i]);
    expect(black).toBe(0);
    expect(white).toBe(255);
    expect(dark - 40).toBeGreaterThan(light - 200);
    expect(dark).toBeGreaterThan(40);
  });

  it("chaud : gains par canal, le noir reste noir", () => {
    const warm = pixels(100, 100, 100, 255, 0, 0, 0, 255);
    effectFilter("warm", 1)(warm);
    expect([...warm.data]).toEqual([112, 105, 92, 255, 0, 0, 0, 255]);
    const cold = pixels(100, 100, 100, 255);
    effectFilter("cold", 1)(cold);
    expect(cold.data[2]).toBeGreaterThan(cold.data[0]);
  });

  it("intensité nulle : aucune modification", () => {
    for (const { name } of EFFECTS) {
      const img = pixels(30, 120, 220, 255, 250, 10, 90, 255);
      effectFilter(name, 0)(img);
      [...img.data].forEach((v, i) => expect(Math.abs(v - [30, 120, 220, 255, 250, 10, 90, 255][i])).toBeLessThanOrEqual(1));
    }
  });

  it("contraste et saturation (filtres Konva natifs)", () => {
    const contrast = pixels(100, 160, 128, 255);
    effectFilter("contrast", 1)(contrast);
    expect(contrast.data[0]).toBeLessThan(100);
    expect(contrast.data[1]).toBeGreaterThan(160);

    const gray = pixels(255, 0, 0, 255);
    effectFilter("saturation", -1)(gray);
    expect(Math.abs(gray.data[0] - gray.data[1])).toBeLessThanOrEqual(2);
  });

  it("vibrance : renforce une couleur terne plus qu’une couleur vive", () => {
    const img = pixels(140, 120, 110, 255, 250, 20, 20, 255);
    effectFilter("vibrance", 1)(img);
    expect(img.data[0] - img.data[2]).toBeGreaterThan(30 * 1.3);
    expect(img.data[4]).toBe(255);
  });

  it("liste Konva dans l’ordre du champ, sans filtre inconnu", () => {
    expect(effectFilters({ cold: { intensity: 0.2 }, inconnu: { intensity: 1 }, black: { intensity: -0.3 } })).toHaveLength(2);
    expect(effectFilters(undefined)).toEqual([]);
  });
});
