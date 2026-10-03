// frontend/modules/stick/labels/utils/presetsOmbre.js
//
// LES OMBRES vues par le panneau Effets — portée (`shadow*`) et interne
// (`innerShadow*`) : leurs clés, leurs bornes, leurs valeurs par défaut,
// leurs préréglages, et leur aperçu en CSS. Les clés et les défauts sont ceux
// que lisent le canvas (`KonvaCanvas`, `shadowProps` ; `ombreInterne.js`) et
// l'export planche : rien ne change au rendu.
// Module pur, testable sous Node.

/** Bornes de l'INTERFACE (le rendu, lui, ne borne pas les décalages). */
export const OMBRE_BORNES = { decalage: 40, flou: 40 };
export const OMBRE_INTERNE_BORNES = { decalage: 40, flou: 60 };

/** Valeurs lues quand l'élément ne porte pas la clé — celles du rendu. */
export const OMBRE_DEFAUT = {
  shadowColor: '#000000',
  shadowOpacity: 0.4,
  shadowBlur: 8,
  shadowOffsetX: 2,
  shadowOffsetY: 2,
};
export const OMBRE_INTERNE_DEFAUT = {
  innerShadowColor: '#000000',
  innerShadowOpacity: 0.5,
  innerShadowBlur: 8,
  innerShadowOffsetX: 2,
  innerShadowOffsetY: 2,
};

/**
 * Les deux ombres ont la même forme, à un préfixe près. `cles` : le nom de
 * chaque clé d'élément, pour que le bloc écrive sans connaître le préfixe.
 */
const variante = (prefixe, defaut, bornes) => ({
  cles: {
    actif: `${prefixe}Enabled`,
    couleur: `${prefixe}Color`,
    opacite: `${prefixe}Opacity`,
    flou: `${prefixe}Blur`,
    x: `${prefixe}OffsetX`,
    y: `${prefixe}OffsetY`,
  },
  defaut,
  bornes,
});
export const OMBRE_PORTEE = variante('shadow', OMBRE_DEFAUT, OMBRE_BORNES);
export const OMBRE_INTERNE = variante('innerShadow', OMBRE_INTERNE_DEFAUT, OMBRE_INTERNE_BORNES);

/** L'ombre d'un élément, défauts appliqués. `v` : `OMBRE_PORTEE` (défaut) ou `OMBRE_INTERNE`. */
export const ombreDe = (el, v = OMBRE_PORTEE) => {
  const { cles, defaut } = v;
  return {
    actif: !!el?.[cles.actif],
    couleur: el?.[cles.couleur] ?? defaut[cles.couleur],
    opacite: el?.[cles.opacite] ?? defaut[cles.opacite],
    flou: el?.[cles.flou] ?? defaut[cles.flou],
    x: el?.[cles.x] ?? defaut[cles.x],
    y: el?.[cles.y] ?? defaut[cles.y],
  };
};

const preset = (v, id, label, opacite, flou, x, y) => ({
  id,
  label,
  valeurs: {
    [v.cles.actif]: true,
    [v.cles.couleur]: '#000000',
    [v.cles.opacite]: opacite,
    [v.cles.flou]: flou,
    [v.cles.x]: x,
    [v.cles.y]: y,
  },
});

/** Un clic pose les SIX clés d'un coup : un seul pas d'historique. */
export const PRESETS_OMBRE = [
  preset(OMBRE_PORTEE, 'douce', 'Douce', 0.2, 4, 1, 1),
  preset(OMBRE_PORTEE, 'normale', 'Normale', 0.4, 8, 2, 2),
  preset(OMBRE_PORTEE, 'forte', 'Forte', 0.6, 16, 4, 4),
  preset(OMBRE_PORTEE, 'longue', 'Longue', 0.35, 14, 12, 12),
  preset(OMBRE_PORTEE, 'dure', 'Dure', 0.8, 0, 4, 4),
];
export const PRESETS_OMBRE_INTERNE = [
  preset(OMBRE_INTERNE, 'douce', 'Douce', 0.3, 6, 1, 1),
  preset(OMBRE_INTERNE, 'creusee', 'Creusée', 0.5, 8, 2, 2),
  preset(OMBRE_INTERNE, 'profonde', 'Profonde', 0.7, 18, 4, 4),
  preset(OMBRE_INTERNE, 'halo', 'Halo', 0.5, 20, 0, 0),
];

/** Un préréglage relu comme une ombre (pour dessiner sa vignette). */
export const ombreDuPreset = (p, v = OMBRE_PORTEE) => ombreDe(p.valeurs, v);

/** `#rrggbb` (ou `#rgb`) + opacité → `rgba(...)`. Autre chose : rendu tel quel. */
export const couleurAvecOpacite = (couleur, opacite) => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(couleur ?? '').trim());
  if (!m) return couleur || '#000000';
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const n = Number.parseInt(h, 16);
  const a = Math.min(1, Math.max(0, Number.isFinite(opacite) ? opacite : 1));
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const px = (v, echelle) => `${Math.round(v * echelle * 10) / 10}px`;

/**
 * L'aperçu d'une ombre PORTÉE : la valeur CSS `filter` qui la dessine sur une
 * vignette. `echelle` : pixels d'écran par unité de décalage (celle du pavé,
 * pour que l'ombre tombe sous la poignée). Indicatif : ce n'est pas l'échelle
 * du document.
 */
export const filtreApercu = ({ couleur, opacite, flou, x, y }, echelle = 1) =>
  `drop-shadow(${px(x, echelle)} ${px(y, echelle)} ${px(flou, echelle / 2)} ${couleurAvecOpacite(couleur, opacite)})`;

/** L'aperçu d'une ombre INTERNE : la valeur CSS `box-shadow` (inset). */
export const ombreInterneApercu = ({ couleur, opacite, flou, x, y }, echelle = 1) =>
  `inset ${px(x, echelle)} ${px(y, echelle)} ${px(flou, echelle / 2)} ${couleurAvecOpacite(couleur, opacite)}`;
