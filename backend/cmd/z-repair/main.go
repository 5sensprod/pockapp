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
	"math"
	"os"
	"path/filepath"

	"github.com/pocketbase/pocketbase"

	"pocket-react/backend/migrations"
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

	// Le rejeu produit des rapports en schema_version 2, dont les colonnes
	// collected_* entrent dans le hash. Si elles manquent, l'écriture scellerait
	// des valeurs que la base ne porte pas. On pose donc CETTE migration-là, et
	// elle seule — pas RunMigrations, qui toucherait vingt collections sans
	// rapport avec la caisse. Elle est idempotente.
	if *apply {
		if err := migrations.AddCollectedToZReports(app); err != nil {
			fmt.Printf("❌ mise à niveau du schéma z_reports : %v\n", err)
			os.Exit(1)
		}
	}

	bilan, err := reports.RepairZReports(app, *apply)
	if err != nil {
		fmt.Printf("❌ %v\n", err)
		os.Exit(1)
	}

	// Le tableau confronte l'ANCIEN total en tête au NOUVEAU total encaissé,
	// puis détaille les quatre lignes. Comparer l'ancien total_ttc au nouveau
	// n'aurait pas de sens : ils ne recouvrent plus la même chose.
	fmt.Printf("%-16s %-11s %10s %10s %9s | %10s %10s %10s %9s  %s\n",
		"RAPPORT", "DATE", "ANNONCÉ", "ENCAISSÉ", "ÉCART",
		"L1 VENTES", "L2 CRÉANC", "L3 ACOMPT", "L4 REMB", "ÉTAT")
	fmt.Println(dashes(118))

	var totalEcart float64
	var sommeAnnonce, sommeEncaisse float64
	var sommeL1, sommeL2, sommeL3, sommeL4 float64
	var nbModifies, nbEnrichis, nbRechaines, nbErreurs, nbDesequilibres int

	for _, e := range bilan.Entries {
		etat := "inchangé"
		switch {
		case e.Erreur != "":
			etat = "ERREUR : " + e.Erreur
			nbErreurs++
		case e.ValeursChangees:
			etat = "VALEURS CORRIGÉES"
			nbModifies++
			totalEcart += e.EcartEncaisse()
		case e.Enrichi:
			etat = "enrichi (argent inchangé)"
			nbEnrichis++
		case e.Change:
			etat = "hash rechaîné"
			nbRechaines++
		}

		if e.Erreur == "" {
			sommeAnnonce += e.AncienTTC
			sommeEncaisse += e.NouveauEncaisse
			sommeL1 += e.NouveauVentesDuJour
			sommeL2 += e.NouveauCreances
			sommeL3 += e.NouveauAcomptes
			sommeL4 += e.NouveauRemboursements

			// Le contrôle le plus important de la reprise : chaque rapport doit
			// égaler la somme de ses propres lignes. Un déséquilibre, et le
			// document se contredirait lui-même — c'est exactement le symptôme
			// de la régression du 20 mai.
			if !e.LignesEquilibrees() {
				nbDesequilibres++
				etat += " ⚠️ LIGNES DÉSÉQUILIBRÉES"
			}
		}

		// On n'affiche que ce qui bouge — mais « bouger » ne veut pas dire
		// « changer de hash ». Le rapprochement espèces n'entre PAS dans le
		// hash (backend/reports/z_repair.go:189-196) : un rapport dont seul le
		// tiroir attendu est corrigé a `Change` à false. Le filtre d'origine le
		// comptait dans « aux MONTANTS corrigés » sans jamais le montrer, et
		// c'est le seul chiffre que le commerçant confronte à son tiroir.
		// Constaté le 29 août 2026 : le dépôt de 100 € repris sur le 22/08
		// corrigeait le Z-060 en silence.
		if e.Erreur == "" && !e.Change && !e.ValeursChangees && !e.Enrichi {
			continue
		}

		fmt.Printf("%-16s %-11s %10.2f %10.2f %9.2f | %10.2f %10.2f %10.2f %9.2f  %s\n",
			e.Number, court(e.Date), e.AncienTTC, e.NouveauEncaisse, e.EcartEncaisse(),
			e.NouveauVentesDuJour, e.NouveauCreances, e.NouveauAcomptes,
			e.NouveauRemboursements, etat)
	}

	fmt.Println(dashes(118))
	fmt.Printf("%-16s %-11s %10.2f %10.2f %9.2f | %10.2f %10.2f %10.2f %9.2f\n",
		"CUMUL", "", sommeAnnonce, sommeEncaisse, roundEcart(sommeEncaisse-sommeAnnonce),
		sommeL1, sommeL2, sommeL3, sommeL4)

	fmt.Printf("\n%d rapports examinés · %d aux MONTANTS corrigés · %d enrichis · %d rechaînés · %d en erreur\n",
		len(bilan.Entries), nbModifies, nbEnrichis, nbRechaines, nbErreurs)
	fmt.Printf("Correction cumulée de l'argent encaissé : %+.2f €\n", totalEcart)
	if nbDesequilibres == 0 {
		fmt.Printf("✅ Tous les rapports égalent la somme de leurs quatre lignes.\n")
	} else {
		fmt.Printf("❌ %d rapports ne s'équilibrent PAS — ne rien appliquer.\n", nbDesequilibres)
	}

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

func roundEcart(v float64) float64 {
	return math.Round(v*100) / 100
}
