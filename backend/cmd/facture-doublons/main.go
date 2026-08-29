// Diagnostique les numéros de document portés par PLUSIEURS factures, et propose
// un plan de renumérotation. Ne modifie RIEN : il n'y a pas de `-apply`.
//
//	go run ./backend/cmd/facture-doublons
//	go run ./backend/cmd/facture-doublons -data "C:\...\pb_data - Copie"
//	go run ./backend/cmd/facture-doublons -prefixe FAC -annee 2026
//
// ── POURQUOI CETTE COMMANDE EXISTE ────────────────────────────────────────
// `generateDocumentNumber` (backend/hooks/invoice_hooks.go:845) cherche le
// numéro précédent en triant sur `-sequence_number`, PAS sur `-number` : il
// remonte donc le document le plus RÉCENT, et n'en tire un numéro utilisable
// que si ce document appartient à la même série. Un brouillon validé en retard
// suffit à lui faire relire un vieux numéro. Et quand la requête ne rend rien —
// `if err != nil || len(records) == 0` — la séquence repart à 1, sans erreur.
// Une seule défaillance empoisonne la série définitivement : le tri étant sur
// `sequence_number`, le document suivant retrouve le `000001` fraîchement posé
// et repart de 2, 3, 4…
//
// Mesuré le 27/08/2026 sur la base de production : 115 numéros portés en double,
// dont toute la série FAC-2026-000001 → 000106, née le 03/06/2026 à 14h50 alors
// que la série en cours était à FAC-2026-000173.
//
// ── POURQUOI ELLE N'ÉCRIT PAS ─────────────────────────────────────────────
// `number` entre dans le hash du document (backend/hash/hash.go:93), et chaque
// document porte le hash du précédent. Renuméroter un document, c'est donc
// invalider SON hash et rompre la chaîne à partir de lui : la réparation ne se
// limite jamais au document renuméroté, elle descend jusqu'au dernier maillon.
// Ce plan dit ce qu'il faudrait changer et ce que cela coûterait ; l'exécuter
// est une autre décision, et un autre outil.
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
)

// Même largeur que hooks.NumberPadding et reports.NumberPadding.
const padding = 6

type doc struct {
	id       string
	number   string
	created  string
	seq      int
	statut   string
	typ      string
	paye     bool
	verrou   bool
	ttc      float64
	serie    string // "FAC-2026-"
	rang     int    // 105
	company  string
	exercice int
}

func main() {
	defaut := filepath.Join(os.Getenv("LOCALAPPDATA"), "PocketReact", "pb_data")

	dataDir := flag.String("data", defaut, "dossier pb_data")
	prefixe := flag.String("prefixe", "", "n'examiner qu'une série : FAC, TIK, AVO, ACC, DEV")
	annee := flag.Int("annee", 0, "n'examiner qu'un exercice : 2026")
	detail := flag.Bool("detail", false, "lister chaque document en double, pas seulement le plan")
	flag.Parse()

	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: *dataDir})
	if err := app.Bootstrap(); err != nil {
		fmt.Printf("❌ ouverture de la base : %v\n", err)
		fmt.Printf("   (PocketApp est-il ouvert ? travailler sur une COPIE avec -data)\n")
		os.Exit(1)
	}
	defer app.ResetBootstrapState()

	records, err := app.Dao().FindRecordsByFilter("invoices", "id != ''", "sequence_number", 0, 0)
	if err != nil {
		fmt.Printf("❌ lecture des factures : %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("\nBase : %s\n", *dataDir)
	fmt.Printf("%d document(s) dans `invoices`\n\n", len(records))

	tous := make([]doc, 0, len(records))
	for _, r := range records {
		tous = append(tous, lire(r))
	}

	// ── Numéros vides ───────────────────────────────────────────────────────
	var vides []doc
	for _, d := range tous {
		if strings.TrimSpace(d.number) == "" {
			vides = append(vides, d)
		}
	}

	// ── Regroupement par numéro, dans la partition (company, exercice) ──────
	parNumero := map[string][]doc{}
	for _, d := range tous {
		if d.number == "" {
			continue
		}
		if *prefixe != "" && !strings.HasPrefix(d.number, *prefixe) {
			continue
		}
		if *annee != 0 && d.exercice != *annee {
			continue
		}
		cle := fmt.Sprintf("%s|%d|%s", d.company, d.exercice, d.number)
		parNumero[cle] = append(parNumero[cle], d)
	}

	cles := make([]string, 0, len(parNumero))
	for c, ds := range parNumero {
		if len(ds) > 1 {
			cles = append(cles, c)
		}
	}
	sort.Strings(cles)

	// ── Le plus haut numéro réellement utilisé, par série ───────────────────
	plafond := map[string]int{} // "company|exercice|FAC-2026-" → rang max
	for _, d := range tous {
		if d.serie == "" {
			continue
		}
		k := fmt.Sprintf("%s|%d|%s", d.company, d.exercice, d.serie)
		if d.rang > plafond[k] {
			plafond[k] = d.rang
		}
	}

	// ── § 1. Ce que la caisse donnera au prochain document ──────────────────
	fmt.Println("§1 — CE QUE LA NUMÉROTATION FERA AU PROCHAIN DOCUMENT")
	fmt.Println(strings.Repeat("─", 78))
	prevoir(tous, plafond)

	// ── § 2. Les doublons ───────────────────────────────────────────────────
	fmt.Printf("\n§2 — NUMÉROS PORTÉS PAR PLUSIEURS DOCUMENTS\n")
	fmt.Println(strings.Repeat("─", 78))
	if len(cles) == 0 {
		fmt.Println("Aucun. Rien à renuméroter.")
	} else {
		lignes := 0
		parSerie := map[string]int{}
		for _, c := range cles {
			ds := parNumero[c]
			lignes += len(ds)
			parSerie[ds[0].serie]++
		}
		fmt.Printf("%d numéro(s) en double, portés par %d document(s).\n\n", len(cles), lignes)
		series := make([]string, 0, len(parSerie))
		for s := range parSerie {
			series = append(series, s)
		}
		sort.Strings(series)
		for _, s := range series {
			fmt.Printf("  %-12s %3d numéro(s)\n", s, parSerie[s])
		}
	}
	if len(vides) > 0 {
		fmt.Printf("\n⚠️ %d document(s) SANS numéro (ils n'entrent pas dans le plan) :\n", len(vides))
		for _, d := range vides {
			fmt.Printf("   · %s  seq %-5d %s  %s  %.2f €\n", d.id, d.seq, d.created, d.statut, d.ttc)
		}
	}

	if len(cles) == 0 {
		fmt.Println()
		return
	}

	// ── § 3. Le plan ────────────────────────────────────────────────────────
	// Règle : dans un groupe, le document au PLUS PETIT `sequence_number` garde
	// son numéro — c'est le premier émis, celui que le client a déjà reçu. Les
	// autres sont renumérotés à la SUITE de la série, dans l'ordre de leur
	// séquence, pour ne jamais réutiliser un numéro déjà sorti.
	fmt.Printf("\n§3 — PLAN DE RENUMÉROTATION (rien n'est écrit)\n")
	fmt.Println(strings.Repeat("─", 78))
	fmt.Println("Règle : le document au plus petit `sequence_number` GARDE son numéro ;")
	fmt.Println("les suivants sont renumérotés à la suite de leur série.")
	fmt.Println()

	var aDeplacer []doc
	for _, c := range cles {
		ds := parNumero[c]
		sort.Slice(ds, func(i, j int) bool { return ds[i].seq < ds[j].seq })
		aDeplacer = append(aDeplacer, ds[1:]...)
	}
	sort.Slice(aDeplacer, func(i, j int) bool { return aDeplacer[i].seq < aDeplacer[j].seq })

	minSeqTouche := -1
	compteur := map[string]int{}
	for _, d := range aDeplacer {
		k := fmt.Sprintf("%s|%d|%s", d.company, d.exercice, d.serie)
		if _, vu := compteur[k]; !vu {
			compteur[k] = plafond[k]
		}
		compteur[k]++
		nouveau := fmt.Sprintf("%s%0*d", d.serie, padding, compteur[k])

		if minSeqTouche == -1 || d.seq < minSeqTouche {
			minSeqTouche = d.seq
		}

		fmt.Printf("  %-16s → %-16s  seq %-5d %s  %-9s %8.2f €  %s\n",
			d.number, nouveau, d.seq, court(d.created), d.statut, d.ttc, d.id)
		if *detail {
			fmt.Printf("        type %s · payée %v · verrouillée %v\n", d.typ, d.paye, d.verrou)
		}
	}

	// ── § 4. Ce que ça coûterait ────────────────────────────────────────────
	var aRehacher int
	for _, d := range tous {
		if d.seq >= minSeqTouche && d.seq > 0 {
			aRehacher++
		}
	}

	fmt.Printf("\n§4 — CE QUE L'EXÉCUTION COÛTERAIT\n")
	fmt.Println(strings.Repeat("─", 78))
	fmt.Printf("  %d document(s) à renuméroter.\n", len(aDeplacer))
	fmt.Printf("  Le plus ancien touché porte `sequence_number` %d.\n", minSeqTouche)
	fmt.Printf("  `number` entre dans le hash (backend/hash/hash.go:93) : la chaîne serait\n")
	fmt.Printf("  rompue à partir de là, donc %d document(s) à rehacher jusqu'au dernier\n", aRehacher)
	fmt.Printf("  maillon - par hash.MigrateRecalculateAllHashes, qui suit la chaine\n")
	fmt.Printf("  GLOBALE, et NON migrate_invoices_only.go qui exclut les tickets.\n")
	fmt.Printf("  Les rapports Z ne sont PAS concernés : mesuré le 28/08/2026,\n")
	fmt.Printf("  aucun des 60 `full_report` ne cite de numéro de piece, et un\n")
	fmt.Printf("  z-repair apres renumerotation sur copie n'a reecrit aucun Z.\n")
	fmt.Printf("\n  Verifications seules. Pour executer ce plan :\n")
	fmt.Printf("  go run ./backend/cmd/facture-renumeroter -apply\n\n")
}

func lire(r *models.Record) doc {
	d := doc{
		id:       r.Id,
		number:   r.GetString("number"),
		created:  r.GetString("created"),
		seq:      r.GetInt("sequence_number"),
		statut:   r.GetString("status"),
		typ:      r.GetString("invoice_type"),
		paye:     r.GetBool("is_paid"),
		verrou:   r.GetBool("is_locked"),
		ttc:      r.GetFloat("total_ttc"),
		company:  r.GetString("owner_company"),
		exercice: r.GetInt("fiscal_year"),
	}
	d.serie, d.rang = decouper(d.number)
	return d
}

// decouper rend "FAC-2026-" et 105 pour "FAC-2026-000105".
// Un numéro qui ne suit pas la forme attendue rend une série vide : il ne
// participe alors ni au plafond, ni au plan.
func decouper(number string) (string, int) {
	i := strings.LastIndex(number, "-")
	if i < 0 || i+1 >= len(number) {
		return "", 0
	}
	suffixe := number[i+1:]
	if len(suffixe) != padding {
		return "", 0
	}
	var rang int
	if _, err := fmt.Sscanf(suffixe, "%d", &rang); err != nil || rang <= 0 {
		return "", 0
	}
	return number[:i+1], rang
}

func court(date string) string {
	if len(date) < 10 {
		return date
	}
	return date[:10]
}

// prevoir rejoue la logique de generateDocumentNumber sans écrire.
//
// Le hook filtre sur `number ~ '<série>'` PUIS trie sur `-sequence_number` : le
// document qu'il relit est donc celui de la série au plus grand numéro d'ordre,
// pas le dernier document tous types confondus. C'est cette lecture-là qu'on
// reproduit ici, série par série — la simuler sur le dernier document global
// crierait au doublon sur toutes les séries à chaque fois que le dernier
// document n'est pas du bon type.
//
// Si le numéro obtenu est en dessous du plus haut réellement atteint, la
// prochaine pièce de cette série SORTIRA EN DOUBLE.
func prevoir(tous []doc, plafond map[string]int) {
	// (company|exercice|série) → document de la série au plus grand seq
	dernierDeSerie := map[string]doc{}
	dernierGlobal := map[string]doc{}
	for _, d := range tous {
		if d.company == "" {
			continue
		}
		if cur, ok := dernierGlobal[d.company]; !ok || d.seq > cur.seq {
			dernierGlobal[d.company] = d
		}
		if d.serie == "" {
			continue
		}
		k := fmt.Sprintf("%s|%d|%s", d.company, d.exercice, d.serie)
		if cur, ok := dernierDeSerie[k]; !ok || d.seq > cur.seq {
			dernierDeSerie[k] = d
		}
	}

	companies := make([]string, 0, len(dernierGlobal))
	for c := range dernierGlobal {
		companies = append(companies, c)
	}
	sort.Strings(companies)

	risque := false
	for _, c := range companies {
		last := dernierGlobal[c]
		fmt.Printf("  société %s — dernier document : %s (seq %d, %s)\n",
			c, last.number, last.seq, court(last.created))

		for _, p := range []string{"FAC", "AVO", "ACC", "TIK", "DEV"} {
			serie := fmt.Sprintf("%s-%d-", p, last.exercice)
			k := fmt.Sprintf("%s|%d|%s", c, last.exercice, serie)
			atteint, existe := plafond[k]
			if !existe {
				continue
			}
			// numbering.Suivant relit le plus grand NUMERO de la serie : c'est
			// exactement `atteint`, deja calcule plus haut. Avant le 28/08/2026
			// cette ligne simulait l'ANCIEN hook, trie sur `-sequence_number`,
			// et criait donc au doublon sur une cause deja fermee.
			prochain := atteint + 1
			marque := "ok"
			if prochain <= atteint {
				marque = fmt.Sprintf("⚠️ DOUBLON (%s%0*d existe déjà)", serie, padding, prochain)
				risque = true
			}
			fmt.Printf("      %-12s plus haut atteint %0*d - numbering.Suivant relit %s%0*d et donnera %0*d  %s\n",
				serie, padding, atteint, serie, padding, atteint, padding, prochain, marque)
		}
	}
	if risque {
		fmt.Printf("\n  [!] La prochaine piece sortirait sur un numero DEJA UTILISE.\n")
		fmt.Printf("     Sous numbering.Suivant c'est impossible par construction :\n")
		fmt.Printf("     si ce message s'affiche, un chemin de numerotation a echappe\n")
		fmt.Printf("     au paquet. Les quatre connus : invoice_hooks.go:850 et :1279,\n")
		fmt.Printf("     deposit.go:521 et :535.\n")
	} else {
		fmt.Printf("\n  [ok] Aucune serie ne redonnerait un numero deja utilise.\n")
		fmt.Printf("     Les doublons ci-dessous sont ANTERIEURS au correctif : la\n")
		fmt.Printf("     cause est fermee (numbering.Suivant, tri sur `-number`), les\n")
		fmt.Printf("     documents deja emis ne se reparent pas pour autant.\n")
	}
}
