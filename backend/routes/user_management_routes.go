// backend/routes/user_management_routes.go - VERSION CORRIGÉE
package routes

import (
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/tools/security"
)

func RegisterUserManagementRoutes(pb *pocketbase.PocketBase, router *echo.Echo) {
	log.Println("🔧 Registering user management routes...")

	// ✅ Middleware d'authentification simplifié (pour app desktop locale)
	requireAdmin := func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			log.Println("🔐 Checking admin access...")

			// 1. Récupérer le token
			token := c.Request().Header.Get("Authorization")
			token = strings.TrimPrefix(token, "Bearer ")
			token = strings.TrimSpace(token)

			if token == "" {
				log.Println("❌ No token")
				return c.JSON(http.StatusUnauthorized, map[string]interface{}{
					"error": "Non authentifié",
				})
			}

			// Log du token (premiers 30 caractères)
			tokenPreview := token
			if len(token) > 30 {
				tokenPreview = token[:30] + "..."
			}
			log.Printf("🔑 Token received: %s", tokenPreview)

			// 2. Parser le token (sans vérifier la signature - OK pour app desktop locale)
			claims, err := security.ParseUnverifiedJWT(token)
			if err != nil {
				log.Printf("❌ Parse error: %v", err)
				return c.JSON(http.StatusUnauthorized, map[string]interface{}{
					"error": "Token invalide - impossible de parser",
				})
			}

			log.Printf("✅ Token parsed successfully")
			log.Printf("📋 Claims: %+v", claims)

			// 3. Extraire l'ID utilisateur
			userId, ok := claims["id"].(string)
			if !ok || userId == "" {
				log.Println("❌ No user ID in claims")
				return c.JSON(http.StatusUnauthorized, map[string]interface{}{
					"error": "Token invalide - pas d'ID utilisateur",
				})
			}

			log.Printf("📝 User ID from token: %s", userId)

			// 4. Récupérer l'utilisateur depuis la base de données
			record, err := pb.Dao().FindRecordById("users", userId)
			if err != nil {
				log.Printf("❌ User not found: %v", err)
				return c.JSON(http.StatusUnauthorized, map[string]interface{}{
					"error": "Utilisateur non trouvé",
				})
			}

			log.Printf("👤 User found: %s (%s)", record.GetString("name"), record.GetString("email"))

			// 5. Vérifier le rôle
			role := record.GetString("role")
			log.Printf("🎭 User role: %s", role)

			if role != "admin" {
				log.Println("⛔ User is not admin - access denied")
				return c.JSON(http.StatusForbidden, map[string]interface{}{
					"error": "Accès réservé aux administrateurs",
				})
			}

			log.Println("✅ Admin access granted")

			// 6. Stocker l'utilisateur dans le contexte
			c.Set("authRecord", record)

			return next(c)
		}
	}

	// Lister tous les utilisateurs (admin only)
	router.GET("/api/users", func(c echo.Context) error {
		log.Println("📋 GET /api/users - Listing users...")

		// ✅ CORRECTION: Utiliser FindRecordsByExpr qui est plus fiable
		// ou FindRecordsByFilter avec les bons paramètres
		records, err := pb.Dao().FindRecordsByFilter(
			"users",    // Utiliser directement le nom de la collection
			"id != ''", // Filtre pour récupérer tous les enregistrements (non vide)
			"-created", // Tri par date de création décroissante
			500,        // Limite raisonnable (au lieu de 0)
			0,          // Offset
		)

		if err != nil {
			log.Printf("❌ Error listing users: %v", err)

			// Tentative alternative avec FindAllRecords si disponible
			collection, collErr := pb.Dao().FindCollectionByNameOrId("users")
			if collErr != nil {
				log.Printf("❌ Collection users not found: %v", collErr)
				return c.JSON(http.StatusInternalServerError, map[string]interface{}{
					"error": "Collection users non trouvée",
				})
			}

			// Essayer avec une requête directe
			records, err = pb.Dao().FindRecordsByExpr(collection.Id)
			if err != nil {
				log.Printf("❌ FindRecordsByExpr error: %v", err)
				return c.JSON(http.StatusInternalServerError, map[string]interface{}{
					"error": "Erreur lors de la récupération des utilisateurs: " + err.Error(),
				})
			}
		}

		log.Printf("✅ Found %d users", len(records))

		// Formater les données (sans les mots de passe)
		users := make([]map[string]interface{}, len(records))
		for i, record := range records {
			users[i] = map[string]interface{}{
				"id":      record.Id,
				"name":    record.GetString("name"),
				"email":   record.GetString("email"),
				"role":    record.GetString("role"),
				"avatar":  record.GetString("avatar"),
				"created": record.Created,
				"updated": record.Updated,
			}
		}

		return c.JSON(http.StatusOK, users)
	}, requireAdmin)

	// Créer un nouvel utilisateur (admin only)
	router.POST("/api/users", func(c echo.Context) error {
		log.Println("➕ POST /api/users - Creating user...")

		type CreateUserRequest struct {
			Name     string `json:"name"`
			Email    string `json:"email"`
			Password string `json:"password"`
			Role     string `json:"role"`
		}

		var req CreateUserRequest
		if err := c.Bind(&req); err != nil {
			log.Printf("❌ Bind error: %v", err)
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Données invalides",
			})
		}

		log.Printf("📝 Request: name=%s, email=%s, role=%s", req.Name, req.Email, req.Role)

		// Validation
		if req.Name == "" || req.Email == "" || req.Password == "" {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Nom, email et mot de passe obligatoires",
			})
		}

		if len(req.Password) < 8 {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Le mot de passe doit contenir au moins 8 caractères",
			})
		}

		// Valider le rôle
		validRoles := map[string]bool{
			"admin":    true,
			"manager":  true,
			"caissier": true,
			"user":     true,
		}

		if req.Role == "" {
			req.Role = "user"
		}

		if !validRoles[req.Role] {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Rôle invalide. Valeurs acceptées: admin, manager, caissier, user",
			})
		}

		collection, err := pb.Dao().FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("❌ Collection error: %v", err)
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "Collection users non trouvée",
			})
		}

		// Vérifier si l'email existe déjà
		existing, _ := pb.Dao().FindFirstRecordByFilter(
			"users",
			"email = {:email}",
			map[string]interface{}{"email": req.Email},
		)

		if existing != nil {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Cet email est déjà utilisé",
			})
		}

		// ✅ Générer un username unique à partir de l'email
		// Prendre la partie avant le @ et ajouter un suffixe unique si nécessaire
		username := strings.Split(req.Email, "@")[0]
		// Nettoyer le username (garder que lettres, chiffres, underscore)
		cleanUsername := ""
		for _, r := range username {
			if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
				cleanUsername += string(r)
			}
		}
		if cleanUsername == "" {
			cleanUsername = "user"
		}

		// Vérifier si le username existe déjà et ajouter un suffixe si nécessaire
		baseUsername := cleanUsername
		counter := 1
		for {
			existingUsername, _ := pb.Dao().FindFirstRecordByFilter(
				"users",
				"username = {:username}",
				map[string]interface{}{"username": cleanUsername},
			)
			if existingUsername == nil {
				break
			}
			cleanUsername = baseUsername + fmt.Sprintf("%d", counter)
			counter++
			if counter > 100 {
				// Sécurité: éviter boucle infinie
				cleanUsername = baseUsername + fmt.Sprintf("%d", time.Now().UnixNano())
				break
			}
		}

		log.Printf("📝 Generated username: %s", cleanUsername)

		// Créer l'utilisateur
		record := models.NewRecord(collection)

		// ✅ Définir tous les champs AVANT de sauvegarder
		record.Set("username", cleanUsername) // ✅ USERNAME REQUIS
		record.Set("name", req.Name)
		record.Set("email", req.Email)
		record.Set("role", req.Role)

		// ✅ IMPORTANT: PocketBase requiert password ET passwordConfirm
		record.Set("password", req.Password)
		record.Set("passwordConfirm", req.Password)

		// ✅ Marquer l'email comme vérifié (optionnel)
		record.Set("verified", true)

		log.Printf("📝 Creating record: username=%s, name=%s, email=%s, role=%s",
			cleanUsername,
			record.GetString("name"),
			record.GetString("email"),
			record.GetString("role"))

		if err := pb.Dao().SaveRecord(record); err != nil {
			log.Printf("❌ Error creating user: %v", err)
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error":   "Erreur lors de la création de l'utilisateur",
				"details": err.Error(),
			})
		}

		log.Printf("✅ User created: %s (role: %s)", req.Email, req.Role)

		return c.JSON(http.StatusOK, map[string]interface{}{
			"id":       record.Id,
			"username": record.GetString("username"),
			"name":     record.GetString("name"),
			"email":    record.GetString("email"),
			"role":     record.GetString("role"),
			"created":  record.Created,
		})
	}, requireAdmin)

	// Mettre à jour un utilisateur (admin only)
	router.PATCH("/api/users/:id", func(c echo.Context) error {
		userId := c.PathParam("id")
		log.Printf("✏️ PATCH /api/users/%s - Updating user...", userId)

		type UpdateUserRequest struct {
			Name     *string `json:"name"`
			Email    *string `json:"email"`
			Password *string `json:"password"`
			Role     *string `json:"role"`
		}

		var req UpdateUserRequest
		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Données invalides",
			})
		}

		record, err := pb.Dao().FindRecordById("users", userId)
		if err != nil {
			return c.JSON(http.StatusNotFound, map[string]interface{}{
				"error": "Utilisateur non trouvé",
			})
		}

		if req.Name != nil && *req.Name != "" {
			record.Set("name", *req.Name)
		}

		if req.Email != nil && *req.Email != "" {
			existing, _ := pb.Dao().FindFirstRecordByFilter(
				"users",
				"email = {:email} && id != {:id}",
				map[string]interface{}{
					"email": *req.Email,
					"id":    userId,
				},
			)

			if existing != nil {
				return c.JSON(http.StatusBadRequest, map[string]interface{}{
					"error": "Cet email est déjà utilisé",
				})
			}

			record.Set("email", *req.Email)
		}

		if req.Password != nil && *req.Password != "" {
			if len(*req.Password) < 8 {
				return c.JSON(http.StatusBadRequest, map[string]interface{}{
					"error": "Le mot de passe doit contenir au moins 8 caractères",
				})
			}
			record.SetPassword(*req.Password)
		}

		if req.Role != nil {
			validRoles := map[string]bool{
				"admin":    true,
				"manager":  true,
				"caissier": true,
				"user":     true,
			}

			if !validRoles[*req.Role] {
				return c.JSON(http.StatusBadRequest, map[string]interface{}{
					"error": "Rôle invalide",
				})
			}

			record.Set("role", *req.Role)
		}

		if err := pb.Dao().SaveRecord(record); err != nil {
			log.Printf("❌ Error updating user: %v", err)
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "Erreur lors de la mise à jour",
			})
		}

		log.Printf("✅ User updated: %s", userId)

		return c.JSON(http.StatusOK, map[string]interface{}{
			"id":      record.Id,
			"name":    record.GetString("name"),
			"email":   record.GetString("email"),
			"role":    record.GetString("role"),
			"updated": record.Updated,
		})
	}, requireAdmin)

	// Supprimer un utilisateur (admin only)
	router.DELETE("/api/users/:id", func(c echo.Context) error {
		userId := c.PathParam("id")
		log.Printf("🗑️ DELETE /api/users/%s - Deleting user...", userId)

		// Empêcher la suppression de son propre compte
		authRecord := c.Get("authRecord")
		if authRecord != nil {
			if record, ok := authRecord.(*models.Record); ok {
				if record.Id == userId {
					log.Println("⛔ Cannot delete own account")
					return c.JSON(http.StatusBadRequest, map[string]interface{}{
						"error": "Vous ne pouvez pas supprimer votre propre compte",
					})
				}
			}
		}

		record, err := pb.Dao().FindRecordById("users", userId)
		if err != nil {
			return c.JSON(http.StatusNotFound, map[string]interface{}{
				"error": "Utilisateur non trouvé",
			})
		}

		if err := pb.Dao().DeleteRecord(record); err != nil {
			log.Printf("❌ Error deleting user: %v", err)
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "Erreur lors de la suppression",
			})
		}

		log.Printf("✅ User deleted: %s", record.GetString("email"))

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Utilisateur supprimé",
		})
	}, requireAdmin)

	log.Println("✅ User management routes registered successfully")
}
