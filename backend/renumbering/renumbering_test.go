package renumbering

import "testing"

func doc(id, number, serie string, rang, seq int) Doc {
	return Doc{ID: id, Number: number, Serie: serie, Rang: rang, Seq: seq,
		Company: "co1", Exercice: 2026}
}

// Le premier émis garde son numéro.
//
// C'est la seule règle qui ne se discute pas : le document au plus petit
// `sequence_number` est celui que le client a déjà reçu, avec ce numéro-là
// imprimé dessus. Renuméroter celui-là ferait diverger le papier et la base.
func TestLePremierEmisGardeSonNumero(t *testing.T) {
	docs := []Doc{
		doc("a", "FAC-2026-000001", "FAC-2026-", 1, 10),
		doc("b", "FAC-2026-000001", "FAC-2026-", 1, 900),
		doc("c", "FAC-2026-000173", "FAC-2026-", 173, 800),
	}
	plan := Plan(docs)
	if len(plan) != 1 {
		t.Fatalf("%d mouvement(s), attendu 1", len(plan))
	}
	if plan[0].Doc.ID != "b" {
		t.Errorf("renuméroté : %q, attendu \"b\" — le plus petit seq garde son numéro",
			plan[0].Doc.ID)
	}
	if plan[0].Nouveau != "FAC-2026-000174" {
		t.Errorf("nouveau numéro = %q, attendu FAC-2026-000174 (plafond 173 + 1)",
			plan[0].Nouveau)
	}
}

// Un numéro déjà sorti n'est JAMAIS réattribué, même libéré.
//
// La tentation serait de combler les trous de la série. Un numéro remis à un
// client lui appartient : le rendre à un autre document produirait deux pièces
// différentes portant la même référence chez deux clients — exactement ce
// qu'on répare.
func TestOnNeComblePasLesTrous(t *testing.T) {
	docs := []Doc{
		doc("a", "FAC-2026-000001", "FAC-2026-", 1, 1),
		doc("b", "FAC-2026-000001", "FAC-2026-", 1, 2),
		doc("c", "FAC-2026-000002", "FAC-2026-", 2, 3),
		doc("d", "FAC-2026-000002", "FAC-2026-", 2, 4),
		// 000003 et 000004 n'existent pas : ce sont des trous.
		doc("e", "FAC-2026-000005", "FAC-2026-", 5, 5),
	}
	plan := Plan(docs)
	if len(plan) != 2 {
		t.Fatalf("%d mouvement(s), attendu 2", len(plan))
	}
	if plan[0].Nouveau != "FAC-2026-000006" || plan[1].Nouveau != "FAC-2026-000007" {
		t.Errorf("nouveaux numéros %q puis %q, attendu 000006 puis 000007 — "+
			"les trous 000003/000004 ne se comblent pas",
			plan[0].Nouveau, plan[1].Nouveau)
	}
}

// Chaque série a son propre compteur.
//
// Un avoir et une facture ne partagent ni leur suite ni leur plafond. Les
// mélanger était le défaut d'origine de `generateBalanceNumber`, qui filtrait
// sur `invoice_type` sans la série et a relu un TIK pour numéroter un FAC.
func TestChaqueSerieACompteurPropre(t *testing.T) {
	docs := []Doc{
		doc("a", "FAC-2026-000001", "FAC-2026-", 1, 1),
		doc("b", "FAC-2026-000001", "FAC-2026-", 1, 2),
		doc("c", "AVO-2026-000009", "AVO-2026-", 9, 3),
		doc("d", "AVO-2026-000009", "AVO-2026-", 9, 4),
	}
	plan := Plan(docs)
	got := map[string]string{}
	for _, m := range plan {
		got[m.Doc.ID] = m.Nouveau
	}
	if got["b"] != "FAC-2026-000002" {
		t.Errorf("b → %q, attendu FAC-2026-000002", got["b"])
	}
	if got["d"] != "AVO-2026-000010" {
		t.Errorf("d → %q, attendu AVO-2026-000010", got["d"])
	}
}

// Sans doublon, le plan est vide — et l'outil ne doit rien écrire.
func TestSansDoublonPlanVide(t *testing.T) {
	docs := []Doc{
		doc("a", "FAC-2026-000001", "FAC-2026-", 1, 1),
		doc("b", "FAC-2026-000002", "FAC-2026-", 2, 2),
	}
	if plan := Plan(docs); len(plan) != 0 {
		t.Errorf("%d mouvement(s) sur une base saine, attendu 0", len(plan))
	}
	if SeqMin(nil) != -1 {
		t.Error("SeqMin d'un plan vide doit valoir -1")
	}
}

// SeqMin dit où la chaîne de hachage se rompt.
//
// Tout document de `sequence_number` supérieur ou égal devra être rehaché :
// `number` entre dans le hash et chaque document porte celui du précédent.
func TestSeqMinEstLePlusAncienTouche(t *testing.T) {
	docs := []Doc{
		doc("a", "FAC-2026-000001", "FAC-2026-", 1, 5),
		doc("b", "FAC-2026-000001", "FAC-2026-", 1, 700),
		doc("c", "FAC-2026-000002", "FAC-2026-", 2, 14),
		doc("d", "FAC-2026-000002", "FAC-2026-", 2, 900),
	}
	if got := SeqMin(Plan(docs)); got != 700 {
		t.Errorf("SeqMin = %d, attendu 700 — les gardés (5 et 14) ne comptent pas", got)
	}
}

// Deux sociétés ne se marchent pas dessus.
func TestLesSocietesSontCloisonnees(t *testing.T) {
	a := doc("a", "FAC-2026-000001", "FAC-2026-", 1, 1)
	b := doc("b", "FAC-2026-000001", "FAC-2026-", 1, 2)
	b.Company = "co2"
	if plan := Plan([]Doc{a, b}); len(plan) != 0 {
		t.Errorf("%d mouvement(s) : le même numéro dans deux sociétés n'est pas "+
			"un doublon", len(plan))
	}
}
