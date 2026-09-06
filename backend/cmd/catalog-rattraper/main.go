// backend/cmd/catalog-rattraper/main.go
// ═══════════════════════════════════════════════════════════════════════════
// RATTRAPER LES FICHES QUE L'IMPORT A LAISSÉES — SIMULATION PAR DÉFAUT
// ═══════════════════════════════════════════════════════════════════════════
// L'import du 11 août 2026 a dédoublonné par SKU. Des devis et des factures
// citent des produits que le catalogue n'a jamais reçus ; certains n'existent
// même plus dans la base d'installation d'AppPos, et seule la base de
// développement — pourtant périmée — les détient encore.
//
//	go run ./backend/cmd/catalog-rattraper -ids candidats.txt
//	go run ./backend/cmd/catalog-rattraper -ids candidats.txt -apply
//
// ─── Pourquoi plusieurs sources, et dans cet ordre ─────────────────────────
// `%APPDATA%\AppPOS\data\products.db` a été COMPACTÉ : les suppressions n'y
// laissent aucune trace, ni réécriture ni marqueur `$$deleted`. Une fiche
// supprimée dans AppPos y est simplement absente. Les deux sauvegardes et la
// base de développement sont donc les seuls témoins de ce qui a existé. On
// lit la plus récente d'abord : une fiche encore vivante doit être reprise
// dans son état actuel, pas dans celui d'août.
//
// ─── Ce que la simulation vérifie vraiment ─────────────────────────────────
// Tout sauf l'écriture, y compris la présence RÉELLE des fichiers d'images sur
// le disque. Une simulation qui annoncerait « 15 fiches » sans dire lesquelles
// arriveront sans visuel ne servirait à rien : c'est justement ce qui distingue
// un rattrapage utile d'un rattrapage à refaire.
package main

import (
	"bufio"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase"

	"pocket-react/backend/catalog/load"
	"pocket-react/backend/catalog/mapping"
	"pocket-react/backend/catalog/nedb"
	"pocket-react/backend/catalog/normalize"
)

func defaultSources() []string {
	a := os.Getenv("APPDATA")
	if a == "" {
		return []string{"data"}
	}
	base := filepath.Join(a, "AppPOS", "data")
	return []string{
		base,
		filepath.Join(base, "bk_avant_dern"),
		filepath.Join(base, "bk"),
		filepath.Join("I:", `\`, "AppPOS", "AppServe", "data"),
	}
}

func defaultPBDir() string {
	if l := os.Getenv("LOCALAPPDATA"); l != "" {
		return filepath.Join(l, "PocketReact", "pb_data")
	}
	return "pb_data"
}

func main() {
	var (
		idsFichier = flag.String("ids", "",
			"fichier de `legacy_id` NeDB, un par ligne (« # » en commentaire). "+
				"À défaut, les identifiants sont pris en arguments")
		sourcesArg = flag.String("sources", strings.Join(defaultSources(), string(os.PathListSeparator)),
			"répertoires NeDB à consulter, dans l'ordre de priorité, séparés par « ; »")
		pbDir   = flag.String("pb", defaultPBDir(), "répertoire `pb_data`")
		secours = flag.String("images-secours", "",
			"répertoire `storage` d'une autre base PocketBase, dernier repli pour les images")
		skuVide = flag.Bool("vider-sku-en-collision", false,
			"écrire une fiche SANS SKU quand son SKU est déjà porté, au lieu de la "+
				"refuser. Pour le FAUX doublon : deux articles distincts saisis sous "+
				"la même référence dans AppPos. Jamais par défaut")
		apply = flag.Bool("apply", false,
			"ÉCRIRE dans PocketBase. Sans ce drapeau, l'outil simule. "+
				"PocketApp doit être FERMÉ : une seconde connexion en écriture "+
				"casse l'atomicité sur laquelle repose le stock")
	)
	flag.Parse()
	log.SetFlags(0)

	ids, err := lireIDs(*idsFichier, flag.Args())
	if err != nil {
		log.Fatalf("%v", err)
	}
	if len(ids) == 0 {
		log.Fatalf("aucun legacy_id : passer -ids fichier, ou des identifiants en arguments")
	}

	sources := decouper(*sourcesArg)
	fmt.Printf("Rattrapage de %d fiche(s)\n", len(ids))
	fmt.Printf("PocketBase : %s\n\n", *pbDir)

	// ── Lecture des sources, la plus prioritaire d'abord ────────────────────
	cat := &normalize.Catalog{}
	rep := &normalize.Report{}
	vus := map[string]bool{}
	vusCat := map[string]bool{}
	racines := []string{}

	for _, dir := range sources {
		c, r, err := chargerSource(dir)
		if err != nil {
			fmt.Printf("  %-52s ignorée (%v)\n", dir, err)
			continue
		}
		var pris int
		for _, p := range c.Products {
			if !vus[p.LegacyID] {
				vus[p.LegacyID] = true
				cat.Products = append(cat.Products, p)
				pris++
			}
		}
		// Les catégories suivent : sans elles, la règle « Occasion » ne peut
		// pas être appliquée — elle se lit par le CHEMIN d'une catégorie, et
		// un catalogue sans arbre n'a pas de chemin.
		for _, k := range c.Categories {
			if !vusCat[k.LegacyID] {
				vusCat[k.LegacyID] = true
				cat.Categories = append(cat.Categories, k)
			}
		}
		// Le rapport de la source qui fournit la fiche est celui qui compte :
		// une quarantaine prononcée sur une AUTRE version de la même fiche
		// écarterait à tort celle qu'on reprend.
		rep.Anomalies = append(rep.Anomalies, r.Anomalies...)
		fmt.Printf("  %-52s %5d fiches, %4d nouvelles\n", dir, len(c.Products), pris)
		racines = append(racines, racinesDe(dir)...)
	}
	fmt.Println()

	// ── « Occasion » et « LOCATION » ne sont pas des catégories ─────────────
	//
	// Ce sont des états commerciaux depuis le 24 août 2026, et PocketBase ne
	// les porte donc pas. Sans cette étape, le rattrapage signalerait « catégorie
	// non rattachée » et écrirait un instrument d'occasion comme du neuf — au
	// prix du neuf. La règle est LUE dans categories.json, elle n'est pas
	// réécrite ici : deux copies d'une même règle finissent par diverger.
	if ct, _, err := mapping.LoadTables(); err != nil {
		fmt.Printf("⚠ tables de correspondance illisibles (%v) : les états commerciaux "+
			"ne seront pas posés\n\n", err)
	} else if etats := mapping.EtatsCommerciaux(cat, ct); len(etats) > 0 {
		poses := appliquerEtatsCommerciaux(cat, etats)
		fmt.Printf("États commerciaux : %d catégorie(s) traitées comme un champ, "+
			"%d fiche(s) marquées\n\n", len(etats), poses)
	}

	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: *pbDir})
	if err := app.Bootstrap(); err != nil {
		log.Fatalf("ouverture de %q : %v\n\nPocketApp est-il fermé ?", *pbDir, err)
	}

	var sauvegarde string
	if *apply {
		// PocketApp fermé : ce n'est pas une consigne, c'est une condition.
		// L'atomicité du stock repose sur une propriété de PocketBase v0.22 —
		// UNE SEULE connexion en écriture (CLAUDE.md). Un second processus qui
		// écrit pendant que la caisse tourne la rompt, et le symptôme serait
		// des mouvements de stock perdus en silence, pas une erreur.
		if adresse := pocketAppEnMarche(); adresse != "" {
			log.Fatalf("PocketApp répond sur %s : le fermer avant d'écrire.\n"+
				"Rien n'a été écrit.", adresse)
		}
		sauvegarde, err = sauvegarderBase(*pbDir)
		if err != nil {
			log.Fatalf("SAUVEGARDE IMPOSSIBLE, rien n'a été écrit : %v", err)
		}
		fmt.Printf("Sauvegarde de la base : %s\n\n", sauvegarde)
	}

	res, err := load.Rattraper(app, cat, rep, ids, load.OptionsRattrapage{
		RacineImages:        premier(racines),
		AutresRacines:       reste(racines),
		SecoursImages:       *secours,
		Simulation:          !*apply,
		ViderSKUEnCollision: *skuVide,
	})
	if err != nil {
		log.Fatalf("%v", err)
	}

	afficher(res)

	if !*apply {
		fmt.Println("\nAucune écriture : simulation seule.")
		fmt.Println("Pour appliquer — PocketApp FERMÉ — relancer avec -apply.")
		return
	}
	fmt.Printf("\nEn cas de doute, la base d'avant est ici :\n  %s\n", sauvegarde)
}

// appliquerEtatsCommerciaux retire de chaque produit les catégories devenues
// un champ, et pose l'état correspondant. Rend le nombre de fiches marquées.
//
// Un produit qui n'avait QUE « Occasion » se retrouve sans catégorie : c'est
// exact, c'est ce que fait la reprise (mapping/appliquer.go, sansRefonte), et
// c'est mieux qu'un rattachement vers une catégorie qui n'existe plus.
func appliquerEtatsCommerciaux(cat *normalize.Catalog, etats map[string]string) int {
	var marques int
	for i := range cat.Products {
		p := &cat.Products[i]
		garde := make([]string, 0, len(p.CategoryLegacyID))
		var pose bool
		for _, id := range p.CategoryLegacyID {
			if v, estChamp := etats[id]; estChamp {
				p.CommercialState = v
				pose = true
				continue
			}
			garde = append(garde, id)
		}
		p.CategoryLegacyID = garde
		if pose {
			marques++
		}
	}
	return marques
}

// pocketAppEnMarche rend l'adresse où PocketApp répond, ou "" s'il est fermé.
//
// Le port suffit : c'est le PocketBase embarqué qui l'ouvre (main.go), donc
// s'il écoute, une connexion en écriture est déjà ouverte sur la base.
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

// ── Lecture ────────────────────────────────────────────────────────────────

func chargerSource(dir string) (*normalize.Catalog, *normalize.Report, error) {
	if _, err := os.Stat(filepath.Join(dir, "products.db")); err != nil {
		return nil, nil, fmt.Errorf("pas de products.db")
	}
	charge := func(nom string) *nedb.Collection {
		c, err := nedb.Load(nom, filepath.Join(dir, nom+".db"))
		if err != nil {
			return &nedb.Collection{Name: nom}
		}
		return c
	}
	cat, rep := normalize.Run(
		charge("products"), charge("categories"), charge("brands"), charge("suppliers"))
	return cat, rep, nil
}

// racinesDe rend les racines où chercher les images d'une source : le parent
// du répertoire NeDB, et son grand-parent.
//
// Le grand-parent existe pour les sauvegardes : `…\AppPOS\data\bk` a pour
// parent `…\AppPOS\data`, qui n'a pas de `public/` — les images sont un cran
// plus haut, sous `…\AppPOS`.
func racinesDe(dir string) []string {
	parent := filepath.Dir(dir)
	return []string{parent, filepath.Dir(parent)}
}

func lireIDs(fichier string, args []string) ([]string, error) {
	var out []string
	ajouter := func(s string) {
		s = strings.TrimSpace(s)
		if i := strings.Index(s, "#"); i >= 0 {
			s = strings.TrimSpace(s[:i])
		}
		// Un TSV est accepté tel quel : la première colonne est l'identifiant.
		if i := strings.IndexAny(s, "\t ,;"); i > 0 {
			s = s[:i]
		}
		if s != "" {
			out = append(out, s)
		}
	}
	for _, a := range args {
		ajouter(a)
	}
	if fichier == "" {
		return out, nil
	}
	f, err := os.Open(fichier)
	if err != nil {
		return nil, fmt.Errorf("liste d'identifiants : %w", err)
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		ajouter(sc.Text())
	}
	return out, sc.Err()
}

func decouper(s string) []string {
	var out []string
	for _, p := range strings.FieldsFunc(s, func(r rune) bool {
		return r == ';' || r == os.PathListSeparator
	}) {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func premier(s []string) string {
	if len(s) == 0 {
		return ""
	}
	return s[0]
}

func reste(s []string) []string {
	if len(s) < 2 {
		return nil
	}
	return s[1:]
}

// ── Affichage ──────────────────────────────────────────────────────────────

func afficher(res *load.ResultatRattrapage) {
	fmt.Printf("Entreprise : %s (%s)\n\n", res.CompanyName, res.CompanyID)

	retenues, refusees := res.Retenues(), res.Refusees()

	fmt.Printf("── RETENUES : %d ─────────────────────────────────────────────\n", len(retenues))
	if len(retenues) == 0 {
		fmt.Println("  (aucune)")
	}
	for _, f := range retenues {
		img := fmt.Sprintf("%d/%d image(s)", f.ImagesTrouvees, f.ImagesAttendues)
		if f.ImagesAttendues == 0 {
			img = "sans image"
		} else if f.ImagesTrouvees < f.ImagesAttendues {
			img += "  ⚠ manquantes sur disque"
		}
		fmt.Printf("  %-16s %-46s %-16s %s\n", f.LegacyID, trunc(f.Nom, 44), trunc(f.SKU, 14), img)
		if f.ProduitID != "" {
			fmt.Printf("      → écrit sous %s\n", f.ProduitID)
		}
		if f.SKUVide {
			fmt.Println("      SKU écarté : il était déjà porté par un autre produit. " +
				"La fiche entre SANS référence.")
		}
		if f.SlugAjuste {
			fmt.Printf("      slug ajusté : %s (celui du nom était déjà pris)\n", f.Slug)
		}
		if len(f.RelationsPerdues) > 0 {
			fmt.Printf("      ⚠ non rattaché : %s\n", strings.Join(f.RelationsPerdues, ", "))
		}
	}

	if len(refusees) > 0 {
		fmt.Printf("\n── REFUSÉES : %d ─────────────────────────────────────────────\n", len(refusees))
		for _, f := range refusees {
			fmt.Printf("  %-16s %-46s %s\n", f.LegacyID, trunc(f.Nom, 44), f.Refus)
		}
	}

	if !res.Simulation {
		fmt.Printf("\nImages copiées : %d", res.FilesCopied)
		if res.ResolvedByName > 0 {
			fmt.Printf(", dont %d retrouvées par leur nom", res.ResolvedByName)
		}
		if res.ResolvedFromBackup > 0 {
			fmt.Printf(", %d reprises du storage de secours", res.ResolvedFromBackup)
		}
		fmt.Println()
	}
}

func trunc(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "…"
}

// ── Sauvegarde ─────────────────────────────────────────────────────────────

// sauvegarderBase copie `data.db` et ses journaux, PAS `storage/`.
//
// C'est délibéré, et c'est une différence assumée avec `catalog-reprise`, qui
// copie tout : le rattrapage n'EFFACE aucun fichier image, il n'en ajoute que.
// Copier 1,6 Gio pour protéger des octets que personne ne touche coûterait des
// minutes à chaque essai — et un outil qu'on hésite à relancer est un outil
// qu'on utilise mal. Restaurer, c'est remettre `data.db` en place ; les images
// surnuméraires resteront sans être référencées, sans conséquence.
func sauvegarderBase(pbDir string) (string, error) {
	dest := filepath.Join(pbDir, "avant-rattrapage-"+horodatage())
	if _, err := os.Stat(dest); err == nil {
		return "", fmt.Errorf("%q existe déjà — refus d'écraser une sauvegarde", dest)
	}
	if err := os.MkdirAll(dest, 0o700); err != nil {
		return "", err
	}
	for _, suffixe := range []string{"", "-wal", "-shm"} {
		src := filepath.Join(pbDir, "data.db"+suffixe)
		if _, err := os.Stat(src); err != nil {
			continue // -wal et -shm sont absents après un arrêt propre
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

func horodatage() string { return time.Now().Format("20060102-150405") }

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
