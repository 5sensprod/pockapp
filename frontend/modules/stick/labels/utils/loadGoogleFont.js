// src/features/labels/utils/loadGoogleFont.js

// Polices système courantes (Windows + cross-plateformes)
export const SYSTEM_FONTS = new Set([
  // Windows
  'Segoe UI',
  'Calibri',
  'Cambria',
  'Consolas',
  'Candara',
  'Franklin Gothic Medium',
  'Bahnschrift',

  // Cross-plateforme classiques
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Georgia',
  'Trebuchet MS',
  'Tahoma',

  // Stacks génériques
  'System UI',
  'system-ui',
  'sans-serif',
  'serif',
  'monospace',
]);

// Stacks de fallback (optionnel)
export const FONT_STACKS = {
  Arial: 'Arial, Helvetica, "Nimbus Sans L", "Liberation Sans", "Noto Sans", sans-serif',
  'Times New Roman':
    '"Times New Roman", Times, "Nimbus Roman No9 L", "Liberation Serif", "Noto Serif", serif',
  'Courier New':
    '"Courier New", Courier, "Nimbus Mono L", "Liberation Mono", Menlo, Monaco, Consolas, monospace',
  'Segoe UI':
    '"Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif',
  Calibri: 'Calibri, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  Consolas: 'Consolas, "Courier New", Menlo, Monaco, "Liberation Mono", monospace',
};

const feuilles = new Map(); // href → Promise : la feuille de style est arrivée (ou abandonnée)
const ATTENTE_FEUILLE_MS = 4000;

/**
 * Charge une famille Google Fonts SI ce n'est pas une police système.
 * Attend que la police soit prête via FontFaceSet.
 * @param {string} fontFamily - ex: "Inter", "Poppins"
 * @param {object} opts - { weights?: '400;700', ital?: boolean }
 */
export async function loadGoogleFont(fontFamily, opts = {}) {
  if (!fontFamily) return;

  // Ne rien injecter pour une police système
  if (SYSTEM_FONTS.has(fontFamily)) return;

  const weights = opts.weights || '400;700';

  // Ne pas inclure italic par défaut car toutes les polices ne l'ont pas
  const href = opts.ital
    ? `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:ital,wght@0,${weights};1,${weights}&display=swap`
    : `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@${weights}&display=swap`;

  if (!feuilles.has(href)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    // La FEUILLE d'abord : tant qu'elle n'est pas là, `document.fonts.load`
    // ne connaît aucune face de la famille et répond aussitôt, sans rien
    // charger (mesuré : Oswald gras dessiné en police de repli à l'export).
    // Plafonnée : hors ligne, la feuille ne vient jamais.
    feuilles.set(
      href,
      new Promise((resolve) => {
        link.onload = resolve;
        link.onerror = resolve;
        setTimeout(resolve, ATTENTE_FEUILLE_MS);
      })
    );
    document.head.appendChild(link);
  }
  await feuilles.get(href);

  // Attendre que la police soit utilisable dans Canvas/Konva — TOUTES les
  // graisses demandées : `load('16px …')` n'attendait que le 400, et un texte
  // gras dessiné juste après (export planche) sortait dans une police de repli.
  try {
    await Promise.all(
      weights
        .split(';')
        .filter(Boolean)
        .map((w) => document.fonts.load(`${w} 16px "${fontFamily}"`))
    );
    await document.fonts.ready;
  } catch {
    // non bloquant
  }
}
