package backend

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
)

type SetupRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type SetupResponse struct {
	NeedsSetup bool   `json:"needsSetup"`
	Message    string `json:"message,omitempty"`
}

// RegisterSetupRoutes enregistre les routes pour le setup initial
func RegisterSetupRoutes(app *pocketbase.PocketBase, router *echo.Echo) {
	// Route pour vérifier si le setup est nécessaire
	router.GET("/api/setup/status", func(c echo.Context) error {
		// Vérifie s'il existe déjà un user dans la collection users
		collection, err := app.Dao().FindCollectionByNameOrId("users")
		if err != nil {
			return c.JSON(http.StatusOK, SetupResponse{
				NeedsSetup: true,
			})
		}

		// Compte le nombre de users avec une requête SQL directe
		var count int
		err = app.Dao().DB().
			Select("COUNT(*)").
			From(collection.Name).
			Row(&count)

		if err != nil || count == 0 {
			return c.JSON(http.StatusOK, SetupResponse{
				NeedsSetup: true,
			})
		}

		return c.JSON(http.StatusOK, SetupResponse{
			NeedsSetup: false,
		})
	})

	// Route pour créer le premier user
	router.POST("/api/setup/create-admin", func(c echo.Context) error {
		// Vérifie d'abord si un user existe déjà
		collection, err := app.Dao().FindCollectionByNameOrId("users")
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": "Collection users introuvable",
			})
		}

		// Compte le nombre de users avec une requête SQL directe
		var count int
		err = app.Dao().DB().
			Select("COUNT(*)").
			From(collection.Name).
			Row(&count)

		if err == nil && count > 0 {
			return c.JSON(http.StatusForbidden, map[string]string{
				"error": "Un utilisateur existe déjà",
			})
		}

		var req SetupRequest
		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Données invalides",
			})
		}

		// Validation basique
		if req.Email == "" || req.Password == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Email et mot de passe requis",
			})
		}

		if len(req.Password) < 8 {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Le mot de passe doit contenir au moins 8 caractères",
			})
		}

		// Crée le premier user
		record := models.NewRecord(collection)
		
		// Génère un username depuis l'email (prend la partie avant @)
		username := strings.Split(req.Email, "@")[0]
		
		// Important : définir les champs AVANT de définir le password
		record.Set("username", username)
		record.Set("email", req.Email)
		record.Set("emailVisibility", true)
		record.Set("verified", true) // Vérifié automatiquement pour le premier user
		
		// Si la collection a un champ role ou is_admin, définissez-le
		if collection.Schema.GetFieldByName("role") != nil {
			record.Set("role", "admin")
		}
		if collection.Schema.GetFieldByName("is_admin") != nil {
			record.Set("is_admin", true)
		}
		
		// Définir le password après les autres champs
		record.SetPassword(req.Password)

		if err := app.Dao().SaveRecord(record); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": "Impossible de créer l'utilisateur: " + err.Error(),
			})
		}

		return c.JSON(http.StatusCreated, SetupResponse{
			NeedsSetup: false,
			Message:    "Utilisateur créé avec succès",
		})
	})
}