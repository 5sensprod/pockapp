// frontend/modules/stick/labels/config/catalogueLocalPolices.js
//
// LE CATALOGUE DE POLICES QUI NE DEMANDE AUCUNE CLÉ.
//
// Deux choses distinctes chez Google Fonts :
//   • CHARGER une police — `https://fonts.googleapis.com/css2?family=…` — est
//     public, sans clé (`utils/loadGoogleFont.js`) ;
//   • LISTER le catalogue — `webfonts/v1/webfonts?key=…` — exige une clé d'API.
//
// AppPos lisait la liste avec `VITE_GOOGLE_FONTS_KEY`. Sur un poste client,
// aucun `.env` n'accompagne l'exécutable : le sélecteur restait donc vide, pour
// toujours. Et embarquer la clé dans le bundle serait refaire exactement ce que
// la faille 3.1 du site reproche aux clés WooCommerce.
//
// D'où cette liste figée : 72 familles choisies pour de l'affiche et de
// l'étiquette. Chaque famille se charge ensuite normalement, sans clé. Si une
// clé EST présente (poste de développement), le catalogue complet la remplace.

export const CATALOGUE_LOCAL_POLICES = [
	// Sans-serif — le gros de l'usage
	{ family: 'Inter', category: 'sans-serif' },
	{ family: 'Roboto', category: 'sans-serif' },
	{ family: 'Open Sans', category: 'sans-serif' },
	{ family: 'Lato', category: 'sans-serif' },
	{ family: 'Montserrat', category: 'sans-serif' },
	{ family: 'Poppins', category: 'sans-serif' },
	{ family: 'Raleway', category: 'sans-serif' },
	{ family: 'Nunito', category: 'sans-serif' },
	{ family: 'Nunito Sans', category: 'sans-serif' },
	{ family: 'Work Sans', category: 'sans-serif' },
	{ family: 'Rubik', category: 'sans-serif' },
	{ family: 'Karla', category: 'sans-serif' },
	{ family: 'Mulish', category: 'sans-serif' },
	{ family: 'Manrope', category: 'sans-serif' },
	{ family: 'DM Sans', category: 'sans-serif' },
	{ family: 'Barlow', category: 'sans-serif' },
	{ family: 'Barlow Condensed', category: 'sans-serif' },
	{ family: 'Oswald', category: 'sans-serif' },
	{ family: 'Fjalla One', category: 'sans-serif' },
	{ family: 'Archivo', category: 'sans-serif' },
	{ family: 'Archivo Black', category: 'sans-serif' },
	{ family: 'Anton', category: 'sans-serif' },
	{ family: 'Bebas Neue', category: 'sans-serif' },
	{ family: 'Teko', category: 'sans-serif' },
	{ family: 'Cabin', category: 'sans-serif' },
	{ family: 'Quicksand', category: 'sans-serif' },
	{ family: 'Josefin Sans', category: 'sans-serif' },
	{ family: 'Titillium Web', category: 'sans-serif' },
	{ family: 'Source Sans 3', category: 'sans-serif' },
	{ family: 'PT Sans', category: 'sans-serif' },
	{ family: 'Ubuntu', category: 'sans-serif' },
	{ family: 'Exo 2', category: 'sans-serif' },
	{ family: 'Asap', category: 'sans-serif' },
	{ family: 'Heebo', category: 'sans-serif' },
	{ family: 'Outfit', category: 'sans-serif' },
	{ family: 'Figtree', category: 'sans-serif' },
	{ family: 'Plus Jakarta Sans', category: 'sans-serif' },
	{ family: 'Space Grotesk', category: 'sans-serif' },

	// Serif
	{ family: 'Playfair Display', category: 'serif' },
	{ family: 'Merriweather', category: 'serif' },
	{ family: 'Lora', category: 'serif' },
	{ family: 'PT Serif', category: 'serif' },
	{ family: 'Libre Baskerville', category: 'serif' },
	{ family: 'Source Serif 4', category: 'serif' },
	{ family: 'Crimson Text', category: 'serif' },
	{ family: 'EB Garamond', category: 'serif' },
	{ family: 'Cormorant Garamond', category: 'serif' },
	{ family: 'Bitter', category: 'serif' },
	{ family: 'Arvo', category: 'serif' },
	{ family: 'Domine', category: 'serif' },
	{ family: 'Noto Serif', category: 'serif' },
	{ family: 'Zilla Slab', category: 'serif' },

	// Display — les gros titres d'affiche
	{ family: 'Alfa Slab One', category: 'display' },
	{ family: 'Righteous', category: 'display' },
	{ family: 'Bungee', category: 'display' },
	{ family: 'Lilita One', category: 'display' },
	{ family: 'Passion One', category: 'display' },
	{ family: 'Staatliches', category: 'display' },
	{ family: 'Russo One', category: 'display' },
	{ family: 'Black Ops One', category: 'display' },
	{ family: 'Squada One', category: 'display' },
	{ family: 'Chewy', category: 'display' },
	{ family: 'Luckiest Guy', category: 'display' },
	{ family: 'Bangers', category: 'display' },

	// Manuscrites
	{ family: 'Pacifico', category: 'handwriting' },
	{ family: 'Lobster', category: 'handwriting' },
	{ family: 'Dancing Script', category: 'handwriting' },
	{ family: 'Caveat', category: 'handwriting' },
	{ family: 'Satisfy', category: 'handwriting' },
	{ family: 'Great Vibes', category: 'handwriting' },

	// Monospace — utile pour une référence ou un code
	{ family: 'Roboto Mono', category: 'monospace' },
	{ family: 'JetBrains Mono', category: 'monospace' },
	{ family: 'Source Code Pro', category: 'monospace' },
	{ family: 'IBM Plex Mono', category: 'monospace' },
].map((police) => ({
	...police,
	// Les deux graisses que `loadGoogleFont` demande par défaut. Toutes les
	// familles ci-dessus les possèdent.
	variants: ['regular', '700'],
}))
