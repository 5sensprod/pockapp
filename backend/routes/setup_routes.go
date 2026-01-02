// backend/routes/setup_routes.go
package routes

import (
	"log"
	"net/http"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
)

func RegisterSetupRoutes(pb *pocketbase.PocketBase, router *echo.Echo) {
	// Vérifier le statut du setup
	router.GET("/api/setup/status", func(c echo.Context) error {
		collection, err := pb.Dao().FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Setup status - collection users not found: %v", err)
			return c.JSON(http.StatusOK, map[string]interface{}{
				"needsSetup": true,
			})
		}

		var count int
		err = pb.Dao().DB().
			Select("COUNT(*)").
			From(collection.Name).
			Row(&count)

		if err != nil || count == 0 {
			return c.JSON(http.StatusOK, map[string]interface{}{
				"needsSetup": true,
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"needsSetup": false,
			"userCount":  count,
		})
	})

	// Créer l'administrateur initial (premier utilisateur)
	router.POST("/api/setup/create-admin", func(c echo.Context) error {
		type CreateAdminRequest struct {
			Name     string `json:"name"`
			Email    string `json:"email"`
			Password string `json:"password"`
		}

		var req CreateAdminRequest
		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Données invalides",
			})
		}

		// Validation
		if req.Name == "" || req.Email == "" || req.Password == "" {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Tous les champs sont obligatoires",
			})
		}

		if len(req.Password) < 8 {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Le mot de passe doit contenir au moins 8 caractères",
			})
		}

		collection, err := pb.Dao().FindCollectionByNameOrId("users")
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "Collection users non trouvée",
			})
		}

		// Vérifier qu'il n'y a pas déjà d'utilisateurs
		var count int
		err = pb.Dao().DB().
			Select("COUNT(*)").
			From(collection.Name).
			Row(&count)

		if err == nil && count > 0 {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Le setup a déjà été effectué",
			})
		}

		// Créer le premier utilisateur avec le rôle admin
		record := models.NewRecord(collection)
		record.Set("name", req.Name)
		record.Set("email", req.Email)
		record.Set("role", "admin") // 🔑 Rôle admin automatique
		record.SetPassword(req.Password)

		if err := pb.Dao().SaveRecord(record); err != nil {
			log.Printf("Error creating admin: %v", err)
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "Erreur lors de la création de l'administrateur",
			})
		}

		log.Printf("Admin user created: %s (role: admin)", req.Email)

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Administrateur créé avec succès",
		})
	})
}
