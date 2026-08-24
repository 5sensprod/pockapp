// Rattache au rapport Z de leur journée les sessions fermées qu'aucun Z ne porte
// alors que leur jour en porte déjà un.
//
//	go run ./backend/cmd/z-rattacher                 # simulation
//	go run ./backend/cmd/z-rattacher -apply          # rattache
//	go run ./backend/cmd/z-rattacher -data <chemin>  # sur une autre base
//
// ⚠️ -apply modifie le DÉCOUPAGE de documents fiscaux scellés. Fermer PocketApp,
// sauvegarder, et ENCHAÎNER avec `z-repair -apply` : tant qu'il n'a pas tourné,
// le rapport porte une session que ses totaux ignorent.
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
	apply := flag.Bool("apply", false, "rattacher (sinon : simulation)")
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
		mode = "RATTACHEMENT — des rapports Z vont être redécoupés"
	}
	fmt.Printf("\nBase : %s\nMode : %s\n\n", *dataDir, mode)

	liens, err := reports.RattacherSessionsOrphelines(app, societe, *apply)
	if err != nil {
		fmt.Printf("❌ %v\n", err)
		os.Exit(1)
	}

	if len(liens) == 0 {
		fmt.Println("Aucune session orpheline dont la journée porte déjà un Z.")
		fmt.Println()
		return
	}

	for _, l := range liens {
		fmt.Printf("Session %s — fermée le %s — %d ticket(s), %.2f €\n",
			l.SessionID, l.FermeeLe, l.NbTickets, l.TicketsTTC)
		fmt.Printf("  rapport du jour   : %s\n", l.ZNumero)
		fmt.Printf("  tickets comptés   : %d → %d\n", l.AncienNbTickets, l.NouveauNbTickets)
		fmt.Printf("  ventes du jour    : %.2f → %.2f €\n", l.AncienTTC, l.NouveauTTC)
		fmt.Printf("  total encaissé    : %.2f → %.2f €  (%+.2f)\n",
			l.AncienEncaisse, l.NouveauEncaisse, l.EcartEncaisse())
		fmt.Printf("  espèces attendues : %.2f → %.2f €  (%+.2f)\n",
			l.AncienEspecesAttendues, l.NouvellesEspecesAttendues, l.EcartEspeces())
		fmt.Printf("  espèces comptées  : %.2f → %.2f €\n",
			l.AncienEspecesComptees, l.NouvellesEspecesComptees)
		fmt.Printf("  écart de caisse   : %.2f → %.2f €\n",
			l.AncienEcartEspeces, l.NouvelEcartEspeces)
		if l.Erreur != "" {
			fmt.Printf("  ⚠️  %s\n", l.Erreur)
		}
		if l.Applique {
			fmt.Printf("  ✅ rattachée\n")
		}
		fmt.Println()
	}

	if !*apply {
		fmt.Printf("Simulation seule. Pour appliquer :\n")
		fmt.Printf("  1. fermer PocketApp\n")
		fmt.Printf("  2. sauvegarder %s\n", *dataDir)
		fmt.Printf("  3. go run ./backend/cmd/z-rattacher -apply\n")
		fmt.Printf("  4. go run ./backend/cmd/z-repair -apply   ← indispensable\n")
		fmt.Println()
	}
}
