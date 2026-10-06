// backend/routes/credits_routes.go
// ═══════════════════════════════════════════════════════════════════════════
// SOLDE DES CRÉDITS IA — lu par le Go, jamais par le renderer
// ═══════════════════════════════════════════════════════════════════════════
//
// Jusqu'au 6 octobre 2026, l'en-tête de l'application lisait son solde en
// appelant LUI-MÊME le mini-SaaS : il lui fallait donc la clé, et
// `GET /api/settings/pocketapp-key` la rendait DÉCHIFFRÉE, sans aucune garde —
// tout ce qui joignait le PocketBase (un navigateur du réseau local, sans
// session) pouvait la lire. Cette route n'existe plus.
//
// C'est désormais le Go qui pose l'en-tête `X-API-Key` et ne rend que le
// solde : la clé ne descend plus dans le renderer, comme pour les autres
// services (publication du menu, catalogue, détourage).
//
// Gardien : credits_routes_test.go.

package routes

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"pocket-react/backend/secrets"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
)

const pocketAppSoldeTimeout = 10 * time.Second

type creditsDeps struct {
	cle      func() (string, error)
	endpoint string
	client   *http.Client
}

// lireSoldePocketApp demande le solde au mini-SaaS (`usage.php?balance=1`).
func lireSoldePocketApp(ctx context.Context, deps creditsDeps, cle string) (float64, error) {
	if !strings.HasPrefix(deps.endpoint, "https://") {
		return 0, fmt.Errorf("le solde ne se lit qu'en HTTPS")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, deps.endpoint+"?balance=1", nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("X-API-Key", cle)
	req.Header.Set("User-Agent", "PocketApp/1.0 (solde des crédits)")

	response, err := deps.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return 0, fmt.Errorf("HTTP %d", response.StatusCode)
	}

	// `balance_eur` arrive en nombre ou en chaîne selon la version du mini-SaaS.
	var corps struct {
		BalanceEur interface{} `json:"balance_eur"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 64*1024)).Decode(&corps); err != nil {
		return 0, err
	}
	switch valeur := corps.BalanceEur.(type) {
	case float64:
		return valeur, nil
	case string:
		solde, err := strconv.ParseFloat(strings.TrimSpace(valeur), 64)
		if err != nil {
			return 0, fmt.Errorf("solde illisible")
		}
		return solde, nil
	default:
		return 0, nil
	}
}

func traiterSoldeCredits(c echo.Context, deps creditsDeps) error {
	// La session est celle que PocketBase a VÉRIFIÉE (signature du jeton comprise).
	if utilisateurVerifie(c) == nil {
		return c.JSON(http.StatusUnauthorized, map[string]interface{}{
			"error": "Non authentifié",
		})
	}

	cle, err := deps.cle()
	if err != nil || cle == "" {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"configured":  false,
			"balance_eur": 0,
		})
	}

	ctx, annuler := context.WithTimeout(c.Request().Context(), pocketAppSoldeTimeout)
	defer annuler()

	solde, err := lireSoldePocketApp(ctx, deps, cle)
	if err != nil {
		// L'erreur du transport peut citer l'adresse, jamais la clé : elle est
		// dans un en-tête. On ne rend qu'un message fixe.
		return c.JSON(http.StatusBadGateway, map[string]interface{}{
			"error": "Solde indisponible",
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"configured":  true,
		"balance_eur": solde,
	})
}

func RegisterCreditsRoutes(pb *pocketbase.PocketBase, router *echo.Echo) {
	deps := creditsDeps{
		cle: func() (string, error) {
			return secrets.NewSecretManager(pb).GetSecret(secrets.KeyNotificationAPI)
		},
		endpoint: pocketAppUsageURL,
		client:   &http.Client{Timeout: pocketAppSoldeTimeout},
	}

	// GET /api/credits/balance - Solde des crédits IA (toute session vérifiée)
	router.GET("/api/credits/balance", func(c echo.Context) error {
		return traiterSoldeCredits(c, deps)
	})
}
