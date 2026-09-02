// backend/backup/super.go
// ═══════════════════════════════════════════════════════════════════════════
// CLIENT DE L'ENDPOINT SUPER-ADMIN — LIRE CE QUE LE SERVEUR DÉTIENT
// ═══════════════════════════════════════════════════════════════════════════
// Ce que la clé super-admin permet, et que la clé du poste ne permet pas :
// voir les sauvegardes de TOUS les clients, les télécharger, les supprimer.
//
// ─── Pourquoi ça passe par le Go et pas directement par le navigateur ──────
// La clé vit dans le SecretManager, chiffrée, sur le poste. La donner au
// navigateur pour qu'il appelle le mini-SaaS lui-même la sortirait de sa
// cachette et la mettrait dans le bundle, dans les journaux réseau du poste,
// et dans le presse-papier de qui inspecte la page. Le Go la garde et relaie.
//
// ─── Le miroir des images passe aussi par ici ─────────────────────────────
// Déclarer un socle, lister le miroir, rapatrier un fichier : trois gestes de
// l'ÉDITEUR, donc trois actions sous la clé super-admin. Déclarer un socle en
// particulier ne peut pas être laissé au poste — un poste qui pourrait
// affirmer « j'ai déjà tout » cesserait de sauvegarder ses images sans que
// personne ne s'en aperçoive.
// ═══════════════════════════════════════════════════════════════════════════

package backup

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// SnapshotDistant est une ligne de l'inventaire du serveur.
type SnapshotDistant struct {
	ClientID     string `json:"client_id"`
	ClientName   string `json:"client_name"`
	SnapshotID   string `json:"snapshot_id"`
	Statut       string `json:"status"`
	TailleClair  int64  `json:"plain_size"`
	SHA256Clair  string `json:"plain_sha256"`
	NbTranches   int    `json:"chunk_count"`
	AppVersion   string `json:"app_version"`
	Origine      string `json:"origin"`
	EmpreinteCle string `json:"key_fingerprint"`
	CreeLe       string `json:"created_at"`
	DeposeLe     string `json:"uploaded_at"`
}

// ClientSuper parle à l'endpoint super-admin.
type ClientSuper struct {
	Endpoint string
	CleSuper string
	http     *http.Client
}

// URLAdminParDefaut déduit l'endpoint super-admin de celui du dépôt.
//
// Les deux scripts vivent côte à côte ; demander à l'utilisateur de saisir
// deux URL qui ne diffèrent que par un suffixe, c'est fabriquer une occasion
// de se tromper pour rien. Un réglage permet malgré tout de la forcer.
func URLAdminParDefaut(urlDepot string) string {
	urlDepot = strings.TrimSpace(urlDepot)
	if urlDepot == "" {
		return ""
	}
	if strings.HasSuffix(urlDepot, "/backup.php") {
		return strings.TrimSuffix(urlDepot, "/backup.php") + "/backup-admin.php"
	}
	return urlDepot
}

// NouveauClientSuper construit le client. HTTPS exigé, comme partout ailleurs :
// la clé super-admin voyage en clair dans un en-tête, et elle ouvre les
// sauvegardes de tous les clients.
func NouveauClientSuper(endpoint, cleSuper string) (*ClientSuper, error) {
	endpoint = strings.TrimSpace(endpoint)
	if endpoint == "" {
		return nil, fmt.Errorf("URL super-admin non configurée")
	}
	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, fmt.Errorf("URL super-admin illisible : %w", err)
	}
	if u.Scheme != "https" {
		return nil, fmt.Errorf("l'URL super-admin doit être en HTTPS")
	}
	if strings.TrimSpace(cleSuper) == "" {
		return nil, fmt.Errorf("clé super-admin non configurée")
	}
	return &ClientSuper{
		Endpoint: endpoint,
		CleSuper: cleSuper,
		http:     &http.Client{Timeout: 60 * time.Second},
	}, nil
}

func (c *ClientSuper) appeler(methode, action string, params url.Values, corps io.Reader) (*http.Response, error) {
	u, err := url.Parse(c.Endpoint)
	if err != nil {
		return nil, err
	}
	if params == nil {
		params = url.Values{}
	}
	params.Set("action", action)
	u.RawQuery = params.Encode()

	req, err := http.NewRequest(methode, u.String(), corps)
	if err != nil {
		return nil, err
	}
	// En-tête, jamais en paramètre d'URL : cette clé n'a rien à faire dans les
	// journaux d'accès du mutualisé.
	req.Header.Set("X-Super-Key", c.CleSuper)
	req.Header.Set("User-Agent", AgentUtilisateur)
	if corps != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return c.http.Do(req)
}

// Lister rend l'inventaire. `clientID` vide = tous les clients.
func (c *ClientSuper) Lister(clientID string) ([]SnapshotDistant, error) {
	params := url.Values{}
	if strings.TrimSpace(clientID) != "" {
		params.Set("client_id", clientID)
	}

	resp, err := c.appeler(http.MethodGet, "liste", params, nil)
	if err != nil {
		return nil, fmt.Errorf("inventaire distant : %w", err)
	}
	corps, err := lireReponse(resp)
	if err != nil {
		return nil, fmt.Errorf("inventaire distant : %w", err)
	}

	var reponse struct {
		Snapshots []SnapshotDistant `json:"backups"`
	}
	if err := json.Unmarshal(corps, &reponse); err != nil {
		return nil, fmt.Errorf("inventaire illisible : %w", err)
	}
	return reponse.Snapshots, nil
}

// Telecharger ouvre le flux chiffré d'un snapshot. L'appelant DOIT fermer le
// corps rendu.
//
// Rend aussi l'empreinte du clair annoncée par le serveur, en en-tête : elle
// permet de vérifier la restauration sans avoir à relire l'inventaire, et
// c'est ce contrôle qui autorise — ou non — à remplacer une base.
func (c *ClientSuper) Telecharger(clientID, snapshotID string) (io.ReadCloser, string, error) {
	resp, err := c.appeler(http.MethodGet, "telecharger", url.Values{
		"client_id":   {clientID},
		"snapshot_id": {snapshotID},
	}, nil)
	if err != nil {
		return nil, "", fmt.Errorf("téléchargement : %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		extrait, _ := io.ReadAll(io.LimitReader(resp.Body, 400))
		resp.Body.Close()
		return nil, "", fmt.Errorf("téléchargement : le serveur a répondu %d : %s",
			resp.StatusCode, strings.TrimSpace(string(extrait)))
	}
	// Le corps attendu est binaire. Du HTML ou du JSON ici signale une erreur
	// que le code de statut n'a pas dite — mieux vaut le voir maintenant que
	// d'écrire une page web dans un fichier data.db.
	if ct := resp.Header.Get("Content-Type"); strings.Contains(ct, "text/html") ||
		strings.Contains(ct, "application/json") {
		resp.Body.Close()
		return nil, "", fmt.Errorf("réponse inattendue du serveur (%s) au lieu du snapshot", ct)
	}

	return resp.Body, resp.Header.Get("X-Plain-Sha256"), nil
}

// Supprimer efface un snapshot distant, sans retour possible.
//
// La confirmation redemandée au serveur (`confirm`) n'est pas une politesse :
// elle interdit qu'une requête mal formée, ou rejouée depuis un journal,
// efface une sauvegarde. Le serveur refuse en 428 sans elle.
func (c *ClientSuper) Supprimer(clientID, snapshotID string) error {
	charge, _ := json.Marshal(map[string]string{
		"client_id":   clientID,
		"snapshot_id": snapshotID,
		"confirm":     snapshotID,
	})

	resp, err := c.appeler(http.MethodPost, "supprimer", url.Values{
		"client_id":   {clientID},
		"snapshot_id": {snapshotID},
	}, strings.NewReader(string(charge)))
	if err != nil {
		return fmt.Errorf("suppression : %w", err)
	}
	if _, err := lireReponse(resp); err != nil {
		return fmt.Errorf("suppression : %w", err)
	}
	return nil
}

// ═══════════════════════════════════════════════════════════════════════════
// MIROIR DES IMAGES
// ═══════════════════════════════════════════════════════════════════════════

// StatsStorage résume l'état du miroir d'un client.
type StatsStorage struct {
	AvecOctets int   `json:"with_bytes"`
	Socle      int   `json:"baseline"`
	Octets     int64 `json:"bytes"`
}

// FichierMiroir est une entrée du miroir, telle que le serveur la rend.
type FichierMiroir struct {
	Chemin      string `json:"path"`
	Taille      int64  `json:"size"`
	TailleStock int64  `json:"stored_size"`
	AOctets     int    `json:"has_bytes"`
	CreeLe      string `json:"created_at"`
}

// DeclarerSocle annonce au serveur les fichiers que l'ÉDITEUR détient déjà.
//
// Elle n'envoie AUCUN octet : seulement des chemins. C'est ce qui évite de
// transporter 1,6 Gio, et c'est le geste à faire AVANT la première
// synchronisation d'un poste — sinon celui-ci croira devoir tout envoyer.
//
// Idempotente : redéclarer un socle n'écrase jamais le fait que le serveur
// détient déjà les octets d'un fichier (INSERT IGNORE côté PHP).
func (c *ClientSuper) DeclarerSocle(clientID string, fichiers []FichierStorage) (declares int, err error) {
	charge, err := json.Marshal(map[string]any{"files": fichiers})
	if err != nil {
		return 0, err
	}

	var compresse bytes.Buffer
	if err := gzipVers(&compresse, charge); err != nil {
		return 0, err
	}

	req, err := http.NewRequest(http.MethodPost, c.url("storage-socle", url.Values{
		"client_id": {clientID},
	}), bytes.NewReader(compresse.Bytes()))
	if err != nil {
		return 0, err
	}
	req.Header.Set("X-Super-Key", c.CleSuper)
	req.Header.Set("User-Agent", AgentUtilisateur)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Content-Encoding", "gzip")

	// Déclarer 4712 chemins tient en une requête, mais elle traverse un
	// mutualisé et écrit autant de lignes : le délai par défaut est trop court.
	cl := &http.Client{Timeout: 10 * time.Minute}
	resp, err := cl.Do(req)
	if err != nil {
		return 0, fmt.Errorf("déclaration du socle : %w", err)
	}
	corps, err := lireReponse(resp)
	if err != nil {
		return 0, fmt.Errorf("déclaration du socle : %w", err)
	}

	var reponse struct {
		Declares int `json:"declared"`
		Ignores  int `json:"skipped"`
	}
	if err := json.Unmarshal(corps, &reponse); err != nil {
		return 0, fmt.Errorf("réponse illisible : %w", err)
	}
	if reponse.Ignores > 0 {
		log.Printf("⚠️  socle : %d chemins ignorés (forme inattendue)", reponse.Ignores)
	}
	return reponse.Declares, nil
}

// ListerStorage rend l'inventaire du miroir d'un client.
func (c *ClientSuper) ListerStorage(clientID string) ([]FichierMiroir, StatsStorage, error) {
	resp, err := c.appeler(http.MethodGet, "storage-liste", url.Values{
		"client_id": {clientID},
	}, nil)
	if err != nil {
		return nil, StatsStorage{}, fmt.Errorf("inventaire du miroir : %w", err)
	}
	corps, err := lireReponse(resp)
	if err != nil {
		return nil, StatsStorage{}, fmt.Errorf("inventaire du miroir : %w", err)
	}

	var reponse struct {
		Fichiers []FichierMiroir `json:"files"`
		Stats    StatsStorage    `json:"stats"`
	}
	if err := json.Unmarshal(corps, &reponse); err != nil {
		return nil, StatsStorage{}, fmt.Errorf("inventaire illisible : %w", err)
	}
	return reponse.Fichiers, reponse.Stats, nil
}

// TelechargerFichierStorage rapatrie les octets CHIFFRÉS d'un fichier.
func (c *ClientSuper) TelechargerFichierStorage(clientID, chemin string) ([]byte, error) {
	resp, err := c.appeler(http.MethodGet, "storage-fichier", url.Values{
		"client_id": {clientID},
		"path":      {chemin},
	}, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		extrait, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		return nil, fmt.Errorf("%d : %s", resp.StatusCode, strings.TrimSpace(string(extrait)))
	}
	return io.ReadAll(io.LimitReader(resp.Body, TailleMaxFichier+1024))
}

// url compose une URL d'action. Extrait de `appeler` parce que DeclarerSocle a
// besoin de son propre client HTTP, au délai plus généreux.
func (c *ClientSuper) url(action string, params url.Values) string {
	u, err := url.Parse(c.Endpoint)
	if err != nil {
		return c.Endpoint
	}
	if params == nil {
		params = url.Values{}
	}
	params.Set("action", action)
	u.RawQuery = params.Encode()
	return u.String()
}

// PurgerStorage efface du miroir les fichiers dont le serveur détient les
// octets, pour un client. Les lignes de SOCLE sont épargnées.
//
// ─── À quoi ça sert, concrètement ──────────────────────────────────────────
// Un fichier envoyé sous une clé de chiffrement, puis la clé change : le
// serveur le « connaît » toujours, donc il ne le redemande jamais — et il
// reste illisible pour toujours. Purger le rend inconnu, et le poste le
// renvoie au passage suivant, sous la bonne clé.
//
// ─── Pourquoi épargner le socle ────────────────────────────────────────────
// Les lignes sans octets déclarent ce que l'ÉDITEUR détient. Les effacer
// ferait croire au poste qu'il doit tout renvoyer : 1,6 Gio sur un mutualisé.
// La purge ne touche donc QUE ce que le serveur a réellement reçu.
func (c *ClientSuper) PurgerStorage(clientID string) (int, error) {
	// ListerStorage ne rend, par défaut, que les fichiers AVEC octets : c'est
	// exactement l'ensemble à purger, et le socle en est absent par
	// construction plutôt que par un filtre qu'on pourrait oublier.
	fichiers, _, err := c.ListerStorage(clientID)
	if err != nil {
		return 0, err
	}

	var chemins []string
	for _, f := range fichiers {
		if f.AOctets == 1 {
			chemins = append(chemins, f.Chemin)
		}
	}
	if len(chemins) == 0 {
		return 0, nil
	}

	charge, err := json.Marshal(map[string]any{
		"paths":   chemins,
		"confirm": "supprimer",
	})
	if err != nil {
		return 0, err
	}

	resp, err := c.appeler(http.MethodPost, "storage-supprimer", url.Values{
		"client_id": {clientID},
	}, bytes.NewReader(charge))
	if err != nil {
		return 0, fmt.Errorf("purge du miroir : %w", err)
	}
	corps, err := lireReponse(resp)
	if err != nil {
		return 0, fmt.Errorf("purge du miroir : %w", err)
	}

	var reponse struct {
		Supprimes int `json:"deleted"`
	}
	if err := json.Unmarshal(corps, &reponse); err != nil {
		return 0, fmt.Errorf("réponse de purge illisible : %w", err)
	}

	log.Printf("🖼️  miroir purgé pour %s : %d fichiers effacés, socle conservé",
		clientID, reponse.Supprimes)
	return reponse.Supprimes, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// RAPATRIER LE MIROIR DANS UN `storage/` LOCAL
// ═══════════════════════════════════════════════════════════════════════════

// ResultatRapatriement résume ce qu'un rapatriement a fait.
type ResultatRapatriement struct {
	Distants int
	Ecrits   int
	DejaLa   int
	Echecs   int
	Octets   int64
}

// RapatrierStorage télécharge les fichiers du miroir et les écrit dans le
// `storage/` local, à leur place exacte.
//
// Ne réécrit JAMAIS un fichier déjà présent : le chemin étant l'identité du
// contenu (voir storage.go), un fichier local a forcément le même contenu que
// son homonyme distant. Retélécharger serait du réseau dépensé pour écrire
// deux fois les mêmes octets.
//
// C'est ce qui rend l'opération reprenable sans état : coupée à mi-chemin,
// elle repart et saute ce qu'elle a déjà écrit.
func (c *ClientSuper) RapatrierStorage(clientID, dataDir string, cle []byte) (*ResultatRapatriement, error) {
	if len(cle) != 32 {
		return nil, fmt.Errorf("clé de chiffrement : 32 octets attendus")
	}

	fichiers, _, err := c.ListerStorage(clientID)
	if err != nil {
		return nil, err
	}

	res := &ResultatRapatriement{Distants: len(fichiers)}
	racine := filepath.Join(dataDir, "storage")
	debut := time.Now()

	for _, f := range fichiers {
		if f.AOctets == 0 {
			continue // ligne de socle : l'éditeur les a déjà, par définition
		}

		destination := filepath.Join(racine, filepath.FromSlash(f.Chemin))
		if _, err := os.Stat(destination); err == nil {
			res.DejaLa++
			continue
		}

		chiffre, err := c.TelechargerFichierStorage(clientID, f.Chemin)
		if err != nil {
			log.Printf("⚠️  miroir : %s non téléchargé (%v)", f.Chemin, err)
			res.Echecs++
			continue
		}

		// Le chemin sert d'identifiant dans les données authentifiées : un
		// fichier présenté sous le nom d'un autre échoue ici, et non après
		// avoir été écrit sur la mauvaise fiche.
		var clair bytes.Buffer
		if _, err := Restaurer(bytes.NewReader(chiffre), &clair, cle, f.Chemin); err != nil {
			log.Printf("⚠️  miroir : %s non déchiffré (%v)", f.Chemin, err)
			res.Echecs++
			continue
		}

		if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
			res.Echecs++
			continue
		}
		// Temporaire puis rename : une écriture coupée laisserait un fichier
		// tronqué que le passage suivant considérerait comme « déjà là ».
		temporaire := destination + ".tmp"
		if err := os.WriteFile(temporaire, clair.Bytes(), 0o600); err != nil {
			log.Printf("⚠️  miroir : %s non écrit (%v)", f.Chemin, err)
			res.Echecs++
			continue
		}
		if err := os.Rename(temporaire, destination); err != nil {
			os.Remove(temporaire)
			res.Echecs++
			continue
		}

		res.Ecrits++
		res.Octets += int64(clair.Len())
	}

	log.Printf("🖼️  miroir rapatrié : %d écrits, %d déjà présents, %d échecs, %d Kio, en %s",
		res.Ecrits, res.DejaLa, res.Echecs, res.Octets/1024, time.Since(debut).Round(time.Second))

	return res, nil
}
