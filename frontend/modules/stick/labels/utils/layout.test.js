import { describe, it, expect } from "vitest";
import {
  getElementBox,
  getSnapTargets,
  snapBox,
  snapPoint,
  anchorAxes,
  alignOffsets,
  distributeOffsets,
  rectFromPoints,
  elementsInRect,
} from "./layout";

const PAGE = { width: 1000, height: 800 };

describe("cadres englobants", () => {
  it("élément tourné autour de son coin haut-gauche, groupe = union des enfants", () => {
    expect(getElementBox({ x: 10, y: 20, width: 100, height: 50, rotation: 0 })).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    const box = getElementBox({ x: 100, y: 100, width: 100, height: 50, rotation: 90 });
    expect(box.x).toBeCloseTo(50);
    expect(box.y).toBeCloseTo(100);
    expect(box.width).toBeCloseTo(50);
    expect(box.height).toBeCloseTo(100);
    const group = { type: "group", children: [{ x: 0, y: 0, width: 10, height: 10 }, { x: 50, y: 40, width: 10, height: 20 }] };
    expect(getElementBox(group)).toEqual({ x: 0, y: 0, width: 60, height: 60 });
  });
});

describe("aimantation", () => {
  const targets = getSnapTargets(PAGE, [{ x: 600, y: 300, width: 100, height: 100 }]);

  it("aimante le centre de la page et affiche un repère sur toute la hauteur", () => {
    const result = snapBox({ x: 447, y: 10, width: 100, height: 100 }, targets, 6);
    expect(result.dx).toBe(3);
    expect(result.dy).toBe(0);
    expect(result.guides).toEqual([{ orientation: "vertical", x: 500, y1: 0, y2: 800 }]);
  });

  it("aimante les bords d’un autre élément sur les deux axes, repère limité aux deux cadres", () => {
    const result = snapBox({ x: 704, y: 196, width: 50, height: 100 }, targets, 6);
    expect([result.dx, result.dy]).toEqual([-4, 4]);
    expect(result.guides).toContainEqual({ orientation: "vertical", x: 700, y1: 200, y2: 400 });
    expect(result.guides).toContainEqual({ orientation: "horizontal", y: 300, x1: 600, x2: 750 });
  });

  it("ne bouge rien au-delà du seuil", () => {
    expect(snapBox({ x: 420, y: 520, width: 30, height: 30 }, targets, 6)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it("aimante une poignée seulement sur ses axes", () => {
    expect(anchorAxes("middle-right")).toEqual({ snapX: true, snapY: false });
    expect(anchorAxes("bottom-left")).toEqual({ snapX: true, snapY: true });
    const p = snapPoint({ x: 598, y: 402 }, targets, 6, anchorAxes("middle-right"));
    expect([p.x, p.y]).toEqual([600, 402]);
    expect(p.guides).toHaveLength(1);
  });
});

describe("alignement et distribution", () => {
  const boxes = [
    { x: 0, y: 0, width: 100, height: 50 },
    { x: 300, y: 100, width: 50, height: 100 },
  ];
  const reference = { x: 0, y: 0, width: 350, height: 200 };

  it("aligne sur les six positions", () => {
    expect(alignOffsets(boxes, reference, "left")).toEqual([{ dx: 0, dy: 0 }, { dx: -300, dy: 0 }]);
    expect(alignOffsets(boxes, reference, "center")).toEqual([{ dx: 125, dy: 0 }, { dx: -150, dy: 0 }]);
    expect(alignOffsets(boxes, reference, "right")).toEqual([{ dx: 250, dy: 0 }, { dx: 0, dy: 0 }]);
    expect(alignOffsets(boxes, reference, "top")).toEqual([{ dx: 0, dy: 0 }, { dx: 0, dy: -100 }]);
    expect(alignOffsets(boxes, reference, "middle")).toEqual([{ dx: 0, dy: 75 }, { dx: 0, dy: -50 }]);
    expect(alignOffsets(boxes, reference, "bottom")).toEqual([{ dx: 0, dy: 150 }, { dx: 0, dy: 0 }]);
  });

  it("distribue avec des espaces égaux, extrémités fixes, quel que soit l’ordre", () => {
    const list = [
      { x: 500, y: 0, width: 100, height: 10 },
      { x: 0, y: 0, width: 100, height: 10 },
      { x: 120, y: 0, width: 50, height: 10 },
    ];
    // étendue 600, tailles 250 → espace 175 : 0, 275, 500
    expect(distributeOffsets(list, "horizontal")).toEqual([{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 155, dy: 0 }]);
    expect(distributeOffsets(list.slice(0, 2), "horizontal")).toEqual([{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }]);
  });
});

describe("lasso", () => {
  it("sélectionne les éléments visibles touchés, groupes compris", () => {
    const elements = [
      { id: "a", visible: true, x: 10, y: 10, width: 20, height: 20 },
      { id: "b", visible: false, x: 10, y: 10, width: 20, height: 20 },
      { id: "c", visible: true, x: 200, y: 200, width: 20, height: 20 },
      { id: "g", type: "group", visible: true, children: [{ x: 90, y: 90, width: 5, height: 5 }] },
    ];
    const rect = rectFromPoints({ x: 100, y: 100 }, { x: 25, y: 25 });
    expect(rect).toEqual({ x: 25, y: 25, width: 75, height: 75 });
    expect(elementsInRect(elements, rect)).toEqual(["a", "g"]);
  });
});
