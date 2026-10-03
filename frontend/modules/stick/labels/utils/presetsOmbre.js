// frontend/modules/stick/labels/utils/presetsOmbre.js
//
// L'OMBRE PORTÉE vue par le panneau Effets : ses clés, ses bornes, ses
// valeurs par défaut, ses préréglages, et son aperçu en CSS. Les clés et les
// défauts sont ceux que lisent le canvas (`KonvaCanvas`, `shadowProps`) et
// l'export planche (`exportPdfSheet.js`) : rien ne change au rendu.
// Module pur, testable sous Node.

/** Bornes de l'INTERFACE (le rendu, lui, ne borne pas les décalages). */
export const OMBRE_BORNES = { decalage: 40, flou: 40 };

/** Valeurs lues quand l'élément ne porte pas la clé — celles du rendu. */
export const OMBRE_DEFAUT = {
  shadowColor: '#000000',
  shadowOpacity: 0.4,
  shadowBlur: 8,
  shadowOffsetX: 2,
  shadowOffsetY: 2,
};

/** L'ombre d'un élément, défauts appliqués. */
export const ombreDe = (el) => ({
  actif: !!el?.shadowEnabled,
  couleur: el?.shadowColor ?? OMBRE_DEFAUT.shadowColor,
  opacite: el?.shadowOpacity ?? OMBRE_DEFAUT.shadowOpacity,
  flou: el?.shadowBlur ?? OMBRE_DEFAUT.shadowBlur,
  x: el?.shadowOffsetX ?? OMBRE_DEFAUT.shadowOffsetX,
  y: el?.shadowOffsetY ?? OMBRE_DEFAUT.shadowOffsetY,
});

const preset = (id, label, shadowOpacity, shadowBlur, shadowOffsetX, shadowOffsetY) => ({
  id,
  label,
  valeurs: { shadowEnabled: true, shadowColor: '#000000', shadowOpacity, shadowBlur, shadowOffsetX, shadowOffsetY },
});

/** Un clic pose les SIX clés d'un coup : un seul pas d'historique. */
export const PRESETS_OMBRE = [
  preset('douce', 'Douce', 0.2, 4, 1, 1),
  preset('normale', 'Normale', 0.4, 8, 2, 2),
  preset('forte', 'Forte', 0.6, 16, 4, 4),
  preset('longue', 'Longue', 0.35, 14, 12, 12),
  preset('dure', 'Dure', 0.8, 0, 4, 4),
];

/** `#rrggbb` (ou `#rgb`) + opacité → `rgba(...)`. Autre chose : rendu tel quel. */
export const couleurAvecOpacite = (couleur, opacite) => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(couleur ?? '').trim());
  if (!m) return couleur || '#000000';
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const n = Number.parseInt(h, 16);
  const a = Math.min(1, Math.max(0, Number.isFinite(opacite) ? opacite : 1));
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/**
 * L'aperçu : la valeur CSS `filter` qui dessine cette ombre sur une vignette.
 * `echelle` : pixels d'écran par unité de décalage (celle du pavé, pour que
 * l'ombre tombe sous la poignée). Indicatif : ce n'est pas l'échelle du document.
 */
export const filtreApercu = ({ couleur, opacite, flou, x, y }, echelle = 1) =>
  `drop-shadow(${Math.round(x * echelle * 10) / 10}px ${Math.round(y * echelle * 10) / 10}px ${Math.round(flou * echelle * 5) / 10}px ${couleurAvecOpacite(couleur, opacite)})`;
