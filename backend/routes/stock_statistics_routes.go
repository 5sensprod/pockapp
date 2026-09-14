package routes

import (
	"database/sql"
	"math"
	"net/http"
	"sort"
	"strconv"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
)

// ═══════════════════════════════════════════════════════════════════════════
// LES STATISTIQUES DE STOCK — VALORISATION, MARGE, TVA POTENTIELLE
// ═══════════════════════════════════════════════════════════════════════════
// Portée depuis AppPos (`AppServe/services/stockStatisticsService.js`) le
// 14 septembre 2026, en même temps que les écrans « Rapports ».
//
// ⚠️ LA TVA CALCULÉE ICI N'EST PAS UNE TVA FISCALE. C'est la TVA que le stock
// PORTERAIT s'il était vendu entièrement au prix affiché. Elle n'a rien à voir
// avec la TVA collectée, qui vit dans le rapport Z et n'a qu'un seul chemin
// d'agrégation (`backend/reports/`). Ne jamais additionner les deux, et ne
// jamais faire lire ce nombre comme une déclaration.
//
// POURQUOI EN GO. C'est la règle de `catalog_counts_routes.go`, et pour la même
// raison : le calcul d'origine chargeait les 2999 produits ET les 463
// catégories dans le navigateur, à chaque montage d'écran, pour remonter
// l'arbre et sommer. Ici c'est deux requêtes et un balayage en mémoire.
//
// UN ÉCART ASSUMÉ AVEC APPPOS. NeDB portait `regular_price`, un prix de vente
// HT natif, préféré quand il était renseigné. Le schéma PocketBase ne l'a pas :
// le HT se déduit TOUJOURS de `price_ttc` et de `tax_rate`. Sur une fiche dont
// les deux prix étaient cohérents, le résultat est le même ; sur une fiche où
// ils divergeaient, ce nombre-ci est celui qui correspond au prix réellement
// pratiqué en caisse.
// ═══════════════════════════════════════════════════════════════════════════

// StockStatsSummary — le décompte des fiches, avant toute valorisation.
type StockStatsSummary struct {
	TotalProducts    int `json:"total_products"`
	SimpleProducts   int `json:"simple_products"`
	ProductsInStock  int `json:"products_in_stock"`
	ExcludedProducts int `json:"excluded_products"`
}

// StockStatsTaxRate — une tranche de la ventilation par taux de TVA.
type StockStatsTaxRate struct {
	Rate           float64 `json:"rate"`
	ProductCount   int     `json:"product_count"`
	InventoryValue float64 `json:"inventory_value"`
	RetailValue    float64 `json:"retail_value"`
	RetailValueTTC float64 `json:"retail_value_ttc"`
	TaxAmount      float64 `json:"tax_amount"`
}

// StockStatsFinancial — les montants. Tous en euros, arrondis au centime.
type StockStatsFinancial struct {
	InventoryValue  float64                      `json:"inventory_value"`
	RetailValue     float64                      `json:"retail_value"`
	RetailValueTTC  float64                      `json:"retail_value_ttc"`
	PotentialMargin float64                      `json:"potential_margin"`
	MarginPct       float64                      `json:"margin_percentage"`
	TaxAmount       float64                      `json:"tax_amount"`
	TaxBreakdown    map[string]StockStatsTaxRate `json:"tax_breakdown"`
}

type StockStatsPerformance struct {
	AvgInventoryPerProduct float64 `json:"avg_inventory_per_product"`
	AvgRetailPerProduct    float64 `json:"avg_retail_per_product"`
}

// StockStatsRootCategory — une part du camembert : une catégorie RACINE, avec
// ce que le stock rangé sous elle vaut.
type StockStatsRootCategory struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Value    float64 `json:"value"`
	Products int     `json:"products"`
	Margin   float64 `json:"margin"`
}

type StockStatsCategoryTotals struct {
	TotalValue    float64 `json:"totalValue"`
	TotalProducts int     `json:"totalProducts"`
	TotalMargin   float64 `json:"totalMargin"`
}

type StockStatsCategories struct {
	RootCategories []StockStatsRootCategory `json:"rootCategories"`
	Totals         StockStatsCategoryTotals `json:"totals"`
}

// StockStatisticsOutput — la forme rendue. Elle reprend celle d'AppPos, clé
// pour clé, pour que les composants portés l'affichent sans adaptateur.
type StockStatisticsOutput struct {
	Summary     StockStatsSummary     `json:"summary"`
	Financial   StockStatsFinancial   `json:"financial"`
	Performance StockStatsPerformance `json:"performance"`
	Categories  StockStatsCategories  `json:"categories"`
	// Le nombre de fiches VALORISÉES par catégorie — `direct` et `total`, dans
	// la même forme que `/api/catalog/counts`, et calculé par la même fonction.
	//
	// Pourquoi pas `/api/catalog/counts` directement : cette route-là compte le
	// catalogue ENTIER, or l'arbre de l'export ne montre que les catégories qui
	// ont du stock à valoriser. Les deux nombres sont légitimes et différents ;
	// les confondre afficherait « 412 produits » sur une branche qui n'en
	// valorise que 9.
	ParCategorie map[string]CategoryCounts `json:"par_categorie"`
}

// ligneProduitStats — les seules colonnes qui entrent dans le calcul.
type ligneProduitStats struct {
	Type            sql.NullString  `db:"type"`
	SKU             sql.NullString  `db:"sku"`
	Name            sql.NullString  `db:"name"`
	Stock           sql.NullFloat64 `db:"stock"`
	PurchasePriceHT sql.NullFloat64 `db:"purchase_price_ht"`
	PriceTTC        sql.NullFloat64 `db:"price_ttc"`
	TaxRate         sql.NullFloat64 `db:"tax_rate"`
	Categories      sql.NullString  `db:"categories"`
}

type ligneCategorieNommee struct {
	ID     string         `db:"id"`
	Name   sql.NullString `db:"name"`
	Parent sql.NullString `db:"parent"`
}

// libelleSansCategorie — la part du camembert qui reçoit tout ce qui n'est
// rangé nulle part. Le nom est celui d'AppPos, l'écran l'affiche tel quel.
const libelleSansCategorie = "Sans catégorie"

// RegisterStockStatisticsRoutes expose GET /api/reports/stock-statistics.
func RegisterStockStatisticsRoutes(app *pocketbase.PocketBase, router *echo.Echo) {
	router.GET("/api/reports/stock-statistics", func(c echo.Context) error {
		companyID := c.QueryParam("company")

		sortie, err := computeStockStatistics(app, companyID)
		if err != nil {
			return apis.NewApiError(http.StatusInternalServerError,
				"statistiques de stock indisponibles", err)
		}

		return c.JSON(http.StatusOK, sortie)
	}, apis.RequireRecordAuth())
}

func computeStockStatistics(app *pocketbase.PocketBase, companyID string) (*StockStatisticsOutput, error) {
	db := app.Dao().DB()

	var categories []ligneCategorieNommee
	requeteCategories := db.Select("id", "name", "parent").From("categories")
	if companyID != "" {
		requeteCategories = requeteCategories.Where(dbx.HashExp{"company": companyID})
	}
	if err := requeteCategories.All(&categories); err != nil {
		return nil, err
	}

	var produits []ligneProduitStats
	requeteProduits := db.
		Select("type", "sku", "name", "stock", "purchase_price_ht", "price_ttc",
			"tax_rate", "categories").
		From("products")
	if companyID != "" {
		requeteProduits = requeteProduits.Where(dbx.HashExp{"company": companyID})
	}
	if err := requeteProduits.All(&produits); err != nil {
		return nil, err
	}

	return agregerStatistiquesStock(produits, categories), nil
}

// agregerStatistiquesStock — LA RÈGLE, séparée de la base pour être testée
// seule. Tout ce qui pourrait diverger d'un rapport à l'autre est ici.
func agregerStatistiquesStock(
	produits []ligneProduitStats,
	categories []ligneCategorieNommee,
) *StockStatisticsOutput {
	racineDe := indexRacinesCategories(categories)
	parentDe := make(map[string]string, len(categories))
	for _, categorie := range categories {
		parentDe[categorie.ID] = decodeUnRelation(categorie.Parent)
	}
	ancetres := make(map[string]struct{}, 8)

	sortie := &StockStatisticsOutput{ParCategorie: map[string]CategoryCounts{}}
	sortie.Summary.TotalProducts = len(produits)
	sortie.Financial.TaxBreakdown = map[string]StockStatsTaxRate{}

	var inventaire, venteHT, venteTTC, tva float64
	parRacine := map[string]*StockStatsRootCategory{}

	for _, produit := range produits {
		if !estProduitSimple(produit) {
			continue
		}
		sortie.Summary.SimpleProducts++

		stock := produit.Stock.Float64
		prixAchat := produit.PurchasePriceHT.Float64
		prixTTC := produit.PriceTTC.Float64
		taux := produit.TaxRate.Float64

		// Le même filtre qu'AppPos : une fiche sans stock, sans prix d'achat ou
		// sans prix de vente ne se valorise pas. Elle est COMPTÉE comme exclue,
		// pour que l'écart entre les deux nombres reste visible.
		if stock <= 0 || prixAchat <= 0 || prixTTC <= 0 {
			continue
		}
		sortie.Summary.ProductsInStock++

		prixHT := prixVenteHT(prixTTC, taux)

		valeurAchat := stock * prixAchat
		valeurVenteHT := stock * prixHT
		tvaProduit := 0.0
		if taux > 0 {
			tvaProduit = valeurVenteHT * taux / 100
		}

		inventaire += valeurAchat
		venteHT += valeurVenteHT
		venteTTC += stock * prixTTC
		tva += tvaProduit

		cle := cleTaux(taux)
		tranche := sortie.Financial.TaxBreakdown[cle]
		tranche.Rate = taux
		tranche.ProductCount++
		tranche.InventoryValue += valeurAchat
		tranche.RetailValue += valeurVenteHT
		tranche.RetailValueTTC += stock * prixTTC
		tranche.TaxAmount += tvaProduit
		sortie.Financial.TaxBreakdown[cle] = tranche

		// ── La part de camembert ───────────────────────────────────────────
		// AppPos ne retient QUE la première catégorie du produit, et remonte à
		// sa racine. Repris tel quel : répartir un produit sur plusieurs
		// racines ferait compter sa valeur plusieurs fois, et le total du
		// camembert cesserait d'être la valeur du stock.
		racineID, racineNom := "", libelleSansCategorie
		directes := decodeRelationMultiple(produit.Categories)
		if len(directes) > 0 {
			if racine, connue := racineDe[directes[0]]; connue {
				racineID, racineNom = racine.ID, racine.Name
			}
			// Le décompte de l'arbre, lui, retient TOUTES les catégories de la
			// fiche : c'est un nombre de fiches, pas une valeur, et il ne peut
			// donc pas se compter deux fois dans un même total (la remontée
			// dédoublonne les ancêtres communs).
			compterDansCategories(sortie.ParCategorie, directes, parentDe, ancetres)
		}

		part := parRacine[racineNom]
		if part == nil {
			part = &StockStatsRootCategory{ID: racineID, Name: racineNom}
			parRacine[racineNom] = part
		}
		part.Value += valeurAchat
		part.Products++
		part.Margin += valeurVenteHT - valeurAchat
	}

	sortie.Summary.ExcludedProducts = sortie.Summary.SimpleProducts - sortie.Summary.ProductsInStock

	marge := venteHT - inventaire
	sortie.Financial.InventoryValue = arrondiCentime(inventaire)
	sortie.Financial.RetailValue = arrondiCentime(venteHT)
	sortie.Financial.RetailValueTTC = arrondiCentime(venteTTC)
	sortie.Financial.PotentialMargin = arrondiCentime(marge)
	sortie.Financial.TaxAmount = arrondiCentime(tva)
	if inventaire > 0 {
		sortie.Financial.MarginPct = arrondiCentime(marge / inventaire * 100)
	}

	for cle, tranche := range sortie.Financial.TaxBreakdown {
		tranche.InventoryValue = arrondiCentime(tranche.InventoryValue)
		tranche.RetailValue = arrondiCentime(tranche.RetailValue)
		tranche.RetailValueTTC = arrondiCentime(tranche.RetailValueTTC)
		tranche.TaxAmount = arrondiCentime(tranche.TaxAmount)
		sortie.Financial.TaxBreakdown[cle] = tranche
	}

	if sortie.Summary.ProductsInStock > 0 {
		diviseur := float64(sortie.Summary.ProductsInStock)
		sortie.Performance.AvgInventoryPerProduct = arrondiCentime(inventaire / diviseur)
		sortie.Performance.AvgRetailPerProduct = arrondiCentime(venteHT / diviseur)
	}

	sortie.Categories = assemblerCategories(parRacine)

	return sortie
}

// assemblerCategories — les parts triées par valeur décroissante, et leurs
// totaux. Le tri est FAIT ICI et pas à l'écran : le camembert prend les
// couleurs dans l'ordre de la liste, un tri instable changerait les couleurs
// d'un affichage à l'autre.
func assemblerCategories(parRacine map[string]*StockStatsRootCategory) StockStatsCategories {
	parts := make([]StockStatsRootCategory, 0, len(parRacine))
	totaux := StockStatsCategoryTotals{}

	for _, part := range parRacine {
		totaux.TotalValue += part.Value
		totaux.TotalProducts += part.Products
		totaux.TotalMargin += part.Margin

		part.Value = arrondiCentime(part.Value)
		part.Margin = arrondiCentime(part.Margin)
		parts = append(parts, *part)
	}

	// À valeur égale — deux catégories vides, ou un jeu de test — le nom
	// départage, pour que la réponse soit la même d'un appel à l'autre.
	sort.Slice(parts, func(i, j int) bool {
		if parts[i].Value != parts[j].Value {
			return parts[i].Value > parts[j].Value
		}
		return parts[i].Name < parts[j].Name
	})

	totaux.TotalValue = arrondiCentime(totaux.TotalValue)
	totaux.TotalMargin = arrondiCentime(totaux.TotalMargin)

	return StockStatsCategories{RootCategories: parts, Totals: totaux}
}

// estProduitSimple — la règle d'AppPos, transposée. Là-bas : `type === 'simple'`
// ou, à défaut de type, une fiche qui porte une référence ET un nom. Ici le
// champ vaut `simple` ou `service` ; un service ne se valorise pas.
func estProduitSimple(produit ligneProduitStats) bool {
	typeProduit := ""
	if produit.Type.Valid {
		typeProduit = produit.Type.String
	}
	if typeProduit != "" {
		return typeProduit == "simple"
	}
	return produit.SKU.Valid && produit.SKU.String != "" &&
		produit.Name.Valid && produit.Name.String != ""
}

// prixVenteHT — le prix de vente hors taxes d'une fiche. Voir l'écart assumé
// avec AppPos, en tête de fichier : il n'y a pas de prix HT natif ici.
func prixVenteHT(prixTTC, taux float64) float64 {
	if taux <= 0 {
		return prixTTC
	}
	return prixTTC / (1 + taux/100)
}

// cleTaux — la clé de la ventilation, au format d'AppPos (`rate_20`), parce
// que les composants portés s'en servent comme clé de rendu.
func cleTaux(taux float64) string {
	return "rate_" + strconv.FormatFloat(taux, 'f', -1, 64)
}

// indexRacinesCategories — pour chaque catégorie, sa racine.
//
// La remontée est bornée par un jeu de visités : une donnée importée peut
// porter un parent qui est aussi son propre descendant, et une boucle naïve
// tournerait sans fin, requête pendue. C'est la même précaution que dans
// `compterDansCategories`.
func indexRacinesCategories(categories []ligneCategorieNommee) map[string]ligneRacine {
	parentDe := make(map[string]string, len(categories))
	nomDe := make(map[string]string, len(categories))
	for _, categorie := range categories {
		parentDe[categorie.ID] = decodeUnRelation(categorie.Parent)
		nom := categorie.Name.String
		if nom == "" {
			// AppPos affichait « Sans nom » plutôt que rien : une catégorie
			// anonyme reste distinguable de l'absence de catégorie.
			nom = "Sans nom"
		}
		nomDe[categorie.ID] = nom
	}

	racines := make(map[string]ligneRacine, len(categories))
	for _, categorie := range categories {
		vus := map[string]struct{}{}
		courante := categorie.ID
		for {
			if _, deja := vus[courante]; deja {
				break
			}
			vus[courante] = struct{}{}
			parent := parentDe[courante]
			if parent == "" {
				break
			}
			if _, existe := nomDe[parent]; !existe {
				break
			}
			courante = parent
		}
		racines[categorie.ID] = ligneRacine{ID: courante, Name: nomDe[courante]}
	}

	return racines
}

type ligneRacine struct {
	ID   string
	Name string
}

// arrondiCentime — l'arrondi d'AppPos (`Math.round(x * 100) / 100`), au
// centime. Il est posé UNE FOIS, en sortie : arrondir à chaque produit
// décalerait le total de quelques centimes sur 2999 fiches.
func arrondiCentime(valeur float64) float64 {
	return math.Round(valeur*100) / 100
}
