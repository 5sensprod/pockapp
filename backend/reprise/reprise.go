// backend/reprise — reprendre dans notre base ce qu'une copie de production
// porte en plus.
//
// ── POURQUOI CE PAQUET EXISTE ─────────────────────────────────────────────
// La base de développement descend d'une copie de la base du client, et elle
// en a divergé : le développement y a renuméroté 114 factures, reconstitué 15
// rapports Z et fait passer le schéma des Z en v6, pendant que le comptoir
// continuait de vendre. Ramener les ventes du client est donc une opération
// RÉCURRENTE, pas un geste unique — d'où un outil, et non un script jetable.
//
// ── LES TROIS RÈGLES, ET ELLES SONT MESURÉES ──────────────────────────────
//
//  1. L'IDENTITÉ EST L'id POCKETBASE, PAS LE NUMÉRO. Le 29 août 2026, sur le
//     delta réel : aucun des 10 documents à reprendre ne portait un id déjà
//     présent chez nous, tandis que QUATRE portaient un numéro déjà attribué
//     (FAC-2026-000107 à 000110) — la base du client fabrique encore des
//     doublons de numéro, 118 numéros pour 236 documents. Reprendre par le
//     numéro aurait donc écrasé ou dédoublé ; reprendre par l'id ne peut rien
//     heurter. C'est aussi ce qui rend l'outil IDEMPOTENT sans mémoire : un
//     second passage retrouve les id et ne trouve plus rien à faire.
//
//  2. LE NUMÉRO, LA SÉQUENCE ET LE HASH NE SE RECOPIENT JAMAIS. Ils sont posés
//     à la création, chez nous, dans NOTRE chaîne — par `numbering.Suivant` et
//     `hash.ComputeDocumentHash`. Recopier un `previous_hash` venu d'une autre
//     chaîne produirait un maillon incohérent SANS AUCUNE ERREUR.
//
//  3. LES RELATIONS SE RÉSOLVENT PAR L'id, ET SEULEMENT PAR LUI. Mesuré :
//     l'avoir AVO-2026-000041 annule `tacc49ewf6nyf46`, un document que nous
//     avons déjà — mais sous un AUTRE numéro depuis la renumérotation du
//     28 août. En conservant l'id, le lien retombe juste ; en recopiant le
//     numéro, il aurait pointé dans le vide.
//
// ── CE QUE CE PAQUET NE FAIT PAS ──────────────────────────────────────────
// Il ne génère aucun rapport Z. La clôture reste `reports.GenerateRapportZ`,
// chemin unique de l'agrégation de caisse : reprendre des documents et les
// clôturer sont deux gestes, et il faut pouvoir dire lequel a échoué.
package reprise

import (
	"fmt"
	"sort"
	"strings"

	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"

	"pocket-react/backend/hash"
	"pocket-react/backend/numbering"
)

// Element est une chose à reprendre, telle qu'on la montre avant de l'écrire.
type Element struct {
	Collection string
	ID         string
	Origine    string // le numéro CHEZ LE CLIENT — indicatif, jamais recopié
	Jour       string // journée commerciale, telle qu'écrite dans la donnée
	TTC        float64
	Libelle    string

	// Attribue est rempli après application : le numéro que NOTRE base a posé.
	Attribue string
}

// Plan est ce que la reprise ferait. Il se lit avant d'écrire quoi que ce soit.
type Plan struct {
	Societe    string
	Du, Au     string
	Clients    []Element
	Documents  []Element
	Mouvements []Element
	Ignores    []Element
	Refus      []string

	// Recalages : des enregistrements DÉJÀ repris dont la date de création ne
	// correspond plus à celle de la source. Cas d'une reprise antérieure qui
	// n'avait pas recopié `created` — voir le commentaire de `copier`.
	Recalages []Element
}

// Vide dit qu'il n'y a rien à reprendre — l'état attendu d'un second passage.
func (p *Plan) Vide() bool {
	return len(p.Clients) == 0 && len(p.Documents) == 0 &&
		len(p.Mouvements) == 0 && len(p.Recalages) == 0
}

// Preparer établit le plan : ce que la source porte en plus de la cible, entre
// deux journées incluses.
//
// `ignorer` contient des numéros de document OU des id, à écarter délibérément.
// C'est une décision de métier, jamais une règle : le 29 août 2026, la facture
// FAC-2026-000107 et l'avoir AVO-2026-000041 ont été écartés parce que le
// client avait facturé deux fois la même vente de 2 000 € et annulé la
// première — celle que nous avons déjà.
func Preparer(
	source, cible *daos.Dao,
	societe, du, au string,
	ignorer map[string]bool,
) (*Plan, error) {
	if societe == "" {
		return nil, fmt.Errorf("société requise")
	}
	if du == "" || au == "" || au < du {
		return nil, fmt.Errorf("période invalide : du %q au %q", du, au)
	}

	p := &Plan{Societe: societe, Du: du, Au: au}

	// ─── Les documents ──────────────────────────────────────────────────────
	docs, err := source.FindRecordsByFilter(
		"invoices",
		fmt.Sprintf(
			"owner_company = '%s' && date >= '%s 00:00:00' && date <= '%s 23:59:59'",
			societe, du, au,
		),
		"sequence_number", 0, 0,
	)
	if err != nil {
		return nil, fmt.Errorf("lecture des documents de la source : %w", err)
	}

	retenus := map[string]bool{}
	clientsVus := map[string]bool{}

	for _, d := range docs {
		numero := d.GetString("number")
		elt := Element{
			Collection: "invoices",
			ID:         d.Id,
			Origine:    numero,
			Jour:       jourDe(d.GetString("date")),
			TTC:        d.GetFloat("total_ttc"),
			Libelle:    d.GetString("invoice_type"),
		}

		if ignorer[numero] || ignorer[d.Id] {
			p.Ignores = append(p.Ignores, elt)
			continue
		}
		if existe(cible, "invoices", d.Id) {
			// Déjà chez nous : c'est l'idempotence. Reste à vérifier que sa date
			// de création n'a pas dérivé — une reprise antérieure a pu la poser
			// à l'instant de l'écriture.
			if e, decale := recalage(cible, "invoices", d, elt); decale {
				p.Recalages = append(p.Recalages, e)
			}
			continue
		}

		p.Documents = append(p.Documents, elt)
		retenus[d.Id] = true

		// Le client du document, s'il nous manque. Un ticket de caisse pointe
		// le client « comptoir », qui existe depuis toujours : en pratique,
		// seules les factures amènent des clients neufs.
		if c := d.GetString("customer"); c != "" && !clientsVus[c] && !existe(cible, "customers", c) {
			clientsVus[c] = true
			cl, err := source.FindRecordById("customers", c)
			if err != nil {
				p.Refus = append(p.Refus, fmt.Sprintf(
					"%s : son client %s est introuvable dans la source", numero, c))
				continue
			}
			p.Clients = append(p.Clients, Element{
				Collection: "customers",
				ID:         cl.Id,
				Origine:    cl.GetString("customer_number"),
				Libelle:    cl.GetString("name"),
			})
		}
	}

	// ─── Les liens qui ne se résoudraient pas ───────────────────────────────
	//
	// On refuse plutôt que de deviner : un avoir dont la facture annulée n'est
	// ni chez nous ni dans le lot pointerait dans le vide, sans erreur.
	for _, d := range docs {
		if !retenus[d.Id] {
			continue
		}
		cible_ := d.GetString("original_invoice_id")
		if cible_ == "" || retenus[cible_] || existe(cible, "invoices", cible_) {
			continue
		}
		p.Refus = append(p.Refus, fmt.Sprintf(
			"%s pointe le document %s, qui n'est ni chez nous ni dans le lot",
			d.GetString("number"), cible_))
	}

	// ─── Les mouvements de caisse ───────────────────────────────────────────
	mvts, err := source.FindRecordsByFilter(
		"cash_movements",
		fmt.Sprintf(
			"owner_company = '%s' && created >= '%s 00:00:00' && created <= '%s 23:59:59'",
			societe, du, au,
		),
		"created", 0, 0,
	)
	if err != nil {
		return nil, fmt.Errorf("lecture des mouvements de la source : %w", err)
	}
	for _, m := range mvts {
		elt := Element{
			Collection: "cash_movements",
			ID:         m.Id,
			Jour:       jourDe(m.GetCreated().String()),
			TTC:        m.GetFloat("amount"),
			Libelle:    m.GetString("movement_type") + " — " + m.GetString("reason"),
		}
		if existe(cible, "cash_movements", m.Id) {
			if e, decale := recalage(cible, "cash_movements", m, elt); decale {
				p.Recalages = append(p.Recalages, e)
			}
			continue
		}
		p.Mouvements = append(p.Mouvements, elt)
	}

	sort.SliceStable(p.Documents, func(i, j int) bool { return p.Documents[i].Jour < p.Documents[j].Jour })

	return p, nil
}

// SessionPourJour rend l'id de la session de caisse à laquelle rattacher les
// tickets d'une journée. L'appelant la fournit — c'est `SessionDuJourLe`, seul
// chemin d'ouverture — pour que ce paquet n'ait pas à connaître les caisses.
type SessionPourJour func(jour string) (string, error)

// Appliquer écrit le plan. L'ordre compte : les clients d'abord (les factures
// les référencent), les documents ensuite dans l'ordre de la source, les
// mouvements en dernier.
func Appliquer(source, cible *daos.Dao, p *Plan, session SessionPourJour) error {
	if len(p.Refus) > 0 {
		return fmt.Errorf("%d lien(s) non résolu(s) : la reprise refuse d'écrire", len(p.Refus))
	}

	// Le recalage d'abord : il ne crée rien, il répare des dates de création
	// laissées à l'instant d'une reprise antérieure.
	for i := range p.Recalages {
		e := &p.Recalages[i]
		src, err := source.FindRecordById(e.Collection, e.ID)
		if err != nil {
			return fmt.Errorf("recalage %s : introuvable dans la source : %w", e.ID, err)
		}
		chez, err := cible.FindRecordById(e.Collection, e.ID)
		if err != nil {
			return fmt.Errorf("recalage %s : introuvable chez nous : %w", e.ID, err)
		}
		chez.Set("created", src.GetCreated())
		if err := cible.SaveRecord(chez); err != nil {
			return fmt.Errorf("recalage %s : %w", e.ID, err)
		}
	}

	for i := range p.Clients {
		if err := copier(source, cible, "customers", p.Clients[i].ID, nil); err != nil {
			return fmt.Errorf("client %s : %w", p.Clients[i].Origine, err)
		}
	}

	for i := range p.Documents {
		e := &p.Documents[i]
		err := copier(source, cible, "invoices", e.ID, func(rec *models.Record, src *models.Record) error {
			// Un ticket se rattache à la session de SA journée chez nous, pas à
			// celle du client : la sienne est close et scellée dans un de nos Z.
			// GenerateRapportZ ne retient que les sessions fermées DANS la
			// journée du rapport (cash_reports.go:1490-1496) — un mauvais
			// rattachement sortirait le ticket de toute clôture, sans erreur.
			if src.GetString("session") != "" {
				if session == nil {
					return fmt.Errorf("aucune session fournie pour le %s", e.Jour)
				}
				id, err := session(e.Jour)
				if err != nil {
					return err
				}
				rec.Set("session", id)
			}
			return sceller(cible, rec)
		})
		if err != nil {
			return fmt.Errorf("document %s : %w", e.Origine, err)
		}
		if rec, err := cible.FindRecordById("invoices", e.ID); err == nil {
			e.Attribue = rec.GetString("number")
		}
	}

	dansLeLot := map[string]bool{}
	for _, d := range p.Documents {
		dansLeLot[d.ID] = true
	}

	for i := range p.Mouvements {
		e := &p.Mouvements[i]
		err := copier(source, cible, "cash_movements", e.ID, func(rec *models.Record, src *models.Record) error {
			// ── À QUELLE SESSION RATTACHER UN MOUVEMENT ──────────────────────
			//
			// Deux cas, et la donnée les sépare d'elle-même :
			//
			//  1. Le mouvement accompagne un document du lot (`related_invoice`)
			//     — un encaissement espèces. Il DOIT tomber dans la même session
			//     que lui, donc dans le même Z, sinon le tiroir et la clôture se
			//     contrediraient. Mesuré le 29 août 2026 : le mouvement de 1,70 €
			//     du 25/08 accompagne le ticket TIK-2026-000830.
			//
			//  2. Le mouvement est un geste de tiroir (dépôt en banque, apport).
			//     Il garde la session de la source dès lors que nous l'avons —
			//     y compris une session déjà scellée dans un de nos Z. C'est sans
			//     danger : `total_cash_expected` n'entre PAS dans le hash
			//     (backend/reports/z_repair.go:189-196), un `z-repair -apply` le
			//     corrige sans rescellement. Mesuré : le dépôt banque de 100 €
			//     du 22/08 appartient à la session que notre Z-060 couvre déjà.
			//     Lui inventer une session neuve créerait une journée de clôture
			//     qui n'a jamais existé.
			suitSonDocument := dansLeLot[src.GetString("related_invoice")]
			sessionSource := src.GetString("session")

			if !suitSonDocument && sessionSource != "" && existe(cible, "cash_sessions", sessionSource) {
				rec.Set("session", sessionSource)
				return nil
			}
			if sessionSource == "" {
				return nil
			}
			if session == nil {
				return fmt.Errorf("aucune session fournie pour le %s", e.Jour)
			}
			id, err := session(e.Jour)
			if err != nil {
				return err
			}
			rec.Set("session", id)
			return nil
		})
		if err != nil {
			return fmt.Errorf("mouvement %s : %w", e.ID, err)
		}
	}

	return nil
}

// copier recrée un enregistrement dans la cible, EN CONSERVANT SON id, puis
// laisse `ajuster` poser ce qui doit l'être avant l'écriture.
func copier(
	source, cible *daos.Dao,
	collection, id string,
	ajuster func(rec, src *models.Record) error,
) error {
	if existe(cible, collection, id) {
		return nil // idempotence : déjà repris
	}

	src, err := source.FindRecordById(collection, id)
	if err != nil {
		return fmt.Errorf("introuvable dans la source : %w", err)
	}

	col, err := cible.FindCollectionByNameOrId(collection)
	if err != nil {
		return fmt.Errorf("collection %s absente de la cible : %w", collection, err)
	}

	rec := models.NewRecord(col)
	rec.SetId(src.Id)
	for _, f := range col.Schema.Fields() {
		rec.Set(f.Name, src.Get(f.Name))
	}

	// ⚠️ `created` DOIT être recopié explicitement. PocketBase ne le repose que
	// s'il est vide (daos/base.go:317, « if m.GetCreated().IsZero() ») : sans
	// cette ligne, tout enregistrement repris porte l'instant de la reprise.
	// Sans conséquence sur un document — le Z, le journal et le hash lisent
	// `date` — mais un MOUVEMENT DE CAISSE est daté par `created` : les deux
	// mouvements repris le 29 août 2026 se sont retrouvés au 29 dans le journal
	// des espèces, au lieu du 22 et du 25.
	rec.Set("created", src.GetCreated())

	// Ce qui appartient à NOTRE chaîne, jamais à la sienne.
	if collection == "invoices" {
		rec.Set("number", "")
		rec.Set("sequence_number", 0)
		rec.Set("hash", "")
		rec.Set("previous_hash", "")
	}

	if ajuster != nil {
		if err := ajuster(rec, src); err != nil {
			return err
		}
	}

	return cible.SaveRecord(rec)
}

// sceller pose le chaînage, le numéro et le hash — dans cet ordre, et le hash
// en dernier parce qu'il porte sur les trois autres.
//
// Aucune règle n'est réécrite ici : la numérotation vient de `backend/numbering`
// et le hachage de `backend/hash`. Ce sont les deux paquets partagés, et ils
// existent précisément pour qu'un second chemin ne dise jamais autre chose.
func sceller(dao *daos.Dao, rec *models.Record) error {
	societe := rec.GetString("owner_company")
	if societe == "" {
		return fmt.Errorf("owner_company vide : scellement impossible")
	}

	prev, seq := derniereChaine(dao, societe)
	rec.Set("previous_hash", prev)
	rec.Set("sequence_number", seq)

	exercice := rec.GetInt("fiscal_year")
	if exercice == 0 {
		return fmt.Errorf("fiscal_year vide : série indéterminable")
	}

	serie := numbering.Serie(prefixeDe(rec), exercice)
	numero, err := numbering.Suivant(dao, "invoices",
		numbering.Filtre(societe, exercice, serie), serie)
	if err != nil {
		return err
	}
	rec.Set("number", numero)

	rec.Set("hash", hash.ComputeDocumentHash(rec))
	rec.Set("is_locked", true)
	rec.Set("_skip_hook_processing", true)

	return nil
}

// prefixeDe rend la série d'un document, aux mêmes conditions que
// `generateDocumentNumber` (backend/hooks/invoice_hooks.go:838-845).
func prefixeDe(rec *models.Record) string {
	switch {
	case rec.GetString("invoice_type") == "credit_note":
		return "AVO"
	case rec.GetString("invoice_type") == "deposit":
		return "ACC"
	case rec.GetBool("is_pos_ticket") || rec.GetString("cash_register") != "":
		return "TIK"
	default:
		return "FAC"
	}
}

// derniereChaine rend le dernier maillon de la chaîne de la société.
//
// ⚠️ La chaîne est GLOBALE, tickets de caisse compris : `getLastInvoice`
// (backend/hooks/invoice_hooks.go:1287) ne filtre que sur `owner_company`.
// Mesuré le 28 août 2026 : la chaîne globale portait 1 maillon rompu sur 1198,
// celle « sans tickets POS » en portait 209 — c'est la première qui existe.
func derniereChaine(dao *daos.Dao, societe string) (string, int) {
	records, err := dao.FindRecordsByFilter(
		"invoices",
		fmt.Sprintf("owner_company = '%s' && sequence_number > 0", societe),
		"-sequence_number", 1, 0,
	)
	if err != nil || len(records) == 0 {
		return hash.GENESIS_HASH, 1
	}
	return records[0].GetString("hash"), records[0].GetInt("sequence_number") + 1
}

// recalage dit si un enregistrement déjà repris porte une date de création qui
// a dérivé de celle de la source, et prépare de quoi le montrer.
func recalage(cible *daos.Dao, collection string, src *models.Record, elt Element) (Element, bool) {
	chez, err := cible.FindRecordById(collection, src.Id)
	if err != nil {
		return elt, false
	}

	avant, apres := chez.GetCreated().String(), src.GetCreated().String()
	if jourDe(avant) == jourDe(apres) {
		return elt, false
	}

	elt.Collection = collection
	elt.Attribue = chez.GetString("number")
	elt.Libelle = fmt.Sprintf("créé le %s chez nous, le %s chez lui",
		jourDe(avant), jourDe(apres))
	return elt, true
}

func existe(dao *daos.Dao, collection, id string) bool {
	if id == "" {
		return false
	}
	rec, err := dao.FindRecordById(collection, id)
	return err == nil && rec != nil
}

// jourDe rend la journée telle qu'elle est ÉCRITE, sans conversion de fuseau :
// on compare des chaînes de même échelle, on ne réinterprète pas un instant.
func jourDe(brut string) string {
	if len(brut) < 10 {
		return ""
	}
	return brut[:10]
}

// Journees rend les journées couvertes par les documents du plan, triées.
// C'est la liste des Z à générer ensuite.
func (p *Plan) Journees() []string {
	vues := map[string]bool{}
	var jours []string
	for _, d := range p.Documents {
		if d.Jour != "" && !vues[d.Jour] {
			vues[d.Jour] = true
			jours = append(jours, d.Jour)
		}
	}
	sort.Strings(jours)
	return jours
}

// Resume rend le plan en texte, pour la simulation comme pour le compte rendu.
func (p *Plan) Resume() string {
	var b strings.Builder

	fmt.Fprintf(&b, "Période      : du %s au %s\n", p.Du, p.Au)
	fmt.Fprintf(&b, "Clients      : %d\n", len(p.Clients))
	fmt.Fprintf(&b, "Documents    : %d\n", len(p.Documents))
	fmt.Fprintf(&b, "Mouvements   : %d\n", len(p.Mouvements))
	if len(p.Ignores) > 0 {
		fmt.Fprintf(&b, "Écartés      : %d\n", len(p.Ignores))
	}
	if len(p.Recalages) > 0 {
		fmt.Fprintf(&b, "À recaler    : %d (date de création)\n", len(p.Recalages))
	}

	if len(p.Recalages) > 0 {
		b.WriteString("\nDATES DE CRÉATION À RECALER  (déjà repris, mais datés de la reprise)\n")
		for _, e := range p.Recalages {
			nom := e.Attribue
			if nom == "" {
				nom = e.ID
			}
			fmt.Fprintf(&b, "  %-16s %-16s %s\n", nom, e.Collection, e.Libelle)
		}
	}

	if len(p.Clients) > 0 {
		b.WriteString("\nCLIENTS\n")
		for _, e := range p.Clients {
			fmt.Fprintf(&b, "  %-12s %s\n", e.Origine, e.Libelle)
		}
	}

	if len(p.Documents) > 0 {
		b.WriteString("\nDOCUMENTS  (le numéro de gauche est celui du CLIENT ; le nôtre est posé à la création)\n")
		var total float64
		for _, e := range p.Documents {
			attribue := "→ à attribuer"
			if e.Attribue != "" {
				attribue = "→ " + e.Attribue
			}
			fmt.Fprintf(&b, "  %s  %-16s %-12s %10.2f €  %s\n",
				e.Jour, e.Origine, e.Libelle, e.TTC, attribue)
			total += e.TTC
		}
		fmt.Fprintf(&b, "  %54s %10.2f €\n", "TOTAL TTC", total)
	}

	if len(p.Mouvements) > 0 {
		b.WriteString("\nMOUVEMENTS DE CAISSE\n")
		for _, e := range p.Mouvements {
			fmt.Fprintf(&b, "  %s  %10.2f €  %s\n", e.Jour, e.TTC, e.Libelle)
		}
	}

	if len(p.Ignores) > 0 {
		b.WriteString("\nÉCARTÉS DÉLIBÉRÉMENT\n")
		for _, e := range p.Ignores {
			fmt.Fprintf(&b, "  %s  %-16s %10.2f €\n", e.Jour, e.Origine, e.TTC)
		}
	}

	if len(p.Refus) > 0 {
		b.WriteString("\n⛔ LIENS NON RÉSOLUS — la reprise refusera d'écrire\n")
		for _, r := range p.Refus {
			fmt.Fprintf(&b, "  %s\n", r)
		}
	}

	return b.String()
}
