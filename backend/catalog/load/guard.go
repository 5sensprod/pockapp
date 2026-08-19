// backend/catalog/load/guard.go
// ═══════════════════════════════════════════════════════════════════════════
// LA GARDE — ce qui empêche le rechargement d'effacer une base vivante
// ═══════════════════════════════════════════════════════════════════════════
//
// Le chargeur purge les quatre collections avant d'écrire (voir l'en-tête de
// loader.go). C'était sans risque tant que PocketBase n'était qu'une
// PROJECTION de NeDB : tout ce qu'on effaçait, NeDB le portait encore.
//
// **Ce n'est plus vrai depuis le 19 août 2026.** La caisse crée ses produits
// ici, l'inventaire y écrit ses comptages, les ventes y décrémentent leur
// stock. Une purge détruirait désormais des données qui n'existent nulle part
// ailleurs — sans avertissement, en une commande.
//
// D'où cette garde. Elle ne rend pas la purge impossible : une installation
// neuve doit pouvoir charger son catalogue. Elle la rend **impossible par
// accident**, en cherchant d'abord les trois traces d'une base vivante :
//
//   1. des entités NÉES ICI — `legacy_id` préfixé `pa_`, la clé stable que
//      PocketApp génère (DECISIONS, 2026-08-13) ;
//   2. des MOUVEMENTS DE STOCK locaux — vente, comptage d'inventaire, retour,
//      journalisés dans `product_events` ;
//   3. des DOCUMENTS qui citent des produits — tickets, factures, devis : les
//      purger laisserait des lignes pointant vers des identifiants disparus.
//
// Si l'une des trois est trouvée, le chargement s'arrête et dit quoi. Passer
// outre demande `-force-purge`, écrit à la main, en connaissance de cause.

package load

import (
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/daos"
)

// Findings est ce que la garde a trouvé d'irremplaçable dans la base.
type Findings struct {
	// CreatedHere compte les entités dont la clé stable a été générée par
	// PocketApp, par collection.
	CreatedHere map[string]int
	// StockEvents compte les mouvements de stock locaux, par source.
	StockEvents map[string]int
	// Documents compte les pièces qui citent des produits, par collection.
	Documents map[string]int
}

// Blocks dit si le contenu trouvé interdit une purge non forcée.
func (f Findings) Blocks() bool {
	return f.total() > 0
}

func (f Findings) total() int {
	n := 0
	for _, m := range []map[string]int{f.CreatedHere, f.StockEvents, f.Documents} {
		for _, v := range m {
			n += v
		}
	}
	return n
}

// Explain rend le message affiché à l'opérateur. Il nomme ce qui serait perdu
// plutôt que de dire « refusé » : c'est le décompte qui décide, pas l'outil.
func (f Findings) Explain() string {
	if !f.Blocks() {
		return "Base reconstructible : aucune donnée née ici, aucun mouvement, aucun document."
	}

	var b strings.Builder
	b.WriteString("REFUS — cette base porte des données que NeDB ne contient pas :\n")

	writeSection := func(titre string, m map[string]int) {
		if len(m) == 0 {
			return
		}
		lignes := make([]string, 0, len(m))
		for k, v := range m {
			if v > 0 {
				lignes = append(lignes, fmt.Sprintf("     %-22s %6d", k, v))
			}
		}
		if len(lignes) == 0 {
			return
		}
		sortStrings(lignes)
		b.WriteString("\n   " + titre + "\n")
		b.WriteString(strings.Join(lignes, "\n") + "\n")
	}

	writeSection("Entités créées dans PocketApp (legacy_id « pa_… ») :", f.CreatedHere)
	writeSection("Mouvements de stock locaux (product_events) :", f.StockEvents)
	writeSection("Documents citant des produits :", f.Documents)

	b.WriteString("\n   Une purge les détruirait, et rien ne les reconstruirait :\n")
	b.WriteString("   NeDB ne les a jamais eus.\n\n")
	b.WriteString("   Pour recharger malgré tout — installation neuve, base de test —\n")
	b.WriteString("   relancer avec -force-purge. La commande dira ce qu'elle efface.\n")
	return b.String()
}

// sortStrings trie sans importer sort dans le chemin chaud du message.
func sortStrings(s []string) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j] < s[j-1]; j-- {
			s[j], s[j-1] = s[j-1], s[j]
		}
	}
}

// collectionsWithLegacyKey — celles que la purge vide et qui portent une clé
// stable. `external_refs` n'en a pas : elle est reconstruite avec le reste.
var collectionsWithLegacyKey = []string{"products", "categories", "brands", "suppliers"}

// legacyKeyExpr reconnaît les clés stables générées par PocketApp.
//
// ⚠️ L'ESCAPE n'est pas décoratif : sans lui, `_` est un JOKER, et
// « PAz78WYfCpbSWJay » — un identifiant NeDB parfaitement ordinaire — passerait
// pour une entité née ici. La garde bloquerait alors une base reconstructible.
// Constaté sur la base réelle le 19 août 2026.
const legacyKeyExpr = `legacy_id LIKE 'pa\_%' ESCAPE '\'`

// documentsCitingProducts — les pièces dont les lignes citent un produit.
var documentsCitingProducts = []string{"invoices", "quotes", "orders"}

// Inspect compte ce qui serait perdu. Chaque décompte est fait séparément :
// une collection absente d'une installation ancienne ne doit pas faire échouer
// l'inspection, elle vaut zéro.
func Inspect(dao *daos.Dao) (Findings, error) {
	f := Findings{
		CreatedHere: map[string]int{},
		StockEvents: map[string]int{},
		Documents:   map[string]int{},
	}

	for _, name := range collectionsWithLegacyKey {
		n, err := countRows(dao, name, dbx.NewExp(legacyKeyExpr))
		if err != nil {
			return f, err
		}
		if n > 0 {
			f.CreatedHere[name] = n
		}
	}

	// Les quatre motifs de `stock-adjust.ts`, plus l'ancien `manual`. On ne
	// compte PAS `import` ni `apppos_sync` : ceux-là se reconstruisent.
	for _, source := range []string{"sale", "inventory_session", "return", "manual"} {
		n, err := countRows(dao, "product_events", dbx.NewExp("source = {:s}", dbx.Params{"s": source}))
		if err != nil {
			return f, err
		}
		if n > 0 {
			f.StockEvents[source] = n
		}
	}

	for _, name := range documentsCitingProducts {
		n, err := countRows(dao, name, nil)
		if err != nil {
			return f, err
		}
		if n > 0 {
			f.Documents[name] = n
		}
	}

	return f, nil
}

// countRows compte, et rend 0 sans erreur si la table n'existe pas : une base
// installée avant l'ajout d'une collection est un cas normal, pas une panne.
func countRows(dao *daos.Dao, table string, where dbx.Expression) (int, error) {
	q := dao.DB().Select("COUNT(*)").From(table)
	if where != nil {
		q = q.Where(where)
	}
	var n int
	if err := q.Row(&n); err != nil {
		if strings.Contains(err.Error(), "no such table") {
			return 0, nil
		}
		return 0, fmt.Errorf("inspection de %q: %w", table, err)
	}
	return n, nil
}
