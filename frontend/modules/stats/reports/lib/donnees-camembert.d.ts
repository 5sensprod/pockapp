// frontend/modules/stats/reports/lib/donnees-camembert.d.ts
//
// Le module porté est en `.js` (`allowJs` sans `checkJs`) : TypeScript compile
// `donnees-camembert.js` sans rien savoir de ses tableaux, qu'il infère `never[]`.
// Ces déclarations rendent la fonction lisible aux appelants typés — le test et,
// plus tard, un `StockCategoryChart.tsx`.
//
// C'est la même parade que `frontend/wailsjs`, dont les bindings `.js` ont leurs
// `.d.ts` à côté. Elle disparaîtra quand le fichier passera en TypeScript.

import type {
	CategorieRacine,
	StatistiquesStock,
} from './use-statistiques-stock'

export declare const PARTS_MAXIMUM: number

/** Une part du camembert, prête à dessiner. `percentage` est une CHAÎNE à une
 *  décimale : c'est ce que le libellé affiche, tel quel. */
export interface PartCamembert {
	name: string
	products: number
	stockValue: number
	margin: number
	value: number
	formattedValue: string
	percentage: string
}

export interface DonneesCamembert {
	value: PartCamembert[]
	products: PartCamembert[]
	margin: PartCamembert[]
	totals: StatistiquesStock['categories']['totals']
}

export declare function donneesCamembert(categories?: {
	rootCategories?: CategorieRacine[]
	totals?: StatistiquesStock['categories']['totals']
}): DonneesCamembert
