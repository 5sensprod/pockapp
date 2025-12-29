// backend/routes/setup_routes.go
package routes

import (
	"log"
	"net/http"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"

	"pocket-react/backend/migrations"
)

type SetupRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

type SetupResponse struct {
	NeedsSetup bool   `json:"needsSetup"`
	Message    string `json:"message,omitempty"`
}

// hasAnyUser retourne true si au moins un utilisateur existe dans _pb_users_auth_
func hasAnyUser(app *pocketbase.PocketBase) (bool, error) {
	usersCollection, err := app.Dao().FindCollectionByNameOrId("_pb_users_auth_")
	if err != nil {
		return false, err
	}

	var total int
	err = app.Dao().DB().
		Select("COUNT(*)").
		From(usersCollection.Name).
		Row(&total)
	if err != nil {
		return false, err
	}

	return total > 0, nil
}

// RegisterSetupRoutes enregistre les routes de setup initial (création du premier admin)
func RegisterSetupRoutes(app *pocketbase.PocketBase, e *echo.Echo) {
	// Vérifie si le setup est nécessaire
	e.GET("/api/setup/status", func(c echo.Context) error {
		hasUser, err := hasAnyUser(app)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": "Impossible de vérifier l'état du setup",
			})
		}

		if !hasUser {
			return c.JSON(http.StatusOK, SetupResponse{
				NeedsSetup: true,
				Message:    "Aucun utilisateur trouvé, le setup est requis.",
			})
		}

		return c.JSON(http.StatusOK, SetupResponse{
			NeedsSetup: false,
			Message:    "Un utilisateur existe déjà, le setup n'est pas nécessaire.",
		})
	})

	// Crée le premier utilisateur (admin)
	e.POST("/api/setup/create-admin", func(c echo.Context) error {
		// Sécurité : empêcher de rejouer le setup si un user existe déjà
		hasUser, err := hasAnyUser(app)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": "Impossible de vérifier les utilisateurs existants",
			})
		}

		if hasUser {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Le setup a déjà été effectué.",
			})
		}

		var req SetupRequest
		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Requête invalide.",
			})
		}

		req.Email = strings.TrimSpace(req.Email)
		req.Name = strings.TrimSpace(req.Name)

		if req.Email == "" || req.Password == "" || req.Name == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Email, mot de passe et nom sont obligatoires.",
			})
		}

		email := strings.ToLower(req.Email)

		// Vérifier que l'email n'existe pas déjà
		existingByEmail, _ := app.Dao().FindAuthRecordByEmail("_pb_users_auth_", email)
		if existingByEmail != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Un utilisateur avec cet email existe déjà.",
			})
		}

		// Récupération de la collection users auth
		usersCollection, err := app.Dao().FindCollectionByNameOrId("_pb_users_auth_")
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": "Impossible de récupérer la collection des utilisateurs",
			})
		}

		// Création du record utilisateur
		record := models.NewRecord(usersCollection)

		// Email
		record.SetEmail(email)

		// Username auto-généré à partir de l'email
		username := email
		if parts := strings.Split(email, "@"); len(parts) > 1 && parts[0] != "" {
			username = parts[0]
		}
		record.Set("username", username)

		// 🆕 Nom de l'utilisateur (affiché dans le header)
		record.Set("name", req.Name)

		// On peut marquer l'email comme vérifié pour le premier admin
		record.Set("verified", true)

		// Mot de passe
		record.SetPassword(req.Password)

		if err := app.Dao().SaveRecord(record); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": "Impossible de créer l'utilisateur: " + err.Error(),
			})
		}

		// 🔄 Relancer les migrations après la création du premier user
		if err := migrations.RunMigrations(app); err != nil {
			log.Println("Erreur lors des migrations après setup:", err)
			// On ne bloque pas la réponse au client
		}

		return c.JSON(http.StatusCreated, SetupResponse{
			NeedsSetup: false,
			Message:    "Utilisateur créé avec succès",
		})
	})
}
