// backend/routes/backup_selectif_routes.go
// ═══════════════════════════════════════════════════════════════════════════
// ROUTES — RESTAURATION SÉLECTIVE, À CHAUD
// ═══════════════════════════════════════════════════════════════════════════
//   POST   /api/backup/selective-restore        → simule, ou applique
//   DELETE /api/backup/selective-restore/cache  → efface les snapshots en clair
//
// ─── Ce que fait la route, dans l'ordre ────────────────────────────────────
//  1. télécharge le snapshot (clé super-admin) ;
//  2. le déchiffre (clé de chiffrement du poste) et VÉRIFIE son empreinte ;
//  3. l'ouvre en LECTURE SEULE à côté de la base en service ;
//  4. calcule l'écart champ par champ ;
//  5. le rend — et s'arrête là, sauf si `apply` est vrai ET confirmé.
//
// Les étapes 1 et 2 sont sautées quand le snapshot déchiffré est déjà dans le
// dossier de travail : c'est ce qui fait que le geste de validation porte sur
// EXACTEMENT ce qui a été montré, et pas sur un second téléchargement.
//
// ─── Pourquoi la même route pour simuler et pour appliquer ─────────────────
// Parce que le calcul doit être le même. Deux routes, ce serait deux chemins
// de code, et l'aperçu finirait par diverger de ce qui s'écrit — c'est la
// leçon de la régression du Z du 20 mai 2026, transposée : on ne réimplémente
// pas deux fois les mêmes règles. `apply` est un drapeau, pas une porte.
//
// ─── L'écriture diffuse ────────────────────────────────────────────────────
// Le temps réel de PocketBase est accroché aux événements de MODÈLE, pas à
// l'API REST (`apis/realtime.go:257`) : les `SaveRecord` de la transaction
// diffusent donc sur `products`, `categories` et `site_menu`, et les autres
// postes périment leurs caches sans rien faire de plus ici — `products` et
// `categories` périment toutes deux `catalog-counts`
// (`frontend/lib/realtime/catalog-realtime.ts`).
// ═══════════════════════════════════════════════════════════════════════════

package routes

import (
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"

	"pocket-react/backend/backup"
)

// enregistrerRoutesSelectives branche la restauration sélective.
//
// Reçoit `clientSuper` plutôt que de le reconstruire : c'est la même fermeture
// que le reste des routes de sauvegarde, donc la même règle « la clé peut
// disparaître en cours de session, on ne met pas le client en cache ».
func enregistrerRoutesSelectives(
	pb *pocketbase.PocketBase,
	router *echo.Echo,
	planificateur *backup.Planificateur,
	clientSuper func() (*backup.ClientSuper, error),
	requireAdmin echo.MiddlewareFunc,
) {
	// ── POST /api/backup/selective-restore ──────────────────────────────────
	router.POST("/api/backup/selective-restore", func(c echo.Context) error {
		var req struct {
			ClientID   string `json:"client_id"`
			SnapshotID string `json:"snapshot_id"`
			CompanyID  string `json:"company_id"`

			// Le menu se remplace EN ENTIER, création et suppression comprises.
			// D'où une case à part : ce n'est pas la même promesse que les
			// trois champs du catalogue, et la mêler à eux serait mentir.
			AvecMenu bool `json:"with_menu"`

			// Faux ou absent = simulation. C'est le défaut, et il est ici,
			// dans la forme de la requête : un client qui oublie le champ
			// simule, il n'écrit pas.
			Apply bool `json:"apply"`

			// Exigée pour écrire seulement. Retaper l'identifiant est la seule
			// garde qui distingue « je veux écrire dans CETTE base » d'un clic.
			Confirm string `json:"confirm"`
		}
		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]any{"error": "Données invalides"})
		}

		req.SnapshotID = strings.TrimSpace(req.SnapshotID)
		if req.SnapshotID == "" {
			return c.JSON(http.StatusBadRequest, map[string]any{
				"error": "snapshot_id requis",
			})
		}
		if req.Apply && req.Confirm != req.SnapshotID {
			return c.JSON(http.StatusPreconditionRequired, map[string]any{
				"error": "Confirmation manquante : renvoyer l'identifiant du snapshot",
			})
		}

		chemin, err := backup.CheminSnapshotDeTravail(pb.DataDir(), req.SnapshotID)
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]any{"error": err.Error()})
		}

		// ── Télécharger et déchiffrer, sauf si c'est déjà fait ──────────────
		if _, err := os.Stat(chemin); err != nil {
			cs, err := clientSuper()
			if err != nil {
				return c.JSON(http.StatusPreconditionFailed, map[string]any{"error": err.Error()})
			}
			cle, err := planificateur.CleChiffrement()
			if err != nil {
				return c.JSON(http.StatusPreconditionFailed, map[string]any{
					"error": "Clé de chiffrement indisponible : " + err.Error(),
				})
			}

			flux, shaAnnonce, err := cs.Telecharger(req.ClientID, req.SnapshotID)
			if err != nil {
				return c.JSON(http.StatusBadGateway, map[string]any{"error": err.Error()})
			}
			chemin, err = backup.PreparerSnapshotDeTravail(
				pb.DataDir(), flux, cle, req.SnapshotID, shaAnnonce)
			flux.Close()
			if err != nil {
				// Empreinte divergente, clé qui ne correspond pas, flux
				// tronqué : chacune se corrige autrement, le message porte
				// laquelle.
				return c.JSON(http.StatusUnprocessableEntity, map[string]any{"error": err.Error()})
			}
		}

		rapport, err := backup.RestaurerSelectivement(pb, chemin, req.SnapshotID,
			backup.OptionsSelectif{
				Appliquer: req.Apply,
				AvecMenu:  req.AvecMenu,
				CompanyID: strings.TrimSpace(req.CompanyID),
			})
		if err != nil {
			return c.JSON(http.StatusUnprocessableEntity, map[string]any{"error": err.Error()})
		}

		if req.Apply {
			// Un snapshot déchiffré est la base du client EN CLAIR sur le
			// disque : il ne survit pas à l'écriture qu'il a servie.
			if n, err := backup.PurgerTravailSelectif(pb.DataDir(), ""); err == nil && n > 0 {
				log.Printf("🧹 restauration sélective : %d snapshot(s) de travail effacé(s)", n)
			}
			log.Printf("♻️  restauration sélective APPLIQUÉE depuis %s : %d écritures",
				req.SnapshotID, rapport.Ecrites)
		}

		return c.JSON(http.StatusOK, rapport)
	}, requireAdmin)

	// ── DELETE /api/backup/selective-restore/cache ──────────────────────────
	//
	// Le ménage à la main. Une simulation laisse un snapshot déchiffré derrière
	// elle — c'est voulu, pour que l'écriture porte sur le même fichier — mais
	// il ne doit pas y rester quand on renonce.
	router.DELETE("/api/backup/selective-restore/cache", func(c echo.Context) error {
		n, err := backup.PurgerTravailSelectif(pb.DataDir(), "")
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]any{"error": err.Error()})
		}
		return c.JSON(http.StatusOK, map[string]any{"success": true, "deleted": n})
	}, requireAdmin)
}
