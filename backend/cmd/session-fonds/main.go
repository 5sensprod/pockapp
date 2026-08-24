// Corrige le fonds d'ouverture d'une session de caisse.
//
//	go run ./backend/cmd/session-fonds -session <id> -fonds 447.96          # simulation
//	go run ./backend/cmd/session-fonds -session <id> -fonds 447.96 -apply   # écrit
//
// ⚠️ À faire AVANT `z-rattacher` : la commande refuse toute session déjà
// clôturée par un Z, dont le fonds est scellé dans un document fiscal.
// Fermer PocketApp et sauvegarder avant -apply.
package main

import (
	"flag"
	"fmt"
	"math"
	"os"
	"path/filepath"

	"github.com/pocketbase/pocketbase"

	"pocket-react/backend/reports"
)

func main() {
	defaut := filepath.Join(os.Getenv("LOCALAPPDATA"), "PocketReact", "pb_data")

	dataDir := flag.String("data", defaut, "dossier pb_data")
	sessionID := flag.String("session", "", "id de la session")
	fonds := flag.Float64("fonds", math.NaN(), "nouveau fonds d'ouverture, en euros")
	apply := flag.Bool("apply", false, "écrire (sinon : simulation)")
	flag.Parse()

	if *sessionID == "" || math.IsNaN(*fonds) {
		fmt.Println("❌ -session et -fonds sont requis")
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
		mode = "CORRECTION — le fonds va être réécrit"
	}
	fmt.Printf("\nBase : %s\nMode : %s\n\n", *dataDir, mode)

	c, err := reports.CorrigerFondsDOuverture(app, *sessionID, *fonds, *apply)
	if err != nil {
		fmt.Printf("❌ %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Session %s — ouverte %s, fermée %s\n", c.SessionID, c.OuverteLe, c.FermeeLe)
	fmt.Printf("  fonds d'ouverture : %.2f → %.2f €\n", c.AncienFonds, c.NouveauFonds)
	fmt.Printf("  espèces attendues : %.2f → %.2f €\n", c.AncienAttendu, c.NouvelAttendu)
	if c.NonCompte {
		fmt.Printf("  espèces comptées  : jamais comptées — le rapport posera compté = attendu\n")
		fmt.Printf("  écart de caisse   : 0,00 € dans les deux cas\n")
	} else {
		fmt.Printf("  espèces comptées  : %.2f €\n", c.Compte)
		fmt.Printf("  écart de caisse   : %.2f → %.2f €\n", c.AncienEcart, c.NouvelEcart)
	}
	if c.Applique {
		fmt.Printf("  ✅ écrit\n")
	} else {
		fmt.Printf("\nSimulation seule. Pour appliquer :\n")
		fmt.Printf("  1. fermer PocketApp\n")
		fmt.Printf("  2. sauvegarder %s\n", *dataDir)
		fmt.Printf("  3. rejouer cette commande avec -apply\n")
		fmt.Printf("  4. go run ./backend/cmd/z-rattacher -apply\n")
		fmt.Printf("  5. go run ./backend/cmd/z-repair -apply\n")
	}
	fmt.Println()
}
