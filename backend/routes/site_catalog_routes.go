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
// Et, depuis le 14 septembre 2026, un relais vers un AUTRE fichier :
//
//   POST /api/site/catalog/remove     → retire une entité (catalog-delete.php)
//
// Il vise `catalog-delete.php`, et c'est délibéré : `products-sync.php` ne
// contient pas un seul DELETE, propriété qu'on garde — un lot d'export ne peut
// pas effacer une ligne, quel que soit le bug. Le geste destructeur est dans un
// fichier qu'on appelle exprès, une entité à la fois.
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
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
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

	// ── GET /api/site/catalog/removal-preview ───────────────────────────────
	// Ce que le site sait encore d'une fiche qu'on n'a plus ici : son nom, son
	// adresse, le nombre d'images, et ce qui retiendrait le retrait.
	//
	// Elle existe parce que le détail de l'écran n'affichait que des clés
	// stables — `0eZtUIbYxLjkaZWe` ne dit à personne quel produit va partir, et
	// le retrait est sans retour. Le nom n'est plus nulle part en local : la
	// fiche est supprimée. Seul le site l'a encore.
	//
	// Elle ne touche à rien : c'est le GET de `catalog-delete.php`.
	router.GET("/api/site/catalog/removal-preview", func(c echo.Context) error {
		endpoint, apiKey, failure := config(c)
		if failure != nil {
			return failure
		}

		kind := c.QueryParam("kind")
		switch kind {
		case "products", "categories", "brands":
		default:
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "kind inconnu. Attendu : products, categories ou brands.",
			})
		}
		legacyID := c.QueryParam("legacy_id")
		if !legacyIDValide(legacyID) {
			return c.JSON(http.StatusUnprocessableEntity, map[string]interface{}{
				"error": "legacy_id absent ou de forme inacceptable.",
			})
		}

		cible, err := endpointVoisin(endpoint, "catalog-delete.php")
		if err != nil {
			return c.JSON(http.StatusPreconditionFailed, map[string]interface{}{
				"error": "URL d'export inattendue : " + err.Error(),
			})
		}

		params := url.Values{}
		params.Set("kind", kind)
		params.Set("legacy_id", legacyID)

		req, err := http.NewRequest(http.MethodGet, cible+"?"+params.Encode(), nil)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "URL de retrait invalide",
			})
		}

		return forward(c, req, apiKey, siteCatalogMaxBytes)
	}, requireAdmin)

	// ── POST /api/site/catalog/remove ───────────────────────────────────────
	// Retire UNE entité de la base SQL du site : la ligne, ses rattachements et
	// ses images. C'est le seul geste destructeur de tout l'export.
	//
	// Il existe parce qu'une fiche SUPPRIMÉE dans PocketApp n'a plus rien à
	// exporter — ni en `draft`, ni autrement — et que sa page restait servie
	// indéfiniment. Dépublier reste le retrait normal d'un produit qui existe
	// encore (21 août 2026) ; celui-ci ne sert qu'aux fiches disparues.
	//
	// L'URL se déduit de `site_catalog_url` en remplaçant le dernier segment :
	// les deux fichiers sont côte à côte dans `server/api/`, le réglage n'a pas
	// à être saisi deux fois — et une URL qui ne finirait pas par un fichier
	// PHP est refusée plutôt que devinée.
	router.POST("/api/site/catalog/remove", func(c echo.Context) error {
		endpoint, apiKey, failure := config(c)
		if failure != nil {
			return failure
		}

		var demande struct {
			Kind     string `json:"kind"`
			LegacyID string `json:"legacy_id"`
		}
		if err := c.Bind(&demande); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Corps de requête illisible",
			})
		}

		// Liste fermée ici AUSSI, et pas seulement dans le PHP : ces deux
		// valeurs partent dans une URL, et `legacy_id` devient un nom de
		// répertoire à l'autre bout.
		switch demande.Kind {
		case "products", "categories", "brands":
		default:
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "kind inconnu. Attendu : products, categories ou brands.",
			})
		}
		if !legacyIDValide(demande.LegacyID) {
			return c.JSON(http.StatusUnprocessableEntity, map[string]interface{}{
				"error": "legacy_id absent ou de forme inacceptable.",
			})
		}

		cible, err := endpointVoisin(endpoint, "catalog-delete.php")
		if err != nil {
			return c.JSON(http.StatusPreconditionFailed, map[string]interface{}{
				"error": "URL d'export inattendue : " + err.Error(),
			})
		}

		log.Printf("🗑️ POST /api/site/catalog/remove %s/%s", demande.Kind, demande.LegacyID)

		corps := url.Values{}
		corps.Set("kind", demande.Kind)
		corps.Set("legacy_id", demande.LegacyID)

		req, err := http.NewRequest(
			http.MethodPost,
			cible,
			strings.NewReader(corps.Encode()),
		)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "URL de retrait invalide",
			})
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

		return forward(c, req, apiKey, siteCatalogMaxBytes)
	}, requireAdmin)

	log.Println("✅ Site catalog routes registered successfully")
}

// legacyIDRe : identifiants NeDB (16 caractères) ou clés PocketApp `pa_…`. La
// même contrainte qu'au miroir d'images et qu'au PHP — ce jeton finit en nom de
// répertoire, il ne peut pas porter un `..`.
var legacyIDRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

func legacyIDValide(id string) bool {
	return legacyIDRe.MatchString(id)
}

// endpointVoisin remplace le dernier segment d'une URL par `fichier`, en
// conservant schéma, hôte et chemin. `site_catalog_url` désigne
// `…/server/api/products-sync.php` ; son voisin est `…/server/api/<fichier>`.
//
// Elle REFUSE une URL dont le dernier segment n'est pas un fichier : deviner
// reviendrait à poster un retrait sur une adresse inventée.
func endpointVoisin(endpoint, fichier string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(endpoint))
	if err != nil {
		return "", err
	}
	coupe := strings.LastIndex(u.Path, "/")
	if coupe < 0 || !strings.HasSuffix(u.Path, ".php") {
		return "", fmt.Errorf(
			"le réglage doit désigner un fichier .php (reçu %q)", u.Path,
		)
	}
	u.Path = u.Path[:coupe+1] + fichier
	u.RawQuery = ""
	return u.String(), nil
}
