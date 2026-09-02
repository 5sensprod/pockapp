// backend/routes/catalog_health_routes.go
//
// TRI DE SANTÉ DU CATALOGUE, CÔTÉ DONNÉES.
//
// La page produit est paginée : calculer la santé dans React ne trierait que
// les 25 lignes visibles. Cette route locale applique le même filtre que
// PocketBase, ordonne les enregistrements en SQLite, puis ne renvoie qu'une
// page. Ce n'est pas une nouvelle sortie réseau : elle reste dans le PocketBase
// embarqué, point 1 de la carte du dépôt.

package routes

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/resolvers"
	"github.com/pocketbase/pocketbase/tools/search"
)

const productHealthMax = 6

// Six prérequis concrets de la fiche publique. Marque et fournisseur restent
// filtrables mais ne sont pas comptés : ils sont légitimement absents de
// certains produits et le fournisseur ne part jamais vers le site.
const productHealthSQL = `(
	CASE WHEN TRIM(COALESCE(products.name, '')) <> '' THEN 1 ELSE 0 END +
	CASE WHEN TRIM(COALESCE(products.description, '')) <> '' THEN 1 ELSE 0 END +
	CASE WHEN TRIM(COALESCE(products.image, '')) <> '' THEN 1 ELSE 0 END +
	CASE WHEN EXISTS (
		SELECT 1 FROM json_each(
			CASE
				WHEN json_valid(COALESCE(products.categories, '')) THEN products.categories
				ELSE json_array(COALESCE(products.categories, ''))
			END
		) WHERE value <> ''
	) THEN 1 ELSE 0 END +
	CASE WHEN COALESCE(products.price_ttc, 0) > 0 THEN 1 ELSE 0 END +
	CASE WHEN TRIM(COALESCE(products.slug, '')) <> '' THEN 1 ELSE 0 END
)`

type catalogHealthPage struct {
	Items      []*models.Record `json:"items"`
	Page       int              `json:"page"`
	PerPage    int              `json:"perPage"`
	TotalItems int              `json:"totalItems"`
	TotalPages int              `json:"totalPages"`
}

type productHealthValues struct {
	Name        string
	Description string
	Image       string
	Categories  []string
	PriceTTC    float64
	Slug        string
}

func productHealthScore(values productHealthValues) int {
	score := 0
	if strings.TrimSpace(values.Name) != "" {
		score++
	}
	if strings.TrimSpace(values.Description) != "" {
		score++
	}
	if strings.TrimSpace(values.Image) != "" {
		score++
	}
	if len(values.Categories) > 0 {
		score++
	}
	if values.PriceTTC > 0 {
		score++
	}
	if strings.TrimSpace(values.Slug) != "" {
		score++
	}
	return score
}

func recordProductHealth(record *models.Record) int {
	return productHealthScore(productHealthValues{
		Name:        record.GetString("name"),
		Description: record.GetString("description"),
		Image:       record.GetString("image"),
		Categories:  record.GetStringSlice("categories"),
		PriceTTC:    record.GetFloat("price_ttc"),
		Slug:        record.GetString("slug"),
	})
}

func filteredProductQuery(app *pocketbase.PocketBase, filter string) (*dbx.SelectQuery, error) {
	collection, err := app.Dao().FindCollectionByNameOrId("products")
	if err != nil {
		return nil, err
	}
	query := app.Dao().RecordQuery(collection)
	if strings.TrimSpace(filter) == "" {
		return query, nil
	}

	resolver := resolvers.NewRecordFieldResolver(
		app.Dao(),
		collection,
		nil,
		true,
	)
	expression, err := search.FilterData(filter).BuildExpr(resolver)
	if err != nil || expression == nil {
		return nil, errors.New("filtre catalogue invalide")
	}
	query.AndWhere(expression)
	resolver.UpdateQuery(query)
	return query, nil
}

func applyProductHealthFilter(query *dbx.SelectQuery, rawScore string) error {
	if strings.TrimSpace(rawScore) == "" {
		return nil
	}
	score, err := strconv.Atoi(rawScore)
	if err != nil || score < 0 || score > productHealthMax {
		return errors.New("note de santé invalide")
	}
	query.AndWhere(dbx.NewExp(
		productHealthSQL+" = {:health}",
		dbx.Params{"health": score},
	))
	return nil
}

// La route santé sert aussi quand la note est un filtre mais que le tableau
// reste trié par une colonne ordinaire. La liste blanche évite de transformer
// le paramètre de tri en fragment SQL libre.
func catalogProductOrder(sortValue, legacyDirection string) []string {
	if sortValue == "" {
		sortValue = "health"
		if strings.EqualFold(legacyDirection, "desc") {
			sortValue = "-health"
		}
	}

	orders := map[string]string{
		"health":     productHealthSQL + " ASC",
		"-health":    productHealthSQL + " DESC",
		"name":       "products.name ASC",
		"-name":      "products.name DESC",
		"name_sort":  "products.name_sort ASC",
		"-name_sort": "products.name_sort DESC",
		"price_ttc":  "products.price_ttc ASC",
		"-price_ttc": "products.price_ttc DESC",
		"created":    "products.created ASC",
		"-created":   "products.created DESC",
	}
	order, ok := orders[sortValue]
	if !ok {
		order = orders["name_sort"]
	}
	return []string{order, "products.name ASC"}
}

func RegisterCatalogHealthRoutes(app *pocketbase.PocketBase, router *echo.Echo) {
	router.GET("/api/catalog/products/health", func(c echo.Context) error {
		page, _ := strconv.Atoi(c.QueryParam("page"))
		perPage, _ := strconv.Atoi(c.QueryParam("perPage"))
		if page < 1 {
			page = 1
		}
		if perPage < 1 {
			perPage = 25
		}
		if perPage > 100 {
			perPage = 100
		}
		filter := c.QueryParam("filter")
		health := c.QueryParam("health")

		countQuery, err := filteredProductQuery(app, filter)
		if err != nil {
			return apis.NewBadRequestError("filtre catalogue invalide", err)
		}
		if err := applyProductHealthFilter(countQuery, health); err != nil {
			return apis.NewBadRequestError("note de santé invalide", err)
		}
		var count struct {
			Total int `db:"total"`
		}
		if err := countQuery.
			Select("COUNT(DISTINCT products.id) AS total").
			One(&count); err != nil {
			return apis.NewApiError(http.StatusInternalServerError,
				"comptage du catalogue indisponible", err)
		}

		productsQuery, err := filteredProductQuery(app, filter)
		if err != nil {
			return apis.NewBadRequestError("filtre catalogue invalide", err)
		}
		if err := applyProductHealthFilter(productsQuery, health); err != nil {
			return apis.NewBadRequestError("note de santé invalide", err)
		}
		orders := catalogProductOrder(c.QueryParam("sort"), c.QueryParam("direction"))
		productsQuery.
			AndOrderBy(orders...).
			Limit(int64(perPage)).
			Offset(int64((page - 1) * perPage))

		products := []*models.Record{}
		if err := productsQuery.All(&products); err != nil {
			return apis.NewApiError(http.StatusInternalServerError,
				"tri de santé indisponible", err)
		}
		for _, product := range products {
			product.Set("health_score", recordProductHealth(product))
			product.WithUnknownData(true)
		}

		totalPages := 0
		if count.Total > 0 {
			totalPages = (count.Total + perPage - 1) / perPage
		}
		return c.JSON(http.StatusOK, catalogHealthPage{
			Items:      products,
			Page:       page,
			PerPage:    perPage,
			TotalItems: count.Total,
			TotalPages: totalPages,
		})
	}, apis.RequireRecordAuth())
}
