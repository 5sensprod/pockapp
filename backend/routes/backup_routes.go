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
//   GET    /api/backup/storage         → l'inventaire LOCAL du storage
//   POST   /api/backup/storage/baseline → déclare ce storage comme socle
//   POST   /api/backup/storage/pull    → rapatrie le miroir d'un client
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

		// ── Les deux clés doivent rester DISTINCTES ─────────────────────────
		//
		// `clients.api_key` est stockée EN CLAIR dans le mini-SaaS et affichée
		// dans son interface : leur donner la même valeur reviendrait à confier
		// la clé de déchiffrement au serveur qu'elle protège.
		//
		// Le contrôle porte sur l'état FINAL, pas sur ce qui est en base.
		// Comparer une clé soumise à l'ANCIENNE valeur de l'autre refusait la
		// correction elle-même : saisir les deux clés ensemble, précisément
		// pour sortir d'une configuration fautive, était rejeté parce que la
		// nouvelle clé API valait l'ancienne clé de chiffrement. Mesuré le
		// 3 septembre 2026.
		//
		// Et il a lieu AVANT toute écriture : valider au fil de l'eau laissait
		// la première clé enregistrée et la seconde refusée, donc le poste dans
		// un état que personne n'avait demandé.
		finaleAPI := req.APIKey
		if finaleAPI == "" {
			finaleAPI, _ = sm.GetSecret(secrets.KeyBackupAPI)
		}
		finaleChiffrement := req.EncryptionKey
		if finaleChiffrement == "" {
			finaleChiffrement, _ = sm.GetSecret(secrets.KeyBackupChiffrement)
		}
		if err := backup.ClesDistinctes(finaleChiffrement, finaleAPI); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]any{"error": err.Error()})
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
			// L'empreinte de la clé de CE poste. Comparée à celle de chaque
			// snapshot, elle dit d'un coup d'œil lesquels sont lisibles ici.
			"encryption_fingerprint": empreinteCleLocale(sm),
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

	// ── GET /api/backup/storage ─────────────────────────────────────────────
	//
	// Ce que CE poste détient. Sert à mesurer avant de déclarer un socle : on
	// ne déclare pas 4712 fichiers sans les avoir comptés d'abord.
	router.GET("/api/backup/storage", func(c echo.Context) error {
		fichiers, err := backup.InventorierStorage(pb.DataDir())
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]any{"error": err.Error()})
		}
		var octets int64
		for _, f := range fichiers {
			octets += f.Taille
		}
		return c.JSON(http.StatusOK, map[string]any{
			"count": len(fichiers),
			"bytes": octets,
		})
	}, requireAdmin)

	// ── GET /api/backup/storage/mirror ──────────────────────────────────────
	//
	// Ce que le serveur détient POUR UN CLIENT : combien de fichiers déclarés
	// au socle, combien dont il a réellement les octets.
	//
	// Sans cette route, rien à l'écran ne distingue « socle déclaré » de
	// « socle jamais déclaré » — et c'est précisément la confusion qui coûte
	// un téléversement de 1,6 Gio.
	router.GET("/api/backup/storage/mirror", func(c echo.Context) error {
		clientID := strings.TrimSpace(c.QueryParam("client_id"))
		if clientID == "" {
			return c.JSON(http.StatusBadRequest, map[string]any{"error": "client_id requis"})
		}

		cs, err := clientSuper()
		if err != nil {
			return c.JSON(http.StatusPreconditionFailed, map[string]any{"error": err.Error()})
		}

		_, stats, err := cs.ListerStorage(clientID)
		if err != nil {
			return c.JSON(http.StatusBadGateway, map[string]any{"error": err.Error()})
		}
		return c.JSON(http.StatusOK, stats)
	}, requireAdmin)

	// ── POST /api/backup/storage/baseline ───────────────────────────────────
	//
	// Déclare le `storage/` de CE poste comme déjà détenu, pour un client
	// donné. AUCUN octet ne part : seulement des chemins.
	//
	// C'est le geste qui évite de transporter 1,6 Gio, et il doit être fait
	// AVANT la première synchronisation du poste concerné — sinon celui-ci
	// croira devoir tout envoyer.
	router.POST("/api/backup/storage/baseline", func(c echo.Context) error {
		var req struct {
			ClientID string `json:"client_id"`
		}
		if err := c.Bind(&req); err != nil || strings.TrimSpace(req.ClientID) == "" {
			return c.JSON(http.StatusBadRequest, map[string]any{
				"error": "client_id requis : le client dont on déclare détenir le storage",
			})
		}

		cs, err := clientSuper()
		if err != nil {
			return c.JSON(http.StatusPreconditionFailed, map[string]any{"error": err.Error()})
		}

		fichiers, err := backup.InventorierStorage(pb.DataDir())
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]any{"error": err.Error()})
		}
		if len(fichiers) == 0 {
			return c.JSON(http.StatusBadRequest, map[string]any{
				"error": "Aucun fichier dans le storage de ce poste : rien à déclarer",
			})
		}

		declares, err := cs.DeclarerSocle(req.ClientID, fichiers)
		if err != nil {
			return c.JSON(http.StatusBadGateway, map[string]any{"error": err.Error()})
		}

		log.Printf("🖼️  socle déclaré pour %s : %d nouvelles lignes sur %d fichiers",
			req.ClientID, declares, len(fichiers))

		return c.JSON(http.StatusOK, map[string]any{
			"success":   true,
			"inventory": len(fichiers),
			"declared":  declares,
			"message": fmt.Sprintf(
				"%d fichiers déclarés comme déjà détenus (%d nouveaux). Le poste ne les enverra jamais.",
				len(fichiers), declares),
		})
	}, requireAdmin)

	// ── POST /api/backup/storage/purge ──────────────────────────────────────
	//
	// Efface du miroir les images dont le serveur a les octets, pour un client.
	// Le SOCLE est épargné — l'effacer ferait renvoyer 1,6 Gio.
	//
	// Le cas qui l'exige : des images envoyées sous une clé de chiffrement qui
	// a changé depuis. Le serveur les « connaît », donc ne les redemande
	// jamais, et elles restent illisibles pour toujours.
	router.POST("/api/backup/storage/purge", func(c echo.Context) error {
		var req struct {
			ClientID string `json:"client_id"`
			Confirm  string `json:"confirm"`
		}
		if err := c.Bind(&req); err != nil || strings.TrimSpace(req.ClientID) == "" {
			return c.JSON(http.StatusBadRequest, map[string]any{"error": "client_id requis"})
		}
		if req.Confirm != "purger" {
			return c.JSON(http.StatusPreconditionRequired, map[string]any{
				"error": "Confirmation manquante",
			})
		}

		cs, err := clientSuper()
		if err != nil {
			return c.JSON(http.StatusPreconditionFailed, map[string]any{"error": err.Error()})
		}

		n, err := cs.PurgerStorage(req.ClientID)
		if err != nil {
			return c.JSON(http.StatusBadGateway, map[string]any{"error": err.Error()})
		}

		return c.JSON(http.StatusOK, map[string]any{
			"success": true,
			"deleted": n,
			"message": fmt.Sprintf(
				"%d image(s) effacée(s) du serveur. Le poste les renverra à sa prochaine sauvegarde.", n),
		})
	}, requireAdmin)

	// ── POST /api/backup/storage/pull ───────────────────────────────────────
	//
	// Rapatrie les images du miroir dans le `storage/` de CE poste.
	//
	// Écrit directement dans le storage en service — mais SANS jamais écraser
	// un fichier existant, et sans toucher à la base. Ajouter des octets sous
	// des chemins que PocketBase ne référence pas encore est inoffensif : au
	// pire ils dorment. C'est ce qui permet de le faire à chaud, contrairement
	// à la restauration de `data.db`.
	router.POST("/api/backup/storage/pull", func(c echo.Context) error {
		var req struct {
			ClientID string `json:"client_id"`
		}
		if err := c.Bind(&req); err != nil || strings.TrimSpace(req.ClientID) == "" {
			return c.JSON(http.StatusBadRequest, map[string]any{"error": "client_id requis"})
		}

		cs, err := clientSuper()
		if err != nil {
			return c.JSON(http.StatusPreconditionFailed, map[string]any{"error": err.Error()})
		}
		cle, err := planificateur.CleChiffrement()
		if err != nil {
			return c.JSON(http.StatusPreconditionFailed, map[string]any{"error": err.Error()})
		}

		res, err := cs.RapatrierStorage(req.ClientID, pb.DataDir(), cle)
		if err != nil {
			return c.JSON(http.StatusBadGateway, map[string]any{"error": err.Error()})
		}

		return c.JSON(http.StatusOK, map[string]any{
			"success": true,
			"result":  res,
		})
	}, requireAdmin)

	log.Println("✅ Backup routes registered successfully")
}

// empreinteCleLocale rend l'empreinte de la clé de chiffrement de ce poste,
// ou une chaîne vide s'il n'en a pas.
//
// Ne lève jamais : c'est une information d'affichage, et l'écran doit se
// charger même sans clé configurée.
func empreinteCleLocale(sm *secrets.SecretManager) string {
	brut, err := sm.GetSecret(secrets.KeyBackupChiffrement)
	if err != nil || strings.TrimSpace(brut) == "" {
		return ""
	}
	cle, err := hex.DecodeString(strings.TrimSpace(brut))
	if err != nil {
		return ""
	}
	return backup.EmpreinteCle(cle)
}
