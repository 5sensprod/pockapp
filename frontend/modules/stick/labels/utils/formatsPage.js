// frontend/modules/stick/labels/utils/formatsPage.js
//
// LES FORMATS DE PAGE et la conversion points ↔ millimètres. La liste vivait
// dans le rendu de `FormatPanel`, et `toMm` était écrit deux fois
// (`FormatPanel`, `SheetPanel`).
//
// Le store ne connaît que des POINTS (72 par pouce), entiers. Le millimètre
// n'est qu'un affichage et une saisie : on convertit à l'écran, on écrit
// toujours des points — aucune clé, aucune borne ne change.

export const MM_PAR_PT = 25.4 / 72;

/** Des points vers des millimètres, arrondis à `decimales` (un NOMBRE). */
export const enMm = (pt, decimales = 0) => {
  if (pt === null || pt === undefined || pt === '') return null;
  const facteur = 10 ** decimales;
  return Math.round(pt * MM_PAR_PT * facteur) / facteur;
};

/** Des millimètres saisis vers des points entiers, ce que le store attend. */
export const enPt = (mm) => {
  if (mm === null || mm === undefined || mm === '') return null;
  return Math.round(mm / MM_PAR_PT);
};

/**
 * Ce qu'un champ AFFICHE : le millimètre entier quand la taille en est à deux
 * dixièmes près — le store arrondit le papier au point (595 pt font 209,9 mm,
 * 420 pt font 148,2 mm : on lit 210 et 148) —, sinon le dixième.
 */
export const mmAffiche = (pt) => {
  const dixieme = enMm(pt, 1);
  if (dixieme === null) return null;
  const entier = Math.round(dixieme);
  return Math.abs(dixieme - entier) <= 0.25 ? entier : dixieme;
};

/**
 * Mêmes identifiants, mêmes dimensions qu'avant. `papier` : les quatre
 * premiers ; `reseau` : le réseau social dont le format porte le logo.
 */
export const FORMATS_PAGE = [
  { id: 'a4-portrait', label: 'A4 portrait', width: 595, height: 842, papier: true },
  { id: 'a4-landscape', label: 'A4 paysage', width: 842, height: 595, papier: true },
  { id: 'a5-portrait', label: 'A5 portrait', width: 420, height: 595, papier: true },
  { id: 'a5-landscape', label: 'A5 paysage', width: 595, height: 420, papier: true },
  { id: 'square-small', label: 'Carré 500', width: 500, height: 500 },
  { id: 'square-medium', label: 'Carré 800', width: 800, height: 800 },
  { id: 'instagram-post', label: 'Publication Instagram', width: 1080, height: 1080, reseau: 'instagram' },
  { id: 'instagram-story', label: 'Story Instagram', width: 1080, height: 1920, reseau: 'instagram' },
  { id: 'facebook-post', label: 'Publication Facebook', width: 1200, height: 630, reseau: 'facebook' },
  { id: 'twitter-post', label: 'Publication X', width: 1200, height: 675, reseau: 'x' },
  { id: 'flyer', label: 'Flyer', width: 600, height: 800 },
  { id: 'banner', label: 'Bannière', width: 1200, height: 400 },
];

/** Le format dont la page a exactement la taille, ou `null` (taille libre). */
export const formatDeLaPage = (taille) =>
  FORMATS_PAGE.find((f) => f.width === taille?.width && f.height === taille?.height) ?? null;

/**
 * La miniature d'un format : un rectangle À SES PROPORTIONS, dont le grand
 * côté fait `max` pixels (et le petit jamais moins de 8, pour rester visible).
 */
export const miniatureFormat = (format, max = 32) => {
  const grand = Math.max(format.width, format.height);
  const cote = (v) => Math.max(8, Math.round((v / grand) * max));
  return { width: cote(format.width), height: cote(format.height) };
};
