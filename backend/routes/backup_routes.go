// backend/routes/backup_routes.go
// ═══════════════════════════════════════════════════════════════════════════
// ROUTES API — CONFIGURATION, ÉTAT ET DÉCLENCHEMENT DE LA SAUVEGARDE
// ═══════════════════════════════════════════════════════════════════════════
//   GET    /api/backup/status          → où en est la sauvegarde de ce poste
//   POST   /api/backup/run             → en lancer une tout de suite
//   POST   /api/settings/backup        → URL, clé API, clé de chiffrement…
//   GET    /api/settings/backup/status → ce qui est configuré (sans secrets)
//   DELETE /api/settings/backup        → oublier la clé API
//   GET    /api/backup/encryption-key  → RÉVÈLE la clé de chiffrement
//   GET    /api/backup/remote          → les snapshots que le serveur détient
//   DELETE /api/backup/super-key       → efface la clé super-admin de ce poste
//   POST   /api/backup/remote/delete   → supprime un snapshot distant
//   POST   /api/backup/restore         → ARME une restauration (deux temps)
//   GET    /api/backup/restore/status  → ce qui attend le prochain démarrage
//   DELETE /api/backup/restore         → désarme
//
// ─── La restauration ne remplace RIEN tout de suite ────────────────────────
// `POST /api/backup/restore` télécharge, déchiffre, VÉRIFIE l'empreinte, et
// dépose la base à côté sous un nom d'attente. L'échange a lieu au démarrage
// suivant, avant que PocketBase n'ouvre le fichier — voir
// backend/backup/restauration.go, qui explique pourquoi il ne peut pas en
// aller autrement sous Windows.
//
// L'application ne peut donc jamais écraser sa propre base en marche. Ce qui
// se voit à l'écran comme « restaurer » est en réalité « préparer », et
// l'écran le dit : il demande un redémarrage.
// ═══════════════════════════════════════════════════════════════════════════

package routes

import (
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"

	"pocket-react/backend/backup"
	"pocket-react/backend/secrets"
)

// RegisterBackupRoutes branche les routes sur le planificateur déjà construit
// par main.go. Le planificateur est passé, pas reconstruit : il porte le verrou
// « une seule sauvegarde à la fois », et deux instances auraient chacune le
// leur, ce qui reviendrait à ne pas en avoir.
func RegisterBackupRoutes(pb *pocketbase.PocketBase, router *echo.Echo, planificateur *backup.Planificateur) {
	log.Println("💾 Registering backup routes...")

	sm := secrets.NewSecretManager(pb)
	requireAdmin := createAdminMiddleware(pb)

	// ── GET /api/backup/status ──────────────────────────────────────────────
	router.GET("/api/backup/status", func(c echo.Context) error {
		return c.JSON(http.StatusOK, planificateur.LireEtat())
	}, requireAdmin)

	// ── POST /api/backup/run ────────────────────────────────────────────────
	//
	// Répond IMMÉDIATEMENT, et travaille ensuite. Une sauvegarde tient une
	// seconde et demie de VACUUM plus la durée d'un envoi sur une liaison de
	// magasin : tenir la requête HTTP ouverte pendant ce temps ferait expirer
	// le client et donnerait l'impression que le poste a planté.
	router.POST("/api/backup/run", func(c echo.Context) error {
		if planificateur.EnCours() {
			return c.JSON(http.StatusConflict, map[string]any{
				"error": "Une sauvegarde est déjà en cours",
			})
		}

		go func() {
			if err := planificateur.Executer(); err != nil {
				log.Printf("💾 sauvegarde manuelle : échec — %v", err)
			}
		}()

		return c.JSON(http.StatusAccepted, map[string]any{
			"started": true,
			"note":    "Sauvegarde lancée. Suivre /api/backup/status.",
		})
	}, requireAdmin)

	// ── POST /api/settings/backup ───────────────────────────────────────────
	//
	// Tous les champs sont optionnels : l'écran peut n'en modifier qu'un.
	router.POST("/api/settings/backup", func(c echo.Context) error {
		log.Println("💾 POST /api/settings/backup")

		var req struct {
			EndpointURL string `json:"endpoint_url"`
			APIKey      string `json:"api_key"`

			// La clé de chiffrement, en hexadécimal. FOURNIE plutôt que
			// générée, c'est le mode nominal : une clé que vous saisissez est
			// une clé que vous détenez déjà ailleurs. Une clé générée sur le
			// poste n'existe QUE sur le poste — et un disque qui meurt emporte
			// alors toutes les sauvegardes avec lui.
			EncryptionKey string `json:"encryption_key"`

			// La clé super-admin de l'éditeur. Elle ne sert JAMAIS à déposer :
			// elle ouvre la lecture de ce que le serveur détient, chez tous
			// les clients. Sur le poste d'un client, elle est saisie pour une
			// intervention et s'efface en repartant.
			SuperKey string `json:"super_key"`

			AdminURL string `json:"admin_url"`

			IntervalHours *int  `json:"interval_hours"`
			Enabled       *bool `json:"enabled"`
		}

		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]any{
				"error": "Données invalides",
			})
		}

		req.EndpointURL = strings.TrimSpace(req.EndpointURL)
		req.APIKey = strings.TrimSpace(req.APIKey)
		req.EncryptionKey = strings.TrimSpace(req.EncryptionKey)
		req.SuperKey = strings.TrimSpace(req.SuperKey)
		req.AdminURL = strings.TrimSpace(req.AdminURL)

		if req.EndpointURL == "" && req.APIKey == "" && req.EncryptionKey == "" &&
			req.SuperKey == "" && req.AdminURL == "" &&
			req.IntervalHours == nil && req.Enabled == nil {
			return c.JSON(http.StatusBadRequest, map[string]any{
				"error": "Rien à enregistrer",
			})
		}

		if req.EndpointURL != "" {
			// HTTPS exigé ici AUSSI, et pas seulement au moment de l'envoi.
			// Refuser à la saisie dit pourquoi tout de suite, au lieu de
			// laisser découvrir l'échec dans les journaux, douze heures plus
			// tard. Le corps est chiffré, mais la clé d'API voyage en clair
			// dans un en-tête : sur du HTTP simple, le réseau du magasin la
			// lit.
			if !strings.HasPrefix(req.EndpointURL, "https://") {
				return c.JSON(http.StatusBadRequest, map[string]any{
					"error": "L'URL de sauvegarde doit être absolue et en HTTPS",
				})
			}
			if err := sm.SetSetting(secrets.SettingBackupURL, req.EndpointURL); err != nil {
				log.Printf("❌ backup : URL non enregistrée : %v", err)
				return c.JSON(http.StatusInternalServerError, map[string]any{
					"error": "Erreur lors de l'enregistrement de l'URL",
				})
			}
		}

		if req.APIKey != "" {
			if err := sm.SetSecret(secrets.KeyBackupAPI, req.APIKey); err != nil {
				log.Printf("❌ backup : clé API non enregistrée : %v", err)
				return c.JSON(http.StatusInternalServerError, map[string]any{
					"error": "Erreur lors de l'enregistrement de la clé API",
				})
			}
		}

		if req.EncryptionKey != "" {
			// Validée AVANT d'être écrite. Une clé mal formée acceptée ici
			// ferait échouer toutes les sauvegardes suivantes, dans les
			// journaux et nulle part ailleurs.
			cle, err := hex.DecodeString(req.EncryptionKey)
			if err != nil || len(cle) != 32 {
				return c.JSON(http.StatusBadRequest, map[string]any{
					"error": "La clé de chiffrement doit faire exactement 64 caractères hexadécimaux (256 bits)",
				})
			}

			// Changer la clé n'invalide PAS les snapshots déjà déposés : ils
			// restent lisibles avec l'ancienne. Mais elle ne se retrouve nulle
			// part si on ne l'a pas gardée — d'où l'avertissement rendu à
			// l'écran plutôt qu'un refus silencieux.
			ancienne := sm.HasSecret(secrets.KeyBackupChiffrement)

			if err := sm.SetSecret(secrets.KeyBackupChiffrement, strings.ToLower(req.EncryptionKey)); err != nil {
				log.Printf("❌ backup : clé de chiffrement non enregistrée : %v", err)
				return c.JSON(http.StatusInternalServerError, map[string]any{
					"error": "Erreur lors de l'enregistrement de la clé de chiffrement",
				})
			}
			if ancienne {
				log.Println("🔑 backup : clé de chiffrement REMPLACÉE. Les snapshots déposés avant restent lisibles avec l'ANCIENNE clé uniquement.")
			}
		}

		if req.AdminURL != "" {
			if !strings.HasPrefix(req.AdminURL, "https://") {
				return c.JSON(http.StatusBadRequest, map[string]any{
					"error": "L'URL super-admin doit être absolue et en HTTPS",
				})
			}
			if err := sm.SetSetting(secrets.SettingBackupAdminURL, req.AdminURL); err != nil {
				return c.JSON(http.StatusInternalServerError, map[string]any{
					"error": "Erreur lors de l'enregistrement de l'URL super-admin",
				})
			}
		}

		if req.SuperKey != "" {
			// Validée AVANT d'être écrite : generateApiKey() du mini-SaaS rend
			// 32 octets en hexadécimal. Accepter n'importe quoi ici ferait
			// échouer chaque lecture ensuite, sans dire pourquoi.
			if len(req.SuperKey) != 64 {
				return c.JSON(http.StatusBadRequest, map[string]any{
					"error": "La clé super-admin doit faire 64 caractères hexadécimaux",
				})
			}
			if _, err := hex.DecodeString(req.SuperKey); err != nil {
				return c.JSON(http.StatusBadRequest, map[string]any{
					"error": "La clé super-admin doit être hexadécimale",
				})
			}
			if err := sm.SetSecret(secrets.KeyBackupSuperAdmin, strings.ToLower(req.SuperKey)); err != nil {
				return c.JSON(http.StatusInternalServerError, map[string]any{
					"error": "Erreur lors de l'enregistrement de la clé super-admin",
				})
			}
			log.Println("🔓 backup : clé super-admin ENREGISTRÉE sur ce poste — à effacer après intervention.")
		}

		if req.IntervalHours != nil {
			n := *req.IntervalHours
			if n < 1 || n > 720 {
				return c.JSON(http.StatusBadRequest, map[string]any{
					"error": "L'intervalle doit être compris entre 1 et 720 heures",
				})
			}
			if err := sm.SetSetting(secrets.SettingBackupIntervalHeures, strconv.Itoa(n)); err != nil {
				return c.JSON(http.StatusInternalServerError, map[string]any{
					"error": "Erreur lors de l'enregistrement de l'intervalle",
				})
			}
		}

		if req.Enabled != nil {
			valeur := "0"
			if *req.Enabled {
				valeur = "1"
			}
			if err := sm.SetSetting(secrets.SettingBackupActif, valeur); err != nil {
				return c.JSON(http.StatusInternalServerError, map[string]any{
					"error": "Erreur lors de l'enregistrement de l'activation",
				})
			}
		}

		return c.JSON(http.StatusOK, map[string]any{
			"success": true,
			"message": "Paramètres de sauvegarde enregistrés",
		})
	}, requireAdmin)

	// ── GET /api/settings/backup/status ─────────────────────────────────────
	//
	// Ne rend AUCUN secret : seulement s'ils existent. La clé de chiffrement a
	// sa propre route, explicite.
	router.GET("/api/settings/backup/status", func(c echo.Context) error {
		url, _ := sm.GetSetting(secrets.SettingBackupURL)
		interval, _ := sm.GetSetting(secrets.SettingBackupIntervalHeures)
		actif, err := sm.GetSetting(secrets.SettingBackupActif)

		heures := 24
		if n, e := strconv.Atoi(strings.TrimSpace(interval)); e == nil && n > 0 {
			heures = n
		}

		adminURL, _ := sm.GetSetting(secrets.SettingBackupAdminURL)
		if strings.TrimSpace(adminURL) == "" {
			adminURL = backup.URLAdminParDefaut(url)
		}

		return c.JSON(http.StatusOK, map[string]any{
			"configured":            sm.HasSecret(secrets.KeyBackupAPI),
			"endpoint_url":          url,
			"encryption_configured": sm.HasSecret(secrets.KeyBackupChiffrement),
			// La présence de la clé super-admin est ce qui fait apparaître
			// l'interface de restauration. Sa VALEUR n'est jamais rendue.
			"super_configured": sm.HasSecret(secrets.KeyBackupSuperAdmin),
			"admin_url":        adminURL,
			"interval_hours":   heures,
			"enabled":          err != nil || strings.TrimSpace(actif) != "0",
			"state":            planificateur.LireEtat(),
		})
	}, requireAdmin)

	// ── DELETE /api/settings/backup ─────────────────────────────────────────
	//
	// N'efface QUE la clé d'API. Pas la clé de chiffrement : l'effacer rendrait
	// d'un geste tous les snapshots déposés définitivement illisibles, et ce
	// n'est pas quelque chose qu'un bouton « supprimer la configuration » doit
	// pouvoir faire.
	router.DELETE("/api/settings/backup", func(c echo.Context) error {
		log.Println("🗑️ DELETE /api/settings/backup")
		if err := sm.DeleteSecret(secrets.KeyBackupAPI); err != nil {
			return c.JSON(http.StatusNotFound, map[string]any{
				"error": "Clé API non trouvée",
			})
		}
		return c.JSON(http.StatusOK, map[string]any{
			"success": true,
			"message": "Clé API de sauvegarde supprimée (la clé de chiffrement est conservée)",
		})
	}, requireAdmin)

	// ── GET /api/backup/encryption-key ──────────────────────────────────────
	//
	// RÉVÈLE la clé. C'est délibéré, et voici le raisonnement, pour qu'il
	// puisse être contesté plutôt que redécouvert :
	//
	// Le mode nominal est de FOURNIR la clé — on la détient alors déjà. Mais
	// une installation qui n'en a jamais reçu s'en génère une au premier
	// snapshot, et cette clé n'existe QU'ICI. Sans moyen de l'extraire, les
	// sauvegardes de ce poste sont irrécupérables le jour où son disque meurt
	// — c'est-à-dire le seul jour où elles servent.
	//
	// Le risque ajouté est nul : la route exige une session ADMIN PocketBase,
	// et quiconque l'a peut déjà lire la base entière — factures comprises.
	// La clé ne protège pas contre lui, elle protège contre une fuite de
	// l'hébergement mutualisé, qui n'a rien à voir.
	router.GET("/api/backup/encryption-key", func(c echo.Context) error {
		if !sm.HasSecret(secrets.KeyBackupChiffrement) {
			return c.JSON(http.StatusNotFound, map[string]any{
				"error": "Aucune clé de chiffrement : elle sera générée à la première sauvegarde",
			})
		}
		cle, err := sm.GetSecret(secrets.KeyBackupChiffrement)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]any{
				"error": "Clé illisible",
			})
		}

		// Tracé. Si la question « qui a sorti cette clé, et quand » se pose un
		// jour, il faut qu'elle ait une réponse.
		log.Println("🔑 backup : clé de chiffrement RÉVÉLÉE via /api/backup/encryption-key")

		return c.JSON(http.StatusOK, map[string]any{
			"encryption_key": cle,
			"warning":        "Conservez cette clé HORS de ce poste. Sans elle, aucune sauvegarde n'est restaurable.",
		})
	}, requireAdmin)

	// ── clientSuper construit le client de lecture distante ─────────────────
	//
	// Reconstruit à chaque appel plutôt que gardé : la clé peut être effacée
	// en cours de session — c'est même le geste attendu en fin d'intervention
	// — et un client mis en cache continuerait de fonctionner après.
	clientSuper := func() (*backup.ClientSuper, error) {
		cleSuper, err := sm.GetSecret(secrets.KeyBackupSuperAdmin)
		if err != nil || strings.TrimSpace(cleSuper) == "" {
			return nil, fmt.Errorf("aucune clé super-admin sur ce poste")
		}
		adminURL, _ := sm.GetSetting(secrets.SettingBackupAdminURL)
		if strings.TrimSpace(adminURL) == "" {
			depot, _ := sm.GetSetting(secrets.SettingBackupURL)
			adminURL = backup.URLAdminParDefaut(depot)
		}
		return backup.NouveauClientSuper(adminURL, cleSuper)
	}

	// ── GET /api/backup/remote ──────────────────────────────────────────────
	//
	// L'inventaire de ce que le serveur détient, tous clients confondus. C'est
	// la moitié visible de la clé super-admin.
	router.GET("/api/backup/remote", func(c echo.Context) error {
		cs, err := clientSuper()
		if err != nil {
			return c.JSON(http.StatusPreconditionFailed, map[string]any{
				"error": err.Error(),
			})
		}

		snapshots, err := cs.Lister(c.QueryParam("client_id"))
		if err != nil {
			return c.JSON(http.StatusBadGateway, map[string]any{
				"error": err.Error(),
			})
		}

		return c.JSON(http.StatusOK, map[string]any{"snapshots": snapshots})
	}, requireAdmin)

	// ── POST /api/backup/remote/delete ──────────────────────────────────────
	//
	// Sans retour possible. La confirmation est redemandée ici ET par le
	// serveur : une seule des deux gardes suffirait à la sûreté technique, les
	// deux ensemble évitent qu'un appel programmatique efface une sauvegarde
	// sans que personne ne l'ait voulu.
	router.POST("/api/backup/remote/delete", func(c echo.Context) error {
		var req struct {
			ClientID   string `json:"client_id"`
			SnapshotID string `json:"snapshot_id"`
			Confirm    string `json:"confirm"`
		}
		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]any{"error": "Données invalides"})
		}
		if req.SnapshotID == "" || req.Confirm != req.SnapshotID {
			return c.JSON(http.StatusPreconditionRequired, map[string]any{
				"error": "Confirmation manquante",
			})
		}

		cs, err := clientSuper()
		if err != nil {
			return c.JSON(http.StatusPreconditionFailed, map[string]any{"error": err.Error()})
		}
		if err := cs.Supprimer(req.ClientID, req.SnapshotID); err != nil {
			return c.JSON(http.StatusBadGateway, map[string]any{"error": err.Error()})
		}

		log.Printf("🗑️ backup : snapshot distant %s supprimé", req.SnapshotID)
		return c.JSON(http.StatusOK, map[string]any{"success": true})
	}, requireAdmin)

	// ── DELETE /api/backup/super-key ────────────────────────────────────────
	//
	// Le geste de fin d'intervention. Il a sa propre route, et pas un drapeau
	// dans la route de configuration, parce qu'il doit être ATTEIGNABLE EN UN
	// CLIC : une clé qu'on oublie d'effacer sur le poste d'un magasin ouvre
	// les sauvegardes de tous les autres.
	router.DELETE("/api/backup/super-key", func(c echo.Context) error {
		if err := sm.DeleteSecret(secrets.KeyBackupSuperAdmin); err != nil {
			return c.JSON(http.StatusNotFound, map[string]any{
				"error": "Aucune clé super-admin sur ce poste",
			})
		}
		log.Println("🔒 backup : clé super-admin EFFACÉE de ce poste")
		return c.JSON(http.StatusOK, map[string]any{
			"success": true,
			"message": "Clé super-admin effacée de ce poste",
		})
	}, requireAdmin)

	// ── POST /api/backup/restore ────────────────────────────────────────────
	//
	// ARME une restauration. Le remplacement effectif a lieu au démarrage
	// suivant : voir l'en-tête de ce fichier.
	router.POST("/api/backup/restore", func(c echo.Context) error {
		var req struct {
			ClientID   string `json:"client_id"`
			ClientNom  string `json:"client_name"`
			SnapshotID string `json:"snapshot_id"`
			Origine    string `json:"origin"`
			CreeLe     string `json:"created_at"`
			Confirm    string `json:"confirm"`
		}
		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]any{"error": "Données invalides"})
		}

		// Retaper l'identifiant est la seule garde qui distingue « je veux
		// remplacer CETTE base » d'un clic. C'est le geste le plus destructeur
		// de l'application : il n'a pas de raccourci.
		if req.SnapshotID == "" || req.Confirm != req.SnapshotID {
			return c.JSON(http.StatusPreconditionRequired, map[string]any{
				"error": "Confirmation manquante : renvoyer l'identifiant du snapshot",
			})
		}

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
		defer flux.Close()

		err = backup.PreparerRestauration(
			pb.DataDir(), flux, cle, req.SnapshotID, shaAnnonce,
			backup.RestaurationEnAttente{
				ClientID:  req.ClientID,
				ClientNom: req.ClientNom,
				Origine:   req.Origine,
				CreeLe:    req.CreeLe,
			},
		)
		if err != nil {
			// Le message porte la cause exacte — empreinte divergente, clé qui
			// ne correspond pas, flux tronqué. Chacune se corrige autrement.
			return c.JSON(http.StatusUnprocessableEntity, map[string]any{"error": err.Error()})
		}

		return c.JSON(http.StatusOK, map[string]any{
			"success": true,
			"pending": backup.LireRestaurationEnAttente(pb.DataDir()),
			"message": "Restauration préparée. Elle sera appliquée au redémarrage de l'application.",
		})
	}, requireAdmin)

	// ── GET /api/backup/restore/status ──────────────────────────────────────
	router.GET("/api/backup/restore/status", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]any{
			"pending": backup.LireRestaurationEnAttente(pb.DataDir()),
		})
	}, requireAdmin)

	// ── DELETE /api/backup/restore ──────────────────────────────────────────
	//
	// Désarme. Indispensable : entre la préparation et le redémarrage, on doit
	// pouvoir changer d'avis — sinon la seule issue serait de laisser
	// l'application remplacer une base qu'on ne voulait plus remplacer.
	router.DELETE("/api/backup/restore", func(c echo.Context) error {
		if err := backup.AnnulerRestauration(pb.DataDir()); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]any{"error": err.Error()})
		}
		return c.JSON(http.StatusOK, map[string]any{
			"success": true,
			"message": "Restauration annulée",
		})
	}, requireAdmin)

	log.Println("✅ Backup routes registered successfully")
}
