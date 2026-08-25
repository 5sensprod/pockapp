// backend/cmd/catalog-reprise/main.go
// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION DE LA REPRISE — elle n'écrit rien, et elle ne le peut pas
// ═══════════════════════════════════════════════════════════════════════════
//
// Applique les tables de backend/catalog/mapping au catalogue NeDB et dit ce
// que la reprise écrirait. Aucun `-apply` : cette commande n'ouvre aucune base
// PocketBase et n'a aucun chemin d'écriture. L'écriture viendra dans un outil
// distinct, quand les arbitrages seront faits.
//
//	go run ./backend/cmd/catalog-reprise
//	go run ./backend/cmd/catalog-reprise -detail 20
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"

	"pocket-react/backend/catalog/mapping"
	"pocket-react/backend/catalog/nedb"
	"pocket-react/backend/catalog/normalize"
)

func defaultDataDir() string {
	if a := os.Getenv("APPDATA"); a != "" {
		return filepath.Join(a, "AppPOS", "data")
	}
	return "data"
}

func main() {
	var (
		dataDir = flag.String("data", defaultDataDir(),
			`répertoire des fichiers NeDB ; par défaut la base d'installation %APPDATA%\AppPOS\data`)
		detail = flag.Int("detail", 10, "nombre de cas détaillés par rubrique (0 = tous)")
		apply  = flag.Bool("apply", false,
			"ÉCRIRE dans PocketBase. Sans ce drapeau, l'outil se contente de simuler. "+
				"Une sauvegarde de pb_data est prise d'abord ; l'écriture est refusée si le plan est bloquant.")
		secours = flag.String("images-secours", "",
			"répertoire `storage` d'une autre base PocketBase, où retrouver les images "+
				"absentes de public/ (1334 fichiers dans ce cas, dont 95,7 % récupérables)")
		refondre = flag.Bool("refondre-categories", false,
			"REMPLACER l'arbre des catégories par 12 rayons et leurs natures. "+
				"Par défaut l'arbre du magasin est conservé tel quel : la reprise rend "+
				"son catalogue au client, la refonte est un autre chantier.")
		pbDir = flag.String("pb", "",
			`répertoire pb_data ; par défaut %LOCALAPPDATA%\PocketReact\pb_data`)
	)
	flag.Parse()

	log.SetFlags(0)
	fmt.Printf("Simulation de reprise — LECTURE SEULE\nSource : %s\n\n", *dataDir)

	cat, rep := chargerCatalogue(*dataDir)
	ct, bt, err := mapping.LoadTables()
	if err != nil {
		log.Fatalf("tables de correspondance : %v", err)
	}
	fmt.Printf("Tables générées le %s — %d catégories, %d groupes de marques\n\n",
		ct.GenereLe, len(ct.Categories), len(bt.Groupes))

	kt, err := mapping.LoadKeys()
	if err != nil {
		log.Fatalf("table des clés stables : %v", err)
	}
	fmt.Printf("Clés stables : %d par SKU, %d par nom, %d noms ambigus écartés\n\n",
		len(kt.ParSKU), len(kt.ParNom), len(kt.NomsAmbigusEcartes))

	quarantaine := rep.Quarantined()
	plan := mapping.BuildAvecQuarantaine(cat, ct, bt, kt, quarantaine["products"])
	afficher(plan, *detail)

	// ── La quarantaine de la normalisation ────────────────────────────────
	// Elle ne vient PAS des tables : `normalize` écarte ce qu'elle juge
	// inchargeable (nom manquant, relation impossible…), et `load.Run` ne
	// l'écrit pas. Le plan l'ignore — il raisonne sur le catalogue normalisé.
	//
	// Le taire ferait annoncer 3055 produits et en écrire 3020, sans que rien
	// n'explique les 35 manquants. C'est exactement l'écart qu'une simulation
	// doit fermer.
	if n := plan.EnQuarantaine; n > 0 {
		fmt.Printf("\n── QUARANTAINE DE LA NORMALISATION %s\n", ligne(36))
		fmt.Printf("  %d produit(s) ne seront PAS écrits — écartés en amont des tables :\n", n)
		motifs := map[string]int{}
		for _, raison := range quarantaine["products"] {
			motifs[raison]++
		}
		for _, m := range clesTriees(motifs) {
			fmt.Printf("     %-52s %4d\n", m, motifs[m])
		}
	}

	if n := len(rep.Anomalies); n > 0 {
		fmt.Printf("\nNormalisation : %d anomalie(s) signalée(s) — "+
			"`catalog-import -normalize` les détaille.\n", n)
	}
	if plan.Bloquant() {
		fmt.Println("\n⛔ EN L'ÉTAT, LA REPRISE NE DOIT PAS ÊTRE APPLIQUÉE.")
		fmt.Println("   Des produits réclament la même clé stable — voir CLÉS STABLES.")
		fmt.Println("   Il faut dédoublonner dans AppPos d'abord, ou trancher clé par clé.")
		fmt.Println("\nAucune écriture n'a eu lieu.")
		os.Exit(1)
	}

	if !*apply {
		fmt.Println("\nAucune écriture n'a eu lieu : simulation seule.")
		fmt.Println("Pour appliquer — PocketApp FERMÉ — relancer avec -apply.")
		return
	}

	fmt.Println("\n── APPLICATION ──────────────────────────────────────────────")
	if err := appliquer(cat, rep, plan, ct, bt, kt, *dataDir, *pbDir, *secours, *refondre); err != nil {
		log.Fatalf("%v", err)
	}
	fmt.Println("\nReprise appliquée.")
}

func chargerCatalogue(dir string) (*normalize.Catalog, *normalize.Report) {
	col := func(nom string) *nedb.Collection {
		c, err := nedb.Load(nom, filepath.Join(dir, nom+".db"))
		if err != nil {
			log.Fatalf("lecture de %s : %v", nom, err)
		}
		return c
	}
	cat, rep := normalize.Run(col("products"), col("categories"), col("brands"), col("suppliers"))
	return cat, rep
}

func afficher(p *mapping.Plan, detail int) {
	titre := func(s string) { fmt.Printf("\n── %s %s\n", s, ligne(70-len(s))) }

	titre("CATÉGORIES")
	fmt.Printf("  rattachées à un rayon   %5d\n", p.Rattachees)
	fmt.Printf("  supprimées              %5d\n", p.Supprimees)
	fmt.Printf("  devenues un champ       %5d\n", p.VersChamp)
	fmt.Printf("  → sans -refondre-categories : l'arbre du magasin est CONSERVÉ\n")
	fmt.Printf("     (la refonte proposerait %d rayons + %d natures)\n",
		len(p.Rayons), p.Natures)
	if n := len(p.SansRegle); n > 0 {
		fmt.Printf("  ⚠ SANS RÈGLE            %5d — présentes dans NeDB, absentes de la table\n", n)
		lister(p.SansRegle, detail, "     ")
	}

	titre("MARQUES")
	fmt.Printf("  fusionnées              %5d\n", p.MarquesFusionnees)
	fmt.Printf("  produits réaffectés     %5d\n", p.ProduitsReaffectes)
	if n := len(p.ImagesAVider); n > 0 {
		fmt.Printf("  ⚠ logos à vider AVANT la fusion : %d — sinon le dossier distant\n", n)
		fmt.Printf("    reste en ligne sans que rien ne puisse plus le désigner\n")
		lister(p.ImagesAVider, detail, "     ")
	}
	if n := len(p.MarquesInconnues); n > 0 {
		fmt.Printf("  ⚠ perdantes introuvables dans NeDB : %d — table périmée ?\n", n)
		lister(p.MarquesInconnues, detail, "     ")
	}

	titre("PRODUITS")
	fmt.Printf("  total                   %5d\n", p.ProduitsTotal)
	fmt.Printf("  reclassés               %5d\n", p.ProduitsReclasses)
	fmt.Printf("  rattachements  %d → %d\n", p.RattachementsAvant, p.RattachementsApres)
	if len(p.EtatCommercial) > 0 {
		fmt.Printf("  état commercial posé :\n")
		for _, k := range clesTriees(p.EtatCommercial) {
			fmt.Printf("     %-10s %5d\n", k, p.EtatCommercial[k])
		}
	}
	if n := len(p.ProduitsSansRayon); n > 0 {
		fmt.Printf("  ⚠ SANS RAYON            %5d — ils n'atterrissent nulle part\n", n)
		for _, k := range clesTriees(p.SansRayonParCause) {
			fmt.Printf("       %-26s %5d\n", k, p.SansRayonParCause[k])
		}
		lister(p.ProduitsSansRayon, detail, "     ")
	}

	titre("CLÉS STABLES")
	fmt.Printf("  gardées (identité)      %5d — le produit portait déjà sa clé\n", p.ClesGardees)
	fmt.Printf("  reprises par SKU        %5d\n", p.ClesReprisesParSKU)
	fmt.Printf("  reprises par nom        %5d\n", p.ClesReprisesParNom)
	fmt.Printf("  neuves (pa_…)           %5d — produits apparus depuis l'extraction\n",
		len(p.ClesNeuves))
	lister(p.ClesNeuves, detail, "     ")
	if n := len(p.ClesPerdues); n > 0 {
		fmt.Printf("  devancés                %5d — leur clé était prise par un autre.\n", n)
		fmt.Printf("     Ils partiront en ligne comme des produits NEUFS.\n")
		lister(p.ClesPerdues, detail, "     ")
	}
	if n := len(p.ClesEnCollision); n > 0 {
		fmt.Printf("  ⛔ COLLISIONS            %5d — deux produits réclament la MÊME clé.\n", n)
		fmt.Printf("     Ils partageraient leur dossier d'images distant et leur ligne SQL.\n")
		lister(p.ClesEnCollision, detail, "     ")
	}

	titre("RÉPARTITION PAR RAYON")
	total := 0
	for _, r := range p.Rayons {
		fmt.Printf("  %-28s %5d\n", r, p.ParRayon[r])
		total += p.ParRayon[r]
	}
	fmt.Printf("  %-28s %5d  (un produit multi-rayons compte plusieurs fois)\n", "", total)

	if n := len(p.AArbitrer); n > 0 {
		titre("RESTE À ARBITRER")
		fmt.Printf("  %d ligne(s) de la table portent `a_arbitrer`.\n", n)
		var l []string
		for _, c := range p.AArbitrer {
			l = append(l, fmt.Sprintf("%s (%d produits) — %s",
				c.Chemin, c.ProduitsAvecDescendance, c.Note))
		}
		lister(l, detail, "     ")
	}
}

func lister(items []string, max int, indent string) {
	n := len(items)
	if max > 0 && n > max {
		items = items[:max]
	}
	for _, s := range items {
		fmt.Printf("%s%s\n", indent, s)
	}
	if max > 0 && n > max {
		fmt.Printf("%s… et %d de plus (-detail 0 pour tout voir)\n", indent, n-max)
	}
}

func clesTriees(m map[string]int) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func ligne(n int) string {
	if n < 0 {
		n = 0
	}
	s := make([]byte, n)
	for i := range s {
		s[i] = '-'
	}
	return string(s)
}
