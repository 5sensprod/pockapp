// backend/renumbering — la règle de renumérotation des documents en double.
//
// ── POURQUOI CE PAQUET EXISTE ─────────────────────────────────────────────
// Deux commandes ont besoin du MÊME plan : `facture-doublons`, qui le montre
// sans rien écrire, et `facture-renumeroter`, qui l'exécute. Écrire la règle
// deux fois, c'est accepter qu'un jour l'une renumérote autrement que ce que
// l'autre annonçait — sur des documents fiscaux déjà remis à des clients.
// C'est la même consigne que pour l'agrégation de la caisse (`aggregateZ`) et
// pour la numérotation (`backend/numbering`), et pour la même raison.
//
// ── LA RÈGLE ──────────────────────────────────────────────────────────────
// Dans un groupe de documents partageant un numéro, celui au PLUS PETIT
// `sequence_number` GARDE son numéro : c'est le premier émis, celui que le
// client a déjà reçu. Les autres sont renumérotés à la SUITE de leur série,
// dans l'ordre de leur séquence — jamais sur un numéro déjà sorti, même
// libéré.
//
// ⚠️ `number` entre dans le hash (backend/hash/hash.go:93) et la chaîne est
// GLOBALE : `getLastInvoice` (backend/hooks/invoice_hooks.go:1287) ne filtre
// que sur `owner_company` et trie sur `-sequence_number`, tickets compris.
// Mesuré le 28/08/2026 sur la base de production : la chaîne globale porte
// 1 maillon rompu sur 1198, celle « sans tickets POS » en porte 209 — c'est
// la première qui existe. Renuméroter impose donc de rehacher par
// `hash.MigrateRecalculateAllHashes`, qui suit cette chaîne-là, et NON par
// `migrate_invoices_only.go`, qui exclut les tickets et travaille sur une
// chaîne fictive.
package renumbering

import (
	"fmt"
	"sort"
)

// Padding est la largeur du compteur : FAC-2026-000105.
// Même valeur que numbering.Padding.
const Padding = 6

// Doc est le strict nécessaire pour établir le plan.
type Doc struct {
	ID       string
	Number   string
	Serie    string // "FAC-2026-"
	Rang     int    // 105
	Seq      int    // sequence_number
	Company  string
	Exercice int
	Statut   string
	Cree     string
	TTC      float64
}

// Mouvement dit qu'un document change de numéro.
type Mouvement struct {
	Doc     Doc
	Nouveau string
}

// Plan rend les documents à renuméroter, dans l'ordre de leur séquence.
//
// `docs` doit porter TOUS les documents numérotés de la base — pas seulement
// les doublons : les plafonds de série s'en déduisent, et attribuer un numéro
// sans connaître le plus haut atteint en recréerait un.
func Plan(docs []Doc) []Mouvement {
	plafond := Plafonds(docs)

	parNumero := map[string][]Doc{}
	for _, d := range docs {
		if d.Number == "" {
			continue
		}
		cle := d.Company + "|" + d.Number
		parNumero[cle] = append(parNumero[cle], d)
	}

	var aDeplacer []Doc
	for _, g := range parNumero {
		if len(g) < 2 {
			continue
		}
		sort.Slice(g, func(i, j int) bool { return g[i].Seq < g[j].Seq })
		// Le plus petit `sequence_number` garde son numéro.
		aDeplacer = append(aDeplacer, g[1:]...)
	}
	sort.Slice(aDeplacer, func(i, j int) bool {
		if aDeplacer[i].Seq != aDeplacer[j].Seq {
			return aDeplacer[i].Seq < aDeplacer[j].Seq
		}
		return aDeplacer[i].ID < aDeplacer[j].ID
	})

	compteur := map[string]int{}
	out := make([]Mouvement, 0, len(aDeplacer))
	for _, d := range aDeplacer {
		k := Cle(d.Company, d.Exercice, d.Serie)
		if _, vu := compteur[k]; !vu {
			compteur[k] = plafond[k]
		}
		compteur[k]++
		out = append(out, Mouvement{Doc: d, Nouveau: Composer(d.Serie, compteur[k])})
	}
	return out
}

// Plafonds rend, par série, le plus grand rang atteint.
func Plafonds(docs []Doc) map[string]int {
	plafond := map[string]int{}
	for _, d := range docs {
		if d.Serie == "" {
			continue
		}
		k := Cle(d.Company, d.Exercice, d.Serie)
		if d.Rang > plafond[k] {
			plafond[k] = d.Rang
		}
	}
	return plafond
}

// Cle identifie une série dans une partition.
func Cle(company string, exercice int, serie string) string {
	return fmt.Sprintf("%s|%d|%s", company, exercice, serie)
}

// Composer rend "FAC-2026-000106" pour ("FAC-2026-", 106).
func Composer(serie string, rang int) string {
	return fmt.Sprintf("%s%0*d", serie, Padding, rang)
}

// SeqMin rend le plus petit `sequence_number` touché par le plan, ou -1.
// C'est à partir de lui que la chaîne de hachage est rompue.
func SeqMin(plan []Mouvement) int {
	min := -1
	for _, m := range plan {
		if min == -1 || m.Doc.Seq < min {
			min = m.Doc.Seq
		}
	}
	return min
}
