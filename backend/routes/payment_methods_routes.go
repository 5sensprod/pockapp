// backend/routes/payment_methods_routes.go
// ═══════════════════════════════════════════════════════════════════════════
// ROUTES - GESTION DES MOYENS DE PAIEMENT
// ═══════════════════════════════════════════════════════════════════════════

package routes

import (
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/models"
)

// DTOs -----------------------------------------------------------------

type PaymentMethodInput struct {
	Code               string  `json:"code"`
	Name               string  `json:"name"`
	Description        string  `json:"description"`
	Type               string  `json:"type"`
	AccountingCategory string  `json:"accounting_category"`
	Enabled            bool    `json:"enabled"`
	RequiresSession    bool    `json:"requires_session"`
	Icon               string  `json:"icon"`
	Color              string  `json:"color"`
	TextColor          string  `json:"text_color"`
	DisplayOrder       float64 `json:"display_order"`
}

// ROUTES ---------------------------------------------------------------

func RegisterPaymentMethodsRoutes(app *pocketbase.PocketBase, router *echo.Echo) {

	// Liste des moyens de paiement d'une company
	router.GET("/api/payment-methods", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		if info.AuthRecord == nil {
			return apis.NewUnauthorizedError("Authentication required", nil)
		}

		companyId := c.QueryParam("company_id")
		if companyId == "" {
			return apis.NewBadRequestError("company_id requis", nil)
		}

		// Récupérer tous les moyens de cette company, triés par display_order
		methods, err := app.Dao().FindRecordsByFilter(
			"payment_methods",
			"company = {:company}",
			"-display_order",
			0,
			0,
			map[string]interface{}{
				"company": companyId,
			},
		)
		if err != nil {
			return apis.NewApiError(500, "Erreur récupération moyens", err)
		}

		return c.JSON(200, methods)
	})

	// Créer un moyen custom
	router.POST("/api/payment-methods", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		if info.AuthRecord == nil {
			return apis.NewUnauthorizedError("Authentication required", nil)
		}

		var input PaymentMethodInput
		if err := c.Bind(&input); err != nil {
			return apis.NewBadRequestError("Corps invalide", err)
		}

		// Validation
		if input.Code == "" || input.Name == "" {
			return apis.NewBadRequestError("code et name requis", nil)
		}

		// Nettoyer le code (lowercase, pas d'espaces)
		input.Code = strings.ToLower(strings.ReplaceAll(input.Code, " ", "_"))

		// Vérifier que le code ne commence pas par "default_" (réservé)
		if strings.HasPrefix(input.Code, "card") ||
			strings.HasPrefix(input.Code, "cash") ||
			strings.HasPrefix(input.Code, "check") ||
			strings.HasPrefix(input.Code, "transfer") {
			return apis.NewBadRequestError("Code réservé aux moyens par défaut", nil)
		}

		companyId := c.QueryParam("company_id")
		if companyId == "" {
			return apis.NewBadRequestError("company_id requis", nil)
		}

		// Vérifier l'unicité company + code
		existing, _ := app.Dao().FindFirstRecordByFilter(
			"payment_methods",
			"company = {:company} && code = {:code}",
			map[string]interface{}{
				"company": companyId,
				"code":    input.Code,
			},
		)
		if existing != nil {
			return apis.NewBadRequestError("Ce code existe déjà pour cette company", nil)
		}

		// Créer le record
		collection, err := app.Dao().FindCollectionByNameOrId("payment_methods")
		if err != nil {
			return apis.NewApiError(500, "Collection introuvable", err)
		}

		record := models.NewRecord(collection)
		record.Set("company", companyId)
		record.Set("code", input.Code)
		record.Set("name", input.Name)
		record.Set("description", input.Description)
		record.Set("type", "custom") // Toujours custom pour les créations
		record.Set("accounting_category", input.AccountingCategory)
		record.Set("enabled", input.Enabled)
		record.Set("requires_session", input.RequiresSession)
		record.Set("icon", input.Icon)
		record.Set("color", input.Color)
		record.Set("text_color", input.TextColor)
		record.Set("display_order", input.DisplayOrder)

		if err := app.Dao().SaveRecord(record); err != nil {
			return apis.NewApiError(500, "Erreur création", err)
		}

		return c.JSON(200, record)
	})

	// Mettre à jour un moyen
	router.PATCH("/api/payment-methods/:id", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		if info.AuthRecord == nil {
			return apis.NewUnauthorizedError("Authentication required", nil)
		}

		id := c.PathParam("id")
		record, err := app.Dao().FindRecordById("payment_methods", id)
		if err != nil {
			return apis.NewNotFoundError("Moyen introuvable", err)
		}

		var input PaymentMethodInput
		if err := c.Bind(&input); err != nil {
			return apis.NewBadRequestError("Corps invalide", err)
		}

		// Les moyens par défaut ont des restrictions
		methodType := record.GetString("type")
		if methodType == "default" {
			// On peut seulement modifier enabled, description, display_order
			record.Set("enabled", input.Enabled)
			record.Set("description", input.Description)
			record.Set("display_order", input.DisplayOrder)
		} else {
			// Custom: modification complète (sauf code et type)
			if input.Name != "" {
				record.Set("name", input.Name)
			}
			record.Set("description", input.Description)
			record.Set("accounting_category", input.AccountingCategory)
			record.Set("enabled", input.Enabled)
			record.Set("requires_session", input.RequiresSession)
			record.Set("icon", input.Icon)
			record.Set("color", input.Color)
			record.Set("text_color", input.TextColor)
			record.Set("display_order", input.DisplayOrder)
		}

		if err := app.Dao().SaveRecord(record); err != nil {
			return apis.NewApiError(500, "Erreur mise à jour", err)
		}

		return c.JSON(200, record)
	})

	// Supprimer un moyen custom
	router.DELETE("/api/payment-methods/:id", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		if info.AuthRecord == nil {
			return apis.NewUnauthorizedError("Authentication required", nil)
		}

		id := c.PathParam("id")
		record, err := app.Dao().FindRecordById("payment_methods", id)
		if err != nil {
			return apis.NewNotFoundError("Moyen introuvable", err)
		}

		// Vérifier que c'est un custom
		if record.GetString("type") == "default" {
			return apis.NewBadRequestError("Les moyens par défaut ne peuvent pas être supprimés", nil)
		}

		// Vérifier qu'il n'est pas utilisé dans des factures récentes
		companyId := record.GetString("company")
		code := record.GetString("code")
		methodName := record.GetString("name")

		// Utiliser FindRecordsByFilter pour vérifier l'utilisation
		usedInvoices, err := app.Dao().FindRecordsByFilter(
			"invoices",
			"owner_company = {:company} && payment_method = 'autre' && payment_method_label = {:label}",
			"",
			1, // Limiter à 1 pour vérifier l'existence
			0,
			map[string]interface{}{
				"company": companyId,
				"label":   methodName,
			},
		)

		if err == nil && len(usedInvoices) > 0 {
			// Si utilisé, le désactiver au lieu de le supprimer
			record.Set("enabled", false)
			if err := app.Dao().SaveRecord(record); err != nil {
				return apis.NewApiError(500, "Erreur désactivation", err)
			}
			return c.JSON(200, map[string]interface{}{
				"message": "Moyen désactivé (utilisé dans des factures)",
				"code":    code,
			})
		}

		// Sinon, supprimer
		if err := app.Dao().DeleteRecord(record); err != nil {
			return apis.NewApiError(500, "Erreur suppression", err)
		}

		return c.JSON(200, map[string]interface{}{
			"message": "Moyen supprimé",
			"code":    code,
		})
	})

	// Toggle enabled/disabled d'un moyen
	router.POST("/api/payment-methods/:id/toggle", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		if info.AuthRecord == nil {
			return apis.NewUnauthorizedError("Authentication required", nil)
		}

		id := c.PathParam("id")
		record, err := app.Dao().FindRecordById("payment_methods", id)
		if err != nil {
			return apis.NewNotFoundError("Moyen introuvable", err)
		}

		// Toggle
		currentState := record.GetBool("enabled")
		record.Set("enabled", !currentState)

		if err := app.Dao().SaveRecord(record); err != nil {
			return apis.NewApiError(500, "Erreur toggle", err)
		}

		return c.JSON(200, record)
	})

	// ═══════════════════════════════════════════════════════════════════════
	// ROUTE DE RÉPARATION - Créer les moyens par défaut manquants
	// ═══════════════════════════════════════════════════════════════════════

	// Réparer toutes les companies
	router.POST("/api/payment-methods/repair-all", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		if info.AuthRecord == nil {
			return apis.NewUnauthorizedError("Authentication required", nil)
		}

		companies, err := app.Dao().FindRecordsByFilter("companies", "", "", 0, 0)
		if err != nil {
			return apis.NewApiError(500, "Erreur récupération companies", err)
		}

		results := []map[string]interface{}{}
		totalCreated := 0

		for _, company := range companies {
			created := ensureDefaultPaymentMethods(app, company.Id)
			results = append(results, map[string]interface{}{
				"company_id":   company.Id,
				"company_name": company.GetString("name"),
				"created":      created,
			})
			totalCreated += len(created)
		}

		return c.JSON(200, map[string]interface{}{
			"success":       true,
			"total_created": totalCreated,
			"companies":     results,
		})
	})

	// Réparer une company spécifique
	router.POST("/api/payment-methods/repair/:companyId", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		if info.AuthRecord == nil {
			return apis.NewUnauthorizedError("Authentication required", nil)
		}

		companyId := c.PathParam("companyId")

		// Vérifier que la company existe
		company, err := app.Dao().FindRecordById("companies", companyId)
		if err != nil {
			return apis.NewNotFoundError("Company introuvable", err)
		}

		created := ensureDefaultPaymentMethods(app, companyId)

		return c.JSON(200, map[string]interface{}{
			"success":      true,
			"company_id":   companyId,
			"company_name": company.GetString("name"),
			"created":      created,
		})
	})
}

func ensureDefaultPaymentMethods(app *pocketbase.PocketBase, companyId string) []string {
	col, err := app.Dao().FindCollectionByNameOrId("payment_methods")
	if err != nil {
		return []string{}
	}

	defaults := []map[string]interface{}{
		{
			"code":                "card",
			"name":                "Carte bancaire",
			"description":         "Terminal CB connecté",
			"type":                "default",
			"accounting_category": "card",
			"enabled":             true,
			"requires_session":    false,
			"icon":                "CreditCard",
			"color":               "#1e293b",
			"text_color":          "#ffffff",
			"display_order":       1,
		},
		{
			"code":                "cash",
			"name":                "Espèces",
			"description":         "Rendue monnaie calculée automatiquement",
			"type":                "default",
			"accounting_category": "cash",
			"enabled":             true,
			"requires_session":    true,
			"icon":                "Banknote",
			"color":               "#f8fafc",
			"text_color":          "#475569",
			"display_order":       2,
		},
		{
			"code":                "check",
			"name":                "Chèque",
			"description":         "Paiement par chèque bancaire",
			"type":                "default",
			"accounting_category": "check",
			"enabled":             false,
			"requires_session":    false,
			"icon":                "Receipt",
			"color":               "#f8fafc",
			"text_color":          "#475569",
			"display_order":       3,
		},
		{
			"code":                "transfer",
			"name":                "Virement",
			"description":         "Virement bancaire",
			"type":                "default",
			"accounting_category": "transfer",
			"enabled":             false,
			"requires_session":    false,
			"icon":                "ArrowRightLeft",
			"color":               "#f8fafc",
			"text_color":          "#475569",
			"display_order":       4,
		},
	}

	created := []string{}

	for _, methodData := range defaults {
		// Vérifier si existe déjà
		existing, _ := app.Dao().FindFirstRecordByFilter(
			"payment_methods",
			"company = {:company} && code = {:code}",
			map[string]interface{}{
				"company": companyId,
				"code":    methodData["code"],
			},
		)
		if existing != nil {
			continue // Déjà créé, skip
		}

		// Créer le record
		record := models.NewRecord(col)
		record.Set("company", companyId)
		for key, value := range methodData {
			record.Set(key, value)
		}

		if err := app.Dao().SaveRecord(record); err == nil {
			created = append(created, methodData["code"].(string))
		}
	}

	return created
}
