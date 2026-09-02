// backend/backup/storage.go
// ═══════════════════════════════════════════════════════════════════════════
// MIROIR DIFFÉRENTIEL DU `storage/` — N'ENVOYER QUE CE QUE L'AUTRE N'A PAS
// ═══════════════════════════════════════════════════════════════════════════
// Le snapshot de `data.db` ne contient AUCUN octet d'image (voir snapshot.go).
// Une base restaurée affiche donc des fiches sans visuel. Ce fichier comble ce
// trou, sans jamais retransporter les 1,6 Gio que l'éditeur détient déjà.
//
// ─── Pourquoi un inventaire, et pas une date de coupure ───────────────────
// « Les images ajoutées depuis le 29 août » suppose de se fier aux dates des
// fichiers. Or copier ou restaurer un `storage/` remet ces dates à zéro — et
// le jour où ça arrive, on ne s'en aperçoit pas : on croit sauvegarder et on
// ne sauvegarde rien. Le serveur tient donc la liste de ce qu'il CONNAÎT, et
// le poste n'envoie que l'écart. Auto-correcteur, et rien à dater.
//
// ─── Pourquoi le CHEMIN suffit comme identité ─────────────────────────────
// PocketBase suffixe chaque fichier d'un aléa au moment de l'upload
// (`nom_1754471692119_wDmqA0HWAM.png`). Remplacer une image ne réécrit pas le
// fichier : elle en crée un autre, sous un autre nom. Un chemin donné a donc
// TOUJOURS le même contenu.
//
// C'est ce qui permet de bâtir un inventaire sans lire un seul octet — sinon
// il faudrait hacher 1,6 Gio à chaque synchronisation, sur une caisse en
// service. Si un jour PocketBase réécrivait un fichier en place, cette
// propriété tomberait et il faudrait une empreinte : c'est LA supposition à
// revérifier avant de faire évoluer ce mécanisme.
//
// ─── Ce qui ne part pas ────────────────────────────────────────────────────
//   • les vignettes (`thumbs_*`) — dérivées, PocketBase les regénère à la
//     demande ; mesuré le 2 septembre 2026 : 96 fichiers sur 9519 ;
//   • rien d'autre. Les `.attrs` PARTENT : ils portent le type MIME, et sans
//     eux PocketBase sert les images en `application/octet-stream`.
// ═══════════════════════════════════════════════════════════════════════════

package backup

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// TailleMaxFichier plafonne un fichier transporté. Large par rapport au besoin
// réel — l'image la plus lourde mesurée dans ce dépôt fait 2,7 Mio — et serré
// par rapport à ce qu'un envoi accidentel coûterait sur un mutualisé.
const TailleMaxFichier = 32 << 20

// FichierStorage est une entrée d'inventaire. Pas d'empreinte : le chemin est
// l'identité (voir l'en-tête).
type FichierStorage struct {
	Chemin string `json:"path"`
	Taille int64  `json:"size"`
}

// InventorierStorage parcourt `storage/` et rend la liste des fichiers, en
// chemins relatifs à séparateurs `/` — jamais `\`, même sous Windows : ces
// chemins voyagent vers un serveur Linux et y nomment des dossiers.
func InventorierStorage(dataDir string) ([]FichierStorage, error) {
	racine := filepath.Join(dataDir, "storage")

	info, err := os.Stat(racine)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // pas de storage : rien à miroiter, ce n'est pas une erreur
		}
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("%s n'est pas un dossier", racine)
	}

	var fichiers []FichierStorage

	err = filepath.WalkDir(racine, func(chemin string, d fs.DirEntry, err error) error {
		if err != nil {
			// Un fichier illisible ne doit pas interrompre l'inventaire : on le
			// signale et on continue. Mieux vaut miroiter 4711 fichiers sur
			// 4712 que zéro.
			log.Printf("⚠️  storage : %s ignoré (%v)", chemin, err)
			return nil
		}

		relatif, rerr := filepath.Rel(racine, chemin)
		if rerr != nil {
			return nil
		}
		relatif = filepath.ToSlash(relatif)

		if d.IsDir() {
			// Les vignettes sont dérivées : on saute le dossier entier.
			if strings.HasPrefix(d.Name(), "thumbs_") {
				return filepath.SkipDir
			}
			return nil
		}

		// LISEZ-MOI.txt et autres fichiers posés à la racine ne sont pas des
		// pièces jointes : ils n'ont ni collection ni enregistrement.
		if strings.Count(relatif, "/") < 2 {
			return nil
		}

		fi, ferr := d.Info()
		if ferr != nil {
			return nil
		}
		if fi.Size() > TailleMaxFichier {
			log.Printf("⚠️  storage : %s ignoré, %d Mio dépasse le plafond", relatif, fi.Size()>>20)
			return nil
		}

		fichiers = append(fichiers, FichierStorage{Chemin: relatif, Taille: fi.Size()})
		return nil
	})
	if err != nil {
		return nil, err
	}

	return fichiers, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// CÔTÉ POSTE — DÉCLARER, PUIS ENVOYER L'ÉCART
// ═══════════════════════════════════════════════════════════════════════════

// ResultatSyncStorage résume ce qu'une synchronisation a fait.
type ResultatSyncStorage struct {
	Inventories int   // fichiers vus localement
	Manquants   int   // fichiers que le serveur ne connaissait pas
	Envoyes     int   // effectivement transmis
	Echecs      int   // refusés ou coupés — l'envoi suivant les reprendra
	OctetsEnvoi int64 // volume clair transmis
}

// SynchroniserStorage envoie au serveur ce qu'il ne connaît pas encore.
//
// Idempotente et reprenable : ce qui échoue n'est pas déclaré, donc le prochain
// passage le redemandera. Aucun état à tenir sur le poste.
func (c *Client) SynchroniserStorage(dataDir string, cle []byte) (*ResultatSyncStorage, error) {
	if len(cle) != 32 {
		return nil, fmt.Errorf("clé de chiffrement : 32 octets attendus")
	}

	inventaire, err := InventorierStorage(dataDir)
	if err != nil {
		return nil, fmt.Errorf("inventaire local : %w", err)
	}

	res := &ResultatSyncStorage{Inventories: len(inventaire)}
	if len(inventaire) == 0 {
		return res, nil
	}

	manquants, err := c.diffStorage(inventaire)
	if err != nil {
		return nil, err
	}
	res.Manquants = len(manquants)

	if len(manquants) == 0 {
		log.Printf("🖼️  storage : %d fichiers, aucun à envoyer", len(inventaire))
		return res, nil
	}

	log.Printf("🖼️  storage : %d fichiers localement, %d à envoyer", len(inventaire), len(manquants))
	racine := filepath.Join(dataDir, "storage")
	debut := time.Now()

	for _, chemin := range manquants {
		clair, err := os.ReadFile(filepath.Join(racine, filepath.FromSlash(chemin)))
		if err != nil {
			// Le fichier a pu disparaître entre l'inventaire et l'envoi — un
			// produit supprimé pendant la synchronisation, par exemple. Ce
			// n'est pas une anomalie.
			log.Printf("⚠️  storage : %s illisible, ignoré (%v)", chemin, err)
			res.Echecs++
			continue
		}

		// Même chaîne que les snapshots : gzip puis AES-256-GCM par tranches.
		// Le CHEMIN sert d'identifiant dans les données authentifiées, ce qui
		// lie le chiffré à son emplacement : un fichier ne peut pas être
		// présenté sous le nom d'un autre.
		var chiffre bytes.Buffer
		if _, err := compresserEtChiffrer(bytes.NewReader(clair), &chiffre, cle, chemin); err != nil {
			log.Printf("⚠️  storage : %s non chiffré (%v)", chemin, err)
			res.Echecs++
			continue
		}

		if err := c.envoyerFichierStorage(chemin, chiffre.Bytes()); err != nil {
			log.Printf("⚠️  storage : %s non envoyé (%v)", chemin, err)
			res.Echecs++
			continue
		}

		res.Envoyes++
		res.OctetsEnvoi += int64(len(clair))
	}

	log.Printf("🖼️  storage : %d envoyés, %d échecs, %d Kio, en %s",
		res.Envoyes, res.Echecs, res.OctetsEnvoi/1024, time.Since(debut).Round(time.Second))

	return res, nil
}

// diffStudioStorage demande au serveur ce qu'il ne connaît pas.
//
// L'inventaire part gzippé : 4700 chemins pèsent près d'un mégaoctet en JSON,
// et se réduisent à quelques dizaines de kilo-octets — ils se ressemblent tous.
func (c *Client) diffStorage(inventaire []FichierStorage) ([]string, error) {
	charge, err := json.Marshal(map[string]any{"files": inventaire})
	if err != nil {
		return nil, err
	}

	var compresse bytes.Buffer
	if err := gzipVers(&compresse, charge); err != nil {
		return nil, err
	}

	req, err := c.requete(http.MethodPost, "storage-diff", nil, bytes.NewReader(compresse.Bytes()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Content-Encoding", "gzip")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("comparaison d'inventaire : %w", err)
	}
	corps, err := lireReponse(resp)
	if err != nil {
		return nil, fmt.Errorf("comparaison d'inventaire : %w", err)
	}

	var reponse struct {
		Manquants []string `json:"missing"`
	}
	if err := json.Unmarshal(corps, &reponse); err != nil {
		return nil, fmt.Errorf("réponse de comparaison illisible : %w", err)
	}
	return reponse.Manquants, nil
}

func (c *Client) envoyerFichierStorage(chemin string, chiffre []byte) error {
	params := url.Values{"path": {chemin}}

	var derniereErr error
	for essai := 1; essai <= nbEssaisTranche; essai++ {
		req, err := c.requete(http.MethodPost, "storage-fichier", params, bytes.NewReader(chiffre))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/octet-stream")
		req.ContentLength = int64(len(chiffre))

		resp, err := c.http.Do(req)
		if err == nil {
			_, err = lireReponse(resp)
		}
		if err == nil {
			return nil
		}
		derniereErr = err
		if essai < nbEssaisTranche {
			time.Sleep(time.Duration(essai) * time.Second)
		}
	}
	return derniereErr
}

// gzipVers compresse `donnees` dans `dst`.
func gzipVers(dst io.Writer, donnees []byte) error {
	gz := gzip.NewWriter(dst)
	if _, err := gz.Write(donnees); err != nil {
		return err
	}
	return gz.Close()
}
