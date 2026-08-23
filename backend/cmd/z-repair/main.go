// Commande de réparation des rapports Z déjà émis.
//
//	go run ./backend/cmd/z-repair                 # simulation, n'écrit rien
//	go run ./backend/cmd/z-repair -apply          # réécrit les rapports modifiés
//	go run ./backend/cmd/z-repair -data <chemin>  # sur une autre base
//
// Recalcule les totaux depuis les documents sources, à découpage inchangé, puis
// reconstruit la chaîne de hachage. Voir backend/reports/z_repair.go et
// frontend/modules/cash/PocketCash-docs/02-rituel-regression-z.md
//
// ⚠️ En mode -apply, FERMER PocketApp d'abord : une base ouverte ailleurs bloque
// les écritures. Et faire une sauvegarde — la commande écrit dans les documents
// scellés.
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/pocketbase/pocketbase"

	"pocket-react/backend/reports"
)

func main() {
	defaut := filepath.Join(os.Getenv("LOCALAPPDATA"), "PocketReact", "pb_data")

	dataDir := flag.String("data", defaut, "dossier pb_data de la base à traiter")
	apply := flag.Bool("apply", false, "écrire les corrections (sinon : simulation)")
	flag.Parse()

	if _, err := os.Stat(*dataDir); err != nil {
		fmt.Printf("❌ base introuvable : %s\n", *dataDir)
		os.Exit(1)
	}

	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: *dataDir})
	if err := app.Bootstrap(); err != nil {
		fmt.Printf("❌ ouverture de la base : %v\n", err)
		os.Exit(1)
	}
	defer app.ResetBootstrapState()

	mode := "SIMULATION — aucune écriture"
	if *apply {
		mode = "ÉCRITURE — les rapports modifiés seront réécrits"
	}
	fmt.Printf("\nBase : %s\nMode : %s\n\n", *dataDir, mode)

	bilan, err := reports.RepairZReports(app, *apply)
	if err != nil {
		fmt.Printf("❌ %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("%-16s %-12s %10s %10s %10s   %s\n",
		"RAPPORT", "DATE", "TTC AVANT", "TTC APRÈS", "ÉCART", "ÉTAT")
	fmt.Println(dashes(78))

	var totalEcart float64
	var nbModifies, nbEnrichis, nbRechaines, nbErreurs int

	for _, e := range bilan.Entries {
		etat := "inchangé"
		switch {
		case e.Erreur != "":
			etat = "ERREUR : " + e.Erreur
			nbErreurs++
		case e.ValeursChangees:
			etat = "VALEURS CORRIGÉES"
			nbModifies++
			totalEcart += e.EcartTTC()
		case e.Enrichi:
			etat = "enrichi (argent inchangé)"
			nbEnrichis++
		case e.Change:
			etat = "hash rechaîné"
			nbRechaines++
		}

		if e.Erreur == "" && !e.Change {
			continue // on n'affiche que ce qui bouge
		}

		fmt.Printf("%-16s %-12s %10.2f %10.2f %10.2f   %s\n",
			e.Number, court(e.Date), e.AncienTTC, e.NouveauTTC, e.EcartTTC(), etat)
	}

	fmt.Println(dashes(78))
	fmt.Printf("\n%d rapports examinés · %d aux MONTANTS corrigés · %d enrichis · %d rechaînés · %d en erreur\n",
		len(bilan.Entries), nbModifies, nbEnrichis, nbRechaines, nbErreurs)
	fmt.Printf("Correction cumulée du TTC : %+.2f €\n", totalEcart)

	if !*apply && nbModifies > 0 {
		fmt.Printf("\nSimulation seule. Pour appliquer :\n")
		fmt.Printf("  1. fermer PocketApp\n")
		fmt.Printf("  2. sauvegarder %s\n", *dataDir)
		fmt.Printf("  3. go run ./backend/cmd/z-repair -apply\n")
	}
	if *apply {
		fmt.Printf("\n✅ %d rapports réécrits, dont %d aux montants corrigés. Chaîne de hachage reconstruite.\n",
			nbModifies+nbEnrichis+nbRechaines, nbModifies)
	}
	fmt.Println()
}

func court(d string) string {
	if len(d) >= 10 {
		return d[:10]
	}
	return d
}

func dashes(n int) string {
	s := make([]byte, n)
	for i := range s {
		s[i] = '-'
	}
	return string(s)
}
