// backend/routes/site_catalog_routes.go
// ═══════════════════════════════════════════════════════════════════════════
// ROUTES API — EXPORT DU CATALOGUE VERS LA BASE SQL AXEMUSIQUE
// ═══════════════════════════════════════════════════════════════════════════
// Deux relais vers server/api/products-sync.php, dont le contrat est
// frontend/modules/site/PocketSite-docs/12-contrat-catalogue.md :
//
//   GET  /api/site/catalog/inventory  → ce que la base SQL contient déjà
//   POST /api/site/catalog/export     → pousse un lot d'entités
//
// ─── Pourquoi ce relais existe ─────────────────────────────────────────────
// La même raison qu'au ticket 6 : la clé ne doit jamais descendre dans le
// renderer. Le lot est composé en React — c'est là que vit la règle de mise en
// ligne —, la clé est lue ici, au moment de l'appel, et n'est exposée par
// aucune route.
//
// ─── Ce que ce fichier ne fait PAS ─────────────────────────────────────────
// Il ne valide pas le lot et ne sait pas ce qu'est un produit. Le contrat est
// gardé par le PHP, qui refuse en 422 avec la raison ; le répliquer ici
// créerait deux validateurs à tenir d'accord.
//
// C'est la CINQUIÈME sortie réseau de PocketApp. Inscrite dans CLAUDE.md.
// ═══════════════════════════════════════════════════════════════════════════

package routes

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"pocket-react/backend/secrets"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
)

// Le mutualisé est lent, et un lot de 200 entités écrit quatre tables. Plus
// large que la publication du menu, pour la même raison qu'elle : ne pas
// couper un export qui aboutit.
const siteCatalogTimeout = 60 * time.Second

// Garde-fou symétrique de celui du PHP (1 Mio, §6 du contrat). Refuser ici
// évite un aller-retour réseau pour rien.
const siteCatalogMaxBytes = 1048576

// L'inventaire, lui, ramène 2500 paires legacy_id → checksum. Il est plus gros
// que ce qu'on envoie ; le plafond de lecture est donc distinct.
const siteCatalogMaxInventoryBytes = 8 * 1024 * 1024

// Sans agent explicite, Go envoie « Go-http-client/1.1 » — que la couche
// anti-bot d'axemusique.shop REJETTE, avec une page HTML « The page is
// temporarily unavailable » en 503, le PHP n'étant jamais atteint. Constaté le
// 10 août 2026. Voir site_publish_routes.go:128 et CLAUDE.md.
const siteCatalogUserAgent = "PocketApp/1.0 (export catalogue)"

// RegisterSiteCatalogRoutes enregistre les routes d'export du catalogue.
func RegisterSiteCatalogRoutes(pb *pocketbase.PocketBase, router *echo.Echo) {
	log.Println("🌐 Registering site catalog routes...")

	sm := secrets.NewSecretManager(pb)
	requireAdmin := createAdminMiddleware(pb)

	// config lit l'URL et la clé, ou explique lequel des deux manque.
	config := func(c echo.Context) (string, string, error) {
		endpoint, err := sm.GetSetting(secrets.SettingSiteCatalogURL)
		if err != nil || strings.TrimSpace(endpoint) == "" {
			return "", "", c.JSON(http.StatusPreconditionFailed, map[string]interface{}{
				"error": "URL d'export du catalogue non configurée. Réglages > Clés API.",
			})
		}
		apiKey, err := sm.GetSecret(secrets.KeySiteCatalogAPI)
		if err != nil || apiKey == "" {
			return "", "", c.JSON(http.StatusPreconditionFailed, map[string]interface{}{
				"error": "Clé d'export du catalogue non configurée. Réglages > Clés API.",
			})
		}
		return endpoint, apiKey, nil
	}

	// forward exécute la requête et retransmet la réponse du PHP telle quelle.
	// En cas de refus, elle porte la raison — la réécrire ne ferait que la
	// tronquer.
	forward := func(c echo.Context, req *http.Request, apiKey string, maxRead int64) error {
		req.Header.Set("X-API-Key", apiKey)
		req.Header.Set("User-Agent", siteCatalogUserAgent)

		client := &http.Client{Timeout: siteCatalogTimeout}
		resp, err := client.Do(req)
		if err != nil {
			log.Printf("❌ Export catalogue : %v", err)
			return c.JSON(http.StatusBadGateway, map[string]interface{}{
				"error": "Serveur d'export injoignable : " + err.Error(),
			})
		}
		defer resp.Body.Close()

		respBody, err := io.ReadAll(io.LimitReader(resp.Body, maxRead))
		if err != nil {
			return c.JSON(http.StatusBadGateway, map[string]interface{}{
				"error": "Réponse du serveur d'export illisible",
			})
		}

		if !json.Valid(respBody) {
			// Page d'erreur Apache, avertissement PHP, ou la page de la couche
			// anti-bot. Le début du corps est remonté : c'est lui qui dit quoi.
			log.Printf("⚠️ Réponse non-JSON (%d) : %.200s", resp.StatusCode, respBody)
			extract := string(respBody)
			if len(extract) > 300 {
				extract = extract[:300]
			}
			return c.JSON(http.StatusBadGateway, map[string]interface{}{
				"error":  "Réponse inattendue du serveur d'export",
				"status": resp.StatusCode,
				"body":   extract,
			})
		}

		return c.Blob(resp.StatusCode, "application/json", respBody)
	}

	// ── GET /api/site/catalog/inventory ─────────────────────────────────────
	// Lecture seule. C'est elle qui permet à l'interface de distinguer absent,
	// modifié et à jour (§3 du contrat).
	router.GET("/api/site/catalog/inventory", func(c echo.Context) error {
		log.Println("📥 GET /api/site/catalog/inventory")

		endpoint, apiKey, failure := config(c)
		if failure != nil {
			return failure
		}

		separator := "?"
		if strings.Contains(endpoint, "?") {
			separator = "&"
		}

		req, err := http.NewRequest(http.MethodGet, endpoint+separator+"action=inventory", nil)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "URL d'export invalide",
			})
		}

		return forward(c, req, apiKey, siteCatalogMaxInventoryBytes)
	}, requireAdmin)

	// ── POST /api/site/catalog/export ───────────────────────────────────────
	// Corps : le lot déjà composé. Le découpage est fait côté front ; ici on
	// vérifie seulement qu'il tient dans le plafond et que c'est du JSON.
	router.POST("/api/site/catalog/export", func(c echo.Context) error {
		log.Println("📤 POST /api/site/catalog/export")

		endpoint, apiKey, failure := config(c)
		if failure != nil {
			return failure
		}

		body, err := io.ReadAll(io.LimitReader(c.Request().Body, siteCatalogMaxBytes+1))
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Corps de requête illisible",
			})
		}
		if len(body) == 0 {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Lot vide",
			})
		}
		if len(body) > siteCatalogMaxBytes {
			return c.JSON(http.StatusRequestEntityTooLarge, map[string]interface{}{
				"error": "Lot trop volumineux — le découpage doit se faire côté client",
			})
		}
		if !json.Valid(body) {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Le lot n'est pas du JSON valide",
			})
		}

		req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "URL d'export invalide",
			})
		}
		req.Header.Set("Content-Type", "application/json")

		return forward(c, req, apiKey, siteCatalogMaxBytes)
	}, requireAdmin)

	log.Println("✅ Site catalog routes registered successfully")
}
