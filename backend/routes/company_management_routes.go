// backend/routes/company_management_routes.go
package routes

import (
	"log"
	"net/http"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/tools/security"
)

func RegisterCompanyManagementRoutes(pb *pocketbase.PocketBase, router *echo.Echo) {
	log.Println("🏢 Registering company management routes...")

	// Middleware d'authentification admin
	requireAdmin := func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			token := c.Request().Header.Get("Authorization")
			token = strings.TrimPrefix(token, "Bearer ")
			token = strings.TrimSpace(token)

			if token == "" {
				return c.JSON(http.StatusUnauthorized, map[string]interface{}{
					"error": "Non authentifié",
				})
			}

			claims, err := security.ParseUnverifiedJWT(token)
			if err != nil {
				return c.JSON(http.StatusUnauthorized, map[string]interface{}{
					"error": "Token invalide",
				})
			}

			userId, ok := claims["id"].(string)
			if !ok || userId == "" {
				return c.JSON(http.StatusUnauthorized, map[string]interface{}{
					"error": "Token invalide",
				})
			}

			record, err := pb.Dao().FindRecordById("users", userId)
			if err != nil {
				return c.JSON(http.StatusUnauthorized, map[string]interface{}{
					"error": "Utilisateur non trouvé",
				})
			}

			role := record.GetString("role")
			if role != "admin" {
				return c.JSON(http.StatusForbidden, map[string]interface{}{
					"error": "Accès réservé aux administrateurs",
				})
			}

			c.Set("authRecord", record)
			return next(c)
		}
	}

	// 📋 Lister toutes les entreprises (admin only)
	router.GET("/api/companies", func(c echo.Context) error {
		log.Println("📋 GET /api/companies - Listing companies...")

		records, err := pb.Dao().FindRecordsByFilter(
			"companies",
			"id != ''",
			"+created", // Tri par date de création (la première en premier)
			500,
			0,
		)

		if err != nil {
			log.Printf("❌ Error listing companies: %v", err)
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "Erreur lors de la récupération des entreprises",
			})
		}

		// Trouver l'ID de la première entreprise (non supprimable)
		var firstCompanyId string
		if len(records) > 0 {
			firstCompanyId = records[0].Id
		}

		companies := make([]map[string]interface{}, len(records))
		for i, record := range records {
			companies[i] = map[string]interface{}{
				"id":                         record.Id,
				"name":                       record.GetString("name"),
				"trade_name":                 record.GetString("trade_name"),
				"logo":                       record.GetString("logo"),
				"active":                     record.GetBool("active"),
				"is_default":                 record.GetBool("is_default"),
				"siren":                      record.GetString("siren"),
				"siret":                      record.GetString("siret"),
				"vat_number":                 record.GetString("vat_number"),
				"legal_form":                 record.GetString("legal_form"),
				"rcs":                        record.GetString("rcs"),
				"ape_naf":                    record.GetString("ape_naf"),
				"share_capital":              record.GetFloat("share_capital"),
				"address_line1":              record.GetString("address_line1"),
				"address_line2":              record.GetString("address_line2"),
				"zip_code":                   record.GetString("zip_code"),
				"city":                       record.GetString("city"),
				"country":                    record.GetString("country"),
				"phone":                      record.GetString("phone"),
				"email":                      record.GetString("email"),
				"website":                    record.GetString("website"),
				"bank_name":                  record.GetString("bank_name"),
				"iban":                       record.GetString("iban"),
				"bic":                        record.GetString("bic"),
				"account_holder":             record.GetString("account_holder"),
				"default_payment_terms_days": record.GetFloat("default_payment_terms_days"),
				"default_payment_method":     record.GetString("default_payment_method"),
				"invoice_footer":             record.GetString("invoice_footer"),
				"invoice_prefix":             record.GetString("invoice_prefix"),
				"created":                    record.Created,
				"updated":                    record.Updated,
				"is_first":                   record.Id == firstCompanyId, // Marqueur pour la première entreprise
			}
		}

		log.Printf("✅ Found %d companies", len(records))
		return c.JSON(http.StatusOK, companies)
	}, requireAdmin)

	// 📦 Détails d'une entreprise (admin only)
	router.GET("/api/companies/:id", func(c echo.Context) error {
		companyId := c.PathParam("id")
		log.Printf("📦 GET /api/companies/%s", companyId)

		record, err := pb.Dao().FindRecordById("companies", companyId)
		if err != nil {
			return c.JSON(http.StatusNotFound, map[string]interface{}{
				"error": "Entreprise non trouvée",
			})
		}

		// Vérifier si c'est la première entreprise (la plus ancienne)
		firstCompanies, _ := pb.Dao().FindRecordsByFilter(
			"companies",
			"id != ''",
			"+created", // Tri par date croissante (la plus ancienne en premier)
			1,          // Limit 1
			0,          // Offset 0
		)
		isFirst := len(firstCompanies) > 0 && firstCompanies[0].Id == record.Id

		return c.JSON(http.StatusOK, map[string]interface{}{
			"id":                         record.Id,
			"name":                       record.GetString("name"),
			"trade_name":                 record.GetString("trade_name"),
			"logo":                       record.GetString("logo"),
			"active":                     record.GetBool("active"),
			"is_default":                 record.GetBool("is_default"),
			"siren":                      record.GetString("siren"),
			"siret":                      record.GetString("siret"),
			"vat_number":                 record.GetString("vat_number"),
			"legal_form":                 record.GetString("legal_form"),
			"rcs":                        record.GetString("rcs"),
			"ape_naf":                    record.GetString("ape_naf"),
			"share_capital":              record.GetFloat("share_capital"),
			"address_line1":              record.GetString("address_line1"),
			"address_line2":              record.GetString("address_line2"),
			"zip_code":                   record.GetString("zip_code"),
			"city":                       record.GetString("city"),
			"country":                    record.GetString("country"),
			"phone":                      record.GetString("phone"),
			"email":                      record.GetString("email"),
			"website":                    record.GetString("website"),
			"bank_name":                  record.GetString("bank_name"),
			"iban":                       record.GetString("iban"),
			"bic":                        record.GetString("bic"),
			"account_holder":             record.GetString("account_holder"),
			"default_payment_terms_days": record.GetFloat("default_payment_terms_days"),
			"default_payment_method":     record.GetString("default_payment_method"),
			"invoice_footer":             record.GetString("invoice_footer"),
			"invoice_prefix":             record.GetString("invoice_prefix"),
			"created":                    record.Created,
			"updated":                    record.Updated,
			"is_first":                   isFirst,
		})
	}, requireAdmin)

	// ➕ Créer une entreprise (admin only)
	router.POST("/api/companies", func(c echo.Context) error {
		log.Println("➕ POST /api/companies - Creating company...")

		type CreateCompanyRequest struct {
			Name                    string  `json:"name"`
			TradeName               string  `json:"trade_name"`
			Active                  bool    `json:"active"`
			IsDefault               bool    `json:"is_default"`
			Siren                   string  `json:"siren"`
			Siret                   string  `json:"siret"`
			VatNumber               string  `json:"vat_number"`
			LegalForm               string  `json:"legal_form"`
			Rcs                     string  `json:"rcs"`
			ApeNaf                  string  `json:"ape_naf"`
			ShareCapital            float64 `json:"share_capital"`
			AddressLine1            string  `json:"address_line1"`
			AddressLine2            string  `json:"address_line2"`
			ZipCode                 string  `json:"zip_code"`
			City                    string  `json:"city"`
			Country                 string  `json:"country"`
			Phone                   string  `json:"phone"`
			Email                   string  `json:"email"`
			Website                 string  `json:"website"`
			BankName                string  `json:"bank_name"`
			Iban                    string  `json:"iban"`
			Bic                     string  `json:"bic"`
			AccountHolder           string  `json:"account_holder"`
			DefaultPaymentTermsDays float64 `json:"default_payment_terms_days"`
			DefaultPaymentMethod    string  `json:"default_payment_method"`
			InvoiceFooter           string  `json:"invoice_footer"`
			InvoicePrefix           string  `json:"invoice_prefix"`
		}

		var req CreateCompanyRequest
		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Données invalides",
			})
		}

		// Validation
		if req.Name == "" {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Le nom de l'entreprise est obligatoire",
			})
		}

		collection, err := pb.Dao().FindCollectionByNameOrId("companies")
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "Collection companies non trouvée",
			})
		}

		// Si is_default = true, enlever is_default des autres entreprises
		if req.IsDefault {
			removeDefaultFromOthers(pb)
		}

		record := models.NewRecord(collection)
		record.Set("name", req.Name)
		record.Set("trade_name", req.TradeName)
		record.Set("active", req.Active)
		record.Set("is_default", req.IsDefault)
		record.Set("siren", req.Siren)
		record.Set("siret", req.Siret)
		record.Set("vat_number", req.VatNumber)
		record.Set("legal_form", req.LegalForm)
		record.Set("rcs", req.Rcs)
		record.Set("ape_naf", req.ApeNaf)
		record.Set("share_capital", req.ShareCapital)
		record.Set("address_line1", req.AddressLine1)
		record.Set("address_line2", req.AddressLine2)
		record.Set("zip_code", req.ZipCode)
		record.Set("city", req.City)
		record.Set("country", req.Country)
		record.Set("phone", req.Phone)
		record.Set("email", req.Email)
		record.Set("website", req.Website)
		record.Set("bank_name", req.BankName)
		record.Set("iban", req.Iban)
		record.Set("bic", req.Bic)
		record.Set("account_holder", req.AccountHolder)
		record.Set("default_payment_terms_days", req.DefaultPaymentTermsDays)
		record.Set("default_payment_method", req.DefaultPaymentMethod)
		record.Set("invoice_footer", req.InvoiceFooter)
		record.Set("invoice_prefix", req.InvoicePrefix)

		if err := pb.Dao().SaveRecord(record); err != nil {
			log.Printf("❌ Error creating company: %v", err)
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error":   "Erreur lors de la création de l'entreprise",
				"details": err.Error(),
			})
		}

		log.Printf("✅ Company created: %s", req.Name)

		return c.JSON(http.StatusOK, map[string]interface{}{
			"id":      record.Id,
			"name":    record.GetString("name"),
			"created": record.Created,
		})
	}, requireAdmin)

	// ✏️ Modifier une entreprise (admin only)
	router.PATCH("/api/companies/:id", func(c echo.Context) error {
		companyId := c.PathParam("id")
		log.Printf("✏️ PATCH /api/companies/%s", companyId)

		record, err := pb.Dao().FindRecordById("companies", companyId)
		if err != nil {
			return c.JSON(http.StatusNotFound, map[string]interface{}{
				"error": "Entreprise non trouvée",
			})
		}

		type UpdateCompanyRequest struct {
			Name                    *string  `json:"name"`
			TradeName               *string  `json:"trade_name"`
			Active                  *bool    `json:"active"`
			IsDefault               *bool    `json:"is_default"`
			Siren                   *string  `json:"siren"`
			Siret                   *string  `json:"siret"`
			VatNumber               *string  `json:"vat_number"`
			LegalForm               *string  `json:"legal_form"`
			Rcs                     *string  `json:"rcs"`
			ApeNaf                  *string  `json:"ape_naf"`
			ShareCapital            *float64 `json:"share_capital"`
			AddressLine1            *string  `json:"address_line1"`
			AddressLine2            *string  `json:"address_line2"`
			ZipCode                 *string  `json:"zip_code"`
			City                    *string  `json:"city"`
			Country                 *string  `json:"country"`
			Phone                   *string  `json:"phone"`
			Email                   *string  `json:"email"`
			Website                 *string  `json:"website"`
			BankName                *string  `json:"bank_name"`
			Iban                    *string  `json:"iban"`
			Bic                     *string  `json:"bic"`
			AccountHolder           *string  `json:"account_holder"`
			DefaultPaymentTermsDays *float64 `json:"default_payment_terms_days"`
			DefaultPaymentMethod    *string  `json:"default_payment_method"`
			InvoiceFooter           *string  `json:"invoice_footer"`
			InvoicePrefix           *string  `json:"invoice_prefix"`
		}

		var req UpdateCompanyRequest
		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Données invalides",
			})
		}

		// Si is_default = true, enlever is_default des autres entreprises
		if req.IsDefault != nil && *req.IsDefault {
			removeDefaultFromOthers(pb)
		}

		// Mettre à jour les champs fournis
		if req.Name != nil {
			record.Set("name", *req.Name)
		}
		if req.TradeName != nil {
			record.Set("trade_name", *req.TradeName)
		}
		if req.Active != nil {
			record.Set("active", *req.Active)
		}
		if req.IsDefault != nil {
			record.Set("is_default", *req.IsDefault)
		}
		if req.Siren != nil {
			record.Set("siren", *req.Siren)
		}
		if req.Siret != nil {
			record.Set("siret", *req.Siret)
		}
		if req.VatNumber != nil {
			record.Set("vat_number", *req.VatNumber)
		}
		if req.LegalForm != nil {
			record.Set("legal_form", *req.LegalForm)
		}
		if req.Rcs != nil {
			record.Set("rcs", *req.Rcs)
		}
		if req.ApeNaf != nil {
			record.Set("ape_naf", *req.ApeNaf)
		}
		if req.ShareCapital != nil {
			record.Set("share_capital", *req.ShareCapital)
		}
		if req.AddressLine1 != nil {
			record.Set("address_line1", *req.AddressLine1)
		}
		if req.AddressLine2 != nil {
			record.Set("address_line2", *req.AddressLine2)
		}
		if req.ZipCode != nil {
			record.Set("zip_code", *req.ZipCode)
		}
		if req.City != nil {
			record.Set("city", *req.City)
		}
		if req.Country != nil {
			record.Set("country", *req.Country)
		}
		if req.Phone != nil {
			record.Set("phone", *req.Phone)
		}
		if req.Email != nil {
			record.Set("email", *req.Email)
		}
		if req.Website != nil {
			record.Set("website", *req.Website)
		}
		if req.BankName != nil {
			record.Set("bank_name", *req.BankName)
		}
		if req.Iban != nil {
			record.Set("iban", *req.Iban)
		}
		if req.Bic != nil {
			record.Set("bic", *req.Bic)
		}
		if req.AccountHolder != nil {
			record.Set("account_holder", *req.AccountHolder)
		}
		if req.DefaultPaymentTermsDays != nil {
			record.Set("default_payment_terms_days", *req.DefaultPaymentTermsDays)
		}
		if req.DefaultPaymentMethod != nil {
			record.Set("default_payment_method", *req.DefaultPaymentMethod)
		}
		if req.InvoiceFooter != nil {
			record.Set("invoice_footer", *req.InvoiceFooter)
		}
		if req.InvoicePrefix != nil {
			record.Set("invoice_prefix", *req.InvoicePrefix)
		}

		if err := pb.Dao().SaveRecord(record); err != nil {
			log.Printf("❌ Error updating company: %v", err)
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "Erreur lors de la mise à jour",
			})
		}

		log.Printf("✅ Company updated: %s", companyId)

		return c.JSON(http.StatusOK, map[string]interface{}{
			"id":      record.Id,
			"name":    record.GetString("name"),
			"updated": record.Updated,
		})
	}, requireAdmin)

	// 🗑️ Supprimer une entreprise (admin only, sauf la première)
	router.DELETE("/api/companies/:id", func(c echo.Context) error {
		companyId := c.PathParam("id")
		log.Printf("🗑️ DELETE /api/companies/%s", companyId)

		// Vérifier si c'est la première entreprise (la plus ancienne)
		firstCompanies, err := pb.Dao().FindRecordsByFilter(
			"companies",
			"id != ''",
			"+created", // Tri par date croissante
			1,          // Limit 1
			0,          // Offset 0
		)
		if err == nil && len(firstCompanies) > 0 && firstCompanies[0].Id == companyId {
			log.Println("⛔ Cannot delete the first company")
			return c.JSON(http.StatusForbidden, map[string]interface{}{
				"error": "Impossible de supprimer l'entreprise principale. C'est la première entreprise créée.",
			})
		}

		record, err := pb.Dao().FindRecordById("companies", companyId)
		if err != nil {
			return c.JSON(http.StatusNotFound, map[string]interface{}{
				"error": "Entreprise non trouvée",
			})
		}

		// Vérifier si des utilisateurs sont liés à cette entreprise
		usersWithCompany, _ := pb.Dao().FindRecordsByFilter(
			"users",
			"company = {:companyId}",
			"",
			100, // Limite raisonnable
			0,
			dbx.Params{"companyId": companyId},
		)

		if len(usersWithCompany) > 0 {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error":      "Impossible de supprimer cette entreprise car des utilisateurs y sont rattachés",
				"usersCount": len(usersWithCompany),
			})
		}

		companyName := record.GetString("name")
		if err := pb.Dao().DeleteRecord(record); err != nil {
			log.Printf("❌ Error deleting company: %v", err)
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "Erreur lors de la suppression",
			})
		}

		log.Printf("✅ Company deleted: %s", companyName)

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Entreprise supprimée",
		})
	}, requireAdmin)

	log.Println("✅ Company management routes registered")
}

// removeDefaultFromOthers enlève is_default de toutes les entreprises
func removeDefaultFromOthers(pb *pocketbase.PocketBase) {
	records, err := pb.Dao().FindRecordsByFilter(
		"companies",
		"is_default = true",
		"",
		100, // Limite raisonnable
		0,
	)
	if err != nil {
		return
	}

	for _, record := range records {
		record.Set("is_default", false)
		pb.Dao().SaveRecord(record)
	}
}
