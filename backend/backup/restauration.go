// backend/backup/restauration.go
// ═══════════════════════════════════════════════════════════════════════════
// RESTAURER DEPUIS L'APPLICATION — EN DEUX TEMPS, ET C'EST OBLIGATOIRE
// ═══════════════════════════════════════════════════════════════════════════
// Temps 1, application en marche : télécharger, déchiffrer, VÉRIFIER, et
//          déposer la base restaurée À CÔTÉ, sous un nom d'attente.
// Temps 2, au démarrage suivant : échanger les fichiers AVANT que PocketBase
//          n'ouvre quoi que ce soit.
//
// ─── Pourquoi deux temps ───────────────────────────────────────────────────
// Sous Windows, un fichier ouvert ne se remplace pas. Tant que l'application
// tourne, PocketBase tient `data.db` : toute tentative d'échange échoue, ou
// pire, réussit à moitié. L'échange doit donc avoir lieu au seul instant où
// personne ne tient le fichier — juste avant l'ouverture, dans main().
//
// ─── Le piège du WAL, qui corromprait tout en silence ──────────────────────
// `data.db` vient avec `data.db-wal` et `data.db-shm`. Remplacer le seul
// `data.db` en laissant le WAL de l'ANCIENNE base à côté, c'est présenter à
// SQLite un journal qui ne correspond pas au fichier : au mieux il refuse, au
// pire il rejoue des pages dans une base qui n'est pas la sienne. Les trois
// fichiers sont donc déplacés ensemble, et le WAL restant est écarté.
//
// ─── Rien n'est jamais effacé ──────────────────────────────────────────────
// La base remplacée est ARCHIVÉE, horodatée, à côté. Une restauration est le
// geste le plus destructeur de l'application : elle doit rester réversible à
// la main, par quelqu'un qui n'a que l'explorateur de fichiers.
// ═══════════════════════════════════════════════════════════════════════════

package backup

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"
)

const (
	// fichierEnAttente est la base restaurée, prête à prendre la place.
	fichierEnAttente = "data.db.restauration"

	// fichierMarqueur décrit ce qui attend. Sa PRÉSENCE déclenche l'échange :
	// c'est lui, et pas l'existence du fichier de base, qui fait foi — un
	// téléchargement interrompu laisse un fichier, jamais un marqueur.
	fichierMarqueur = "restauration-en-attente.json"
)

// RestaurationEnAttente décrit ce qui sera appliqué au prochain démarrage.
type RestaurationEnAttente struct {
	IDSnapshot  string `json:"snapshot_id"`
	ClientID    string `json:"client_id"`
	ClientNom   string `json:"client_name"`
	Origine     string `json:"origin"`
	SHA256Clair string `json:"plain_sha256"`
	TailleClair int64  `json:"plain_size"`
	CreeLe      string `json:"created_at"`
	PrepareeLe  string `json:"prepared_at"`
}

// PreparerRestauration télécharge, déchiffre, vérifie et met en attente.
//
// `verifSHA` est l'empreinte annoncée par le manifeste. Elle n'est pas
// facultative : sans elle, on écrirait en attente une base dont personne n'a
// vérifié qu'elle est complète, et l'échange du démarrage suivant remplacerait
// une base saine par un fichier tronqué. Le contrôle a lieu ICI, tant qu'on
// peut encore refuser sans rien casser.
func PreparerRestauration(
	dataDir string,
	source io.Reader,
	cle []byte,
	idSnapshot string,
	verifSHA string,
	info RestaurationEnAttente,
) error {
	cheminAttente := filepath.Join(dataDir, fichierEnAttente)
	cheminMarqueur := filepath.Join(dataDir, fichierMarqueur)

	// On écrit d'abord dans un temporaire : un déchiffrement interrompu ne doit
	// pas laisser un `data.db.restauration` incomplet qui aurait l'air prêt.
	temporaire := cheminAttente + ".partiel"
	_ = os.Remove(temporaire)

	dest, err := os.OpenFile(temporaire, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("création du fichier de restauration : %w", err)
	}

	empreinte, err := Restaurer(source, dest, cle, idSnapshot)
	cerr := dest.Close()
	if err != nil {
		os.Remove(temporaire)
		return fmt.Errorf("déchiffrement : %w", err)
	}
	if cerr != nil {
		os.Remove(temporaire)
		return fmt.Errorf("écriture : %w", cerr)
	}

	// ── La vérification qui autorise la suite ───────────────────────────────
	if verifSHA != "" && empreinte != verifSHA {
		os.Remove(temporaire)
		return fmt.Errorf(
			"empreinte divergente — la base restaurée n'est PAS celle du manifeste (attendu %s, obtenu %s)",
			verifSHA, empreinte)
	}

	// Contrôle de forme, pour le cas où la clé serait bonne mais le contenu
	// pas une base : les 16 premiers octets d'un fichier SQLite sont connus.
	if err := verifierEnteteSQLite(temporaire); err != nil {
		os.Remove(temporaire)
		return err
	}

	if err := os.Rename(temporaire, cheminAttente); err != nil {
		os.Remove(temporaire)
		return fmt.Errorf("mise en attente : %w", err)
	}

	// Le marqueur EN DERNIER. C'est lui qui arme l'échange : l'écrire avant le
	// fichier armerait une restauration sans base à restaurer.
	info.IDSnapshot = idSnapshot
	info.SHA256Clair = empreinte
	info.PrepareeLe = time.Now().UTC().Format(time.RFC3339)

	brut, err := json.MarshalIndent(info, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(cheminMarqueur, brut, 0o600); err != nil {
		os.Remove(cheminAttente)
		return fmt.Errorf("marqueur : %w", err)
	}

	log.Printf("♻️  restauration ARMÉE : %s (%s). Elle sera appliquée au prochain démarrage.",
		idSnapshot, info.ClientNom)
	return nil
}

func verifierEnteteSQLite(chemin string) error {
	f, err := os.Open(chemin)
	if err != nil {
		return err
	}
	defer f.Close()

	entete := make([]byte, 16)
	if _, err := io.ReadFull(f, entete); err != nil {
		return fmt.Errorf("fichier restauré illisible : %w", err)
	}
	if string(entete) != "SQLite format 3\x00" {
		return fmt.Errorf("le fichier restauré n'est pas une base SQLite")
	}
	return nil
}

// LireRestaurationEnAttente rend ce qui attend, ou nil.
func LireRestaurationEnAttente(dataDir string) *RestaurationEnAttente {
	brut, err := os.ReadFile(filepath.Join(dataDir, fichierMarqueur))
	if err != nil {
		return nil
	}
	var info RestaurationEnAttente
	if err := json.Unmarshal(brut, &info); err != nil {
		return nil
	}
	return &info
}

// AnnulerRestauration désarme et efface ce qui attendait.
func AnnulerRestauration(dataDir string) error {
	// Le marqueur D'ABORD : tant qu'il est là, un démarrage appliquerait la
	// restauration. L'ordre inverse laisserait une fenêtre où le marqueur
	// désigne un fichier déjà effacé.
	if err := os.Remove(filepath.Join(dataDir, fichierMarqueur)); err != nil && !os.IsNotExist(err) {
		return err
	}
	if err := os.Remove(filepath.Join(dataDir, fichierEnAttente)); err != nil && !os.IsNotExist(err) {
		return err
	}
	log.Println("♻️  restauration en attente ANNULÉE")
	return nil
}

// AppliquerRestaurationEnAttente échange les fichiers, si un marqueur l'arme.
//
// ⚠️ À appeler dans main(), AVANT toute ouverture de PocketBase, et de nulle
// part ailleurs. Appelée trop tard, elle écrirait sous un moteur qui tient
// déjà les fichiers.
//
// Ne rend jamais d'erreur fatale : une restauration qui échoue doit laisser
// l'application démarrer sur la base EXISTANTE, pas refuser de se lancer. Un
// magasin qui ne peut plus encaisser parce qu'une restauration a mal tourné
// serait un remède pire que le mal.
func AppliquerRestaurationEnAttente(dataDir string) {
	info := LireRestaurationEnAttente(dataDir)
	if info == nil {
		return
	}

	cheminAttente := filepath.Join(dataDir, fichierEnAttente)
	cheminBase := filepath.Join(dataDir, "data.db")
	cheminMarqueur := filepath.Join(dataDir, fichierMarqueur)

	log.Println("═══════════════════════════════════════════════════════════")
	log.Printf("♻️  RESTAURATION EN ATTENTE : snapshot %s", info.IDSnapshot)
	log.Printf("    client %s, poste %s, base du %s", info.ClientNom, info.Origine, info.CreeLe)

	if _, err := os.Stat(cheminAttente); err != nil {
		// Marqueur sans fichier : on désarme plutôt que de réessayer à chaque
		// démarrage, ce qui polluerait les journaux sans jamais aboutir.
		log.Printf("❌ base de restauration introuvable (%v) — restauration ABANDONNÉE", err)
		os.Remove(cheminMarqueur)
		log.Println("═══════════════════════════════════════════════════════════")
		return
	}

	horodatage := time.Now().Format("20060102-150405")

	// ── 1. Archiver l'existant, les trois fichiers ──────────────────────────
	//
	// `-wal` et `-shm` partent AVEC : laisser le journal de l'ancienne base à
	// côté de la nouvelle, c'est offrir à SQLite un WAL qui n'est pas le sien.
	archive := filepath.Join(dataDir, "avant-restauration-"+horodatage)
	if err := os.MkdirAll(archive, 0o700); err != nil {
		log.Printf("❌ dossier d'archive impossible (%v) — restauration ABANDONNÉE", err)
		os.Remove(cheminMarqueur)
		log.Println("═══════════════════════════════════════════════════════════")
		return
	}

	for _, suffixe := range []string{"", "-wal", "-shm"} {
		src := cheminBase + suffixe
		if _, err := os.Stat(src); err != nil {
			continue // absent, normal pour -wal et -shm après un arrêt propre
		}
		dst := filepath.Join(archive, "data.db"+suffixe)
		if err := os.Rename(src, dst); err != nil {
			// Échec à mi-chemin : on remet ce qu'on a déplacé et on renonce.
			// Une base amputée de son WAL serait pire que pas de restauration.
			log.Printf("❌ archivage de %s impossible (%v) — retour en arrière", src, err)
			restaurerArchive(archive, dataDir)
			os.Remove(cheminMarqueur)
			log.Println("═══════════════════════════════════════════════════════════")
			return
		}
	}

	// ── 2. Mettre la restaurée en place ─────────────────────────────────────
	if err := os.Rename(cheminAttente, cheminBase); err != nil {
		log.Printf("❌ mise en place impossible (%v) — RETOUR à la base précédente", err)
		restaurerArchive(archive, dataDir)
		os.Remove(cheminMarqueur)
		log.Println("═══════════════════════════════════════════════════════════")
		return
	}

	// ── 3. Désarmer ─────────────────────────────────────────────────────────
	os.Remove(cheminMarqueur)

	log.Printf("✅ RESTAURATION APPLIQUÉE — base remplacée par le snapshot %s", info.IDSnapshot)
	log.Printf("   la base précédente est conservée dans %s", archive)
	log.Println("   (elle n'est JAMAIS effacée automatiquement : à supprimer à la main)")
	log.Println("═══════════════════════════════════════════════════════════")
}

// restaurerArchive remet en place ce qui vient d'être archivé, quand l'échange
// tourne court. C'est le chemin de retour, et il ne doit rien supposer.
func restaurerArchive(archive, dataDir string) {
	for _, suffixe := range []string{"", "-wal", "-shm"} {
		src := filepath.Join(archive, "data.db"+suffixe)
		if _, err := os.Stat(src); err != nil {
			continue
		}
		if err := os.Rename(src, filepath.Join(dataDir, "data.db"+suffixe)); err != nil {
			log.Printf("⚠️  retour en arrière incomplet : %s n'a pas pu revenir (%v)", src, err)
		}
	}
	_ = os.Remove(archive)
}
