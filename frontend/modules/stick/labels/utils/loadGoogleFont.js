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

const injected = new Set();

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

  if (!injected.has(href)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
    injected.add(href);
  }

  // Attendre que la police soit utilisable dans Canvas/Konva
  try {
    await document.fonts.load(`16px "${fontFamily}"`);
    await document.fonts.ready;
  } catch {
    // non bloquant
  }
}
