// Remet les rapports Z dans l'ordre de leurs dates.
//
//	go run ./backend/cmd/z-renumeroter                 # simulation
//	go run ./backend/cmd/z-renumeroter -apply          # renumérote
//	go run ./backend/cmd/z-renumeroter -data <chemin>  # sur une autre base
//
// ⚠️ Le hash couvre le numéro et le rang. Après -apply, la chaîne est INVALIDE
// tant que `z-repair -apply` n'a pas été lancé. Les deux commandes vont
// ensemble : fermer PocketApp, sauvegarder, renuméroter, rejouer.
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

	dataDir := flag.String("data", defaut, "dossier pb_data")
	apply := flag.Bool("apply", false, "renuméroter (sinon : simulation)")
	flag.Parse()

	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: *dataDir})
	if err := app.Bootstrap(); err != nil {
		fmt.Printf("❌ ouverture de la base : %v\n", err)
		os.Exit(1)
	}
	defer app.ResetBootstrapState()

	mode := "SIMULATION — aucune écriture"
	if *apply {
		mode = "RENUMÉROTATION — les numéros vont changer"
	}
	fmt.Printf("\nBase : %s\nMode : %s\n\n", *dataDir, mode)

	entrees, err := reports.RenumeroterZParDate(app, *apply)
	if err != nil {
		fmt.Printf("❌ %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("%-12s %-18s %-18s   %s\n", "DATE", "ANCIEN", "NOUVEAU", "ÉTAT")
	fmt.Println(dashes(70))

	var changes, erreurs int
	for _, e := range entrees {
		etat := "inchangé"
		switch {
		case e.Erreur != "":
			etat = "ERREUR : " + e.Erreur
			erreurs++
		case e.Change():
			etat = "renuméroté"
			changes++
		}
		if e.Erreur == "" && !e.Change() {
			continue
		}
		fmt.Printf("%-12s %-18s %-18s   %s\n", e.Date, e.AncienNumero, e.NouveauNum, etat)
	}

	fmt.Println(dashes(70))
	fmt.Printf("\n%d rapports · %d renumérotés · %d en erreur\n", len(entrees), changes, erreurs)

	if changes > 0 {
		if *apply {
			fmt.Printf("\n⚠️ LA CHAÎNE DE HACHAGE EST INVALIDE tant que le rejeu n'a pas tourné :\n")
			fmt.Printf("   go run ./backend/cmd/z-repair -apply\n")
		} else {
			fmt.Printf("\nSimulation seule. Pour appliquer :\n")
			fmt.Printf("  1. fermer PocketApp\n")
			fmt.Printf("  2. sauvegarder %s\n", *dataDir)
			fmt.Printf("  3. go run ./backend/cmd/z-renumeroter -apply\n")
			fmt.Printf("  4. go run ./backend/cmd/z-repair -apply   ← indispensable\n")
		}
	}
	fmt.Println()
}

func dashes(n int) string {
	s := make([]byte, n)
	for i := range s {
		s[i] = '-'
	}
	return string(s)
}
