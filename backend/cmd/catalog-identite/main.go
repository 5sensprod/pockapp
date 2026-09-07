// backend/cmd/catalog-identite/main.go
// ═══════════════════════════════════════════════════════════════════════════
// RENDRE À UNE FICHE SON IDENTITÉ — corriger un `legacy_id`, et rien d'autre
// ═══════════════════════════════════════════════════════════════════════════
// L'import du 11 août 2026 a dédoublonné par SKU, et il n'a pas seulement
// écarté des fiches : trois enregistrements portent le `legacy_id` d'une fiche
// NeDB et le CONTENU d'une autre. Le catalogue affiche le bon nombre de
// produits, aucun contrôle ne bronche, et pourtant l'identité est fausse.
//
//	go run ./backend/cmd/catalog-identite -produit 3bu3ugdky9jfkai -legacy HFbOeGZjsgvZ6q2J
//	go run ./backend/cmd/catalog-identite -produit … -legacy … -apply
//
// ─── Ce qu'un `legacy_id` porte, et pourquoi ce geste n'est pas anodin ─────
// Il n'est pas un champ décoratif. Il est :
//
//   - le PONT vers les documents — devis, factures, tickets et comptages
//     d'inventaire citent des `product_id` NeDB, et c'est par lui qu'ils se
//     résolvent ;
//   - l'IDENTITÉ DISTANTE — la ligne SQL du catalogue d'axemusique.shop et
//     l'arborescence des images (`<kind>/<legacy_id>/<rang>.<ext>`) sont
//     nommées par lui.
//
// Le corriger répare le premier et DÉPLACE le second. Si le produit est
// publié, la ligne distante portant l'ancien identifiant devient orpheline et
// garde le slug ; le prochain export présentera une entité neuve, dont le
// serveur protégera le slug déjà pris. L'outil le dit avant d'écrire — il ne
// peut pas le corriger à distance, c'est un geste côté serveur.
//
// ─── Ce qu'il ne touche pas ────────────────────────────────────────────────
// NI le slug — il est figé et nomme une page en ligne (CLAUDE.md, 20 août
// 2026) —, ni le nom, ni le stock, ni les images. Un seul champ change.
package main

import (
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
	"github.com/pocketbase/pocketbase/daos"
)

func defaultPBDir() string {
	if l := os.Getenv("LOCALAPPDATA"); l != "" {
		return filepath.Join(l, "PocketReact", "pb_data")
	}
	return "pb_data"
}

func main() {
	var (
		produitID = flag.String("produit", "", "identifiant PocketBase du produit à réidentifier")
		nouveau   = flag.String("legacy", "", "`legacy_id` à lui donner")
		pbDir     = flag.String("pb", defaultPBDir(), "répertoire `pb_data`")
		apply     = flag.Bool("apply", false,
			"ÉCRIRE. Sans ce drapeau, l'outil simule. PocketApp doit être FERMÉ")
	)
	flag.Parse()
	log.SetFlags(0)

	if strings.TrimSpace(*produitID) == "" || strings.TrimSpace(*nouveau) == "" {
		log.Fatalf("-produit et -legacy sont requis")
	}

	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: *pbDir})
	if err := app.Bootstrap(); err != nil {
		log.Fatalf("ouverture de %q : %v\n\nPocketApp est-il fermé ?", *pbDir, err)
	}

	dao := app.Dao()
	r, err := dao.FindRecordById("products", *produitID)
	if err != nil {
		log.Fatalf("produit %q introuvable : %v", *produitID, err)
	}
	ancien := r.GetString("legacy_id")

	fmt.Println("── LA FICHE ─────────────────────────────────────────────────")
	fmt.Printf("  %s\n", r.GetString("name"))
	fmt.Printf("  sku    : %s\n", r.GetString("sku"))
	fmt.Printf("  slug   : %s   (NON MODIFIÉ)\n", r.GetString("slug"))
	fmt.Printf("  statut : %s     stock : %v\n", r.GetString("status"), r.Get("stock"))
	fmt.Printf("\n  legacy_id : %s  →  %s\n\n", ancien, *nouveau)

	if ancien == *nouveau {
		fmt.Println("Rien à faire : la fiche porte déjà cet identifiant.")
		return
	}

	// ── Les refus ───────────────────────────────────────────────────────────
	//
	// Un legacy_id en double, c'est deux produits qui réclament le même dossier
	// d'images distant et la même ligne SQL. C'est exactement ce que la reprise
	// appelle une collision de clé stable, et elle refuse d'écrire dessus.
	if autre, err := dao.FindFirstRecordByData("products", "legacy_id", *nouveau); err == nil && autre != nil {
		log.Fatalf("le legacy_id %q est DÉJÀ porté par le produit %s (%s).\n"+
			"Deux produits ne peuvent pas le partager : même dossier d'images\n"+
			"distant, même ligne SQL. Rien n'a été écrit.",
			*nouveau, autre.Id, autre.GetString("name"))
	}

	// ── L'avertissement qui compte ──────────────────────────────────────────
	if r.GetString("status") == "published" {
		fmt.Println("⚠ CETTE FICHE EST PUBLIÉE.")
		fmt.Printf("  La ligne distante `ax_products.legacy_id = %s` restera en ligne\n", ancien)
		fmt.Println("  avec son slug, et deviendra ORPHELINE : plus aucun produit local")
		fmt.Println("  ne la désigne, donc plus rien ne peut la dépublier — le contrat")
		fmt.Println("  n'a aucune opération de suppression (CLAUDE.md, 21 août 2026).")
		fmt.Println()
		fmt.Printf("  Le prochain export INSÉRERA une ligne %s portant LE MÊME SLUG.\n", *nouveau)
		fmt.Println("  Rien ne s'y oppose : `idx_products_slug` est un index simple, pas")
		fmt.Println("  UNIQUE (server/sql/schema.sql), et la protection de slug de")
		fmt.Println("  products-sync.php ne joue que sur la mise à jour d'une ligne")
		fmt.Println("  existante, jamais sur une insertion.")
		fmt.Println()
		fmt.Println("  Résultat sur le site, si rien n'est fait :")
		fmt.Println("    • le produit apparaît DEUX FOIS dans les grilles ;")
		fmt.Println("    • sa page (`catalog.php?action=product&slug=…`) résout par")
		fmt.Println("      `WHERE slug = ? AND status='published' LIMIT 1`, sans ORDER BY :")
		fmt.Println("      laquelle des deux lignes répond n'est pas déterminé ;")
		fmt.Println("    • ses images distantes repartent sous `products/<nouveau>/`,")
		fmt.Println("      l'ancien dossier restant sur le disque du mutualisé.")
		fmt.Println()
		fmt.Println("  → MÉNAGE SQL DISTANT À FAIRE AVANT LE PROCHAIN EXPORT.")
		fmt.Printf("    DELETE FROM ax_products WHERE legacy_id = '%s';\n", ancien)
		fmt.Println("    (ax_product_categories suit par ON DELETE CASCADE)")
		fmt.Println()
	}

	if !*apply {
		fmt.Println("Aucune écriture : simulation seule.")
		fmt.Println("Pour appliquer — PocketApp FERMÉ — relancer avec -apply.")
		return
	}

	// PocketApp fermé : l'atomicité du stock repose sur UNE SEULE connexion en
	// écriture (CLAUDE.md). Un second processus la rompt en silence.
	if adresse := pocketAppEnMarche(); adresse != "" {
		log.Fatalf("PocketApp répond sur %s : le fermer avant d'écrire.\nRien n'a été écrit.", adresse)
	}

	sauvegarde, err := sauvegarderBase(*pbDir)
	if err != nil {
		log.Fatalf("SAUVEGARDE IMPOSSIBLE, rien n'a été écrit : %v", err)
	}
	fmt.Printf("Sauvegarde : %s\n\n", sauvegarde)

	err = dao.RunInTransaction(func(tx *daos.Dao) error {
		rec, err := tx.FindRecordById("products", *produitID)
		if err != nil {
			return err
		}
		rec.Set("legacy_id", *nouveau)
		return tx.SaveRecord(rec)
	})
	if err != nil {
		log.Fatalf("écriture refusée (transaction annulée, la base est dans son état "+
			"d'avant) : %v", err)
	}

	apres, _ := dao.FindRecordById("products", *produitID)
	fmt.Printf("✅ %s porte désormais le legacy_id %s\n", *produitID, apres.GetString("legacy_id"))
	fmt.Printf("   slug inchangé : %s\n", apres.GetString("slug"))
	fmt.Printf("\n   %s est LIBRE : la fiche qui le portait légitimement peut être\n", ancien)
	fmt.Println("   rattrapée (backend/cmd/catalog-rattraper).")
	fmt.Printf("\nEn cas de doute, la base d'avant est ici :\n  %s\n", sauvegarde)
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

// sauvegarderBase copie `data.db` et ses journaux. Pas `storage/` : ce geste
// ne touche aucun fichier image.
func sauvegarderBase(pbDir string) (string, error) {
	dest := filepath.Join(pbDir, "avant-identite-"+time.Now().Format("20060102-150405"))
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
