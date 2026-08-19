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
	router.GET("/api/app-settings", func(c echo.Context) error {
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

	// la clé API PocketApp stockée dans app_settings.
	// Ne retourne que la clé "pocketapp_api_key" — aucune autre valeur sensible.
	router.GET("/api/settings/pocketapp-key", func(c echo.Context) error {
		key, err := sm.GetSecret("notification_api_key")
		if err != nil || key == "" {
			return c.JSON(http.StatusOK, map[string]interface{}{
				"configured": false,
				"api_key":    "",
			})
		}
		return c.JSON(http.StatusOK, map[string]interface{}{
			"configured": true,
			"api_key":    key,
		})
	})

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

	// ═══════════════════════════════════════════════════════════════════════
	// ROUTES POUR LA PUBLICATION DU SITE (ticket 5b)
	// ═══════════════════════════════════════════════════════════════════════
	//
	// Deux valeurs, de nature différente, réglées ensemble parce qu'elles n'ont
	// aucun sens l'une sans l'autre :
	//   - la clé X-API-Key      → chiffrée (SetSecret)
	//   - l'URL de l'endpoint   → en clair (SetSetting), ce n'est pas un secret
	//
	// AUCUNE ROUTE NE RELIT LA CLÉ. C'est délibéré : le front n'en a pas besoin
	// — au ticket 6, il enverra le document composé et c'est le Go qui ira
	// chercher la clé pour poser l'en-tête. La clé ne descend jamais dans le
	// renderer. C'est précisément ce que fait GET /api/settings/pocketapp-key
	// pour le mini-SaaS (:125), et ce qu'on ne reproduit pas ici.

	// POST /api/settings/site-publish - Enregistrer la clé et/ou l'URL
	router.POST("/api/settings/site-publish", func(c echo.Context) error {
		log.Println("🌐 POST /api/settings/site-publish")

		var req struct {
			APIKey      string `json:"api_key"`
			EndpointURL string `json:"endpoint_url"`
		}

		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Données invalides",
			})
		}

		req.APIKey = strings.TrimSpace(req.APIKey)
		req.EndpointURL = strings.TrimSpace(req.EndpointURL)

		if req.APIKey == "" && req.EndpointURL == "" {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Renseignez au moins la clé ou l'URL",
			})
		}

		// L'URL est facultative à chaque appel : on peut changer la clé sans
		// retaper l'URL, et l'inverse.
		if req.EndpointURL != "" {
			if !strings.HasPrefix(req.EndpointURL, "http://") &&
				!strings.HasPrefix(req.EndpointURL, "https://") {
				return c.JSON(http.StatusBadRequest, map[string]interface{}{
					"error": "L'URL doit être absolue et commencer par http:// ou https://",
				})
			}
			if err := sm.SetSetting(secrets.SettingSitePublishURL, req.EndpointURL); err != nil {
				log.Printf("❌ Error saving site publish URL: %v", err)
				return c.JSON(http.StatusInternalServerError, map[string]interface{}{
					"error": "Erreur lors de la sauvegarde de l'URL",
				})
			}
		}

		if req.APIKey != "" {
			if err := sm.SetSecret(secrets.KeySitePublishAPI, req.APIKey); err != nil {
				log.Printf("❌ Error saving site publish key: %v", err)
				return c.JSON(http.StatusInternalServerError, map[string]interface{}{
					"error": "Erreur lors de la sauvegarde de la clé API",
				})
			}
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Paramètres de publication enregistrés",
		})
	}, requireAdmin)

	// GET /api/settings/site-publish/status - État de la configuration
	//
	// Renvoie l'URL, jamais la clé — seulement le fait qu'elle existe.
	router.GET("/api/settings/site-publish/status", func(c echo.Context) error {
		url, err := sm.GetSetting(secrets.SettingSitePublishURL)
		if err != nil {
			url = "" // réglage jamais écrit : ce n'est pas une erreur
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"configured":   sm.HasSecret(secrets.KeySitePublishAPI),
			"endpoint_url": url,
		})
	}, requireAdmin)

	// DELETE /api/settings/site-publish - Supprimer la clé
	//
	// L'URL est conservée : elle n'est pas sensible, et la retaper à chaque
	// rotation de clé n'apporte rien.
	router.DELETE("/api/settings/site-publish", func(c echo.Context) error {
		log.Println("🗑️ DELETE /api/settings/site-publish")

		if err := sm.DeleteSecret(secrets.KeySitePublishAPI); err != nil {
			return c.JSON(http.StatusNotFound, map[string]interface{}{
				"error": "Clé API non trouvée",
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Clé API de publication supprimée",
		})
	}, requireAdmin)

	// ═══════════════════════════════════════════════════════════════════════
	// EXPORT DU CATALOGUE VERS LA BASE SQL AXEMUSIQUE
	// ═══════════════════════════════════════════════════════════════════════
	//
	// Même forme que le trio ci-dessus, et pour les mêmes raisons — clé
	// chiffrée, URL en clair, aucune route qui relise la clé.
	//
	// Réglages SÉPARÉS de ceux de la publication du menu, et ce n'est pas une
	// duplication par facilité : la clé du menu autorise à écrire un fichier
	// JSON de quelques kilo-octets, celle-ci à ÉCRIRE DANS LA BASE DE DONNÉES
	// du catalogue. Deux portées, deux durées de vie ; révoquer l'une ne doit
	// pas condamner l'autre. Côté serveur, ce sont deux entrées distinctes de
	// config.php (`api_key` et `catalog_api_key`).

	// POST /api/settings/site-catalog - Enregistrer la clé et/ou l'URL
	router.POST("/api/settings/site-catalog", func(c echo.Context) error {
		log.Println("🌐 POST /api/settings/site-catalog")

		var req struct {
			APIKey      string `json:"api_key"`
			EndpointURL string `json:"endpoint_url"`
			// URL du MIROIR D'IMAGES. Réglage distinct de l'export d'entités —
			// deux scripts, parce que leurs plafonds de corps n'ont rien à voir
			// (§4.4 de PocketSite-docs/16-conception-images.md) — mais la MÊME
			// clé : même base, même portée d'écriture.
			//
			// C'est ICI qu'il s'enregistre, et pas sur la route du menu : le
			// formulaire poste sur /api/settings/site-catalog, et `c.Bind`
			// ignore en SILENCE un champ non déclaré. Mesuré le 19 août 2026 —
			// l'URL n'arrivait jamais en base, GET .../status la relisait
			// pourtant, et le seul symptôme était le refus « Renseignez au
			// moins la clé ou l'URL » quand ce champ était le seul modifié.
			ImagesURL string `json:"images_url"`
		}

		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Données invalides",
			})
		}

		req.APIKey = strings.TrimSpace(req.APIKey)
		req.EndpointURL = strings.TrimSpace(req.EndpointURL)
		req.ImagesURL = strings.TrimSpace(req.ImagesURL)

		if req.APIKey == "" && req.EndpointURL == "" && req.ImagesURL == "" {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Renseignez au moins la clé ou une URL",
			})
		}

		if req.ImagesURL != "" {
			if !strings.HasPrefix(req.ImagesURL, "http://") &&
				!strings.HasPrefix(req.ImagesURL, "https://") {
				return c.JSON(http.StatusBadRequest, map[string]interface{}{
					"error": "L'URL du miroir d'images doit être absolue et commencer par http:// ou https://",
				})
			}
			if err := sm.SetSetting(secrets.SettingSiteImagesURL, req.ImagesURL); err != nil {
				log.Printf("❌ Error saving site images URL: %v", err)
				return c.JSON(http.StatusInternalServerError, map[string]interface{}{
					"error": "Erreur lors de la sauvegarde de l'URL du miroir d'images",
				})
			}
		}

		if req.EndpointURL != "" {
			if !strings.HasPrefix(req.EndpointURL, "http://") &&
				!strings.HasPrefix(req.EndpointURL, "https://") {
				return c.JSON(http.StatusBadRequest, map[string]interface{}{
					"error": "L'URL doit être absolue et commencer par http:// ou https://",
				})
			}
			if err := sm.SetSetting(secrets.SettingSiteCatalogURL, req.EndpointURL); err != nil {
				log.Printf("❌ Error saving site catalog URL: %v", err)
				return c.JSON(http.StatusInternalServerError, map[string]interface{}{
					"error": "Erreur lors de la sauvegarde de l'URL",
				})
			}
		}

		if req.APIKey != "" {
			if err := sm.SetSecret(secrets.KeySiteCatalogAPI, req.APIKey); err != nil {
				log.Printf("❌ Error saving site catalog key: %v", err)
				return c.JSON(http.StatusInternalServerError, map[string]interface{}{
					"error": "Erreur lors de la sauvegarde de la clé API",
				})
			}
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Paramètres d'export du catalogue enregistrés",
		})
	}, requireAdmin)

	// GET /api/settings/site-catalog/status - État de la configuration
	router.GET("/api/settings/site-catalog/status", func(c echo.Context) error {
		url, err := sm.GetSetting(secrets.SettingSiteCatalogURL)
		if err != nil {
			url = ""
		}

		imagesURL, err := sm.GetSetting(secrets.SettingSiteImagesURL)
		if err != nil {
			imagesURL = ""
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"configured":   sm.HasSecret(secrets.KeySiteCatalogAPI),
			"endpoint_url": url,
			"images_url":   imagesURL,
		})
	}, requireAdmin)

	// DELETE /api/settings/site-catalog - Supprimer la clé
	router.DELETE("/api/settings/site-catalog", func(c echo.Context) error {
		log.Println("🗑️ DELETE /api/settings/site-catalog")

		if err := sm.DeleteSecret(secrets.KeySiteCatalogAPI); err != nil {
			return c.JSON(http.StatusNotFound, map[string]interface{}{
				"error": "Clé API non trouvée",
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Clé API d'export du catalogue supprimée",
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
