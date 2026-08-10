// backend/routes/site_publish_routes.go
// ═══════════════════════════════════════════════════════════════════════════
// ROUTE API - PUBLICATION DU MENU VERS axemusique.shop  (ticket 6)
// ═══════════════════════════════════════════════════════════════════════════
// Reçoit du front le document déjà composé, y ajoute la clé X-API-Key, et le
// poste à l'endpoint PHP du serveur mutualisé.
//
// ─── Pourquoi ce relais existe ─────────────────────────────────────────────
// Le document est composé en React (la résolution ref → url passe par AppPos,
// dont le client n'existe qu'en TypeScript). Mais la clé, elle, ne doit jamais
// descendre dans le renderer : elle est lue ici, au moment du POST, et n'est
// exposée par aucune route. Voir docs/DECISIONS.md, bloc « Clé de publication
// dédiée, document composé en React, POST émis par le Go ».
//
// ─── Ce que ce fichier ne fait PAS ─────────────────────────────────────────
// Il ne valide pas le document. Il ne sait pas ce qu'est un menu, et n'a pas à
// l'apprendre : le contrat est gardé par l'endpoint PHP, qui refuse en 422 avec
// la liste complète des divergences. Les répliquer ici créerait deux
// validateurs à tenir d'accord.
//
// C'est la QUATRIÈME sortie réseau de PocketApp — la seule ajoutée depuis
// l'audit. Inscrite dans CLAUDE.md.
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

// Le mutualisé est lent (faille 3.8). Assez large pour ne pas couper une
// publication qui aboutit, assez court pour ne pas figer l'interface.
const sitePublishTimeout = 30 * time.Second

// Garde-fou symétrique de celui du PHP (256 Kio). Refuser ici évite un
// aller-retour réseau pour rien.
const sitePublishMaxBytes = 262144

// RegisterSitePublishRoutes enregistre la route de publication du menu.
func RegisterSitePublishRoutes(pb *pocketbase.PocketBase, router *echo.Echo) {
	log.Println("🌐 Registering site publish routes...")

	sm := secrets.NewSecretManager(pb)
	requireAdmin := createAdminMiddleware(pb)

	// POST /api/site/publish-menu
	//
	// Corps : le document publiable, tel quel. Réponse : celle de l'endpoint
	// PHP, transmise sans réécriture — c'est elle qui dit quoi corriger.
	router.POST("/api/site/publish-menu", func(c echo.Context) error {
		log.Println("📤 POST /api/site/publish-menu")

		// ── Configuration ───────────────────────────────────────────────────

		endpoint, err := sm.GetSetting(secrets.SettingSitePublishURL)
		if err != nil || strings.TrimSpace(endpoint) == "" {
			return c.JSON(http.StatusPreconditionFailed, map[string]interface{}{
				"error": "URL de publication non configurée. Réglages > Clés API > Publication du site.",
			})
		}

		apiKey, err := sm.GetSecret(secrets.KeySitePublishAPI)
		if err != nil || apiKey == "" {
			return c.JSON(http.StatusPreconditionFailed, map[string]interface{}{
				"error": "Clé de publication non configurée. Réglages > Clés API > Publication du site.",
			})
		}

		// ── Corps reçu du front ─────────────────────────────────────────────

		body, err := io.ReadAll(io.LimitReader(c.Request().Body, sitePublishMaxBytes+1))
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Corps de requête illisible",
			})
		}
		if len(body) == 0 {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Document vide",
			})
		}
		if len(body) > sitePublishMaxBytes {
			return c.JSON(http.StatusRequestEntityTooLarge, map[string]interface{}{
				"error": "Document trop volumineux pour l'endpoint de publication",
			})
		}

		// Seule vérification de forme faite ici : que ce soit du JSON. Elle
		// évite de poster un corps que le PHP refusera à coup sûr. Le CONTENU,
		// lui, n'est pas notre affaire.
		if !json.Valid(body) {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Le document n'est pas du JSON valide",
			})
		}

		// ── Envoi ───────────────────────────────────────────────────────────

		req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "URL de publication invalide",
			})
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-API-Key", apiKey)

		// Sans agent explicite, Go envoie « Go-http-client/1.1 » — et la couche
		// anti-bot de l'hébergement mutualisé le REJETTE, avec une page HTML
		// « The page is temporarily unavailable » en 503. Constaté le 10 août
		// 2026 : à clé, URL et corps identiques, `Go-http-client/1.1` reçoit
		// cette page, `curl/8.0` et l'agent ci-dessous reçoivent la réponse
		// normale de l'endpoint.
		//
		// Le symptôme est trompeur : le PHP n'est jamais atteint, donc rien
		// n'indique que la requête a été filtrée avant lui.
		req.Header.Set("User-Agent", "PocketApp/1.0 (publication menu)")

		client := &http.Client{Timeout: sitePublishTimeout}
		resp, err := client.Do(req)
		if err != nil {
			// Serveur injoignable, DNS, TLS, délai dépassé. Le message part tel
			// quel : c'est la seule chose qui distingue ces cas entre eux.
			log.Printf("❌ Publication échouée : %v", err)
			return c.JSON(http.StatusBadGateway, map[string]interface{}{
				"error": "Serveur de publication injoignable : " + err.Error(),
			})
		}
		defer resp.Body.Close()

		// Réponse du PHP, transmise telle quelle. En cas de refus (422), elle
		// porte le tableau `errors` complet — c'est ce que l'opérateur doit
		// lire, et le réécrire ne ferait que le tronquer.
		respBody, err := io.ReadAll(io.LimitReader(resp.Body, sitePublishMaxBytes))
		if err != nil {
			return c.JSON(http.StatusBadGateway, map[string]interface{}{
				"error": "Réponse du serveur de publication illisible",
			})
		}

		if !json.Valid(respBody) {
			// Le mutualisé a répondu autre chose que du JSON : page d'erreur
			// Apache, avertissement PHP, redirection. Le début du corps est
			// remonté, c'est généralement lui qui dit quoi.
			log.Printf("⚠️ Réponse non-JSON (%d) : %.200s", resp.StatusCode, respBody)
			extract := string(respBody)
			if len(extract) > 300 {
				extract = extract[:300]
			}
			return c.JSON(http.StatusBadGateway, map[string]interface{}{
				"error":  "Réponse inattendue du serveur de publication",
				"status": resp.StatusCode,
				"body":   extract,
			})
		}

		log.Printf("📤 Publication : le serveur a répondu %d", resp.StatusCode)

		return c.Blob(resp.StatusCode, "application/json", respBody)
	}, requireAdmin)

	log.Println("✅ Site publish routes registered successfully")
}
