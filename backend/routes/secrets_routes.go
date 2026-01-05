// backend/routes/secrets_routes.go
// ═══════════════════════════════════════════════════════════════════════════
// ROUTES API - GESTION DES SECRETS ET SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
// Ces routes permettent de gérer les clés API et autres secrets
// depuis l'interface d'administration.
// Toutes les routes nécessitent une authentification admin.
// ═══════════════════════════════════════════════════════════════════════════

package routes

import (
	"log"
	"net/http"
	"strings"

	"pocket-react/backend/secrets"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/tools/security"
)

// RegisterSecretsRoutes enregistre les routes pour la gestion des secrets
func RegisterSecretsRoutes(pb *pocketbase.PocketBase, router *echo.Echo) {
	log.Println("🔧 Registering secrets management routes...")

	sm := secrets.NewSecretManager(pb)

	// Middleware d'authentification admin
	requireAdmin := createAdminMiddleware(pb)

	// ═══════════════════════════════════════════════════════════════════════
	// ROUTES GÉNÉRIQUES POUR LES SECRETS
	// ═══════════════════════════════════════════════════════════════════════

	// GET /api/settings - Liste tous les settings (valeurs masquées pour les secrets)
	router.GET("/api/settings", func(c echo.Context) error {
		log.Println("📋 GET /api/settings")

		settings, err := sm.ListSettings()
		if err != nil {
			log.Printf("❌ Error listing settings: %v", err)
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "Erreur lors de la récupération des paramètres",
			})
		}

		return c.JSON(http.StatusOK, settings)
	}, requireAdmin)

	// POST /api/settings/secret - Créer/Mettre à jour un secret
	router.POST("/api/settings/secret", func(c echo.Context) error {
		log.Println("🔐 POST /api/settings/secret")

		var req struct {
			Key         string `json:"key"`
			Value       string `json:"value"`
			Description string `json:"description"`
			Category    string `json:"category"`
		}

		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Données invalides",
			})
		}

		// Validation
		if req.Key == "" || req.Value == "" {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "La clé et la valeur sont obligatoires",
			})
		}

		// Sauvegarder le secret chiffré
		if err := sm.SetSecret(req.Key, req.Value); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "Erreur lors de la sauvegarde du secret",
			})
		}

		// Mettre à jour la description si fournie
		if req.Description != "" || req.Category != "" {
			record, _ := pb.Dao().FindFirstRecordByFilter(
				"app_settings",
				"key = {:key}",
				map[string]interface{}{"key": req.Key},
			)
			if record != nil {
				if req.Description != "" {
					record.Set("description", req.Description)
				}
				if req.Category != "" {
					record.Set("category", req.Category)
				}
				pb.Dao().SaveRecord(record)
			}
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Secret sauvegardé avec succès",
			"key":     req.Key,
		})
	}, requireAdmin)

	// GET /api/settings/secret/:key/status - Vérifie si un secret existe
	router.GET("/api/settings/secret/:key/status", func(c echo.Context) error {
		key := c.PathParam("key")
		log.Printf("🔍 GET /api/settings/secret/%s/status", key)

		exists := sm.HasSecret(key)

		return c.JSON(http.StatusOK, map[string]interface{}{
			"key":        key,
			"configured": exists,
		})
	}, requireAdmin)

	// DELETE /api/settings/secret/:key - Supprimer un secret
	router.DELETE("/api/settings/secret/:key", func(c echo.Context) error {
		key := c.PathParam("key")
		log.Printf("🗑️ DELETE /api/settings/secret/%s", key)

		if err := sm.DeleteSecret(key); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "Erreur lors de la suppression",
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Secret supprimé",
		})
	}, requireAdmin)

	// ═══════════════════════════════════════════════════════════════════════
	// ROUTES SPÉCIFIQUES POUR LA CLÉ API NOTIFICATIONS
	// ═══════════════════════════════════════════════════════════════════════

	// POST /api/settings/notification-key - Sauvegarder la clé API notifications
	router.POST("/api/settings/notification-key", func(c echo.Context) error {
		log.Println("🔔 POST /api/settings/notification-key")

		var req struct {
			APIKey string `json:"api_key"`
		}

		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Données invalides",
			})
		}

		if req.APIKey == "" {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "La clé API est obligatoire",
			})
		}

		if err := sm.SetSecret(secrets.KeyNotificationAPI, req.APIKey); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "Erreur lors de la sauvegarde de la clé API",
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Clé API notifications sauvegardée",
		})
	}, requireAdmin)

	// GET /api/settings/notification-key/status - Vérifie si la clé est configurée
	router.GET("/api/settings/notification-key/status", func(c echo.Context) error {
		log.Println("🔍 GET /api/settings/notification-key/status")

		exists := sm.HasSecret(secrets.KeyNotificationAPI)

		return c.JSON(http.StatusOK, map[string]interface{}{
			"configured": exists,
		})
	}, requireAdmin)

	// DELETE /api/settings/notification-key - Supprimer la clé API notifications
	router.DELETE("/api/settings/notification-key", func(c echo.Context) error {
		log.Println("🗑️ DELETE /api/settings/notification-key")

		if err := sm.DeleteSecret(secrets.KeyNotificationAPI); err != nil {
			return c.JSON(http.StatusNotFound, map[string]interface{}{
				"error": "Clé API non trouvée",
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Clé API notifications supprimée",
		})
	}, requireAdmin)

	// ═══════════════════════════════════════════════════════════════════════
	// ROUTES POUR LE WEBHOOK SECRET
	// ═══════════════════════════════════════════════════════════════════════

	// POST /api/settings/webhook-secret - Sauvegarder le secret webhook
	router.POST("/api/settings/webhook-secret", func(c echo.Context) error {
		log.Println("🔗 POST /api/settings/webhook-secret")

		var req struct {
			Secret string `json:"secret"`
		}

		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Données invalides",
			})
		}

		// Générer un secret aléatoire si non fourni
		secret := req.Secret
		if secret == "" {
			secret = security.RandomString(32)
		}

		if err := sm.SetSecret(secrets.KeyWebhookSecret, secret); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "Erreur lors de la sauvegarde",
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success":   true,
			"message":   "Secret webhook sauvegardé",
			"generated": req.Secret == "", // Indique si le secret a été auto-généré
		})
	}, requireAdmin)

	// GET /api/settings/webhook-secret/status - Vérifie si le secret existe
	router.GET("/api/settings/webhook-secret/status", func(c echo.Context) error {
		exists := sm.HasSecret(secrets.KeyWebhookSecret)
		return c.JSON(http.StatusOK, map[string]interface{}{
			"configured": exists,
		})
	}, requireAdmin)

	log.Println("✅ Secrets management routes registered successfully")
}

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE D'AUTHENTIFICATION
// ═══════════════════════════════════════════════════════════════════════════

// createAdminMiddleware crée un middleware qui vérifie l'authentification admin
func createAdminMiddleware(pb *pocketbase.PocketBase) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			// 1. Récupérer le token
			token := c.Request().Header.Get("Authorization")
			token = strings.TrimPrefix(token, "Bearer ")
			token = strings.TrimSpace(token)

			if token == "" {
				return c.JSON(http.StatusUnauthorized, map[string]interface{}{
					"error": "Non authentifié",
				})
			}

			// 2. Parser le token
			claims, err := security.ParseUnverifiedJWT(token)
			if err != nil {
				return c.JSON(http.StatusUnauthorized, map[string]interface{}{
					"error": "Token invalide",
				})
			}

			// 3. Extraire l'ID utilisateur
			userId, ok := claims["id"].(string)
			if !ok || userId == "" {
				return c.JSON(http.StatusUnauthorized, map[string]interface{}{
					"error": "Token invalide - pas d'ID utilisateur",
				})
			}

			// 4. Récupérer l'utilisateur
			record, err := pb.Dao().FindRecordById("users", userId)
			if err != nil {
				return c.JSON(http.StatusUnauthorized, map[string]interface{}{
					"error": "Utilisateur non trouvé",
				})
			}

			// 5. Vérifier le rôle admin
			role := record.GetString("role")
			if role != "admin" {
				return c.JSON(http.StatusForbidden, map[string]interface{}{
					"error": "Accès réservé aux administrateurs",
				})
			}

			// 6. Stocker l'utilisateur dans le contexte
			c.Set("authRecord", record)
			c.Set(apis.ContextAuthRecordKey, record)

			return next(c)
		}
	}
}

// GetSecretManager retourne une instance du SecretManager
// Utile pour les autres routes qui ont besoin d'accéder aux secrets
func GetSecretManager(pb *pocketbase.PocketBase) *secrets.SecretManager {
	return secrets.NewSecretManager(pb)
}

// Helper pour récupérer un secret depuis d'autres routes
func GetNotificationAPIKey(pb *pocketbase.PocketBase) (string, error) {
	sm := secrets.NewSecretManager(pb)
	return sm.GetSecret(secrets.KeyNotificationAPI)
}

// Helper pour récupérer le webhook secret
func GetWebhookSecret(pb *pocketbase.PocketBase) (string, error) {
	sm := secrets.NewSecretManager(pb)
	return sm.GetSecret(secrets.KeyWebhookSecret)
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER POUR LES AUTRES MODULES
// ═══════════════════════════════════════════════════════════════════════════

// SecretManagerInstance garde une référence globale (optionnel)
var secretManagerInstance *secrets.SecretManager
var secretManagerPB *pocketbase.PocketBase

// InitSecretManager initialise le gestionnaire de secrets
func InitSecretManager(pb *pocketbase.PocketBase) {
	secretManagerPB = pb
	secretManagerInstance = secrets.NewSecretManager(pb)
}

// GetGlobalSecretManager retourne l'instance globale du SecretManager
func GetGlobalSecretManager() *secrets.SecretManager {
	if secretManagerInstance == nil && secretManagerPB != nil {
		secretManagerInstance = secrets.NewSecretManager(secretManagerPB)
	}
	return secretManagerInstance
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES EXPORTÉS
// ═══════════════════════════════════════════════════════════════════════════

// SecretStatus représente le statut d'un secret
type SecretStatus struct {
	Key        string `json:"key"`
	Configured bool   `json:"configured"`
}

// SecretInfo représente les infos d'un secret (sans la valeur)
type SecretInfo struct {
	ID          string `json:"id"`
	Key         string `json:"key"`
	Encrypted   bool   `json:"encrypted"`
	Description string `json:"description"`
	Category    string `json:"category"`
}

// Pour permettre aux autres modules d'utiliser le SecretManager
type AuthRecord = models.Record
