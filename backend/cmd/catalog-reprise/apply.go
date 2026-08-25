// backend/cmd/catalog-reprise/apply.go
// ═══════════════════════════════════════════════════════════════════════════
// L'APPLICATION — trois verrous avant d'écrire, et une sauvegarde
// ═══════════════════════════════════════════════════════════════════════════
//
// `-apply` est le seul chemin d'écriture de cet outil, et il ne s'ouvre qu'à
// trois conditions, dans cet ordre :
//
//  1. **Le plan ne doit pas être bloquant.** Une collision de clé stable donne
//     le même `legacy_id` à deux produits : même dossier d'images distant,
//     même ligne SQL sur le site. On refuse avant d'ouvrir la base.
//  2. **La sauvegarde doit avoir réussi.** Elle est prise ici, pas demandée à
//     l'opérateur : une consigne se saute, une copie de fichier non. Si elle
//     échoue, on n'écrit pas.
//  3. **`load.Inspect` doit laisser passer**, et c'est le chargeur lui-même
//     qui le vérifie — on ne le redemande pas ici, pour ne pas se retrouver
//     avec deux jugements sur la même question (le défaut exact qu'on a
//     corrigé dans catalog_v2.go).
//
// ── Ce que l'écriture fait, et par qui ─────────────────────────────────────
//
// Rien de neuf : `mapping.Appliquer` transforme la DONNÉE, puis `load.Run`
// écrit — sa transaction unique, sa garde, sa copie d'images. Le chargeur ne
// sait pas qu'il charge une reprise, et c'est voulu.
package main

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"

	"pocket-react/backend/catalog/load"
	"pocket-react/backend/catalog/mapping"
	"pocket-react/backend/catalog/normalize"

	"github.com/pocketbase/pocketbase"
)

// appliquer exécute la reprise. Il n'est appelé qu'avec -apply.
func appliquer(cat *normalize.Catalog, rep *normalize.Report, plan *mapping.Plan,
	ct *mapping.CategoryTable, bt *mapping.BrandTable, kt *mapping.KeyTable,
	nedbDir, pbDir, secoursImages string, refondre bool,
) error {
	if plan.Bloquant() {
		return fmt.Errorf("le plan est bloquant : %d collision(s) de clé stable. "+
			"Rien n'a été écrit", len(plan.ClesEnCollision))
	}

	if pbDir == "" {
		pbDir = defaultPBDir()
	}
	if _, err := os.Stat(filepath.Join(pbDir, "data.db")); err != nil {
		return fmt.Errorf("aucune base PocketBase dans %q : %w", pbDir, err)
	}

	sauvegarde, err := sauvegarder(pbDir)
	if err != nil {
		return fmt.Errorf("SAUVEGARDE IMPOSSIBLE, rien n'a été écrit : %w", err)
	}
	fmt.Printf("Sauvegarde : %s\n", sauvegarde)

	cible := mapping.AppliquerAvec(cat, ct, bt, kt,
		mapping.Options{RefondreCategories: refondre})
	forme := "arbre d'origine conservé"
	if refondre {
		forme = fmt.Sprintf("REFONTE : %d rayons + %d natures", len(plan.Rayons), plan.Natures)
	}
	fmt.Printf("Catalogue cible : %d produits, %d catégories (%s), %d marques, %d fournisseurs\n",
		len(cible.Products), len(cible.Categories), forme, len(cible.Brands), len(cible.Suppliers))

	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: pbDir})
	if err := app.Bootstrap(); err != nil {
		return fmt.Errorf("ouverture de %q : %w", pbDir, err)
	}

	res, err := load.Run(app, cible, rep, nedbDir, load.Options{SecoursImages: secoursImages})
	if err != nil {
		return fmt.Errorf("écriture refusée ou interrompue (la transaction a été "+
			"annulée, la base est dans son état d'avant) : %w", err)
	}

	fmt.Println("\n── ÉCRIT ────────────────────────────────────────────────────")
	for _, k := range []string{"brands", "categories", "suppliers", "products"} {
		fmt.Printf("  %-12s %5d\n", k, res.Loaded[k])
	}
	fmt.Printf("  images        %5d copiées", res.FilesCopied)
	if res.ResolvedFromBackup > 0 {
		fmt.Printf(", dont %d reprises du storage de secours", res.ResolvedFromBackup)
	}
	fmt.Println()
	if n := len(res.MissingFiles); n > 0 {
		fmt.Printf("  ⚠ %d fichier(s) introuvables — les fiches partiront sans ces visuels\n", n)
	}
	if n := len(res.Skipped); n > 0 {
		fmt.Printf("  écartés      %5d (mis en quarantaine par la normalisation)\n", n)
	}
	fmt.Printf("\nEn cas de doute, la base d'avant est ici :\n  %s\n", sauvegarde)
	return nil
}

// sauvegarder copie pb_data à côté de lui, horodaté.
//
// ── Pourquoi une copie et pas une archive ─────────────────────────────────
//
// Restaurer doit être trivial le jour où ça tourne mal : renommer un dossier,
// pas dézipper. On copie donc les fichiers tels quels.
//
// Le journal `logs.db` est EXCLU : il pèse 28 Mo, ne contient que de la trace
// HTTP, et ne conditionne aucune restauration. Les images de `storage`, elles,
// sont copiées — sans elles la base restaurée aurait ses fiches et pas ses
// visuels.
func sauvegarder(pbDir string) (string, error) {
	dest := pbDir + "_avant-reprise_" + time.Now().Format("2006-01-02_15h04")
	if _, err := os.Stat(dest); err == nil {
		return "", fmt.Errorf("%q existe déjà — refus d'écraser une sauvegarde", dest)
	}
	if err := copierArbre(pbDir, dest, map[string]bool{"logs.db": true}); err != nil {
		return "", err
	}
	return dest, nil
}

func copierArbre(src, dest string, exclus map[string]bool) error {
	return filepath.Walk(src, func(chemin string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, chemin)
		if err != nil {
			return err
		}
		if exclus[filepath.Base(chemin)] {
			return nil
		}
		if info.IsDir() {
			return os.MkdirAll(filepath.Join(dest, rel), 0o755)
		}
		return copierFichier(chemin, filepath.Join(dest, rel))
	})
}

func copierFichier(src, dest string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	// Close explicite ET vérifié : sur une copie, une erreur de fermeture est
	// une écriture perdue, et c'est justement le fichier qui doit nous sauver.
	if err := out.Close(); err != nil {
		return fmt.Errorf("fermeture de %q : %w", dest, err)
	}
	return nil
}

func defaultPBDir() string {
	if a := os.Getenv("LOCALAPPDATA"); a != "" {
		return filepath.Join(a, "PocketReact", "pb_data")
	}
	log.Println("⚠️ LOCALAPPDATA absent : pb_data cherché dans le répertoire courant")
	return "pb_data"
}
