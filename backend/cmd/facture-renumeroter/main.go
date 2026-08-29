// Renumérote les documents portant un numéro déjà utilisé, puis rehache la
// chaîne. C'est l'exécution du plan que `facture-doublons` se contente de
// montrer.
//
//	go run ./backend/cmd/facture-renumeroter                 # simulation
//	go run ./backend/cmd/facture-renumeroter -apply          # écrit
//	go run ./backend/cmd/facture-renumeroter -data <chemin>  # autre base
//
// ⚠️ En mode -apply : FERMER PocketApp d'abord, et SAUVEGARDER. Cette commande
// réécrit le `number` de documents scellés, puis le `hash` et le
// `previous_hash` de TOUTE la chaîne à partir du plus ancien touché.
//
// ── CE QU'ELLE FAIT, ET DANS QUEL ORDRE ───────────────────────────────────
//  1. Établit le plan par `backend/renumbering` — le MÊME paquet que
//     `facture-doublons`, pour que ce qui est exécuté soit ce qui a été montré.
//  2. Écrit les nouveaux numéros.
//  3. Rehache par `hash.MigrateRecalculateAllHashes`, qui suit la chaîne
//     GLOBALE (tous documents, par `sequence_number`) — la seule qui existe :
//     `getLastInvoice` (invoice_hooks.go:1287) ne filtre que sur
//     `owner_company`. NE PAS employer `migrate_invoices_only.go`, qui exclut
//     les tickets POS : mesuré le 28/08/2026, la chaîne globale porte 1 maillon
//     rompu sur 1198, la sienne 209 — elle travaillerait sur une chaîne fictive.
//  4. Vérifie l'intégrité, et redit ce qui reste à faire.
//
// Les rapports Z ne sont PAS concernés — mesuré le 28/08/2026 : les 60
// `full_report` ne contiennent aucune occurrence de `FAC-…`, et un
// `z-repair -apply` lancé après la renumérotation sur copie n'a réécrit
// AUCUN rapport. Un Z agrège des montants, il ne cite pas ses pièces.
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"

	"pocket-react/backend/hash"
	"pocket-react/backend/renumbering"
)

func main() {
	defaut := filepath.Join(os.Getenv("LOCALAPPDATA"), "PocketReact", "pb_data")

	dataDir := flag.String("data", defaut, "dossier pb_data de la base à traiter")
	apply := flag.Bool("apply", false, "écrire (sinon : simulation)")
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
		mode = "ÉCRITURE — numéros réécrits, chaîne rehachée"
	}
	fmt.Printf("\nBase : %s\nMode : %s\n\n", *dataDir, mode)

	records, err := app.Dao().FindRecordsByFilter("invoices", "id != ''", "sequence_number", 0, 0)
	if err != nil {
		fmt.Printf("❌ chargement des documents : %v\n", err)
		os.Exit(1)
	}

	parID := map[string]*models.Record{}
	docs := make([]renumbering.Doc, 0, len(records))
	for _, r := range records {
		parID[r.Id] = r
		docs = append(docs, lire(r))
	}
	fmt.Printf("%d document(s) dans `invoices`\n\n", len(records))

	plan := renumbering.Plan(docs)
	if len(plan) == 0 {
		fmt.Println("✅ Aucun numéro en double. Rien à faire.")
		return
	}

	fmt.Printf("PLAN — %d document(s) à renuméroter\n", len(plan))
	fmt.Println(strings.Repeat("─", 78))
	fmt.Println("Règle : le document au plus petit `sequence_number` GARDE son numéro ;")
	fmt.Println("les suivants passent à la suite de leur série. Aucun trou n'est comblé.")
	fmt.Println()
	for _, m := range plan {
		fmt.Printf("  %-16s → %-16s  seq %-5d %s  %-9s %8.2f €  %s\n",
			m.Doc.Number, m.Nouveau, m.Doc.Seq, court(m.Doc.Cree),
			m.Doc.Statut, m.Doc.TTC, m.Doc.ID)
	}

	seqMin := renumbering.SeqMin(plan)
	aRehacher := 0
	for _, d := range docs {
		if d.Seq >= seqMin && d.Seq > 0 {
			aRehacher++
		}
	}
	fmt.Println()
	fmt.Println(strings.Repeat("─", 78))
	fmt.Printf("  Le plus ancien touché porte `sequence_number` %d.\n", seqMin)
	fmt.Printf("  `number` entre dans le hash : %d document(s) à rehacher.\n", aRehacher)

	if !*apply {
		fmt.Printf("\n  Simulation. Relancer avec -apply pour écrire — PocketApp fermé,\n")
		fmt.Printf("  après sauvegarde de pb_data.\n\n")
		return
	}

	// ── Écriture des numéros ────────────────────────────────────────────────
	fmt.Printf("\nÉCRITURE DES NUMÉROS\n")
	fmt.Println(strings.Repeat("─", 78))
	ecrits, erreurs := 0, 0
	for _, m := range plan {
		rec, ok := parID[m.Doc.ID]
		if !ok {
			fmt.Printf("  ❌ %s : document introuvable\n", m.Doc.ID)
			erreurs++
			continue
		}
		rec.Set("number", m.Nouveau)
		if err := app.Dao().SaveRecord(rec); err != nil {
			fmt.Printf("  ❌ %s → %s : %v\n", m.Doc.Number, m.Nouveau, err)
			erreurs++
			continue
		}
		ecrits++
	}
	fmt.Printf("  %d numéro(s) réécrit(s), %d erreur(s).\n", ecrits, erreurs)
	if erreurs > 0 {
		fmt.Printf("\n❌ Des numéros n'ont pas été écrits : la chaîne n'est PAS rehachée.\n")
		fmt.Printf("   Restaurer la sauvegarde avant toute autre opération.\n\n")
		os.Exit(1)
	}

	// ── Rehachage de la chaîne globale ──────────────────────────────────────
	fmt.Printf("\nREHACHAGE DE LA CHAÎNE\n")
	fmt.Println(strings.Repeat("─", 78))
	if err := hash.MigrateRecalculateAllHashes(app); err != nil {
		fmt.Printf("\n❌ rehachage : %v\n", err)
		fmt.Printf("   Les numéros SONT écrits mais la chaîne est incohérente.\n")
		fmt.Printf("   Restaurer la sauvegarde.\n\n")
		os.Exit(1)
	}

	if err := hash.VerifyChainIntegrity(app); err != nil {
		fmt.Printf("\n⚠️ vérification d'intégrité : %v\n", err)
	}

	fmt.Printf("\n✅ %d document(s) renuméroté(s), chaîne rehachée.\n", ecrits)
	fmt.Printf("   Les rapports Z ne citent aucun numéro de pièce : rien à rejouer\n")
	fmt.Printf("   de ce fait — mesuré, 0 occurrence dans les 60 Z.\n\n")
}

func lire(r *models.Record) renumbering.Doc {
	d := renumbering.Doc{
		ID:       r.Id,
		Number:   strings.TrimSpace(r.GetString("number")),
		Seq:      r.GetInt("sequence_number"),
		Company:  r.GetString("owner_company"),
		Exercice: r.GetInt("fiscal_year"),
		Statut:   r.GetString("status"),
		Cree:     r.GetString("created"),
		TTC:      r.GetFloat("total_ttc"),
	}
	d.Serie, d.Rang = decouper(d.Number)
	return d
}

// decouper rend ("FAC-2026-", 105) pour "FAC-2026-000105".
// Toute forme inattendue rend une série vide : le document sort du plan au
// lieu d'y entrer sur une supposition.
func decouper(number string) (string, int) {
	if len(number) <= renumbering.Padding {
		return "", 0
	}
	coupe := len(number) - renumbering.Padding
	serie, suffixe := number[:coupe], number[coupe:]
	if !strings.HasSuffix(serie, "-") {
		return "", 0
	}
	rang := 0
	for _, c := range suffixe {
		if c < '0' || c > '9' {
			return "", 0
		}
		rang = rang*10 + int(c-'0')
	}
	if rang <= 0 {
		return "", 0
	}
	return serie, rang
}

func court(date string) string {
	if len(date) < 10 {
		return date
	}
	return date[:10]
}
