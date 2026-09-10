// backend/cmd/catalog-images/main.go
// ═══════════════════════════════════════════════════════════════════════════
// RENDRE LEUR VISUEL AUX FICHES QUI N'EN ONT PAS — SIMULATION PAR DÉFAUT
// ═══════════════════════════════════════════════════════════════════════════
// Lit un fichier de correspondances « produit → source d'image » et rattache
// chaque fichier au produit. La source est soit un chemin sur ce poste, soit
// une adresse https, soit un identifiant de média WordPress.
//
//	go run ./backend/cmd/catalog-images -liste images-a-recuperer.tsv
//	go run ./backend/cmd/catalog-images -liste images-a-recuperer.tsv -apply
//
// ─── Ce qui est téléchargé, et d'où ────────────────────────────────────────
// Deux domaines, et deux seulement : `axemusique.shop` (les URL que les fiches
// AppPos portent déjà) et `axe.5sensprod.com` (l'ancien site, dont la
// médiathèque WordPress est publique en lecture). Une adresse ailleurs est
// REFUSÉE — c'est une liste blanche, pas un réglage : un outil qui écrit dans
// le catalogue ne doit pas pouvoir aller chercher n'importe où.
//
// ─── Trois contrôles avant d'écrire un octet ───────────────────────────────
//  1. le domaine est dans la liste blanche, et l'adresse est en https ;
//  2. la réponse est réellement une IMAGE — signature de fichier vérifiée, pas
//     l'en-tête Content-Type que le serveur annonce. Un mutualisé qui rend une
//     page d'erreur en 200 ne doit pas devenir le visuel d'un produit ;
//  3. le produit n'a pas déjà une image (`load.PoserImagesPrincipales`).
package main

import (
	"bufio"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase"

	"pocket-react/backend/catalog/load"
)

// domainesAutorises — liste blanche des sources d'images.
var domainesAutorises = map[string]bool{
	"axemusique.shop":     true,
	"www.axemusique.shop": true,
	"axe.5sensprod.com":   true,
}

const tailleMaxImage = 16 << 20

func defaultPBDir() string {
	if l := os.Getenv("LOCALAPPDATA"); l != "" {
		return filepath.Join(l, "PocketReact", "pb_data")
	}
	return "pb_data"
}

type ligne struct {
	preuve, produitID, legacy, nom, sku, source, cible string
}

func main() {
	var (
		liste = flag.String("liste", "",
			"fichier TSV : preuve, id_pb, legacy_id, nom, sku, desc, source, cible")
		pbDir   = flag.String("pb", defaultPBDir(), "répertoire `pb_data`")
		retirer = flag.String("retirer", "",
			"annuler une pose : `id_produit=nom_du_fichier`. Le nom doit correspondre "+
				"à l'image en place, sinon rien n'est retiré")
		apply = flag.Bool("apply", false,
			"ÉCRIRE. Sans ce drapeau, l'outil simule — il télécharge quand même, "+
				"pour dire ce qui arriverait vraiment. PocketApp doit être FERMÉ")
	)
	flag.Parse()
	log.SetFlags(0)

	if strings.TrimSpace(*retirer) != "" {
		parts := strings.SplitN(*retirer, "=", 2)
		nom := ""
		if len(parts) == 2 {
			nom = parts[1]
		}
		app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: *pbDir})
		if err := app.Bootstrap(); err != nil {
			log.Fatalf("ouverture de %q : %v", *pbDir, err)
		}
		if !*apply {
			fmt.Println("Retirerait l'image de", parts[0], "(attendu :", nom+")")
			fmt.Println("Aucune écriture : simulation seule. Ajouter -apply.")
			return
		}
		if adresse := pocketAppEnMarche(); adresse != "" {
			log.Fatalf("PocketApp répond sur %s : le fermer avant d'écrire.", adresse)
		}
		sauv, err := sauvegarderBase(*pbDir)
		if err != nil {
			log.Fatalf("SAUVEGARDE IMPOSSIBLE, rien n'a été écrit : %v", err)
		}
		if err := load.RetirerImagePosee(app, parts[0], nom); err != nil {
			log.Fatalf("%v", err)
		}
		fmt.Println("✅ image retirée de", parts[0])
		fmt.Println("   sauvegarde :", sauv)
		return
	}

	if strings.TrimSpace(*liste) == "" {
		log.Fatalf("-liste ou -retirer est requis")
	}
	lignes, err := lireListe(*liste)
	if err != nil {
		log.Fatalf("%v", err)
	}
	fmt.Printf("%d correspondance(s) à traiter\n\n", len(lignes))

	// ── Récupération des octets, avant toute ouverture de base ──────────────
	cl := &http.Client{Timeout: 60 * time.Second}
	var images []load.ImageAPoser
	var echecs int

	for _, l := range lignes {
		octets, nom, origine, err := recuperer(cl, l.cible)
		if err != nil {
			fmt.Printf("  ✗ %-42s %v\n", trunc(l.nom, 40), err)
			echecs++
			continue
		}
		typ, ok := load.EstUneImage(octets)
		if !ok {
			fmt.Printf("  ✗ %-42s la source ne rend pas une image\n", trunc(l.nom, 40))
			echecs++
			continue
		}
		fmt.Printf("  ✓ %-42s %-6s %6d Ko  %s\n", trunc(l.nom, 40), typ, len(octets)/1024, origine)
		images = append(images, load.ImageAPoser{
			ProduitID:  l.produitID,
			NomFichier: nom,
			Octets:     octets,
			Origine:    origine,
		})
	}
	fmt.Printf("\n%d image(s) récupérée(s), %d échec(s)\n\n", len(images), echecs)
	if len(images) == 0 {
		return
	}

	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: *pbDir})
	if err := app.Bootstrap(); err != nil {
		log.Fatalf("ouverture de %q : %v\n\nPocketApp est-il fermé ?", *pbDir, err)
	}

	var sauvegarde string
	if *apply {
		// L'atomicité du stock repose sur UNE SEULE connexion en écriture.
		if adresse := pocketAppEnMarche(); adresse != "" {
			log.Fatalf("PocketApp répond sur %s : le fermer avant d'écrire.\n"+
				"Rien n'a été écrit.", adresse)
		}
		sauvegarde, err = sauvegarderBase(*pbDir)
		if err != nil {
			log.Fatalf("SAUVEGARDE IMPOSSIBLE, rien n'a été écrit : %v", err)
		}
		fmt.Printf("Sauvegarde : %s\n\n", sauvegarde)
	}

	res, err := load.PoserImagesPrincipales(app, images, !*apply)
	if err != nil {
		log.Fatalf("%v", err)
	}

	fmt.Printf("── RETENUES : %d ────────────────────────────────────────────\n", len(res.Posees))
	for _, p := range res.Posees {
		fmt.Printf("  %-44s %6d Ko", trunc(p.Nom, 42), p.Octets/1024)
		if p.NomStocke != "" {
			fmt.Printf("  → %s", p.NomStocke)
		}
		fmt.Println()
	}
	if len(res.Refusees) > 0 {
		fmt.Printf("\n── REFUSÉES : %d ────────────────────────────────────────────\n", len(res.Refusees))
		for _, p := range res.Refusees {
			fmt.Printf("  %-44s %s\n", trunc(p.Nom+" ("+p.ProduitID+")", 42), p.Refus)
		}
	}

	if !*apply {
		fmt.Println("\nAucune écriture : simulation seule.")
		fmt.Println("Pour appliquer — PocketApp FERMÉ — relancer avec -apply.")
		return
	}
	fmt.Printf("\nEn cas de doute, la base d'avant est ici :\n  %s\n", sauvegarde)
}

// ── Récupération ───────────────────────────────────────────────────────────

// recuperer rend les octets d'une cible : chemin local, adresse https, ou
// « media:<id> » — un identifiant de la médiathèque WordPress, qu'il faut
// d'abord résoudre en adresse.
func recuperer(cl *http.Client, cible string) (octets []byte, nom, origine string, err error) {
	switch {
	case strings.HasPrefix(cible, "media:"):
		u, e := resoudreMedia(cl, strings.TrimPrefix(cible, "media:"))
		if e != nil {
			return nil, "", "", e
		}
		return telecharger(cl, u)

	case strings.HasPrefix(cible, "https://"):
		return telecharger(cl, cible)

	case strings.HasPrefix(cible, "http://"):
		return nil, "", "", fmt.Errorf("adresse en clair refusée")

	default:
		b, e := os.ReadFile(cible)
		if e != nil {
			return nil, "", "", fmt.Errorf("fichier illisible : %w", e)
		}
		if len(b) > tailleMaxImage {
			return nil, "", "", fmt.Errorf("%d Mio dépasse le plafond", len(b)>>20)
		}
		return b, filepath.Base(cible), "disque", nil
	}
}

func telecharger(cl *http.Client, adresse string) ([]byte, string, string, error) {
	u, err := url.Parse(adresse)
	if err != nil {
		return nil, "", "", fmt.Errorf("adresse illisible")
	}
	if u.Scheme != "https" {
		return nil, "", "", fmt.Errorf("https exigé")
	}
	if !domainesAutorises[u.Hostname()] {
		return nil, "", "", fmt.Errorf("domaine %q hors liste blanche", u.Hostname())
	}
	req, _ := http.NewRequest("GET", adresse, nil)
	req.Header.Set("User-Agent", "PocketApp-Images/1.0")
	resp, err := cl.Do(req)
	if err != nil {
		return nil, "", "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, "", "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, tailleMaxImage+1))
	if err != nil {
		return nil, "", "", err
	}
	if len(b) > tailleMaxImage {
		return nil, "", "", fmt.Errorf("dépasse le plafond de %d Mio", tailleMaxImage>>20)
	}
	nom := path.Base(u.Path)
	if nom == "" || nom == "/" {
		nom = "image"
	}
	return b, nom, u.Hostname(), nil
}

func resoudreMedia(cl *http.Client, id string) (string, error) {
	u := "https://axe.5sensprod.com/wp-json/wp/v2/media/" + url.PathEscape(id) + "?_fields=source_url"
	req, _ := http.NewRequest("GET", u, nil)
	req.Header.Set("User-Agent", "PocketApp-Images/1.0")
	resp, err := cl.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("média %s : HTTP %d", id, resp.StatusCode)
	}
	// Réponse minuscule et de forme connue : {"source_url":"https://…"}
	s := string(b)
	i := strings.Index(s, `"source_url":"`)
	if i < 0 {
		return "", fmt.Errorf("média %s : pas d'adresse dans la réponse", id)
	}
	s = s[i+len(`"source_url":"`):]
	j := strings.IndexByte(s, '"')
	if j < 0 {
		return "", fmt.Errorf("média %s : adresse tronquée", id)
	}
	return strings.ReplaceAll(s[:j], `\/`, "/"), nil
}

// ── Lecture de la liste ────────────────────────────────────────────────────

func lireListe(chemin string) ([]ligne, error) {
	f, err := os.Open(chemin)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var out []ligne
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	premiere := true
	for sc.Scan() {
		t := strings.TrimRight(sc.Text(), "\r")
		if strings.TrimSpace(t) == "" || strings.HasPrefix(t, "#") {
			continue
		}
		c := strings.Split(t, "\t")
		if premiere {
			premiere = false
			if len(c) > 1 && c[1] == "id_pb" {
				continue // en-tête
			}
		}
		if len(c) < 8 {
			continue
		}
		l := ligne{preuve: c[0], produitID: c[1], legacy: c[2], nom: c[3],
			sku: c[4], source: c[6], cible: strings.TrimSpace(c[7])}
		if l.produitID == "" || l.cible == "" {
			continue
		}
		out = append(out, l)
	}
	return out, sc.Err()
}

func trunc(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "…"
}

func pocketAppEnMarche() string {
	for _, adresse := range []string{"127.0.0.1:8090", "localhost:8090"} {
		conn, err := net.DialTimeout("tcp", adresse, 300*time.Millisecond)
		if err == nil {
			conn.Close()
			return adresse
		}
	}
	return ""
}

// sauvegarderBase copie `data.db` et ses journaux. `storage/` n'est PAS copié :
// cet outil n'efface aucun fichier image, il n'en ajoute que — restaurer,
// c'est remettre `data.db`, et les fichiers surnuméraires resteront sans être
// référencés.
func sauvegarderBase(pbDir string) (string, error) {
	dest := filepath.Join(pbDir, "avant-images-"+time.Now().Format("20060102-150405"))
	if _, err := os.Stat(dest); err == nil {
		return "", fmt.Errorf("%q existe déjà — refus d'écraser une sauvegarde", dest)
	}
	if err := os.MkdirAll(dest, 0o700); err != nil {
		return "", err
	}
	for _, suffixe := range []string{"", "-wal", "-shm"} {
		src := filepath.Join(pbDir, "data.db"+suffixe)
		if _, err := os.Stat(src); err != nil {
			continue
		}
		if err := copier(src, filepath.Join(dest, "data.db"+suffixe)); err != nil {
			return "", err
		}
	}
	if _, err := os.Stat(filepath.Join(dest, "data.db")); err != nil {
		return "", fmt.Errorf("aucune base copiée depuis %q", pbDir)
	}
	return dest, nil
}

func copier(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
