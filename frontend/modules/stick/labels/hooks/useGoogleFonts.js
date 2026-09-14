// src/features/labels/hooks/useGoogleFonts.js
import { useEffect, useMemo, useState } from 'react';
import { fetchGoogleFontsCatalog } from '../services/googleFonts.service';
import { loadGoogleFont } from '../utils/loadGoogleFont';
import { FONT_FILTER_CONFIG } from '../config/fontFilterConfig';
import { CATALOGUE_LOCAL_POLICES } from '../config/catalogueLocalPolices';

/**
 * Hook pour Google Fonts : catalogue, recherche, tri, préchargement.
 */
export function useGoogleFonts(apiKey, filterConfig = FONT_FILTER_CONFIG) {
  const [fonts, setFonts] = useState([]);
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState('popularity'); // popularity|alpha|trending|date|style
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Pas de sortie anticipée sans clé : le service sert alors le catalogue
      // figé (`config/catalogueLocalPolices.js`).
      setLoading(true);
      try {
        const data = await fetchGoogleFontsCatalog(apiKey, sortBy);
        if (!cancelled) setFonts(data);
      } catch (err) {
        console.error('❌ [POLICES] Catalogue indisponible:', err);
        if (!cancelled) setFonts(CATALOGUE_LOCAL_POLICES);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiKey, sortBy]);

  // Filtre par nom/catégorie avec limitation intelligente et quotas par catégorie
  const filteredGoogle = useMemo(() => {
    const query = q.trim().toLowerCase();
    const {
      maxFonts = 80,
      excludedCategories = [],
      includedCategories = [],
      priorityFonts = {},
      categoryQuotas = {},
    } = filterConfig;

    let filtered = fonts.filter((f) => {
      // Si includedCategories est défini, n'inclure QUE ces catégories
      if (includedCategories.length > 0) {
        if (!includedCategories.includes(f.category)) return false;
      }
      // Sinon, exclure les catégories non désirées
      else if (excludedCategories.includes(f.category)) {
        return false;
      }
      return true;
    });

    // Si pas de recherche, appliquer les quotas et limites
    if (!query) {
      // Grouper par catégorie
      const byCategory = {};
      filtered.forEach((f) => {
        const cat = f.category || 'other';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(f);
      });

      // Appliquer priorités et quotas par catégorie
      const result = [];
      Object.entries(byCategory).forEach(([cat, fontList]) => {
        const quota = categoryQuotas[cat] || Math.ceil(maxFonts / Object.keys(byCategory).length);
        const priorities = priorityFonts[cat] || [];

        // Séparer prioritaires et autres
        const priorityList = fontList.filter((f) => priorities.includes(f.family));
        const otherList = fontList.filter((f) => !priorities.includes(f.family));

        // Prendre jusqu'au quota
        const combined = [...priorityList, ...otherList];
        result.push(...combined.slice(0, quota));
      });

      // Limiter au total maxFonts si dépassement
      return result.slice(0, maxFonts);
    }

    // Avec recherche, filtrer sans limite stricte
    return filtered.filter(
      (f) =>
        f.family.toLowerCase().includes(query) || (f.category || '').toLowerCase().includes(query)
    );
  }, [fonts, q, filterConfig]);

  // Précharge simple (survol)
  const preload = (family) => loadGoogleFont(family);

  return {
    fonts: filteredGoogle,
    setQuery: setQ,
    setSortBy,
    sortBy,
    loading,
    preload,
  };
}
