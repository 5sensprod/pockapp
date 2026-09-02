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
// ─── Ce que ce fichier ne fait pas ─────────────────────────────────────────
// Il ne restaure rien. Télécharger un snapshot et REMPLACER la base vivante
// sont deux gestes très différents : le second demande que PocketBase lâche
// son fichier, ce qu'il ne fait pas tant que l'application tourne. La
// restauration reste dans backend/cmd/snapshot-restore.
// ═══════════════════════════════════════════════════════════════════════════

package backup

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// SnapshotDistant est une ligne de l'inventaire du serveur.
type SnapshotDistant struct {
	ClientID    string `json:"client_id"`
	ClientName  string `json:"client_name"`
	SnapshotID  string `json:"snapshot_id"`
	Statut      string `json:"status"`
	TailleClair int64  `json:"plain_size"`
	SHA256Clair string `json:"plain_sha256"`
	NbTranches  int    `json:"chunk_count"`
	AppVersion  string `json:"app_version"`
	Origine     string `json:"origin"`
	CreeLe      string `json:"created_at"`
	DeposeLe    string `json:"uploaded_at"`
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
