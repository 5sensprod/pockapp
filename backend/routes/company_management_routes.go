// backend/routes/company_management_routes.go
package routes

import (
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/forms"
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
			"+created",
			500,
			0,
		)

		if err != nil {
			log.Printf("❌ Error listing companies: %v", err)
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "Erreur lors de la récupération des entreprises",
			})
		}

		var firstCompanyId string
		if len(records) > 0 {
			firstCompanyId = records[0].Id
		}

		collection, _ := pb.Dao().FindCollectionByNameOrId("companies")

		companies := make([]map[string]interface{}, len(records))
		for i, record := range records {
			companies[i] = map[string]interface{}{
				"id":                         record.Id,
				"collectionId":               collection.Id,
				"collectionName":             collection.Name,
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
				"is_first":                   record.Id == firstCompanyId,
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

		collection, _ := pb.Dao().FindCollectionByNameOrId("companies")

		firstCompanies, _ := pb.Dao().FindRecordsByFilter(
			"companies",
			"id != ''",
			"+created",
			1,
			0,
		)
		isFirst := len(firstCompanies) > 0 && firstCompanies[0].Id == record.Id

		return c.JSON(http.StatusOK, map[string]interface{}{
			"id":                         record.Id,
			"collectionId":               collection.Id,
			"collectionName":             collection.Name,
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

		collection, err := pb.Dao().FindCollectionByNameOrId("companies")
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "Collection companies non trouvée",
			})
		}

		record := models.NewRecord(collection)

		// ✅ Utiliser RecordUpsert form de PocketBase pour gérer correctement les fichiers
		form := forms.NewRecordUpsert(pb, record)

		// Charger les données depuis la requête multipart
		if err := form.LoadRequest(c.Request(), ""); err != nil {
			log.Printf("❌ Error loading request: %v", err)
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error":   "Erreur lors du chargement des données",
				"details": err.Error(),
			})
		}

		// Gérer is_default
		if form.Data()["is_default"] == "true" || form.Data()["is_default"] == true {
			removeDefaultFromOthers(pb)
		}

		// Valider et soumettre
		if err := form.Submit(); err != nil {
			log.Printf("❌ Error submitting form: %v", err)
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error":   "Erreur lors de la création",
				"details": err.Error(),
			})
		}

		log.Printf("✅ Company created: %s (logo: %s)", record.Id, record.GetString("logo"))

		return c.JSON(http.StatusCreated, map[string]interface{}{
			"id":      record.Id,
			"name":    record.GetString("name"),
			"logo":    record.GetString("logo"),
			"created": record.Created,
		})
	}, requireAdmin)

	// ✏️ Modifier une entreprise (admin only) - CORRIGÉ pour le logo
	router.PATCH("/api/companies/:id", func(c echo.Context) error {
		companyId := c.PathParam("id")
		log.Printf("✏️ PATCH /api/companies/%s", companyId)

		record, err := pb.Dao().FindRecordById("companies", companyId)
		if err != nil {
			return c.JSON(http.StatusNotFound, map[string]interface{}{
				"error": "Entreprise non trouvée",
			})
		}

		// ✅ Utiliser RecordUpsert form de PocketBase pour gérer correctement les fichiers
		form := forms.NewRecordUpsert(pb, record)

		// Charger les données depuis la requête multipart
		if err := form.LoadRequest(c.Request(), ""); err != nil {
			log.Printf("❌ Error loading request: %v", err)
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error":   "Erreur lors du chargement des données",
				"details": err.Error(),
			})
		}

		// Debug: afficher les données reçues
		log.Printf("📝 Form data: %+v", form.Data())

		// Vérifier si on a reçu des fichiers
		req := c.Request()
		if req.MultipartForm != nil && req.MultipartForm.File != nil {
			if files, ok := req.MultipartForm.File["logo"]; ok && len(files) > 0 {
				log.Printf("📁 Logo file received: %s (%d bytes)", files[0].Filename, files[0].Size)
			}
		}

		// Gérer is_default
		if form.Data()["is_default"] == "true" || form.Data()["is_default"] == true {
			removeDefaultFromOthers(pb)
		}

		// Valider et soumettre
		if err := form.Submit(); err != nil {
			log.Printf("❌ Error submitting form: %v", err)
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error":   "Erreur lors de la mise à jour",
				"details": err.Error(),
			})
		}

		log.Printf("✅ Company updated: %s (logo: %s)", companyId, record.GetString("logo"))

		return c.JSON(http.StatusOK, map[string]interface{}{
			"id":      record.Id,
			"name":    record.GetString("name"),
			"logo":    record.GetString("logo"),
			"updated": record.Updated,
		})
	}, requireAdmin)

	// 🗑️ Supprimer une entreprise (admin only, sauf la première)
	router.DELETE("/api/companies/:id", func(c echo.Context) error {
		companyId := c.PathParam("id")
		log.Printf("🗑️ DELETE /api/companies/%s", companyId)

		firstCompanies, err := pb.Dao().FindRecordsByFilter(
			"companies",
			"id != ''",
			"+created",
			1,
			0,
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

		usersWithCompany, _ := pb.Dao().FindRecordsByFilter(
			"users",
			"company = {:companyId}",
			"",
			100,
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
		100,
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

// Helper pour parser les valeurs boolean depuis form-data
func parseBool(s string) bool {
	b, _ := strconv.ParseBool(s)
	return b
}

// Helper pour parser les valeurs float depuis form-data
func parseFloat(s string) float64 {
	f, _ := strconv.ParseFloat(s, 64)
	return f
}
