// backend/cmd/catalog-import/main.go
// ═══════════════════════════════════════════════════════════════════════════
// OUTIL DE MIGRATION DU CATALOGUE — NeDB vers PocketBase
// ═══════════════════════════════════════════════════════════════════════════
// Commande autonome, lancée à la main. Elle N'EST PAS dans RunMigrations, et
// c'est délibéré : migrations.go s'exécute à chaque démarrage de PocketApp, et
// un import de données n'est pas une migration de schéma. Il lit un répertoire
// externe, il est long, et il n'a rien à faire dans le chemin de démarrage de
// la caisse.
//
//	go run ./backend/cmd/catalog-import -data "I:\AppPOS\AppServe\data"
//
// ── État : ticket T2 seulement ────────────────────────────────────────────
//
// Cette commande LIT et RAPPORTE. Elle n'écrit nulle part — ni dans NeDB, ni
// dans PocketBase. Le chargement est le ticket T4, et il ne peut pas commencer
// avant que le rapport d'anomalies de T3 ait été lu (10-plan-migration.md §2).
//
// Sens unique, pour mémoire : NeDB est lue, jamais écrite. Si la migration se
// trompe, on vide PocketBase et on relance ; la source reste intacte.
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"pocket-react/backend/catalog/nedb"
)

// Chiffres de référence de la base DEV, établis par l'audit du 10 août 2026
// (07-audit-flux-apppos.md). Le rapport les confronte à ce qu'il lit : un
// écart signifie qu'on ne lit pas la base qu'on croit, et rien ne doit
// continuer avant de l'avoir expliqué.
//
// Rappel : deux bases AppPos coexistent, dev sur I:\ et production dans
// %APPDATA%\AppPOS\data, et la PRODUCTION en contient DAVANTAGE — 3034 produits
// contre 2306, écart jamais expliqué. La cible est la dev.
var referenceCounts = map[string]int{
	"products":   2306,
	"categories": 219,
	"brands":     224,
	"suppliers":  34,
}

// Les quatre fichiers du périmètre catalogue. Les autres fichiers de NeDB
// (sales, drawer_sessions, users…) relèvent de la caisse et des utilisateurs :
// hors périmètre de cette migration, et dit explicitement plutôt que passé
// sous silence.
var catalogFiles = []string{"products", "categories", "brands", "suppliers"}

func main() {
	var (
		dataDir         = flag.String("data", `I:\AppPOS\AppServe\data`, "répertoire des fichiers NeDB d'AppServe (base DEV)")
		showFields      = flag.Bool("fields", false, "détailler le recensement des champs et leurs taux de remplissage")
		minRate         = flag.Float64("min-rate", 0, "avec -fields : n'afficher que les champs dont le taux de remplissage est inférieur à ce seuil (en %)")
		allowProduction = flag.Bool("allow-production", false, "autoriser la lecture d'un répertoire qui ressemble à la production")
	)
	flag.Parse()

	if err := run(*dataDir, *showFields, *minRate, *allowProduction); err != nil {
		fmt.Fprintf(os.Stderr, "\n❌ %v\n", err)
		os.Exit(1)
	}
}

func run(dataDir string, showFields bool, minRate float64, allowProduction bool) error {
	abs, err := filepath.Abs(dataDir)
	if err != nil {
		return fmt.Errorf("chemin invalide %q: %w", dataDir, err)
	}

	// Garde production. Le rituel interdit de toucher à %APPDATA%\AppPOS\data.
	// La lecture seule y serait techniquement sans danger, mais un rapport
	// produit sur la production et lu comme s'il venait de la dev conduirait à
	// des décisions fausses — l'écart de 728 produits entre les deux bases n'est
	// toujours pas expliqué.
	if looksLikeProduction(abs) && !allowProduction {
		return fmt.Errorf(
			"le répertoire %q ressemble à la base de PRODUCTION.\n"+
				"   La migration se conçoit sur la base DEV (I:\\AppPOS\\AppServe\\data).\n"+
				"   Si la lecture est volontaire : -allow-production", abs)
	}

	fmt.Println("═══════════════════════════════════════════════════════════════")
	fmt.Println(" CATALOGUE — EXTRACTION NeDB (ticket T2, lecture seule)")
	fmt.Println("═══════════════════════════════════════════════════════════════")
	fmt.Printf(" Répertoire lu : %s\n", abs)
	fmt.Println(" Aucune écriture n'est effectuée, ni dans NeDB, ni dans PocketBase.")
	fmt.Println()

	cols := make([]*nedb.Collection, 0, len(catalogFiles))
	for _, name := range catalogFiles {
		path := filepath.Join(abs, name+".db")
		col, err := nedb.Load(name, path)
		if err != nil {
			return err
		}
		cols = append(cols, col)
	}

	discrepancies := reportCounts(cols)
	reportLines(cols)

	if showFields {
		for _, col := range cols {
			reportFields(col, minRate)
		}
	}

	fmt.Println("───────────────────────────────────────────────────────────────")
	if len(discrepancies) > 0 {
		fmt.Println(" ⚠  ÉCART AVEC LES CHIFFRES DE RÉFÉRENCE")
		for _, d := range discrepancies {
			fmt.Printf("    %s\n", d)
		}
		fmt.Println()
		return fmt.Errorf("les effectifs lus ne correspondent pas à la base de référence — " +
			"vérifier le répertoire avant d'aller plus loin")
	}
	fmt.Println(" ✅ Effectifs conformes à la base de référence.")
	fmt.Println("    Étape suivante : T3, normalisation et rapport d'anomalies.")
	return nil
}

// looksLikeProduction reconnaît %APPDATA%\AppPOS\data — PathManager d'AppServe
// place la production là, et la dev dans le répertoire courant (audit §1.4).
func looksLikeProduction(path string) bool {
	p := strings.ToLower(filepath.ToSlash(path))
	return strings.Contains(p, "/appdata/roaming/apppos") ||
		strings.Contains(p, "/appdata/apppos")
}

func reportCounts(cols []*nedb.Collection) []string {
	fmt.Println("── Effectifs ──────────────────────────────────────────────────")
	fmt.Printf(" %-12s %10s %10s   %s\n", "collection", "lu", "référence", "")
	var out []string
	for _, col := range cols {
		ref, hasRef := referenceCounts[col.Name]
		mark := "  "
		switch {
		case !hasRef:
			mark = " ?"
		case col.Stats.Documents == ref:
			mark = " ✓"
		default:
			mark = " ✗"
			out = append(out, fmt.Sprintf("%s : %d lus, %d attendus (écart %+d)",
				col.Name, col.Stats.Documents, ref, col.Stats.Documents-ref))
		}
		fmt.Printf(" %-12s %10d %10d %s\n", col.Name, col.Stats.Documents, ref, mark)
	}
	fmt.Println()
	return out
}

// reportLines rend la comptabilité de lecture. C'est elle qui permet de
// vérifier que le lecteur ne s'est pas trompé, et non le seul total final.
func reportLines(cols []*nedb.Collection) {
	fmt.Println("── Comptabilité de lecture ────────────────────────────────────")
	fmt.Printf(" %-12s %7s %6s %7s %7s %8s %8s %7s\n",
		"collection", "lignes", "vides", "méta", "données", "réécrit", "supprimé", "docs")
	for _, col := range cols {
		s := col.Stats
		fmt.Printf(" %-12s %7d %6d %7d %7d %8d %8d %7d\n",
			col.Name, s.LinesTotal, s.LinesBlank, s.LinesMeta, s.LinesData,
			s.Overwrites, s.Deletions, s.Documents)
	}
	fmt.Println()
	fmt.Println(" méta = lignes $$indexCreated, SANS _id : ce ne sont pas des documents.")
	fmt.Println(" Les compter fausse le total — c'est l'erreur qui donnait 2307 produits.")

	var anomalies []string
	for _, col := range cols {
		if col.Stats.LinesUnreadable > 0 {
			anomalies = append(anomalies, fmt.Sprintf(
				"%s : %d ligne(s) JSON illisible(s) — bloquant", col.Name, col.Stats.LinesUnreadable))
		}
		if col.Stats.DeletionsNoop > 0 {
			anomalies = append(anomalies, fmt.Sprintf(
				"%s : %d suppression(s) portant sur un _id jamais inséré", col.Name, col.Stats.DeletionsNoop))
		}
	}
	if len(anomalies) > 0 {
		fmt.Println()
		fmt.Println(" ⚠  Anomalies de journal :")
		for _, a := range anomalies {
			fmt.Printf("    %s\n", a)
		}
	}
	fmt.Println()
}

func reportFields(col *nedb.Collection, minRate float64) {
	fmt.Printf("── Champs : %s (%d documents) ", col.Name, col.Stats.Documents)
	fmt.Println(strings.Repeat("─", max(0, 40-len(col.Name))))
	fmt.Printf(" %-26s %8s %8s  %s\n", "champ", "rempli", "taux", "types")

	for _, f := range col.FieldReport() {
		rate := f.FillRate(col.Stats.Documents)
		if minRate > 0 && rate >= minRate {
			continue
		}
		flag := "  "
		switch {
		case f.Filled == 0:
			flag = " ☠" // aucun document : le champ est mort
		case len(f.Types) > 1:
			flag = " ⚠" // types mixtes : PocketBase est typé, il faudra trancher
		}
		fmt.Printf(" %-26s %8d %7.1f%% %s %s\n",
			f.Name, f.Filled, rate, flag, strings.Join(f.Types, "|"))
	}
	fmt.Println()
	fmt.Println(" ☠ = aucun document ne le renseigne   ⚠ = types mixtes, à normaliser en T3")
	fmt.Println()
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
