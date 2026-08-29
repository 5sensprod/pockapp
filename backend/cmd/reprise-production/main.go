// Reprend dans notre base les ventes qu'une copie de la base du client porte
// en plus — tickets, factures, avoirs, les clients qui vont avec, et les
// mouvements de caisse.
//
//	go run ./backend/cmd/reprise-production -source "<pb_data du client>" -du 2026-08-25 -au 2026-08-25
//	go run ./backend/cmd/reprise-production -source "…" -du … -au … -apply
//	go run ./backend/cmd/reprise-production -source "…" -du … -au … -ignorer FAC-2026-000107,AVO-2026-000041
//
// Simulation par défaut : sans -apply, RIEN n'est écrit.
//
// ── CE QU'IL FAIT, ET DANS CET ORDRE ──────────────────────────────────────
//  1. les clients que les factures reprises référencent et que nous n'avons pas
//  2. les documents, recréés EN CONSERVANT LEUR id, mais numérotés, chaînés et
//     hachés DANS NOTRE CHAÎNE (voir backend/reprise)
//  3. les mouvements de caisse
//  4. la fermeture de la session de chaque journée reprise, à SA date
//
// ── CE QU'IL NE FAIT PAS, VOLONTAIREMENT ──────────────────────────────────
// Il n'émet aucun rapport Z. La clôture appartient à `z-clotures`, et le rejeu
// des périodes à `z-repair` : reprendre et clôturer sont deux gestes, et il
// faut pouvoir dire lequel a échoué. L'enchaînement complet est affiché en fin
// d'exécution.
//
// ⚠️ En -apply : FERMER PocketApp d'abord (une base ouverte ailleurs bloque les
// écritures) et SAUVEGARDER pb_data. La commande crée des documents fiscaux,
// numérotés et hachés — c'est irréversible.
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"

	"pocket-react/backend"
	"pocket-react/backend/reprise"
)

func main() {
	defaut := filepath.Join(os.Getenv("LOCALAPPDATA"), "PocketReact", "pb_data")

	sourceDir := flag.String("source", "", "dossier pb_data de la COPIE DU CLIENT (lecture seule)")
	dataDir := flag.String("data", defaut, "dossier pb_data de NOTRE base")
	du := flag.String("du", "", "première journée à reprendre (AAAA-MM-JJ)")
	au := flag.String("au", "", "dernière journée à reprendre (AAAA-MM-JJ)")
	company := flag.String("company", "", "id de la société (par défaut : la première)")
	ignorerBrut := flag.String("ignorer", "", "numéros ou id à écarter, séparés par des virgules")
	apply := flag.Bool("apply", false, "écrire (sinon : simulation)")
	flag.Parse()

	if *sourceDir == "" || *du == "" || *au == "" {
		fmt.Println("❌ -source, -du et -au sont requis.")
		flag.Usage()
		os.Exit(1)
	}
	for _, d := range []string{*sourceDir, *dataDir} {
		if _, err := os.Stat(d); err != nil {
			fmt.Printf("❌ base introuvable : %s\n", d)
			os.Exit(1)
		}
	}
	if *sourceDir == *dataDir {
		fmt.Println("❌ -source et -data désignent la même base.")
		os.Exit(1)
	}

	source := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: *sourceDir})
	if err := source.Bootstrap(); err != nil {
		fmt.Printf("❌ ouverture de la copie client : %v\n", err)
		os.Exit(1)
	}
	defer source.ResetBootstrapState()

	cible := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: *dataDir})
	if err := cible.Bootstrap(); err != nil {
		fmt.Printf("❌ ouverture de notre base : %v\n", err)
		os.Exit(1)
	}
	defer cible.ResetBootstrapState()

	societe := *company
	if societe == "" {
		cos, err := cible.Dao().FindRecordsByFilter("companies", "id != ''", "", 1, 0)
		if err != nil || len(cos) == 0 {
			fmt.Println("❌ aucune société dans notre base ; préciser -company")
			os.Exit(1)
		}
		societe = cos[0].Id
	}

	ignorer := map[string]bool{}
	for _, v := range strings.Split(*ignorerBrut, ",") {
		if v = strings.TrimSpace(v); v != "" {
			ignorer[v] = true
		}
	}

	mode := "SIMULATION — aucune écriture"
	if *apply {
		mode = "ÉCRITURE — les documents seront créés, numérotés et hachés"
	}
	fmt.Printf("\nSource : %s\nCible  : %s\nSociété: %s\nMode   : %s\n\n",
		*sourceDir, *dataDir, societe, mode)

	plan, err := reprise.Preparer(source.Dao(), cible.Dao(), societe, *du, *au, ignorer)
	if err != nil {
		fmt.Printf("❌ %v\n", err)
		os.Exit(1)
	}

	fmt.Print(plan.Resume())

	if len(plan.Refus) > 0 {
		fmt.Println("\n⛔ Rien n'a été écrit : des liens ne se résolvent pas.")
		os.Exit(1)
	}

	if plan.Vide() {
		fmt.Println("\n✅ Rien à reprendre — notre base porte déjà tout ce que la source a sur cette période.")
		return
	}

	if !*apply {
		fmt.Println("\nSimulation. Relancer avec -apply pour écrire, APPLICATION FERMÉE et après sauvegarde.")
		return
	}

	// La session de chaque journée reprise : SessionDuJourLe est le seul chemin
	// d'ouverture, on ne fabrique pas de session ici.
	sessions := map[string]*models.Record{}
	sessionPourJour := func(jour string) (string, error) {
		if s, ok := sessions[jour]; ok {
			return s.Id, nil
		}
		t, err := time.ParseInLocation("2006-01-02", jour, time.Local)
		if err != nil {
			return "", fmt.Errorf("journée illisible %q : %w", jour, err)
		}
		// Midi, et non minuit : SessionDuJourLe écrit `opened_at` en UTC et lit
		// la JOURNÉE en local. À minuit local, un décalage horaire ferait
		// basculer la journée stockée sur la veille.
		s, err := backend.SessionDuJourLe(cible.Dao(), societe, "", "",
			t.Add(12*time.Hour))
		if err != nil {
			return "", err
		}
		sessions[jour] = s
		return s.Id, nil
	}

	if err := reprise.Appliquer(source.Dao(), cible.Dao(), plan, sessionPourJour); err != nil {
		fmt.Printf("\n❌ %v\n", err)
		os.Exit(1)
	}

	// Refermer chaque session à SA date. Sans cela elle reste ouverte, et
	// GenerateRapportZ ne retient que les sessions dont le `closed_at` tombe
	// dans la journée du rapport (cash_reports.go:1490-1496) : le Z de cette
	// journée serait VIDE, sans la moindre erreur.
	for jour, s := range sessions {
		if err := backend.FermerAuPassageDeJournee(cible.Dao(), s); err != nil {
			fmt.Printf("⚠️ session du %s non refermée : %v\n", jour, err)
		}
	}

	fmt.Println("\n" + plan.Resume())
	fmt.Println("✅ Reprise appliquée.")

	fmt.Println("\nÀ ENCHAÎNER, dans cet ordre :")
	for _, j := range plan.Journees() {
		fmt.Printf("  · une clôture est attendue pour le %s\n", j)
	}
	fmt.Println("  1. go run ./backend/cmd/z-clotures            (simulation)")
	fmt.Println("  2. go run ./backend/cmd/z-clotures -apply     (émet les Z)")
	fmt.Println("  3. go run ./backend/cmd/z-repair -apply       (rejoue les périodes)")
	fmt.Println("  4. go run ./backend/cmd/z-repair              (doit rendre 0 / 0 / 0)")
}
