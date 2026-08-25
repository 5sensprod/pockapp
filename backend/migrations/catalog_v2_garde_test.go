// backend/migrations/catalog_v2_garde_test.go
// ═══════════════════════════════════════════════════════════════════════════
// GARDIEN — une seule garde, et c'est celle du chargeur
// ═══════════════════════════════════════════════════════════════════════════
//
// `MigrateCatalogV2` supprime cinq collections puis les recrée. La question
// « a-t-on le droit ? » est exactement celle que `load.Inspect` pose avant une
// purge, et elle ne doit avoir qu'une réponse.
//
// Elle en a eu deux, et c'est ce que ce fichier empêche de revenir. La garde
// locale de la migration ne testait que `legacy_id = ” OR legacy_id IS NULL`.
// Un produit né en caisse porte `pa_…` — non vide — donc il passait, et la
// migration le détruisait, alors que `guard.go` le protège nommément. Le défaut
// était doublement silencieux : les deux gardes annonçaient « reconstructible »,
// et celle qui se trompait s'exécute au DÉMARRAGE, là où l'autre demande
// `-force-purge` écrit à la main.
//
// ── Ce que ce test vaut, et ce qu'il ne vaut pas ───────────────────────────
//
// Il lit le SOURCE. Il ne monte pas de PocketBase et ne prouve donc pas que la
// migration refuse effectivement une base vivante — c'est `guard_test.go` qui
// couvre la décision elle-même, sur `Findings`.
//
// Ce qu'il prouve est plus étroit et suffit à tenir la règle : la migration
// délègue à `load.Inspect`, et n'a pas reconstitué un critère concurrent. C'est
// précisément la forme qu'avait le défaut — un second jugement, plausible et
// faux, à côté du bon.
package migrations

import (
	"bytes"
	"go/parser"
	"go/printer"
	"go/token"
	"strings"
	"testing"
)

const sourceCatalogV2 = "catalog_v2.go"

// lireSource rend le CODE de catalog_v2.go, commentaires exclus.
//
// L'exclusion n'est pas un raffinement : ce fichier-ci décrit le défaut en
// citant le critère fautif mot pour mot, et l'en-tête de catalog_v2.go en fait
// autant. Une recherche sur le texte brut retrouverait ces citations et
// échouerait sur une prose parfaitement correcte. On parse donc, et on
// réimprime sans les commentaires — ce qui reste est ce que la machine exécute.
func lireSource(t *testing.T) string {
	t.Helper()
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, sourceCatalogV2, nil, 0) // 0 : sans commentaires
	if err != nil {
		t.Fatalf("analyse de %s: %v", sourceCatalogV2, err)
	}
	var b bytes.Buffer
	if err := printer.Fprint(&b, fset, f); err != nil {
		t.Fatalf("réimpression de %s: %v", sourceCatalogV2, err)
	}
	return b.String()
}

func TestLaMigrationDelegueAuChargeurPourDeciderDeLaPurge(t *testing.T) {
	src := lireSource(t)

	if !strings.Contains(src, "load.Inspect(") {
		t.Fatal("MigrateCatalogV2 doit demander à load.Inspect si la base est " +
			"reconstructible : c'est la garde qui connaît les entités « pa_… »")
	}
	if !strings.Contains(src, "findings.Blocks()") {
		t.Fatal("le verdict de load.Inspect doit être consulté (Blocks), " +
			"pas seulement calculé")
	}
	if !strings.Contains(src, "findings.Explain()") {
		t.Fatal("le refus doit NOMMER ce qui serait perdu (Explain) : un " +
			"« refusé » sec ne dit pas à l'opérateur quoi faire")
	}
}

func TestLaMigrationNeRejugePasLaCleStableElleMeme(t *testing.T) {
	// Le critère qui a produit le défaut, mot pour mot. Le laisser DÉCIDER
	// seul est l'erreur ; il ne subsiste que comme contrôle secondaire, après
	// le verdict de load.Inspect.
	src := lireSource(t)

	i := strings.Index(src, "load.Inspect(")
	if i < 0 {
		t.Fatal("load.Inspect absent : voir TestLaMigrationDelegueAuChargeur…")
	}
	if j := strings.Index(src[:i], "legacy_id = '' OR legacy_id IS NULL"); j >= 0 {
		t.Fatal("un test local sur `legacy_id` vide s'exécute AVANT load.Inspect : " +
			"c'est le critère qui laissait passer les entités « pa_… ». " +
			"La garde du chargeur doit trancher la première")
	}
}

func TestLaGardeSExecuteAvantTouteSuppression(t *testing.T) {
	// L'ordre est le mécanisme entier : inspecter après un DeleteCollection ne
	// protège plus rien, et le test passerait quand même.
	src := lireSource(t)

	garde := strings.Index(src, "load.Inspect(")
	suppression := strings.Index(src, "DeleteCollection(")
	switch {
	case garde < 0:
		t.Fatal("load.Inspect absent")
	case suppression < 0:
		t.Fatal("DeleteCollection introuvable : la migration a changé de forme, " +
			"ce gardien est à réécrire plutôt qu'à supprimer")
	case garde > suppression:
		t.Fatal("load.Inspect est appelé APRÈS DeleteCollection : " +
			"la garde ne protège plus rien")
	}
}
