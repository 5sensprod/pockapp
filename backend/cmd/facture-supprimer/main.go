// Supprime une facture — et refuse de le faire si ce n'est pas sans conséquence.
//
//	go run ./backend/cmd/facture-supprimer -id <id>          # vérifications seules
//	go run ./backend/cmd/facture-supprimer -id <id> -apply   # supprime
//
// ── POURQUOI CETTE COMMANDE EXISTE, ET POURQUOI ELLE EST AUSSI MÉFIANTE ───
// Une facture est un document scellé : elle porte un hash, et le document suivant
// porte ce hash dans son `previous_hash`. Supprimer un maillon au MILIEU de la
// chaîne la rompt définitivement, et c'est exactement ce qu'un contrôle
// d'intégrité détecte. Supprimer le DERNIER maillon, en revanche, ne casse rien :
// la chaîne s'arrête un document plus tôt, et la facture suivante reprendra la
// séquence libérée.
//
// La commande vérifie donc, et n'écrit que si TOUT est vert :
//  1. aucun document ne porte une séquence supérieure dans la même partition ;
//  2. aucun document ne pointe sur son hash ;
//  3. aucun avoir, acompte ou facture de solde ne s'y rattache ;
//  4. aucun mouvement de caisse ne s'y réfère ;
//  5. sa session de caisse — s'il y en a une — n'est scellée dans aucun rapport Z.
//
// ⚠️ La suppression est DÉFINITIVE. Sauvegarder d'abord, PocketApp fermé. Et
// enchaîner avec `z-repair -apply` : le rapport Z qui la comptait doit être
// rejoué, sans quoi il continuera d'annoncer un montant qui n'existe plus.
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/pocketbase/pocketbase"
)

func main() {
	defaut := filepath.Join(os.Getenv("LOCALAPPDATA"), "PocketReact", "pb_data")

	dataDir := flag.String("data", defaut, "dossier pb_data")
	id := flag.String("id", "", "id de la facture à supprimer")
	apply := flag.Bool("apply", false, "supprimer (sinon : vérifications seules)")
	flag.Parse()

	if *id == "" {
		fmt.Println("❌ -id est requis")
		os.Exit(1)
	}

	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: *dataDir})
	if err := app.Bootstrap(); err != nil {
		fmt.Printf("❌ ouverture de la base : %v\n", err)
		os.Exit(1)
	}
	defer app.ResetBootstrapState()
	dao := app.Dao()

	cible, err := dao.FindRecordById("invoices", *id)
	if err != nil || cible == nil {
		fmt.Printf("❌ facture introuvable : %s\n", *id)
		os.Exit(1)
	}

	fmt.Printf("\nBase : %s\n\n", *dataDir)
	fmt.Printf("FACTURE VISÉE\n")
	fmt.Printf("  numéro    %s\n", cible.GetString("number"))
	fmt.Printf("  date      %s\n", cible.GetString("date"))
	fmt.Printf("  montant   %.2f € TTC\n", cible.GetFloat("total_ttc"))
	fmt.Printf("  payée     %v le %s\n", cible.GetBool("is_paid"), cible.GetString("paid_at"))
	fmt.Printf("  séquence  %d\n", cible.GetInt("sequence_number"))
	fmt.Printf("  statut    %s\n\n", cible.GetString("status"))

	var refus []string

	// Le document est-il hors de toute clôture ? Un ticket dont la session n'est
	// dans aucun Z n'a JAMAIS été compté par un rapport : le rejeu qui suit la
	// suppression n'a alors rien à corriger. Réclamer un `z-repair` dans ce
	// cas-là serait une fausse alerte sur l'outil même qu'on consulte — le
	// travers relevé sur `facture-doublons` le 28 août 2026.
	sessionSansZ := false

	// 1. Est-elle le dernier maillon de sa partition ?
	suivants, _ := dao.FindRecordsByFilter("invoices", fmt.Sprintf(
		"owner_company = '%s' && fiscal_year = %d && sequence_number > %d",
		cible.GetString("owner_company"), cible.GetInt("fiscal_year"),
		cible.GetInt("sequence_number")), "sequence_number", 0, 0)
	if len(suivants) > 0 {
		refus = append(refus, fmt.Sprintf(
			"%d document(s) portent une séquence supérieure — elle n'est pas le dernier maillon (le premier est %s)",
			len(suivants), suivants[0].GetString("number")))
	}

	// 2. Quelqu'un s'accroche-t-il à son hash ?
	if h := cible.GetString("hash"); h != "" {
		accroches, _ := dao.FindRecordsByFilter("invoices",
			fmt.Sprintf("previous_hash = '%s'", h), "", 0, 0)
		if len(accroches) > 0 {
			refus = append(refus, fmt.Sprintf(
				"%s porte son hash en previous_hash — la supprimer romprait la chaîne",
				accroches[0].GetString("number")))
		}
	}

	// 3. Des documents s'y rattachent-ils ?
	enfants, _ := dao.FindRecordsByFilter("invoices",
		fmt.Sprintf("original_invoice_id = '%s'", cible.Id), "", 0, 0)
	if len(enfants) > 0 {
		for _, e := range enfants {
			refus = append(refus, fmt.Sprintf("%s (%s) s'y rattache",
				e.GetString("number"), e.GetString("invoice_type")))
		}
	}

	// 4. De l'argent a-t-il bougé au tiroir à cause d'elle ?
	mouvements, _ := dao.FindRecordsByFilter("cash_movements",
		fmt.Sprintf("related_invoice = '%s'", cible.Id), "", 0, 0)
	if len(mouvements) > 0 {
		refus = append(refus, fmt.Sprintf(
			"%d mouvement(s) de caisse s'y réfèrent — l'argent du tiroir en dépend",
			len(mouvements)))
	}

	// 5. Sa session est-elle déjà scellée dans un rapport Z ?
	//
	// ⚠️ Ce contrôle a changé le 29 août 2026. Il refusait TOUT document portant
	// une session — « c'est un ticket, pas une facture hors caisse ». Ce refus
	// datait d'un temps où une session se créait à la main : depuis que la
	// session du jour est implicite (backend/session_du_jour.go), TOUT ticket en
	// porte une, et le contrôle interdisait de retirer le moindre ticket, y
	// compris le dernier, y compris jamais clôturé.
	//
	// Ce qui compte n'est pas qu'il y ait une session : c'est que cette session
	// soit ENTRÉE DANS UN Z. Un Z est un document scellé et haché ; retirer un
	// ticket qu'il a compté rendrait son montant faux jusqu'au rejeu, et son
	// rejeu réécrirait un document déjà remis. Tant que la session n'est dans
	// aucun Z, rien n'est scellé et la suppression ne touche que la chaîne des
	// factures, dont le contrôle 1 garantit qu'on n'en retire que le dernier
	// maillon.
	if s := cible.GetString("session"); s != "" {
		session, err := dao.FindRecordById("cash_sessions", s)
		switch {
		case err != nil || session == nil:
			refus = append(refus, fmt.Sprintf(
				"sa session %s est introuvable — on ne supprime pas dans le doute", s))
		case session.GetString("z_report_id") != "":
			refus = append(refus, fmt.Sprintf(
				"sa session est scellée dans le rapport Z %s — ce Z l'a comptée",
				session.GetString("z_report_id")))
		default:
			sessionSansZ = true
			fmt.Printf("  session   %s (ouverte le %s, dans aucun Z)\n\n",
				session.Id, session.GetString("opened_at"))
		}
	}

	if len(refus) > 0 {
		fmt.Println("❌ SUPPRESSION REFUSÉE :")
		for _, r := range refus {
			fmt.Printf("   · %s\n", r)
		}
		fmt.Println()
		os.Exit(1)
	}

	fmt.Println("✅ Aucune dépendance : dernier maillon, rien ne pointe dessus, aucun document")
	fmt.Println("   rattaché, aucun mouvement de caisse, aucune session scellée dans un Z.")

	// Aucun Z ne l'a comptée si elle n'a pas de session, ou si sa session n'est
	// rattachée à aucun rapport : le rejeu n'aurait alors rien à corriger.
	horsCloture := sessionSansZ || cible.GetString("session") == ""

	if !*apply {
		fmt.Printf("\nVérifications seules. Pour supprimer :\n")
		fmt.Printf("  1. fermer PocketApp\n")
		fmt.Printf("  2. sauvegarder %s\n", *dataDir)
		fmt.Printf("  3. go run ./backend/cmd/facture-supprimer -id %s -apply\n", *id)
		if horsCloture {
			fmt.Printf("\nAucun rapport Z ne l'a comptée : pas de z-repair à lancer ensuite.\n\n")
		} else {
			fmt.Printf("  4. go run ./backend/cmd/z-repair -apply   ← indispensable\n\n")
		}
		return
	}

	if err := dao.DeleteRecord(cible); err != nil {
		fmt.Printf("❌ suppression : %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("\n✅ %s supprimée définitivement.\n", cible.GetString("number"))
	if horsCloture {
		fmt.Printf("\nAucun rapport Z ne la comptait : rien d'autre à faire.\n\n")
	} else {
		fmt.Printf("\n⚠️ Le rapport Z qui la comptait annonce encore son montant :\n")
		fmt.Printf("   go run ./backend/cmd/z-repair -apply\n\n")
	}
}
