// backend/migrations/ordre_test.go
// ═══════════════════════════════════════════════════════════════════════════
// GARDIEN — une migration s'inscrit, et elle s'inscrit AU BON RANG
// ═══════════════════════════════════════════════════════════════════════════
//
// Deux façons d'écrire une migration parfaitement correcte qui ne fait rien, et
// aucune des deux ne produit d'erreur :
//
//  1. NE PAS L'INSCRIRE dans la liste de `RunMigrations`. Elle compile, elle
//     est testée, elle n'est jamais appelée.
//  2. L'INSCRIRE TROP TÔT. `MigrateCatalogV2` supprime puis recrée `products` :
//     un champ ajouté avant elle part avec la collection. Le démarrage est
//     propre, les journaux sont verts, et le champ n'existe pas.
//
// Le second cas est le plus traître, parce que le code s'exécute vraiment — il
// travaille, puis son travail est effacé une ligne plus loin.
//
// Ce fichier lit le CODE de `RunMigrations`, commentaires exclus (voir
// `lireSourceSansCommentaires`) : la prose ci-dessus nomme les fonctions
// surveillées, et une recherche sur le texte brut se retrouverait elle-même.
package migrations

import (
	"bytes"
	"go/parser"
	"go/printer"
	"go/token"
	"strings"
	"testing"
)

// lireSourceSansCommentaires rend le code d'un fichier du paquet, sans sa
// documentation. Voir catalog_v2_garde_test.go pour le pourquoi détaillé.
func lireSourceSansCommentaires(t *testing.T, fichier string) string {
	t.Helper()
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, fichier, nil, 0)
	if err != nil {
		t.Fatalf("analyse de %s: %v", fichier, err)
	}
	var b bytes.Buffer
	if err := printer.Fprint(&b, fset, f); err != nil {
		t.Fatalf("réimpression de %s: %v", fichier, err)
	}
	// go/printer ALIGNE les champs d'un littéral avec des tabulations, et
	// l'alignement dépend du plus long voisin : `Name: "x"` s'imprime
	// `Name:\t"x"` dès qu'un champ plus large l'accompagne. Chercher un motif
	// écrit avec une espace échouerait alors sur du code parfaitement correct —
	// et se remettrait à passer si l'on renommait un champ voisin. On réduit
	// donc toute suite de blancs à une espace : le test juge la structure, pas
	// la colonne où elle a atterri.
	return espacesReduites(b.String())
}

func espacesReduites(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	blanc := false
	for _, r := range s {
		if r == ' ' || r == '\t' || r == '\n' || r == '\r' {
			blanc = true
			continue
		}
		if blanc && b.Len() > 0 {
			b.WriteByte(' ')
		}
		blanc = false
		b.WriteRune(r)
	}
	return b.String()
}

// apresCatalogV2 — les migrations qui touchent une collection que
// MigrateCatalogV2 recrée, et qui doivent donc passer APRÈS elle.
//
// Toute migration nouvelle qui altère products, categories, brands, suppliers
// ou external_refs s'ajoute ici. C'est le seul endroit où la contrainte est
// écrite ; la liste de RunMigrations, elle, ne dit pas pourquoi son ordre est
// ce qu'il est.
var apresCatalogV2 = []string{
	"FixSupplierJsonMaxSize",
	"AddCommercialStateToProducts",
}

func TestLesMigrationsDuCatalogueSontInscritesEtApresLaRecreation(t *testing.T) {
	src := lireSourceSansCommentaires(t, "migrations.go")

	recreation := strings.Index(src, "MigrateCatalogV2,")
	if recreation < 0 {
		t.Fatal("MigrateCatalogV2 n'est plus inscrite dans RunMigrations : " +
			"le catalogue ne serait jamais porté au schéma cible")
	}

	for _, nom := range apresCatalogV2 {
		t.Run(nom, func(t *testing.T) {
			i := strings.Index(src, nom+",")
			if i < 0 {
				t.Fatalf("%s n'est pas inscrite dans RunMigrations. Une migration "+
					"non inscrite ne s'exécute JAMAIS, et sans erreur : rien ne "+
					"signalera que le champ manque", nom)
			}
			if i < recreation {
				t.Fatalf("%s est inscrite AVANT MigrateCatalogV2, qui supprime puis "+
					"recrée la collection : son travail serait effacé au démarrage "+
					"suivant, sans erreur", nom)
			}
		})
	}
}

func TestLEtatCommercialEstUnChampDuProduitEtNonUneCategorie(t *testing.T) {
	// Décision du 24 août 2026. Ce que le test tient, c'est la FORME de la
	// décision — un select mono-valeur sur `products`, sans obligation —
	// parce que c'est elle qui porte le raisonnement : l'absence vaut « neuf »,
	// et rien ne s'est jamais présenté en occasion ET en location.
	src := lireSourceSansCommentaires(t, "add_commercial_state_to_products.go")

	if !strings.Contains(src, `Name: "commercial_state"`) {
		t.Fatal("le champ doit s'appeler commercial_state : c'est ce nom que " +
			"les tables de backend/catalog/mapping visent")
	}
	if !strings.Contains(src, "FieldTypeSelect") {
		t.Fatal("commercial_state doit être un select : un texte libre laisserait " +
			"« occasion », « Occasion » et « OCCASION » coexister")
	}
	if !strings.Contains(src, "MaxSelect: 1") {
		t.Fatal("MaxSelect doit valoir 1 : aucun produit n'est à la fois en " +
			"occasion et en location (0 sur 3055 mesurés le 24/08/2026)")
	}
	if strings.Contains(src, "Required: true") {
		t.Fatal("commercial_state ne doit PAS être obligatoire : l'absence de " +
			"valeur VEUT DIRE neuf, et c'est le cas de 3036 produits sur 3055")
	}
	for _, v := range CommercialStateValues {
		if !strings.Contains(src, `"`+v+`"`) {
			t.Fatalf("la valeur %q est annoncée par CommercialStateValues mais "+
				"n'est pas dans le schéma", v)
		}
	}
}
