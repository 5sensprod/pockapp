// backend/cmd/snapshot-restore/main.go
// ═══════════════════════════════════════════════════════════════════════════
// RESTAURER UN SNAPSHOT DU CLIENT DANS UNE POCKETBASE DE DÉVELOPPEMENT
// ═══════════════════════════════════════════════════════════════════════════
// C'est la moitié qui justifie l'autre : sans elle, la sauvegarde est un tas
// d'octets dont personne n'a jamais vérifié qu'il se relit.
//
//	# lister ce que le serveur détient
//	go run ./backend/cmd/snapshot-restore -list
//
//	# récupérer un snapshot et le déposer dans un dossier pb_data neuf
//	go run ./backend/cmd/snapshot-restore -snapshot 20260901T173000Z-a1b2c3d4 -out ./pb_data_client
//
// ─── Ce que l'outil NE fait PAS, délibérément ──────────────────────────────
// Il n'écrit JAMAIS dans %LOCALAPPDATA%\PocketReact\pb_data, et il refuse
// d'écrire dans un dossier qui contient déjà un data.db. Restaurer par-dessus
// une base vivante, c'est effacer des ventes ; l'outil ne doit pas rendre ce
// geste possible par distraction, un soir de diagnostic.
//
// ─── Les images ────────────────────────────────────────────────────────────
// Le snapshot ne contient pas `storage/` (voir backend/backup/snapshot.go).
// La base restaurée est donc entière côté données et vide côté octets
// d'images : les fiches produits s'affichent sans visuel. C'est attendu.
// ═══════════════════════════════════════════════════════════════════════════

package main

import (
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"pocket-react/backend/backup"
)

func main() {
	var (
		endpoint   = flag.String("endpoint", env("BACKUP_ADMIN_URL", "https://pocketapp.5sensprod.com/api/backup-admin.php"), "endpoint super-admin des sauvegardes")
		superKey   = flag.String("super-key", os.Getenv("BACKUP_SUPER_KEY"), "clé super-admin (en-tête X-Super-Key)")
		cleHex     = flag.String("key", os.Getenv("BACKUP_ENCRYPTION_KEY"), "clé de déchiffrement, 64 caractères hexadécimaux")
		snapshotID = flag.String("snapshot", "", "identifiant du snapshot à restaurer")
		clientID   = flag.String("client", os.Getenv("BACKUP_CLIENT_ID"), "identifiant du client propriétaire du snapshot")
		sortie     = flag.String("out", "", "dossier pb_data à créer (doit être vide ou inexistant)")
		fichier    = flag.String("file", "", "restaurer depuis un fichier .bin déjà téléchargé, au lieu du serveur")
		lister     = flag.Bool("list", false, "lister les snapshots disponibles et sortir")
	)
	flag.Parse()

	if *lister {
		if err := listerSnapshots(*endpoint, *superKey); err != nil {
			echouer(err)
		}
		return
	}

	if *snapshotID == "" {
		echouer(fmt.Errorf("-snapshot est requis (ou -list pour voir ce qui existe)"))
	}
	if *sortie == "" {
		echouer(fmt.Errorf("-out est requis : le dossier pb_data à créer"))
	}

	cle, err := lireCle(*cleHex)
	if err != nil {
		echouer(err)
	}

	// ── Où écrire, et pourquoi on vérifie avant d'ouvrir quoi que ce soit ──
	cheminDB, err := preparerSortie(*sortie)
	if err != nil {
		echouer(err)
	}

	// ── D'où viennent les octets ────────────────────────────────────────────
	var source io.ReadCloser
	if *fichier != "" {
		f, err := os.Open(*fichier)
		if err != nil {
			echouer(fmt.Errorf("ouverture du fichier : %w", err))
		}
		source = f
	} else {
		if *clientID == "" {
			echouer(fmt.Errorf("-client est requis pour télécharger (ou utiliser -file)"))
		}
		fmt.Printf("⬇️  téléchargement de %s…\n", *snapshotID)
		r, err := telecharger(*endpoint, *superKey, *clientID, *snapshotID)
		if err != nil {
			echouer(err)
		}
		source = r
	}
	defer source.Close()

	// ── Déchiffrement et décompression ──────────────────────────────────────
	dest, err := os.OpenFile(cheminDB, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		echouer(fmt.Errorf("création de %s : %w", cheminDB, err))
	}

	debut := time.Now()
	empreinte, err := backup.Restaurer(source, dest, cle, *snapshotID)
	dest.Close()
	if err != nil {
		// On efface ce qu'on a écrit : laisser une base à moitié restaurée
		// sur le disque, c'est fabriquer le prochain diagnostic faussé.
		os.Remove(cheminDB)
		echouer(fmt.Errorf("restauration : %w", err))
	}

	info, _ := os.Stat(cheminDB)
	fmt.Printf("✅ %s restauré en %s\n", cheminDB, time.Since(debut).Round(time.Millisecond))
	fmt.Printf("   taille   : %d Kio\n", info.Size()/1024)
	fmt.Printf("   empreinte: %s\n", empreinte)
	fmt.Println()
	fmt.Println("⚠️  Comparer cette empreinte à `plain_sha256` du manifeste (-list).")
	fmt.Println("   Si elles diffèrent, la base restaurée N'EST PAS celle du client.")
	fmt.Println()
	fmt.Println("Pour l'utiliser :")
	fmt.Printf("   pnpm dev  avec pb_data pointant sur %s\n", filepath.Dir(cheminDB))
	fmt.Println("   (les images ne sont pas dans le snapshot : fiches sans visuel, c'est normal)")
}

// preparerSortie refuse tout dossier qui ressemble à une base vivante.
//
// C'est la seule garde qui protège d'une erreur de frappe coûteuse : `-out`
// pointé sur le pb_data de travail, un soir, écraserait une base réelle.
func preparerSortie(dossier string) (string, error) {
	cheminDB := filepath.Join(dossier, "data.db")

	if _, err := os.Stat(cheminDB); err == nil {
		return "", fmt.Errorf("%s existe déjà — refus d'écraser une base ; choisir un dossier neuf", cheminDB)
	}

	// Le pb_data de production locale est nommément interdit : c'est celui
	// qu'on risque le plus de désigner par habitude.
	if local := os.Getenv("LOCALAPPDATA"); local != "" {
		interdit := filepath.Join(local, "PocketReact", "pb_data")
		abs, err1 := filepath.Abs(dossier)
		absInterdit, err2 := filepath.Abs(interdit)
		if err1 == nil && err2 == nil && strings.EqualFold(abs, absInterdit) {
			return "", fmt.Errorf("refus d'écrire dans le pb_data de l'application (%s) : utiliser un dossier séparé", interdit)
		}
	}

	if err := os.MkdirAll(dossier, 0o700); err != nil {
		return "", fmt.Errorf("création du dossier : %w", err)
	}
	return cheminDB, nil
}

func lireCle(hexa string) ([]byte, error) {
	hexa = strings.TrimSpace(hexa)
	if hexa == "" {
		return nil, fmt.Errorf("clé de déchiffrement absente : passer -key ou définir BACKUP_ENCRYPTION_KEY")
	}
	cle, err := hex.DecodeString(hexa)
	if err != nil {
		return nil, fmt.Errorf("clé illisible (64 caractères hexadécimaux attendus) : %w", err)
	}
	if len(cle) != 32 {
		return nil, fmt.Errorf("clé de %d octets, 32 attendus", len(cle))
	}
	return cle, nil
}

type ligneSnapshot struct {
	ClientID    string `json:"client_id"`
	ClientName  string `json:"client_name"`
	SnapshotID  string `json:"snapshot_id"`
	Status      string `json:"status"`
	PlainSize   int64  `json:"plain_size"`
	PlainSHA256 string `json:"plain_sha256"`
	AppVersion  string `json:"app_version"`
	Origin      string `json:"origin"`
	CreatedAt   string `json:"created_at"`
}

func listerSnapshots(endpoint, superKey string) error {
	corps, err := appelAdmin(endpoint, superKey, url.Values{"action": {"liste"}})
	if err != nil {
		return err
	}
	defer corps.Close()

	var reponse struct {
		Backups []ligneSnapshot `json:"backups"`
	}
	if err := json.NewDecoder(corps).Decode(&reponse); err != nil {
		return fmt.Errorf("réponse illisible : %w", err)
	}

	if len(reponse.Backups) == 0 {
		fmt.Println("Aucun snapshot sur le serveur.")
		return nil
	}

	fmt.Printf("%-26s  %-9s  %-9s  %-14s  %s\n", "SNAPSHOT", "ÉTAT", "TAILLE", "CLIENT", "CRÉÉ LE")
	for _, b := range reponse.Backups {
		nom := b.ClientName
		if len(nom) > 14 {
			nom = nom[:14]
		}
		fmt.Printf("%-26s  %-9s  %6d Ki  %-14s  %s\n",
			b.SnapshotID, b.Status, b.PlainSize/1024, nom, b.CreatedAt)
	}
	fmt.Println()
	fmt.Println("Pour restaurer :")
	fmt.Println("  go run ./backend/cmd/snapshot-restore -client <CLIENT_ID> -snapshot <SNAPSHOT> -out ./pb_data_client")
	return nil
}

func telecharger(endpoint, superKey, clientID, snapshotID string) (io.ReadCloser, error) {
	return appelAdmin(endpoint, superKey, url.Values{
		"action":      {"telecharger"},
		"client_id":   {clientID},
		"snapshot_id": {snapshotID},
	})
}

func appelAdmin(endpoint, superKey string, params url.Values) (io.ReadCloser, error) {
	if strings.TrimSpace(superKey) == "" {
		return nil, fmt.Errorf("clé super-admin absente : passer -super-key ou définir BACKUP_SUPER_KEY")
	}

	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, fmt.Errorf("endpoint illisible : %w", err)
	}
	if u.Scheme != "https" && !strings.HasPrefix(u.Host, "127.0.0.1") && !strings.HasPrefix(u.Host, "localhost") {
		return nil, fmt.Errorf("l'endpoint admin doit être en HTTPS (la clé super-admin y voyage)")
	}
	u.RawQuery = params.Encode()

	req, err := http.NewRequest(http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	// En-tête, jamais en paramètre d'URL : cette clé ouvre les sauvegardes de
	// TOUS les clients, elle n'a rien à faire dans les journaux d'accès.
	req.Header.Set("X-Super-Key", superKey)
	req.Header.Set("User-Agent", backup.AgentUtilisateur)

	resp, err := (&http.Client{Timeout: 10 * time.Minute}).Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		extrait, _ := io.ReadAll(io.LimitReader(resp.Body, 400))
		resp.Body.Close()
		return nil, fmt.Errorf("le serveur a répondu %d : %s", resp.StatusCode, strings.TrimSpace(string(extrait)))
	}
	// Une redirection vers la page de connexion arrive en 200 avec du HTML :
	// sans ce contrôle, on écrirait la page de login dans data.db.
	if ct := resp.Header.Get("Content-Type"); strings.Contains(ct, "text/html") {
		resp.Body.Close()
		return nil, fmt.Errorf("réponse HTML au lieu du fichier attendu — vérifier l'URL de l'endpoint")
	}
	return resp.Body, nil
}

// tronquer coupe proprement une colonne de tableau.
func tronquer(s string, n int) string {
	if s == "" {
		return "—"
	}
	if len(s) > n {
		return s[:n]
	}
	return s
}

func env(cle, defaut string) string {
	if v := os.Getenv(cle); v != "" {
		return v
	}
	return defaut
}

func echouer(err error) {
	fmt.Fprintf(os.Stderr, "❌ %v\n", err)
	os.Exit(1)
}
