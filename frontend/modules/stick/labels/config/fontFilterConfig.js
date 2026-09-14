// src/features/labels/config/fontFilterConfig.js

/**
 * Configuration du filtrage des polices Google Fonts
 * Ajustez ces valeurs selon vos besoins
 */

export const FONT_FILTER_CONFIG = {
  // Nombre maximum de polices à afficher (sans recherche active)
  maxFonts: 80,

  // Catégories à exclure - VIDE pour tout inclure
  excludedCategories: [],

  // Alternative: Inclure UNIQUEMENT certaines catégories (laissez vide pour tout autoriser)
  includedCategories: [],

  // Quota par catégorie pour garantir la diversité
  categoryQuotas: {
    'sans-serif': 35, // Polices modernes pour textes
    serif: 15, // Polices classiques/élégantes
    display: 15, // Polices décoratives/titres
    handwriting: 10, // Polices manuscrites/signatures
    monospace: 5, // Polices code/technique
  },

  // Liste de polices à toujours afficher en priorité par catégorie
  priorityFonts: {
    'sans-serif': [
      'Roboto',
      'Open Sans',
      'Lato',
      'Montserrat',
      'Poppins',
      'Inter',
      'Raleway',
      'Ubuntu',
    ],
    serif: ['Playfair Display', 'Merriweather', 'Lora', 'Crimson Text', 'PT Serif'],
    display: ['Bebas Neue', 'Righteous', 'Fredoka One', 'Pacifico', 'Lobster', 'Permanent Marker'],
    handwriting: ['Dancing Script', 'Pacifico', 'Satisfy', 'Caveat', 'Great Vibes'],
    monospace: ['Roboto Mono', 'Fira Code', 'Source Code Pro'],
  },
};

/**
 * Variantes de configuration prédéfinies
 */
export const PRESET_CONFIGS = {
  // Configuration par défaut: équilibre et diversité pour éditeur Konva
  canvas_editor: {
    maxFonts: 80,
    excludedCategories: [],
    categoryQuotas: {
      'sans-serif': 35,
      serif: 15,
      display: 15,
      handwriting: 10,
      monospace: 5,
    },
    priorityFonts: FONT_FILTER_CONFIG.priorityFonts,
  },

  // Configuration minimaliste mais avec diversité
  minimal_diverse: {
    maxFonts: 40,
    excludedCategories: [],
    categoryQuotas: {
      'sans-serif': 20,
      serif: 8,
      display: 7,
      handwriting: 3,
      monospace: 2,
    },
    priorityFonts: {
      'sans-serif': ['Roboto', 'Open Sans', 'Inter', 'Poppins'],
      serif: ['Playfair Display', 'Merriweather'],
      display: ['Bebas Neue', 'Righteous', 'Lobster'],
      handwriting: ['Dancing Script', 'Caveat'],
      monospace: ['Roboto Mono'],
    },
  },

  // Configuration étendue: maximum de choix avec équilibre
  extended_balanced: {
    maxFonts: 120,
    excludedCategories: [],
    categoryQuotas: {
      'sans-serif': 50,
      serif: 25,
      display: 25,
      handwriting: 15,
      monospace: 5,
    },
    priorityFonts: FONT_FILTER_CONFIG.priorityFonts,
  },

  // Sans-serif uniquement: pour interfaces modernes
  sansSerifOnly: {
    maxFonts: 40,
    includedCategories: ['sans-serif'],
    excludedCategories: [],
    categoryQuotas: { 'sans-serif': 40 },
    priorityFonts: {
      'sans-serif': ['Roboto', 'Open Sans', 'Lato', 'Inter', 'Poppins'],
    },
  },

  // Focus créatif: plus de display et handwriting
  creative_focused: {
    maxFonts: 60,
    excludedCategories: ['monospace'],
    categoryQuotas: {
      'sans-serif': 20,
      serif: 10,
      display: 20,
      handwriting: 10,
    },
    priorityFonts: {
      'sans-serif': ['Roboto', 'Poppins', 'Montserrat'],
      serif: ['Playfair Display', 'Cinzel'],
      display: [
        'Bebas Neue',
        'Righteous',
        'Fredoka One',
        'Lobster',
        'Permanent Marker',
        'Alfa Slab One',
      ],
      handwriting: [
        'Dancing Script',
        'Pacifico',
        'Satisfy',
        'Caveat',
        'Great Vibes',
        'Shadows Into Light',
      ],
    },
  },

  // Professionnelle: polices sérieuses pour documents
  professional: {
    maxFonts: 30,
    excludedCategories: ['display', 'handwriting'],
    categoryQuotas: {
      'sans-serif': 20,
      serif: 8,
      monospace: 2,
    },
    priorityFonts: {
      'sans-serif': ['Roboto', 'Open Sans', 'Lato', 'Inter'],
      serif: ['Merriweather', 'Lora', 'PT Serif'],
      monospace: ['Roboto Mono'],
    },
  },
};
