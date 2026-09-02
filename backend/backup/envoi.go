// backend/backup/envoi.go
// ═══════════════════════════════════════════════════════════════════════════
// ENVOI D'UN SNAPSHOT VERS LE MINI-SAAS — LE PROTOCOLE, CÔTÉ POSTE
// ═══════════════════════════════════════════════════════════════════════════
// Quatre actions, dans cet ordre. Elles sont conçues pour qu'une coupure ne
// coûte JAMAIS un envoi entier — un mutualisé lent et une connexion de
// magasin ne pardonnent pas un transfert monolithique de 5 Mio.
//
//	POST ?action=init     → le serveur crée le dossier et le manifeste
//	GET  ?action=etat     → quelles tranches sont DÉJÀ arrivées (reprise)
//	POST ?action=tranche  → une tranche, corps binaire brut
//	POST ?action=valider  → le serveur assemble, vérifie, et SEULEMENT ALORS
//	                        le snapshot devient visible et remplaçable
//
// ─── Pourquoi la validation est une action à part ──────────────────────────
// Tant que `valider` n'a pas répondu, le snapshot est en `en_cours` et ne
// compte pas comme une sauvegarde. C'est ce qui interdit qu'un envoi
// interrompu chasse un snapshot complet plus ancien par la rétention. La
// règle vaut aussi côté serveur, et elle y est répétée : la purge ne regarde
// que les snapshots `complet`.
//
// ─── Ce que le serveur ne peut pas vérifier ────────────────────────────────
// Il ne peut PAS vérifier l'empreinte du clair : il n'a pas la clé, et c'est
// voulu. Il vérifie donc ce qu'il peut — le compte de tranches, leur taille,
// et l'empreinte de CHAQUE TRANCHE CHIFFRÉE, que le poste annonce en en-tête.
// La vérification du clair, elle, a lieu à la restauration, contre
// `sha256_clair` du manifeste. Les deux ensemble couvrent la chaîne entière.
// ═══════════════════════════════════════════════════════════════════════════

package backup

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// AgentUtilisateur est explicite parce qu'il DOIT l'être : une couche anti-bot
// filtre les domaines du projet et rejette `Go-http-client/1.1` par un 503 en
// HTML, sans jamais atteindre le PHP. C'est la même leçon que
// backend/routes/site_publish_routes.go, apprise le 10 août 2026.
const AgentUtilisateur = "PocketApp-Backup/1.0 (+https://pocketapp.5sensprod.com)"

// Délais. Généreux pour une tranche — le mutualisé est lent —, courts pour les
// actions de contrôle, qui ne transportent que du JSON.
const (
	delaiControle = 30 * time.Second
	delaiTranche  = 120 * time.Second
)

// nbEssaisTranche : une tranche est retentée quelques fois avant d'abandonner
// l'envoi. L'abandon n'est pas grave — la reprise repartira des tranches déjà
// arrivées —, mais s'acharner sur un réseau coupé ne sert à rien.
const nbEssaisTranche = 3

// Manifeste est ce que le poste déclare au serveur à l'ouverture d'un envoi.
// Le serveur le stocke tel quel, sans l'interpréter : il ne sait pas ce qu'est
// une base PocketBase, et n'a pas à le savoir.
type Manifeste struct {
	IDSnapshot  string `json:"snapshot_id"`
	CreeLe      string `json:"created_at"` // RFC 3339, UTC
	Algo        string `json:"algo"`
	TailleClair int64  `json:"plain_size"`
	SHA256Clair string `json:"plain_sha256"`
	TailleChiff int64  `json:"cipher_size"`
	NbTranches  int    `json:"chunk_count"`

	// AppVersion sert au diagnostic : savoir quel build a produit un snapshot
	// répond à la moitié des questions quand on cherche à reproduire un bogue.
	AppVersion string `json:"app_version,omitempty"`

	// Origine nomme le POSTE qui a produit le snapshot — le nom de machine,
	// par défaut.
	//
	// Sans elle, deux postes déposant dans le même espace produisent des
	// snapshots que rien ne distingue : on ne sait plus lequel vient du
	// comptoir et lequel vient du poste de développement, et on restaure le
	// mauvais. C'est de l'IDENTITÉ, pas de l'autorité : elle ne donne aucun
	// droit, elle dit seulement d'où ça vient.
	Origine string `json:"origin,omitempty"`

	// EmpreinteCle identifie la clé qui a scellé ce snapshot, sans la révéler
	// (huit caractères dérivés). Elle permet de dire à l'écran « celui-ci a été
	// chiffré avec une AUTRE clé » au lieu de laisser découvrir un « sceau
	// invalide » au moment où l'on croyait restaurer.
	EmpreinteCle string `json:"key_fingerprint,omitempty"`
}

// Etat est la réponse de `?action=etat` : ce que le serveur a déjà.
type Etat struct {
	IDSnapshot     string `json:"snapshot_id"`
	Statut         string `json:"status"` // en_cours | complet | inconnu
	TranchesRecues []int  `json:"chunks_received"`
	NbTranches     int    `json:"chunk_count"`
}

// Client parle au point d'entrée de sauvegarde du mini-SaaS.
type Client struct {
	Endpoint   string
	CleAPI     string
	AppVersion string
	Origine    string

	// cle sert UNIQUEMENT à calculer l'empreinte annoncée au serveur. Le
	// chiffrement, lui, se fait ailleurs (snapshot.go) : ce client ne chiffre
	// rien, il transporte.
	cle []byte

	http *http.Client
}

// NouveauClient construit un client d'envoi.
//
// L'URL DOIT être en HTTPS et c'est vérifié ici, pas seulement documenté : le
// corps transporte des factures chiffrées, mais la clé d'API, elle, voyage en
// clair dans un en-tête. Sur du HTTP simple, elle est lisible par le réseau du
// magasin. On refuse donc de partir.
func NouveauClient(endpoint, cleAPI, appVersion, origine string, cle []byte) (*Client, error) {
	endpoint = strings.TrimSpace(endpoint)
	if endpoint == "" {
		return nil, fmt.Errorf("URL de sauvegarde non configurée")
	}
	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, fmt.Errorf("URL de sauvegarde illisible : %w", err)
	}
	if u.Scheme != "https" {
		return nil, fmt.Errorf("l'URL de sauvegarde doit être en HTTPS (reçu : %q)", u.Scheme)
	}
	if strings.TrimSpace(cleAPI) == "" {
		return nil, fmt.Errorf("clé API de sauvegarde non configurée")
	}

	return &Client{
		Endpoint:   endpoint,
		CleAPI:     cleAPI,
		AppVersion: appVersion,
		Origine:    origine,
		cle:        cle,
		http:       &http.Client{Timeout: delaiTranche},
	}, nil
}

// NomDuPoste rend l'identité par défaut d'une installation : son nom de
// machine.
//
// Automatique, délibérément. Un réglage à saisir serait laissé vide par
// quiconque n'a pas lu la documentation — c'est-à-dire toujours, sur le poste
// d'un client —, et l'étiquette ne servirait justement pas dans le seul cas où
// elle compte. Le nom de machine est déjà là et distingue déjà les postes.
func NomDuPoste() string {
	nom, err := os.Hostname()
	if err != nil || strings.TrimSpace(nom) == "" {
		return "poste-inconnu"
	}
	if len(nom) > 64 {
		nom = nom[:64]
	}
	return nom
}

// requete pose les en-têtes communs. La clé part en EN-TÊTE, jamais en
// paramètre d'URL : une clé dans une query string finit dans les journaux
// Apache du mutualisé, et dans le Referer. `requireApiKey()` du mini-SaaS
// accepte les deux ; nous n'utilisons que le premier.
func (c *Client) requete(methode, action string, params url.Values, corps io.Reader) (*http.Request, error) {
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
	req.Header.Set("X-API-Key", c.CleAPI)
	req.Header.Set("User-Agent", AgentUtilisateur)
	return req, nil
}

// lireReponse rend le corps et transforme un statut non-2xx en erreur
// lisible. Le corps est tronqué : en cas d'anti-bot, la réponse est une page
// HTML entière, et la recopier dans les journaux ne renseigne personne.
func lireReponse(resp *http.Response) ([]byte, error) {
	defer resp.Body.Close()
	corps, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		extrait := strings.TrimSpace(string(corps))
		if len(extrait) > 300 {
			extrait = extrait[:300] + "…"
		}
		return nil, fmt.Errorf("le serveur a répondu %d : %s", resp.StatusCode, extrait)
	}
	return corps, nil
}

// Init ouvre un envoi. Idempotent côté serveur : rappeler Init sur un snapshot
// déjà ouvert ne le réinitialise pas, il rend l'état existant — c'est ce qui
// permet la reprise après un redémarrage du poste.
func (c *Client) Init(m Manifeste) (*Etat, error) {
	charge, err := json.Marshal(m)
	if err != nil {
		return nil, err
	}
	req, err := c.requete(http.MethodPost, "init", nil, bytes.NewReader(charge))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	cl := &http.Client{Timeout: delaiControle}
	resp, err := cl.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ouverture de l'envoi : %w", err)
	}
	corps, err := lireReponse(resp)
	if err != nil {
		return nil, fmt.Errorf("ouverture de l'envoi : %w", err)
	}

	var etat Etat
	if err := json.Unmarshal(corps, &etat); err != nil {
		return nil, fmt.Errorf("réponse d'ouverture illisible : %w", err)
	}
	return &etat, nil
}

// Etat demande quelles tranches sont déjà arrivées.
func (c *Client) Etat(idSnapshot string) (*Etat, error) {
	req, err := c.requete(http.MethodGet, "etat", url.Values{"snapshot_id": {idSnapshot}}, nil)
	if err != nil {
		return nil, err
	}
	cl := &http.Client{Timeout: delaiControle}
	resp, err := cl.Do(req)
	if err != nil {
		return nil, err
	}
	corps, err := lireReponse(resp)
	if err != nil {
		return nil, err
	}
	var etat Etat
	if err := json.Unmarshal(corps, &etat); err != nil {
		return nil, fmt.Errorf("réponse d'état illisible : %w", err)
	}
	return &etat, nil
}

// EnvoyerTranche pousse une tranche. Le corps est le binaire BRUT — pas de
// base64 : l'encodage coûterait un tiers de volume en plus sur une liaison de
// magasin, pour rien.
func (c *Client) EnvoyerTranche(idSnapshot string, rang int, donnees []byte) error {
	empreinte := sha256.Sum256(donnees)

	params := url.Values{
		"snapshot_id": {idSnapshot},
		"index":       {fmt.Sprint(rang)},
	}

	var derniereErr error
	for essai := 1; essai <= nbEssaisTranche; essai++ {
		req, err := c.requete(http.MethodPost, "tranche", params, bytes.NewReader(donnees))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/octet-stream")
		req.Header.Set("X-Chunk-SHA256", hex.EncodeToString(empreinte[:]))
		req.ContentLength = int64(len(donnees))

		resp, err := c.http.Do(req)
		if err == nil {
			_, err = lireReponse(resp)
		}
		if err == nil {
			return nil
		}
		derniereErr = err

		// Attente croissante. Courte : on n'est pas pressé, mais on ne veut
		// pas non plus tenir une goroutine une heure sur un réseau mort.
		if essai < nbEssaisTranche {
			time.Sleep(time.Duration(essai) * 2 * time.Second)
		}
	}
	return fmt.Errorf("tranche %d, après %d essais : %w", rang, nbEssaisTranche, derniereErr)
}

// Valider clôt l'envoi. C'est cet appel, et lui seul, qui fait passer le
// snapshot en `complet` et déclenche la purge des anciens côté serveur.
func (c *Client) Valider(idSnapshot string) error {
	charge, _ := json.Marshal(map[string]string{"snapshot_id": idSnapshot})
	req, err := c.requete(http.MethodPost, "valider", nil, bytes.NewReader(charge))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	cl := &http.Client{Timeout: delaiControle}
	resp, err := cl.Do(req)
	if err != nil {
		return fmt.Errorf("validation : %w", err)
	}
	if _, err := lireReponse(resp); err != nil {
		return fmt.Errorf("validation : %w", err)
	}
	return nil
}

// Envoyer déroule le protocole entier pour un snapshot déjà fabriqué.
//
// Il relit le fichier chiffré tranche par tranche, en SAUTANT celles que le
// serveur dit déjà avoir. C'est la reprise : un envoi coupé à la quinzième
// tranche sur vingt ne réexpédie que les cinq dernières.
func (c *Client) Envoyer(snap *Snapshot) error {
	m := Manifeste{
		IDSnapshot:   snap.ID,
		CreeLe:       snap.CreeLe.UTC().Format(time.RFC3339),
		Algo:         AlgoChiffrement,
		TailleClair:  snap.TailleClaire,
		SHA256Clair:  snap.SHA256Clair,
		TailleChiff:  snap.TailleChiffree,
		NbTranches:   snap.NbTranches,
		AppVersion:   c.AppVersion,
		Origine:      c.Origine,
		EmpreinteCle: EmpreinteCle(c.cle),
	}

	etat, err := c.Init(m)
	if err != nil {
		return err
	}
	if etat.Statut == "complet" {
		log.Printf("📤 snapshot %s : déjà complet côté serveur", snap.ID)
		return nil
	}

	deja := make(map[int]bool, len(etat.TranchesRecues))
	for _, r := range etat.TranchesRecues {
		deja[r] = true
	}
	if len(deja) > 0 {
		log.Printf("📤 snapshot %s : reprise, %d tranches déjà en place", snap.ID, len(deja))
	}

	fichier, err := os.Open(snap.CheminChiffre)
	if err != nil {
		return fmt.Errorf("relecture du snapshot : %w", err)
	}
	defer fichier.Close()

	entete := make([]byte, 4)
	for rang := 0; rang < snap.NbTranches; rang++ {
		// Le fichier est une suite de [longueur][nonce][chiffré]. On relit
		// chaque tranche ENTIÈRE — en-tête compris — pour que le serveur
		// stocke exactement ce que la restauration attend de relire.
		if _, err := io.ReadFull(fichier, entete); err != nil {
			return fmt.Errorf("tranche %d, en-tête : %w", rang, err)
		}
		longueur := binary.BigEndian.Uint32(entete)
		reste := make([]byte, 12+int(longueur))
		if _, err := io.ReadFull(fichier, reste); err != nil {
			return fmt.Errorf("tranche %d, corps : %w", rang, err)
		}

		if deja[rang] {
			continue
		}

		tranche := append(append([]byte{}, entete...), reste...)
		if err := c.EnvoyerTranche(snap.ID, rang, tranche); err != nil {
			return err
		}
	}

	return c.Valider(snap.ID)
}
