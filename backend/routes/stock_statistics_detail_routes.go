package routes

import (
	"net/http"
	"sort"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
)

// ═══════════════════════════════════════════════════════════════════════════
// LE RAPPORT DÉTAILLÉ — LES LIGNES VALORISÉES, GROUPÉES ET TOTALISÉES
// ═══════════════════════════════════════════════════════════════════════════
// Le pendant de `stock_statistics_routes.go` pour l'export PDF « détaillé » :
// là-bas les totaux, ici les fiches qui les composent.
//
// POURQUOI LE TRI, LE GROUPEMENT ET LES SOUS-TOTAUX SONT ICI, ET PAS DANS LE
// PDF. Un sous-total par catégorie est une AGRÉGATION. Le laisser au navigateur
// ferait exister deux additions des mêmes fiches — celle de cette route pour
// l'écran, celle du PDF pour le comptable — et c'est très exactement la forme
// de la régression du 20 mai 2026. Le composant PDF met en page des nombres
// qu'il n'a pas calculés.
//
// La valorisation d'une ligne emprunte les MÊMES fonctions que les totaux
// (`prixVenteHT`, `estProduitSimple`, le filtre stock/prix) : un écart entre la
// synthèse et le détail serait un écart entre deux pages du même PDF.
// ═══════════════════════════════════════════════════════════════════════════

// StockDetailLine — une fiche valorisée, telle qu'elle s'imprime.
type StockDetailLine struct {
	ID             string  `json:"id"`
	SKU            string  `json:"sku"`
	Designation    string  `json:"designation"`
	Stock          float64 `json:"stock"`
	PurchasePrice  float64 `json:"purchase_price"`
	PriceHT        float64 `json:"price_ht"`
	PriceTTC       float64 `json:"price_ttc"`
	TaxRate        float64 `json:"tax_rate"`
	InventoryValue float64 `json:"inventory_value"`
	RetailValue    float64 `json:"retail_value"`
	Margin         float64 `json:"margin"`
}

// StockDetailGroup — un groupe de lignes et son sous-total. Sans groupement,
// la réponse porte un seul groupe, nommé vide.
type StockDetailGroup struct {
	CategoryID     string            `json:"category_id"`
	CategoryName   string            `json:"category_name"`
	Lines          []StockDetailLine `json:"lines"`
	ProductCount   int               `json:"product_count"`
	InventoryValue float64           `json:"inventory_value"`
	RetailValue    float64           `json:"retail_value"`
	Margin         float64           `json:"margin"`
}

// StockDetailOutput — ce que le PDF détaillé met en page.
type StockDetailOutput struct {
	Groups []StockDetailGroup `json:"groups"`
	Totals struct {
		ProductCount   int     `json:"product_count"`
		InventoryValue float64 `json:"inventory_value"`
		RetailValue    float64 `json:"retail_value"`
		Margin         float64 `json:"margin"`
	} `json:"totals"`
	// Vrai quand l'appelant a demandé le mode simplifié : les groupes sont
	// alors rendus SANS leurs lignes, seulement avec leurs sous-totaux. C'est
	// le serveur qui les retire, pour ne pas transporter 2999 fiches qu'aucune
	// page n'imprimera.
	Simplified bool `json:"simplified"`
}

// optionsDetail — ce que l'écran d'export choisit.
type optionsDetail struct {
	// Vides = tout le catalogue valorisé, en un seul groupe.
	Categories           []string
	GroupByCategory      bool
	IncludeUncategorized bool
	Simplified           bool
	// `name` (désignation), `sku`, `stock` ou `value`. Autre chose = `name`.
	SortBy    string
	SortOrder string
}

// ligneProduitDetail — les colonnes du détail. Deux de plus que la synthèse :
// l'identifiant et la désignation, qui s'impriment.
type ligneProduitDetail struct {
	ID          string `db:"id"`
	Designation string `db:"designation"`
	ligneProduitStats
}

// RegisterStockStatisticsDetailRoutes expose
// GET /api/reports/stock-statistics/products.
func RegisterStockStatisticsDetailRoutes(app *pocketbase.PocketBase, router *echo.Echo) {
	router.GET("/api/reports/stock-statistics/products", func(c echo.Context) error {
		options := optionsDetail{
			GroupByCategory:      c.QueryParam("group_by_category") == "true",
			IncludeUncategorized: c.QueryParam("include_uncategorized") == "true",
			Simplified:           c.QueryParam("simplified") == "true",
			SortBy:               c.QueryParam("sort_by"),
			SortOrder:            c.QueryParam("sort_order"),
		}
		if brut := c.QueryParam("categories"); brut != "" {
			for _, id := range strings.Split(brut, ",") {
				if id = strings.TrimSpace(id); id != "" {
					options.Categories = append(options.Categories, id)
				}
			}
		}

		sortie, err := computeStockDetail(app, c.QueryParam("company"), options)
		if err != nil {
			return apis.NewApiError(http.StatusInternalServerError,
				"détail du stock indisponible", err)
		}

		return c.JSON(http.StatusOK, sortie)
	}, apis.RequireRecordAuth())
}

func computeStockDetail(
	app *pocketbase.PocketBase,
	companyID string,
	options optionsDetail,
) (*StockDetailOutput, error) {
	db := app.Dao().DB()

	var categories []ligneCategorieNommee
	requeteCategories := db.Select("id", "name", "parent").From("categories")
	if companyID != "" {
		requeteCategories = requeteCategories.Where(dbx.HashExp{"company": companyID})
	}
	if err := requeteCategories.All(&categories); err != nil {
		return nil, err
	}

	var produits []ligneProduitDetail
	requeteProduits := db.
		Select("id", "designation", "type", "sku", "name", "stock",
			"purchase_price_ht", "price_ttc", "tax_rate", "categories").
		From("products")
	if companyID != "" {
		requeteProduits = requeteProduits.Where(dbx.HashExp{"company": companyID})
	}
	if err := requeteProduits.All(&produits); err != nil {
		return nil, err
	}

	return agregerDetailStock(produits, categories, options), nil
}

// agregerDetailStock — LA RÈGLE du rapport détaillé, séparée de la base.
func agregerDetailStock(
	produits []ligneProduitDetail,
	categories []ligneCategorieNommee,
	options optionsDetail,
) *StockDetailOutput {
	nomDe := make(map[string]string, len(categories))
	for _, categorie := range categories {
		nom := categorie.Name.String
		if nom == "" {
			nom = "Sans nom"
		}
		nomDe[categorie.ID] = nom
	}

	retenues := make(map[string]struct{}, len(options.Categories))
	for _, id := range options.Categories {
		retenues[id] = struct{}{}
	}

	sortie := &StockDetailOutput{Simplified: options.Simplified}
	groupes := map[string]*StockDetailGroup{}
	ordreGroupes := []string{}

	for _, produit := range produits {
		if !estProduitSimple(produit.ligneProduitStats) {
			continue
		}

		stock := produit.Stock.Float64
		prixAchat := produit.PurchasePriceHT.Float64
		prixTTC := produit.PriceTTC.Float64
		taux := produit.TaxRate.Float64
		if stock <= 0 || prixAchat <= 0 || prixTTC <= 0 {
			continue
		}

		directes := decodeRelationMultiple(produit.Categories)

		// La catégorie D'IMPRESSION : la première de la fiche, comme le
		// camembert. Une fiche n'apparaît qu'une fois dans le rapport, sans
		// quoi les sous-totaux ne feraient plus le total.
		categorieID := ""
		if len(directes) > 0 {
			categorieID = directes[0]
		}

		if !gardeLaLigne(directes, retenues, options) {
			continue
		}

		prixHT := prixVenteHT(prixTTC, taux)
		ligne := StockDetailLine{
			ID:             produit.ID,
			SKU:            produit.SKU.String,
			Designation:    designationImprimee(produit),
			Stock:          stock,
			PurchasePrice:  prixAchat,
			PriceHT:        arrondiCentime(prixHT),
			PriceTTC:       prixTTC,
			TaxRate:        taux,
			InventoryValue: arrondiCentime(stock * prixAchat),
			RetailValue:    arrondiCentime(stock * prixHT),
		}
		ligne.Margin = arrondiCentime(ligne.RetailValue - ligne.InventoryValue)

		cle := ""
		nom := ""
		if options.GroupByCategory {
			cle = categorieID
			if nom = nomDe[categorieID]; nom == "" {
				cle, nom = "", libelleSansCategorie
			}
		}

		groupe := groupes[cle]
		if groupe == nil {
			groupe = &StockDetailGroup{CategoryID: cle, CategoryName: nom}
			groupes[cle] = groupe
			ordreGroupes = append(ordreGroupes, cle)
		}
		groupe.Lines = append(groupe.Lines, ligne)
		groupe.ProductCount++
		groupe.InventoryValue += ligne.InventoryValue
		groupe.RetailValue += ligne.RetailValue
		groupe.Margin += ligne.Margin
	}

	for _, cle := range ordreGroupes {
		groupe := groupes[cle]
		trierLignes(groupe.Lines, options.SortBy, options.SortOrder)

		groupe.InventoryValue = arrondiCentime(groupe.InventoryValue)
		groupe.RetailValue = arrondiCentime(groupe.RetailValue)
		groupe.Margin = arrondiCentime(groupe.Margin)

		sortie.Totals.ProductCount += groupe.ProductCount
		sortie.Totals.InventoryValue += groupe.InventoryValue
		sortie.Totals.RetailValue += groupe.RetailValue
		sortie.Totals.Margin += groupe.Margin

		if options.Simplified {
			groupe.Lines = nil
		}
		sortie.Groups = append(sortie.Groups, *groupe)
	}

	// Les groupes sortent par nom : le PDF les imprime dans cet ordre, et il
	// doit être le même d'un export à l'autre. Le groupe sans catégorie ferme
	// la marche.
	sort.SliceStable(sortie.Groups, func(i, j int) bool {
		if (sortie.Groups[i].CategoryID == "") != (sortie.Groups[j].CategoryID == "") {
			return sortie.Groups[j].CategoryID == ""
		}
		return sortie.Groups[i].CategoryName < sortie.Groups[j].CategoryName
	})

	sortie.Totals.InventoryValue = arrondiCentime(sortie.Totals.InventoryValue)
	sortie.Totals.RetailValue = arrondiCentime(sortie.Totals.RetailValue)
	sortie.Totals.Margin = arrondiCentime(sortie.Totals.Margin)

	return sortie
}

// gardeLaLigne — la sélection de catégories de l'écran d'export.
//
// ⚠️ Elle regarde TOUTES les catégories de la fiche, pas seulement celle
// d'impression : cocher « Guitares » doit retenir un produit rangé à la fois
// dans « Guitares » et dans « Promotions », quel que soit l'ordre du tableau.
func gardeLaLigne(directes []string, retenues map[string]struct{}, options optionsDetail) bool {
	if !options.GroupByCategory || len(retenues) == 0 {
		return true
	}
	if len(directes) == 0 {
		return options.IncludeUncategorized
	}
	for _, id := range directes {
		if _, gardee := retenues[id]; gardee {
			return true
		}
	}
	return false
}

// designationImprimee — le nom sur le rapport. `designation` d'abord, `name`
// en repli : c'est la règle de la caisse (`frontend/lib/queries/pos.ts`), et
// `name` est le titre de la page du site, pas le nom de l'article.
func designationImprimee(produit ligneProduitDetail) string {
	if produit.Designation != "" {
		return produit.Designation
	}
	return produit.Name.String
}

func trierLignes(lignes []StockDetailLine, critere, ordre string) {
	descendant := ordre == "desc"

	moins := func(a, b StockDetailLine) bool {
		switch critere {
		case "sku":
			return strings.ToLower(a.SKU) < strings.ToLower(b.SKU)
		case "stock":
			return a.Stock < b.Stock
		case "value":
			return a.InventoryValue < b.InventoryValue
		default:
			return strings.ToLower(a.Designation) < strings.ToLower(b.Designation)
		}
	}

	sort.SliceStable(lignes, func(i, j int) bool {
		if descendant {
			return moins(lignes[j], lignes[i])
		}
		return moins(lignes[i], lignes[j])
	})
}
