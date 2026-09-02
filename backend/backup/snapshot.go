// backend/backup/snapshot.go
// ═══════════════════════════════════════════════════════════════════════════
// SNAPSHOT COHÉRENT DE LA BASE POCKETBASE — FABRICATION
// ═══════════════════════════════════════════════════════════════════════════
// Produit un fichier unique, compressé et chiffré, qui EST la base du client :
// on le déchiffre, on le pose dans pb_data sous le nom data.db, et on a une
// PocketBase qui démarre sur les données réelles. Rien d'autre à rejouer.
//
// ─── Pourquoi VACUUM INTO, et pas une copie de fichier ─────────────────────
// data.db vit en mode WAL : à un instant donné, une partie des écritures est
// dans data.db-wal et PAS dans data.db. Copier le seul data.db donne une base
// EN RETARD, silencieusement — et copier les trois fichiers pendant qu'une
// vente s'écrit donne une base incohérente, tout aussi silencieusement.
//
// `VACUUM INTO` s'exécute dans une transaction de lecture : SQLite écrit une
// base neuve, complète et cohérente à l'instant du début, WAL replié dedans.
// Les écritures concurrentes ne sont PAS bloquées (c'est la propriété du mode
// WAL : un lecteur n'empêche pas l'écrivain), elles sont simplement absentes
// du snapshot — ce qui est exactement ce qu'on veut d'une sauvegarde datée.
// C'est ce qui rend l'opération transparente pour la caisse.
//
// ─── Ce que le snapshot NE contient PAS, et pourquoi ───────────────────────
//   • `storage/` — 1,7 Gio d'images. Déjà miroité vers axemusique.shop par
//     backend/routes/site_images_routes.go. L'y remettre multiplierait par
//     cent le volume transféré pour dupliquer un miroir qui existe.
//   • `logs.db` — journal technique de PocketBase, sans valeur ni pour la
//     sauvegarde ni pour reproduire un bogue métier.
//
// Conséquence à connaître : une base restaurée en développement affiche les
// fiches produits SANS leurs images. Les données sont entières, les octets
// des images ne le sont pas. C'est un choix, pas un oubli.
//
// ─── La chaîne, dans l'ordre ───────────────────────────────────────────────
//     VACUUM INTO ──▶ gzip ──▶ AES-256-GCM par tranches ──▶ tranches à poster
//
// Le chiffrement est fait ICI, sur le poste. Le serveur ne reçoit et ne stocke
// que de l'opaque : il n'a pas la clé et ne peut pas l'avoir. Une fuite de
// l'hébergement mutualisé ne livre aucune facture.
// ═══════════════════════════════════════════════════════════════════════════

package backup

import (
	"compress/gzip"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
)

// TailleTranche est la taille d'une tranche de CLAIR. Chaque tranche part dans
// une requête HTTP distincte, et arrive chiffrée — donc 16 octets de plus, le
// tag d'authentification GCM.
//
// 1 Mio : sous le `post_max_size` de tout mutualisé (8 Mio chez IONOS par
// défaut), assez gros pour qu'une base de 16 Mio parte en une vingtaine
// d'allers-retours, assez petit pour qu'une coupure ne coûte qu'une tranche.
const TailleTranche = 1 << 20

// AlgoChiffrement nomme la construction dans le manifeste. Un outil de
// restauration lit ce champ AVANT de tenter quoi que ce soit : le jour où la
// construction change, les anciens snapshots restent lisibles par la règle
// qui les a produits.
const AlgoChiffrement = "gzip+aes-256-gcm-tranches-v1"

// Snapshot décrit un instantané fabriqué et prêt à partir.
type Snapshot struct {
	// ID nomme le snapshot de bout en bout : dossier distant, tranches,
	// manifeste. Trié lexicographiquement, il est trié chronologiquement.
	ID string

	// CheminChiffre est le fichier local, chiffré, prêt à être découpé.
	CheminChiffre string

	// TailleClaire est la taille de la base compactée AVANT compression.
	// C'est la taille du fichier que la restauration produira.
	TailleClaire int64

	// SHA256Clair est l'empreinte du .db compacté, avant gzip et avant
	// chiffrement. C'est l'invariant que la restauration vérifie : si elle
	// retrouve cette empreinte, la base est exactement celle du client.
	SHA256Clair string

	// TailleChiffree et NbTranches décrivent ce qui part sur le réseau.
	TailleChiffree int64
	NbTranches     int

	// CreeLe est l'instant du VACUUM, pas celui de l'envoi.
	CreeLe time.Time
}

// Nettoyer efface le fichier temporaire chiffré. À appeler en `defer` par
// l'appelant, systématiquement : un snapshot abandonné ne doit pas laisser
// plusieurs Mio derrière lui à chaque tentative.
func (s *Snapshot) Nettoyer() {
	if s == nil || s.CheminChiffre == "" {
		return
	}
	if err := os.Remove(s.CheminChiffre); err != nil && !os.IsNotExist(err) {
		log.Printf("⚠️  snapshot : temporaire non effacé (%s) : %v", s.CheminChiffre, err)
	}
}

// NouvelID fabrique un identifiant de snapshot lisible et triable.
// Forme : 20260901T173000Z-a1b2c3d4
func NouvelID(t time.Time) string {
	suffixe := make([]byte, 4)
	if _, err := rand.Read(suffixe); err != nil {
		// Sans hasard, l'horodatage seul reste unique en pratique (un
		// snapshot par jour) ; on ne fait pas échouer une sauvegarde pour ça.
		return t.UTC().Format("20060102T150405Z")
	}
	return t.UTC().Format("20060102T150405Z") + "-" + hex.EncodeToString(suffixe)
}

// Fabriquer produit un snapshot chiffré, prêt à l'envoi.
//
// `db` est la connexion PocketBase (pb.Dao().DB()). `dossierTravail` reçoit
// les fichiers temporaires — il doit être sur le même volume que pb_data pour
// que le VACUUM ne traverse pas le réseau. `cle` fait 32 octets.
//
// Aucune écriture n'est faite dans pb_data : le compactage sort dans le
// dossier de travail.
func Fabriquer(db dbx.Builder, dossierTravail string, cle []byte) (*Snapshot, error) {
	if len(cle) != 32 {
		return nil, fmt.Errorf("clé de chiffrement : 32 octets attendus, %d reçus", len(cle))
	}
	if err := os.MkdirAll(dossierTravail, 0o700); err != nil {
		return nil, fmt.Errorf("dossier de travail : %w", err)
	}

	debut := time.Now()
	id := NouvelID(debut)

	// ── 1. VACUUM INTO ──────────────────────────────────────────────────────
	//
	// Le fichier de destination ne doit PAS exister : SQLite refuse d'écraser,
	// et c'est une bonne chose. On efface un éventuel reliquat d'un essai
	// précédent avant de demander.
	cheminBrut := filepath.Join(dossierTravail, "snapshot-"+id+".db")
	_ = os.Remove(cheminBrut)

	// Le chemin part dans la requête. Il vient de nous, jamais d'une entrée
	// utilisateur, mais SQLite ne sait pas lier un paramètre dans un VACUUM :
	// on double le guillemet simple à la main, comme on doit toujours le faire
	// quand la liaison n'est pas disponible.
	cheminSQL := strings.ReplaceAll(cheminBrut, "'", "''")
	if _, err := db.NewQuery("VACUUM INTO '" + cheminSQL + "'").Execute(); err != nil {
		return nil, fmt.Errorf("VACUUM INTO : %w", err)
	}
	defer os.Remove(cheminBrut)

	infoBrut, err := os.Stat(cheminBrut)
	if err != nil {
		return nil, fmt.Errorf("snapshot illisible après VACUUM : %w", err)
	}

	// ── 2. gzip puis chiffrement, en flux ───────────────────────────────────
	source, err := os.Open(cheminBrut)
	if err != nil {
		return nil, fmt.Errorf("ouverture du snapshot : %w", err)
	}
	defer source.Close()

	cheminChiffre := filepath.Join(dossierTravail, "snapshot-"+id+".bin")
	destination, err := os.OpenFile(cheminChiffre, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, fmt.Errorf("création du fichier chiffré : %w", err)
	}

	// L'empreinte est prise sur le CLAIR NON COMPRESSÉ, en le lisant une seule
	// fois, au passage. gzip n'est pas déterministe d'une version de Go à
	// l'autre ; le .db, lui, l'est. C'est donc lui l'invariant.
	empreinte := sha256.New()

	nbTranches, err := compresserEtChiffrer(io.TeeReader(source, empreinte), destination, cle, id)
	if cerr := destination.Close(); err == nil && cerr != nil {
		err = cerr
	}
	if err != nil {
		os.Remove(cheminChiffre)
		return nil, err
	}

	infoChiffre, err := os.Stat(cheminChiffre)
	if err != nil {
		os.Remove(cheminChiffre)
		return nil, fmt.Errorf("fichier chiffré illisible : %w", err)
	}

	log.Printf("📦 snapshot %s : %d Kio compactés → %d Kio chiffrés, %d tranches, en %s",
		id, infoBrut.Size()/1024, infoChiffre.Size()/1024, nbTranches,
		time.Since(debut).Round(time.Millisecond))

	return &Snapshot{
		ID:             id,
		CheminChiffre:  cheminChiffre,
		TailleClaire:   infoBrut.Size(),
		SHA256Clair:    hex.EncodeToString(empreinte.Sum(nil)),
		TailleChiffree: infoChiffre.Size(),
		NbTranches:     nbTranches,
		CreeLe:         debut,
	}, nil
}

// compresserEtChiffrer lit `src`, le compresse, et écrit dans `dst` une suite
// de tranches scellées.
//
// ─── Pourquoi tranche par tranche, et pas un seul GCM ──────────────────────
// GCM plafonne à 64 Gio par clé et par nonce, ce qui n'est pas la contrainte
// ici : la contrainte est qu'un envoi se fait EN PLUSIEURS requêtes HTTP, et
// qu'on veut pouvoir reprendre après une coupure sans tout refaire. Chaque
// tranche est donc scellée seule.
//
// Sceller des tranches indépendantes ouvre trois attaques classiques, et les
// trois sont fermées en mettant dans les données authentifiées (AAD) :
//   - l'identifiant du snapshot — interdit de mélanger deux snapshots ;
//   - le rang de la tranche     — interdit de les réordonner ;
//   - un marqueur de fin        — interdit de TRONQUER le flux, c'est-à-dire
//     de restaurer une base amputée de ses dernières ventes sans que rien ne
//     le signale.
//
// Format d'une tranche :
//
//	[4 octets, longueur du chiffré][12 octets, nonce][chiffré + tag]
func compresserEtChiffrer(src io.Reader, dst io.Writer, cle []byte, idSnapshot string) (int, error) {
	bloc, err := aes.NewCipher(cle)
	if err != nil {
		return 0, fmt.Errorf("aes : %w", err)
	}
	aead, err := cipher.NewGCM(bloc)
	if err != nil {
		return 0, fmt.Errorf("gcm : %w", err)
	}

	// gzip écrit dans un tampon ; dès que le tampon atteint une tranche
	// pleine, on scelle et on pousse. Le tampon est le point de rendez-vous
	// entre la compression (qui produit à son rythme) et le découpage (qui
	// veut des tailles fixes).
	tampon := &tamponTranches{
		taille: TailleTranche,
		aead:   aead,
		dst:    dst,
		id:     idSnapshot,
	}

	// BestSpeed, délibérément : la base est déjà compacte et le poste est une
	// caisse en service. On échange quelques points de taux de compression
	// contre des cycles CPU qu'on ne prend pas à la vente.
	gz, err := gzip.NewWriterLevel(tampon, gzip.BestSpeed)
	if err != nil {
		return 0, fmt.Errorf("gzip : %w", err)
	}

	if _, err := io.Copy(gz, src); err != nil {
		return 0, fmt.Errorf("compression : %w", err)
	}
	if err := gz.Close(); err != nil {
		return 0, fmt.Errorf("fermeture gzip : %w", err)
	}
	if err := tampon.Vider(); err != nil {
		return 0, err
	}
	return tampon.rang, nil
}

// tamponTranches accumule du clair et scelle une tranche dès qu'il en a assez.
type tamponTranches struct {
	taille int
	aead   cipher.AEAD
	dst    io.Writer
	id     string

	attente []byte
	rang    int
}

func (t *tamponTranches) Write(p []byte) (int, error) {
	n := len(p)
	t.attente = append(t.attente, p...)
	for len(t.attente) >= t.taille {
		if err := t.sceller(t.attente[:t.taille], false); err != nil {
			return 0, err
		}
		t.attente = t.attente[t.taille:]
	}
	return n, nil
}

// Vider scelle ce qui reste, en le marquant comme DERNIÈRE tranche.
func (t *tamponTranches) Vider() error {
	return t.sceller(t.attente, true)
}

func (t *tamponTranches) sceller(clair []byte, derniere bool) error {
	nonce := make([]byte, t.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return fmt.Errorf("nonce : %w", err)
	}

	chiffre := t.aead.Seal(nil, nonce, clair, aad(t.id, t.rang, derniere))

	entete := make([]byte, 4)
	binary.BigEndian.PutUint32(entete, uint32(len(chiffre)))
	if _, err := t.dst.Write(entete); err != nil {
		return err
	}
	if _, err := t.dst.Write(nonce); err != nil {
		return err
	}
	if _, err := t.dst.Write(chiffre); err != nil {
		return err
	}
	t.rang++
	return nil
}

// aad compose les données authentifiées d'une tranche. Elles ne sont pas
// chiffrées : elles sont LIÉES au chiffré. Modifier l'une d'elles fait échouer
// l'ouverture, ce qui est tout l'intérêt.
func aad(idSnapshot string, rang int, derniere bool) []byte {
	marqueur := "suite"
	if derniere {
		marqueur = "fin"
	}
	return []byte(fmt.Sprintf("%s|%d|%s", idSnapshot, rang, marqueur))
}

// ═══════════════════════════════════════════════════════════════════════════
// RESTAURATION — le chemin inverse, utilisé par backend/cmd/snapshot-restore
// ═══════════════════════════════════════════════════════════════════════════

// ErrTronque signale un flux dont la dernière tranche n'est pas marquée comme
// telle : il manque la fin. Distingué des autres erreurs parce qu'il a une
// cause probable précise — un envoi interrompu et validé à tort.
var ErrTronque = errors.New("flux tronqué : la dernière tranche n'est pas scellée comme finale")

// Restaurer lit un flux chiffré, le déchiffre, le décompresse, et écrit la
// base en clair dans `dst`. Rend l'empreinte SHA-256 du clair produit, que
// l'appelant DOIT comparer à celle du manifeste.
func Restaurer(src io.Reader, dst io.Writer, cle []byte, idSnapshot string) (string, error) {
	if len(cle) != 32 {
		return "", fmt.Errorf("clé de chiffrement : 32 octets attendus, %d reçus", len(cle))
	}
	bloc, err := aes.NewCipher(cle)
	if err != nil {
		return "", fmt.Errorf("aes : %w", err)
	}
	aead, err := cipher.NewGCM(bloc)
	if err != nil {
		return "", fmt.Errorf("gcm : %w", err)
	}

	lecteur, ecrivain := io.Pipe()

	// Le déchiffrement alimente le pipe ; la décompression le consomme.
	go func() {
		ecrivain.CloseWithError(dechiffrerTranches(src, ecrivain, aead, idSnapshot))
	}()

	gz, err := gzip.NewReader(lecteur)
	if err != nil {
		lecteur.CloseWithError(err)
		return "", fmt.Errorf("gzip : %w", err)
	}
	defer gz.Close()

	empreinte := sha256.New()
	if _, err := io.Copy(io.MultiWriter(dst, empreinte), gz); err != nil {
		return "", fmt.Errorf("décompression : %w", err)
	}
	return hex.EncodeToString(empreinte.Sum(nil)), nil
}

func dechiffrerTranches(src io.Reader, dst io.Writer, aead cipher.AEAD, idSnapshot string) error {
	entete := make([]byte, 4)
	nonce := make([]byte, aead.NonceSize())

	for rang := 0; ; rang++ {
		if _, err := io.ReadFull(src, entete); err != nil {
			if errors.Is(err, io.EOF) {
				// Fin du flux sans avoir jamais vu de tranche « fin ».
				return ErrTronque
			}
			return fmt.Errorf("tranche %d, en-tête : %w", rang, err)
		}
		longueur := binary.BigEndian.Uint32(entete)
		if longueur > uint32(TailleTranche)+64 {
			return fmt.Errorf("tranche %d : longueur aberrante (%d)", rang, longueur)
		}
		if _, err := io.ReadFull(src, nonce); err != nil {
			return fmt.Errorf("tranche %d, nonce : %w", rang, err)
		}
		chiffre := make([]byte, longueur)
		if _, err := io.ReadFull(src, chiffre); err != nil {
			return fmt.Errorf("tranche %d, corps : %w", rang, err)
		}

		// On ne sait pas d'avance si la tranche est la dernière : le marqueur
		// est DANS les données authentifiées. On tente « suite », puis
		// « fin ». C'est ce qui rend la troncature détectable — un flux amputé
		// finit sur un EOF, jamais sur une tranche « fin » valide.
		clair, err := aead.Open(nil, nonce, chiffre, aad(idSnapshot, rang, false))
		if err != nil {
			clair, err = aead.Open(nil, nonce, chiffre, aad(idSnapshot, rang, true))
			if err != nil {
				return fmt.Errorf("tranche %d : sceau invalide (clé, ordre ou snapshot ne correspondent pas)", rang)
			}
			if _, err := dst.Write(clair); err != nil {
				return err
			}
			return nil // tranche finale : le flux est complet
		}
		if _, err := dst.Write(clair); err != nil {
			return err
		}
	}
}
