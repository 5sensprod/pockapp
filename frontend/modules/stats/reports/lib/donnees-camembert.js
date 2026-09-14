// frontend/modules/stats/reports/lib/donnees-camembert.js
//
// LA MISE EN FORME DU CAMEMBERT, REPRISE DE `useReportsStore.js` (AppPos).
//
// ⚠️ CE FICHIER N'AGRÈGE RIEN. Il reçoit les catégories racines DÉJÀ
// additionnées par le Go (`categories.rootCategories`) et n'en fait que de
// l'affichage : un pourcentage, un libellé formaté, et les douze plus grosses
// parts. Ce qui a été retiré du store d'origine — la lecture des 2999 produits,
// la remontée de l'arbre, les sommes — est parti dans
// `backend/routes/stock_statistics_routes.go`.
//
// Le fichier est en `.js`, comme le reste du code porté : le module n'est pas
// typé (`allowJs` sans `checkJs`).

/** Au-delà, le camembert n'est plus lisible : c'est la limite d'AppPos, gardée
 *  telle quelle, et l'écran l'annonce sous le graphique. */
export const PARTS_MAXIMUM = 12

/**
 * Les trois jeux de données du camembert — valeur, nombre de produits, marge.
 *
 * Une part n'apparaît dans un mode que si elle y vaut quelque chose : une
 * catégorie dont la marge est nulle ou négative sort du mode « Marge », parce
 * qu'un camembert ne sait pas dessiner une part négative.
 */
export function donneesCamembert(categories) {
	const racines = categories?.rootCategories ?? []
	const totaux = categories?.totals ?? {
		totalValue: 0,
		totalProducts: 0,
		totalMargin: 0,
	}

	const modes = { value: [], products: [], margin: [] }

	for (const categorie of racines) {
		const base = {
			name: categorie.name,
			products: categorie.products,
			stockValue: categorie.value,
			margin: categorie.margin,
		}

		if (categorie.value > 0) {
			modes.value.push({
				...base,
				value: categorie.value,
				formattedValue: enEuros(categorie.value),
				percentage: pourcentage(categorie.value, totaux.totalValue),
			})
		}

		if (categorie.products > 0) {
			modes.products.push({
				...base,
				value: categorie.products,
				formattedValue: `${categorie.products} produits`,
				percentage: pourcentage(categorie.products, totaux.totalProducts),
			})
		}

		if (categorie.margin > 0) {
			modes.margin.push({
				...base,
				value: categorie.margin,
				formattedValue: enEuros(categorie.margin),
				percentage: pourcentage(categorie.margin, totaux.totalMargin),
			})
		}
	}

	for (const mode of Object.keys(modes)) {
		modes[mode] = modes[mode]
			.sort((a, b) => b.value - a.value)
			.slice(0, PARTS_MAXIMUM)
	}

	return { ...modes, totals: totaux }
}

function enEuros(montant) {
	return montant.toLocaleString('fr-FR', {
		style: 'currency',
		currency: 'EUR',
	})
}

function pourcentage(part, total) {
	if (!total) return '0.0'
	return ((part / total) * 100).toFixed(1)
}
