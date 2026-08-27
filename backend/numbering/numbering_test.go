package numbering

import (
	"strings"
	"testing"
)

// Le filtre doit isoler la SÉRIE, pas seulement la partition. C'est ce qui
// manquait à generateBalanceNumber, qui filtrait sur `invoice_type = 'invoice'`
// — vrai pour les tickets de caisse comme pour les factures.
func TestFiltreIsoleLaSerie(t *testing.T) {
	f := Filtre("468mpen5lhg6u0v", 2026, Serie("FAC", 2026))

	if !strings.Contains(f, "number ~ 'FAC-2026-%'") {
		t.Fatalf("le filtre n'ancre pas la série sur le début du numéro : %s", f)
	}
	if !strings.Contains(f, "fiscal_year = 2026") {
		t.Fatalf("le filtre ne borne pas l'exercice : %s", f)
	}
	if !strings.Contains(f, "owner_company = '468mpen5lhg6u0v'") {
		t.Fatalf("le filtre ne borne pas la société : %s", f)
	}
	if strings.Contains(f, "invoice_type") {
		t.Fatalf("`invoice_type` ne distingue pas un ticket d'une facture : %s", f)
	}
}

// Le tri se fait sur le numéro, jamais sur `sequence_number` : le document le
// plus récemment écrit n'est pas celui qui porte le plus grand numéro de sa
// série. Deux tickets encaissés à midi ont suffi, le 3 juin 2026.
func TestTriSurLeNumero(t *testing.T) {
	if Tri != "-number" {
		t.Fatalf("tri = %q, attendu \"-number\"", Tri)
	}
}

// Les numéros sont à largeur fixe et remplis de zéros : l'ordre des chaînes est
// l'ordre des nombres. Sans ce remplissage, "FAC-2026-99" primerait sur
// "FAC-2026-100" et le tri lexicographique serait faux.
func TestOrdreLexicographiqueEgaleOrdreNumerique(t *testing.T) {
	serie := Serie("FAC", 2026)
	if a, b := Composer(serie, 99), Composer(serie, 100); !(a < b) {
		t.Fatalf("%s devrait précéder %s", a, b)
	}
	if a, b := Composer(serie, 173), Composer(serie, 1); !(b < a) {
		t.Fatalf("%s devrait précéder %s", b, a)
	}
}

// Rang refuse tout ce qu'il ne comprend pas, au lieu de rendre 0. Rendre 0
// ferait repartir la série à 1 — le défaut qu'on corrige.
func TestRangRefusePlutotQueDeRendreZero(t *testing.T) {
	serie := Serie("FAC", 2026)

	// Le cas exact du 3 juin 2026 : un ticket relu à la place d'une facture.
	if _, err := Rang("TIK-2026-000547", serie); err == nil {
		t.Fatal("un TIK lu dans la série FAC doit lever, pas rendre 0")
	}

	for _, cas := range []string{"", "FAC-2026-", "FAC-2026-12", "FAC-2026-0000AB", "FAC-2026-000000"} {
		if _, err := Rang(cas, serie); err == nil {
			t.Fatalf("%q accepté alors qu'il est illisible", cas)
		}
	}

	rang, err := Rang("FAC-2026-000105", serie)
	if err != nil {
		t.Fatalf("FAC-2026-000105 refusé : %v", err)
	}
	if rang != 105 {
		t.Fatalf("rang = %d, attendu 105", rang)
	}
}

func TestComposerRemplitLeCompteur(t *testing.T) {
	if got := Composer(Serie("ACC", 2026), 7); got != "ACC-2026-000007" {
		t.Fatalf("got %q", got)
	}
}
