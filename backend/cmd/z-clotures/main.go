// Émet les rapports Z des journées dont la caisse a été fermée sans clôture.
//
//	go run ./backend/cmd/z-clotures                 # simulation
//	go run ./backend/cmd/z-clotures -apply          # émet les rapports
//	go run ./backend/cmd/z-clotures -data <chemin>  # sur une autre base
//
// ⚠️ -apply ÉMET des documents fiscaux, numérotés et hachés. Fermer PocketApp,
// sauvegarder, et ENCHAÎNER avec `z-repair -apply` : insérer un Z dans le passé
// raccourcit la période du suivant, tous les rapports doivent être rejoués.
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
	company := flag.String("company", "", "id de la société (par défaut : la première)")
	apply := flag.Bool("apply", false, "émettre (sinon : simulation)")
	flag.Parse()

	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: *dataDir})
	if err := app.Bootstrap(); err != nil {
		fmt.Printf("❌ ouverture de la base : %v\n", err)
		os.Exit(1)
	}
	defer app.ResetBootstrapState()

	societe := *company
	if societe == "" {
		cos, err := app.Dao().FindRecordsByFilter("companies", "id != ''", "", 1, 0)
		if err != nil || len(cos) == 0 {
			fmt.Println("❌ aucune société trouvée")
			os.Exit(1)
		}
		societe = cos[0].Id
	}

	mode := "SIMULATION — aucune écriture"
	if *apply {
		mode = "ÉMISSION — des rapports Z vont être créés"
	}
	fmt.Printf("\nBase : %s\nMode : %s\n\n", *dataDir, mode)

	clotures, err := reports.GenererCloturesManquantes(app, societe, *apply)
	if err != nil {
		fmt.Printf("❌ %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("%-12s %9s %8s %11s   %s\n", "JOURNÉE", "SESSIONS", "TICKETS", "TTC", "RAPPORT")
	fmt.Println(dashes(72))

	var ttc float64
	var emis, bloquees, erreurs, tickets int
	for _, c := range clotures {
		etat := c.ZGenere
		switch {
		case c.Erreur != "":
			etat = "ERREUR : " + c.Erreur
			erreurs++
		case c.ZExistant != "":
			etat = "BLOQUÉE — porte déjà " + c.ZExistant
			bloquees++
		default:
			emis++
			ttc += c.TTC
			tickets += c.NbTickets
		}
		fmt.Printf("%-12s %9d %8d %11.2f   %s\n",
			c.Date, c.NbSessions, c.NbTickets, c.TTC, etat)
	}

	fmt.Println(dashes(72))
	fmt.Printf("\n%d journées · %d rapports à émettre (%d tickets, %.2f €) · %d bloquées · %d erreurs\n",
		len(clotures), emis, tickets, ttc, bloquees, erreurs)

	if !*apply && emis > 0 {
		fmt.Printf("\nSimulation seule. Pour appliquer :\n")
		fmt.Printf("  1. fermer PocketApp\n")
		fmt.Printf("  2. sauvegarder %s\n", *dataDir)
		fmt.Printf("  3. go run ./backend/cmd/z-clotures -apply\n")
		fmt.Printf("  4. go run ./backend/cmd/z-repair -apply   ← indispensable\n")
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
