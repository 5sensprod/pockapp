// frontend/modules/stick/labels/services/googleFonts.service.js
import { CATALOGUE_LOCAL_POLICES } from '../config/catalogueLocalPolices';

const LS_KEY_BASE = 'gf_catalog_v2';
const LS_TTL = 1000 * 60 * 60 * 24 * 3; // 3 jours

/**
 * Récupère le catalogue Google Fonts trié par `sort`.
 * @param {string} apiKey VITE_GOOGLE_FONTS_KEY
 * @param {'popularity'|'alpha'|'trending'|'date'|'style'} sort
 */
export async function fetchGoogleFontsCatalog(
  apiKey = import.meta.env.VITE_GOOGLE_FONTS_KEY,
  sort = 'popularity'
) {
  // Sans clé — le cas de TOUT poste client, qui n'a pas de `.env` — on sert le
  // catalogue figé plutôt que de rendre le sélecteur vide. Charger une police
  // n'a jamais demandé de clé : seule cette liste en demandait une.
  if (!apiKey) return CATALOGUE_LOCAL_POLICES;

  const cacheKey = `${LS_KEY_BASE}_${sort}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.savedAt < LS_TTL) return parsed.items;
    } catch {}
  }

  const url = `https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}&sort=${sort}`;
  const res = await fetch(url);
  // Clé refusée, quota épuisé, réseau coupé : le sélecteur garde des polices.
  if (!res.ok) return CATALOGUE_LOCAL_POLICES;

  const data = await res.json();
  const items = (data.items || []).map((f) => ({
    family: f.family,
    category: (f.category || '').toLowerCase(), // 'sans-serif', 'serif', 'display', 'handwriting', 'monospace'
    variants: f.variants, // ['regular','700',...]
    // Google ne renvoie pas toujours popularityRank; on garde l'ordre reçu
  }));

  localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), items }));
  return items;
}
