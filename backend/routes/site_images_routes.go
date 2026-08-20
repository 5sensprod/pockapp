// backend/routes/site_images_routes.go
// ═══════════════════════════════════════════════════════════════════════════
// ROUTES API — MIROIR DES IMAGES DU CATALOGUE VERS AXEMUSIQUE
// ═══════════════════════════════════════════════════════════════════════════
// Deux relais vers server/api/images-sync.php, dont le mécanisme est décrit
// par frontend/modules/site/PocketSite-docs/16-conception-images.md :
//
//   GET  /api/site/images/inventory → legacy_id → image_checksum, par table
//   POST /api/site/images/entity    → TOUTES les images d'une entité, entières
//
// ─── Pourquoi une route de plus, et pas l'export d'entités ─────────────────
// Le relais du catalogue plafonne le corps à 1 Mio (siteCatalogMaxBytes, §6
// du contrat). Or **une seule image de catégorie pèse 1 Mo en moyenne et
// 2,7 Mo au pire** — mesuré le 19 août 2026 —, et un envoi de produit atteint
// 15,92 Mio, galerie comprise. Les octets ne peuvent pas voyager
// dans le lot d'entités, ni par la route qui le porte : ce sont deux plafonds
// sans rapport, donc deux routes.
//
// ─── Ce que ce fichier ne fait PAS ─────────────────────────────────────────
// Il ne décode pas le multipart, ne redimensionne rien, ne nomme rien. Le nom
// distant est CALCULÉ par le PHP à partir de (entité, rang) — jamais
// transporté (§4.1). Ici, on ajoute la clé, on pose l'agent, on relaie.
//
// C'est la SIXIÈME sortie réseau de PocketApp. Inscrite dans CLAUDE.md.
// ═══════════════════════════════════════════════════════════════════════════

package routes

import (
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

// Envoyer 2,7 Mo à un mutualisé est plus lent qu'envoyer 200 lignes de JSON,
// et le PHP écrit des fichiers avant de toucher SQL. Plus large que l'export
// d'entités, pour la même raison qu'ailleurs : ne pas couper un envoi qui
// aboutit.
const siteImagesTimeout = 180 * time.Second

// Plafond du corps d'un envoi d'entité. **Sans rapport avec le 1 Mio du lot
// d'entités** : ici le corps EST une image, ou quelques-unes.
//
// 24 Mio couvre le pire cas mesuré, et il l'est maintenant pour de bon : au
// 20 août 2026, sur les 2412 produits publiés, **le plus gros envoi d'entité
// pèse 15,92 Mio** (11 fichiers), et aucun fichier seul ne dépasse 4,84 Mio.
// 466 entités passent 1 Mio, **11 passent 8 Mio**.
//
// Il ne dit toujours rien de ce que l'hébergeur accepte : `post_max_size` et
// `upload_max_filesize` du mutualisé ne sont PAS mesurés (§6.2 de la
// conception). Si `post_max_size` vaut 8M — valeur par défaut fréquente —, ce
// sont ces 11 entités-là qui échoueront, et elles seules. Le PHP refuse en 413
// en le disant ; c'est lui qui fait foi, ce plafond-ci n'évite qu'un
// aller-retour.
const siteImagesMaxBytes = 24 * 1024 * 1024

// L'inventaire d'images ramène au plus une paire par entité, comme celui des
// entités. Même ordre de grandeur, même plafond.
const siteImagesMaxInventoryBytes = 8 * 1024 * 1024

// Sans agent explicite, Go envoie « Go-http-client/1.1 », que la couche
// anti-bot d'axemusique.shop rejette en 503 HTML sans jamais atteindre le PHP
// (constaté le 10 août 2026, CLAUDE.md).
const siteImagesUserAgent = "PocketApp/1.0 (miroir images)"

// RegisterSiteImagesRoutes enregistre les routes du miroir d'images.
func RegisterSiteImagesRoutes(pb *pocketbase.PocketBase, router *echo.Echo) {
	log.Println("🖼️  Registering site images routes...")

	sm := secrets.NewSecretManager(pb)
	requireAdmin := createAdminMiddleware(pb)

	// L'URL est propre au miroir : les octets ne vont pas au même script que
	// les entités. La CLÉ, elle, est celle du catalogue — même base de
	// données, même portée d'écriture ; en créer une seconde donnerait deux
	// secrets à révoquer ensemble, ce qui est une occasion de plus d'en
	// oublier un.
	// Le troisième retour dit que la requête est DÉJÀ traitée : la réponse
	// d'erreur est écrite ici, et l'appelant doit rendre la main sans rien
	// écrire de plus. Le quatrième est l'erreur d'écriture de cette réponse,
	// qu'on lui rend telle quelle.
	//
	// Un `error` seul ne convient PAS, et c'est le défaut qu'on corrige :
	// `c.JSON` rend `nil` quand l'écriture RÉUSSIT. Le `if failure != nil` des
	// appelants laissait donc passer le cas d'échec, le handler poursuivait
	// avec une URL vide et répondait une SECONDE fois — deux JSON collés dans
	// le même corps, et « unsupported protocol scheme \"\" » à la place du
	// message de configuration. Mesuré le 19 août 2026, à la mise en service.
	config := func(c echo.Context) (string, string, bool, error) {
		endpoint, err := sm.GetSetting(secrets.SettingSiteImagesURL)
		if err != nil || strings.TrimSpace(endpoint) == "" {
			return "", "", true, c.JSON(http.StatusPreconditionFailed, map[string]interface{}{
				"error": "URL du miroir d'images non configurée. Réglages > Clés API.",
			})
		}
		apiKey, err := sm.GetSecret(secrets.KeySiteCatalogAPI)
		if err != nil || apiKey == "" {
			return "", "", true, c.JSON(http.StatusPreconditionFailed, map[string]interface{}{
				"error": "Clé d'export du catalogue non configurée. Réglages > Clés API.",
			})
		}
		return endpoint, apiKey, false, nil
	}

	forward := func(c echo.Context, req *http.Request, apiKey string, maxRead int64) error {
		req.Header.Set("X-API-Key", apiKey)
		req.Header.Set("User-Agent", siteImagesUserAgent)

		client := &http.Client{Timeout: siteImagesTimeout}
		resp, err := client.Do(req)
		if err != nil {
			log.Printf("❌ Miroir images : %v", err)
			return c.JSON(http.StatusBadGateway, map[string]interface{}{
				"error": "Serveur d'images injoignable : " + err.Error(),
			})
		}
		defer resp.Body.Close()

		respBody, err := io.ReadAll(io.LimitReader(resp.Body, maxRead))
		if err != nil {
			return c.JSON(http.StatusBadGateway, map[string]interface{}{
				"error": "Réponse du serveur d'images illisible",
			})
		}

		if !json.Valid(respBody) {
			// Page d'erreur Apache, avertissement PHP, ou la couche anti-bot.
			// Le début du corps est remonté : c'est lui qui dit lequel.
			log.Printf("⚠️ Réponse non-JSON (%d) : %.200s", resp.StatusCode, respBody)
			extract := string(respBody)
			if len(extract) > 300 {
				extract = extract[:300]
			}
			return c.JSON(http.StatusBadGateway, map[string]interface{}{
				"error":  "Réponse inattendue du serveur d'images",
				"status": resp.StatusCode,
				"body":   extract,
			})
		}

		return c.Blob(resp.StatusCode, "application/json", respBody)
	}

	// ── GET /api/site/images/inventory ──────────────────────────────────────
	// Le même geste que l'inventaire d'entités, sur l'autre empreinte. C'est
	// lui qui permet les trois états — absent, modifié, à jour — sans aucune
	// table de suivi côté PocketApp (§4.2).
	router.GET("/api/site/images/inventory", func(c echo.Context) error {
		log.Println("📥 GET /api/site/images/inventory")

		endpoint, apiKey, handled, failure := config(c)
		if handled {
			return failure
		}

		req, err := http.NewRequest(http.MethodGet, withQuery(endpoint, "action=inventory"), nil)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "URL du miroir d'images invalide",
			})
		}

		return forward(c, req, apiKey, siteImagesMaxInventoryBytes)
	}, requireAdmin)

	// ── POST /api/site/images/entity ────────────────────────────────────────
	// Le corps est un multipart composé par le front : `kind`, `legacy_id`,
	// `image_checksum`, puis `image_0`, `image_1`, … Il est relayé TEL QUEL,
	// Content-Type compris — le décoder ici pour le recomposer ne ferait que
	// dupliquer la lecture et créer une occasion de diverger.
	//
	// Une requête = toutes les images d'une entité, jamais une image seule
	// (§4.3) : c'est ce qui rend le retrait possible sans jamais supprimer.
	router.POST("/api/site/images/entity", func(c echo.Context) error {
		contentType := c.Request().Header.Get("Content-Type")
		if !strings.HasPrefix(contentType, "multipart/form-data") {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Corps multipart/form-data attendu",
			})
		}

		endpoint, apiKey, handled, failure := config(c)
		if handled {
			return failure
		}

		body, err := io.ReadAll(io.LimitReader(c.Request().Body, siteImagesMaxBytes+1))
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Corps de requête illisible",
			})
		}
		if len(body) == 0 {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": "Envoi vide",
			})
		}
		if len(body) > siteImagesMaxBytes {
			return c.JSON(http.StatusRequestEntityTooLarge, map[string]interface{}{
				"error": "Envoi trop volumineux pour le miroir d'images",
			})
		}

		log.Printf("📤 POST /api/site/images/entity (%d octets)", len(body))

		req, err := http.NewRequest(http.MethodPost, endpoint, strings.NewReader(string(body)))
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]interface{}{
				"error": "URL du miroir d'images invalide",
			})
		}
		// La frontière du multipart vit DANS le Content-Type : le recopier
		// n'est pas une commodité, c'est la condition pour que le PHP sache
		// découper le corps.
		req.Header.Set("Content-Type", contentType)

		return forward(c, req, apiKey, siteImagesMaxInventoryBytes)
	}, requireAdmin)

	log.Println("✅ Site images routes registered successfully")
}

// withQuery ajoute une chaîne de requête à une URL qui en porte peut-être
// déjà une. Le réglage est saisi à la main : il peut très bien finir par `?…`.
func withQuery(endpoint, query string) string {
	if strings.Contains(endpoint, "?") {
		return endpoint + "&" + query
	}
	return endpoint + "?" + query
}
