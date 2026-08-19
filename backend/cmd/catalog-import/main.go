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
	"sort"
	"strings"

	"github.com/pocketbase/pocketbase"

	"pocket-react/backend/catalog/load"
	"pocket-react/backend/catalog/nedb"
	"pocket-react/backend/catalog/normalize"
	"pocket-react/backend/migrations"
)

// ── Les deux bases AppPos, et laquelle fait foi ───────────────────────────
//
// Décision du propriétaire, 11 août 2026 : **la base d'installation fait
// référence**, pas la base de développement. Cette dernière est périmée.
//
//	                             produits  catég.  marques  fourn.
//	installation (référence)         3034     463      287      43
//	développement (périmée)          2306     219      224      34
//
// L'écart n'est pas marginal : +728 produits et **plus du double de
// catégories**. Et surtout, les MARQUES Y ONT DES LOGOS — 225 sur 287 —, là où
// la base dev n'en portait aucun. C'est sur cette mesure que le modèle cible
// avait supprimé le champ image des marques : la mesure était juste, la base
// ne l'était pas.
//
// Conséquence à garder en tête : tous les chiffres de l'audit du 10 août
// (07-audit-flux-apppos.md) sont mesurés sur la base dev et sont donc à
// reprendre. Le §3 du rituel annonçait d'ailleurs « 43 fournisseurs » — chiffre
// de la base d'installation — à côté de « 2306 produits » — chiffre de la dev :
// l'audit mélangeait déjà les deux sans le dire.
//
// Cette commande LIT ces bases, elle n'y écrit jamais. La contrainte
// « ne pas toucher à la production » reste entière côté écriture.
type baseline struct {
	label  string
	counts map[string]int
}

var baselines = map[string]baseline{
	"installation": {"installation (référence)", map[string]int{
		"products": 3034, "categories": 463, "brands": 287, "suppliers": 43,
	}},
	"dev": {"développement (PÉRIMÉE)", map[string]int{
		"products": 2306, "categories": 219, "brands": 224, "suppliers": 34,
	}},
}

// defaultDataDir — la base d'installation, sous %APPDATA%.
func defaultDataDir() string {
	if appData := os.Getenv("APPDATA"); appData != "" {
		return filepath.Join(appData, "AppPOS", "data")
	}
	return `C:\Users\Bossa\AppData\Roaming\AppPOS\data`
}

// baselineFor reconnaît la base lue à son chemin.
func baselineFor(path string) baseline {
	p := strings.ToLower(filepath.ToSlash(path))
	if strings.Contains(p, "/appdata/roaming/apppos") || strings.Contains(p, "/appdata/apppos") {
		return baselines["installation"]
	}
	if strings.Contains(p, "appserve") {
		return baselines["dev"]
	}
	return baseline{"inconnue", nil}
}

// Les quatre fichiers du périmètre catalogue. Les autres fichiers de NeDB
// (sales, drawer_sessions, users…) relèvent de la caisse et des utilisateurs :
// hors périmètre de cette migration, et dit explicitement plutôt que passé
// sous silence.
var catalogFiles = []string{"products", "categories", "brands", "suppliers"}

func main() {
	var (
		dataDir     = flag.String("data", defaultDataDir(), `répertoire des fichiers NeDB ; par défaut la base d'installation %APPDATA%\AppPOS\data`)
		showFields  = flag.Bool("fields", false, "détailler le recensement des champs et leurs taux de remplissage")
		minRate     = flag.Float64("min-rate", 0, "avec -fields : n'afficher que les champs dont le taux de remplissage est inférieur à ce seuil (en %)")
		doNormalize = flag.Bool("normalize", false, "normaliser vers le modèle cible et produire le rapport d'anomalies (T3)")
		detail      = flag.Int("detail", 5, "avec -normalize : nombre de cas détaillés par nature d'anomalie (0 = tous)")
		doLoad      = flag.Bool("load", false, "ÉCRIRE dans le PocketBase local : purge des quatre collections puis chargement (T4)")
		pbDir       = flag.String("pb", "", "répertoire pb_data ; par défaut %LOCALAPPDATA%\\PocketReact\\pb_data")
		forcePurge  = flag.Bool("force-purge", false, "avec -load : purger MÊME SI la base porte des données nées ici — produits créés en caisse, comptages d'inventaire, ventes. Destruction sans retour.")
	)
	flag.Parse()

	opts := options{
		showFields: *showFields,
		minRate:    *minRate,
		normalize:  *doNormalize || *doLoad, // charger suppose normaliser
		detail:     *detail,
		load:       *doLoad,
		pbDir:      *pbDir,
		forcePurge: *forcePurge,
	}
	if err := run(*dataDir, opts); err != nil {
		fmt.Fprintf(os.Stderr, "\n❌ %v\n", err)
		os.Exit(1)
	}
}

type options struct {
	showFields bool
	minRate    float64
	normalize  bool
	detail     int
	load       bool
	pbDir      string
	forcePurge bool
}

func run(dataDir string, opts options) error {
	abs, err := filepath.Abs(dataDir)
	if err != nil {
		return fmt.Errorf("chemin invalide %q: %w", dataDir, err)
	}

	base := baselineFor(abs)

	fmt.Println("═══════════════════════════════════════════════════════════════")
	fmt.Println(" CATALOGUE — EXTRACTION NeDB")
	fmt.Println("═══════════════════════════════════════════════════════════════")
	fmt.Printf(" Répertoire lu : %s\n", abs)
	fmt.Printf(" Base          : %s\n", base.label)
	fmt.Println(" NeDB est lue, jamais écrite.")
	if base.label == baselines["dev"].label {
		fmt.Println()
		fmt.Println(" ⚠  Cette base est PÉRIMÉE. La référence est la base")
		fmt.Println("    d'installation (%APPDATA%\\AppPOS\\data) : +728 produits,")
		fmt.Println("    plus du double de catégories, et les logos de marque.")
	}
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

	discrepancies := reportCounts(cols, base)
	reportLines(cols)

	if opts.showFields {
		for _, col := range cols {
			reportFields(col, opts.minRate)
		}
	}

	if len(discrepancies) > 0 {
		fmt.Println("───────────────────────────────────────────────────────────────")
		fmt.Println(" ⚠  ÉCART AVEC LES CHIFFRES DE RÉFÉRENCE")
		for _, d := range discrepancies {
			fmt.Printf("    %s\n", d)
		}
		fmt.Println()
		return fmt.Errorf("les effectifs lus ne correspondent pas à la base de référence — " +
			"vérifier le répertoire avant d'aller plus loin")
	}

	if !opts.normalize {
		fmt.Println("───────────────────────────────────────────────────────────────")
		fmt.Println(" ✅ Effectifs conformes à la base de référence.")
		fmt.Println("    Étape suivante : -normalize, rapport d'anomalies (T3).")
		return nil
	}

	// ── T3 ────────────────────────────────────────────────────────────────
	byName := map[string]*nedb.Collection{}
	for _, c := range cols {
		byName[c.Name] = c
	}
	cat, rep := normalize.Run(byName["products"], byName["categories"], byName["brands"], byName["suppliers"])

	reportNormalized(cat)
	reportAnomalies(rep, opts.detail)

	if !opts.load {
		fmt.Println("───────────────────────────────────────────────────────────────")
		fmt.Println(" ✅ Normalisation terminée. Rien n'a été écrit.")
		if rep.HasBlocking() {
			fmt.Printf("    %d enregistrement(s) seront MIS EN QUARANTAINE au chargement :\n", countBlocking(rep))
			fmt.Println("    écartés et listés, pas corrigés. Ils n'empêchent pas les autres.")
		}
		fmt.Println("    Pour charger : -load")
		return nil
	}

	return doLoad(cat, rep, opts, abs)
}

func countBlocking(rep *normalize.Report) int {
	seen := map[string]bool{}
	for _, a := range rep.Anomalies {
		if a.Severity == normalize.Blocking {
			seen[a.Entity+"/"+a.SourceID] = true
		}
	}
	return len(seen)
}

// doLoad — le seul chemin de ce programme qui écrit.
func doLoad(cat *normalize.Catalog, rep *normalize.Report, opts options, nedbDir string) error {
	dir := opts.pbDir
	if dir == "" {
		base := os.Getenv("LOCALAPPDATA")
		if base == "" {
			base = "."
		}
		dir = filepath.Join(base, "PocketReact", "pb_data")
	}

	fmt.Println("── Chargement dans PocketBase (T4) ────────────────────────────")
	fmt.Printf(" Base : %s\n", dir)
	fmt.Println(" ⚠  PocketApp doit être FERMÉ : SQLite n'accepte qu'un écrivain.")
	fmt.Println()

	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: dir})
	if err := app.Bootstrap(); err != nil {
		return fmt.Errorf("ouverture de la base %q: %w\n"+
			"   Si PocketApp est ouvert, le fermer et relancer", dir, err)
	}

	// Le schéma du catalogue est mis à niveau avant le chargement. La même
	// migration tourne au démarrage de PocketApp ; l'appeler ici évite un
	// cycle ouvrir/fermer, et garantit que le chargeur écrit dans le schéma
	// qu'il attend. Elle est convergente et refuse d'agir sur des données
	// non reconstructibles.
	if err := migrations.MigrateCatalogV2(app); err != nil {
		return fmt.Errorf("mise à niveau du schéma: %w", err)
	}

	res, err := load.Run(app, cat, rep, nedbDir, load.Options{ForcePurge: opts.forcePurge})
	if err != nil {
		// La transaction a été annulée : les collections sont restées vides
		// plutôt que d'être à moitié pleines.
		return fmt.Errorf("chargement annulé, aucune écriture conservée : %w", err)
	}

	reportLoad(res, opts.detail)
	return nil
}

func reportLoad(res *load.Result, detail int) {
	fmt.Printf(" Entreprise : %s (%s)\n\n", res.CompanyName, res.CompanyID)

	// Quand -force-purge a passé outre la garde, on nomme ce qui vient d'être
	// détruit. Le dire APRÈS coup n'empêche rien, mais laisse une trace lisible
	// dans la console de celui qui l'a lancé.
	if res.Findings.Blocks() {
		fmt.Println(" ⚠  -force-purge : des données nées ici ont été DÉTRUITES.")
		fmt.Println(res.Findings.Explain())
		fmt.Println()
	}

	if len(res.Purged) > 0 {
		fmt.Println(" Purge préalable :")
		for _, name := range []string{"external_refs", "products", "suppliers", "categories", "brands"} {
			if n := res.Purged[name]; n > 0 {
				fmt.Printf("   %-14s %6d supprimé(s)\n", name, n)
			}
		}
		fmt.Println()
	}

	fmt.Println(" Chargé :")
	for _, name := range []string{"brands", "categories", "suppliers", "products"} {
		fmt.Printf("   %-14s %6d\n", name, res.Loaded[name])
	}
	fmt.Printf("   %-14s %6d fichier(s) image copiés dans le stockage\n", "images", res.FilesCopied)
	if res.ResolvedByName > 0 {
		fmt.Printf("     dont %d retrouvés sous public/ par leur nom (chemin NeDB faux ou absolu)\n", res.ResolvedByName)
	}
	if res.AmbiguousFiles > 0 {
		fmt.Printf("     ⚠ %d homonyme(s) dans public/ : le premier trouvé a été retenu\n", res.AmbiguousFiles)
	}
	if n := len(res.MissingFiles); n > 0 {
		fmt.Printf("   ⚠ %d fichier(s) référencés mais introuvables sur le disque :\n", n)
		shown := n
		if detail > 0 && shown > detail {
			shown = detail
		}
		for _, m := range res.MissingFiles[:shown] {
			fmt.Printf("     %s\n", m)
		}
		if shown < n {
			fmt.Printf("     … et %d autre(s)\n", n-shown)
		}
	}
	fmt.Println()

	if len(res.Skipped) > 0 {
		fmt.Printf(" ⚠  Quarantaine — %d enregistrement(s) écarté(s), NON corrigés :\n", len(res.Skipped))
		for entity, items := range res.SkippedByEntity() {
			fmt.Printf("\n   %s (%d)\n", entity, len(items))
			shown := len(items)
			if detail > 0 && shown > detail {
				shown = detail
			}
			for _, s := range items[:shown] {
				fmt.Printf("     %s « %s »\n       %s\n", s.SourceID, s.Label, s.Reason)
			}
			if shown < len(items) {
				fmt.Printf("     … et %d autre(s) — -detail 0 pour tout voir\n", len(items)-shown)
			}
		}
		fmt.Println()
		fmt.Println("   Cette liste EST la liste de travail. Les corrections se feront")
		fmt.Println("   hors de la source, jamais dans AppPos (10-plan-migration.md §2 bis).")
		fmt.Println()
	}

	if len(res.Dropped) > 0 {
		fmt.Println(" Relations perdues (cible écartée ou absente) :")
		keys := make([]string, 0, len(res.Dropped))
		for k := range res.Dropped {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			fmt.Printf("   %-52s %5d\n", k, res.Dropped[k])
		}
		fmt.Println()
	}

	fmt.Println("───────────────────────────────────────────────────────────────")
	fmt.Println(" ✅ Chargement terminé.")
	fmt.Println("    ⚠ Relancer NE recharge plus à l'identique : depuis le 19 août 2026,")
	fmt.Println("      la base porte des données qui ne viennent pas de NeDB — produits")
	fmt.Println("      créés en caisse, comptages, ventes. La garde de guard.go refuse")
	fmt.Println("      alors la purge, et -force-purge détruit sans retour.")
}

func reportNormalized(cat *normalize.Catalog) {
	fmt.Println("── Normalisation vers le modèle cible ─────────────────────────")
	fmt.Printf(" %-12s %10s\n", "collection", "normalisé")
	fmt.Printf(" %-12s %10d\n", "products", len(cat.Products))
	fmt.Printf(" %-12s %10d\n", "categories", len(cat.Categories))
	fmt.Printf(" %-12s %10d\n", "brands", len(cat.Brands))
	fmt.Printf(" %-12s %10d\n", "suppliers", len(cat.Suppliers))
	fmt.Println()
	fmt.Println(" Rien n'est écrit : ces structures vivent en mémoire. Le chargement est T4.")
	fmt.Println()
}

func reportAnomalies(rep *normalize.Report, detail int) {
	if len(rep.Counters) > 0 {
		fmt.Println("── Mesures de normalisation ───────────────────────────────────")
		keys := make([]string, 0, len(rep.Counters))
		for k := range rep.Counters {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			fmt.Printf(" %-46s %7d\n", k, rep.Counters[k])
		}
		fmt.Println()
	}

	groups := rep.Grouped()
	if len(groups) == 0 {
		fmt.Println("── Anomalies ──────────────────────────────────────────────────")
		fmt.Println(" Aucune.")
		fmt.Println()
		return
	}

	fmt.Println("── Anomalies ──────────────────────────────────────────────────")
	for _, g := range groups {
		mark := "  "
		if g.Severity == normalize.Blocking {
			mark = "⛔"
		}
		fmt.Printf("\n %s %s — %d cas [%s]\n", mark, g.Kind, len(g.Items), g.Severity)
		shown := len(g.Items)
		if detail > 0 && shown > detail {
			shown = detail
		}
		for _, a := range g.Items[:shown] {
			fmt.Printf("      %s/%s : %s\n", a.Entity, a.SourceID, a.Detail)
		}
		if shown < len(g.Items) {
			fmt.Printf("      … et %d autre(s) — -detail 0 pour tout voir\n", len(g.Items)-shown)
		}
	}
	fmt.Println()
}

func reportCounts(cols []*nedb.Collection, base baseline) []string {
	fmt.Println("── Effectifs ──────────────────────────────────────────────────")
	fmt.Printf(" %-12s %10s %10s   %s\n", "collection", "lu", "référence", "")
	var out []string
	for _, col := range cols {
		ref, hasRef := base.counts[col.Name]
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
