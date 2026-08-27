// backend/numbering — un seul chemin pour attribuer un numéro de document.
//
// ── POURQUOI CE PAQUET EXISTE ─────────────────────────────────────────────
// Trois fonctions attribuaient des numéros, chacune avec sa propre requête :
// `generateDocumentNumber` (backend/hooks/invoice_hooks.go), `generateDepositNumber`
// et `generateBalanceNumber` (backend/deposit.go). Les trois partageaient deux
// défauts, et le 3 juin 2026 ils ont coûté 106 factures en double.
//
//  1. Elles triaient sur `-sequence_number` — le compteur d'ORDRE d'écriture,
//     tous types de documents confondus — puis relisaient le `number` du
//     document trouvé. Le document le plus récent n'est pas celui qui porte le
//     plus grand numéro de SA série. `generateBalanceNumber` allait plus loin :
//     son filtre ne mentionnait pas la série du tout, seulement
//     `invoice_type = 'invoice'` — or un ticket de caisse porte lui aussi
//     `invoice_type = 'invoice'`, il ne s'en distingue que par `is_pos_ticket`.
//     Le 3 juin 2026 à 14h50, la facture de solde a donc relu TIK-2026-000547,
//     n'y a pas trouvé le préfixe `FAC-2026-`, et est repartie de 1 — alors que
//     la série en était à FAC-2026-000173.
//
//  2. Elles retombaient sur 1 en silence : `if err != nil || len(records) == 0`.
//     Une base vide et une requête en échec menaient au même endroit. C'est ce
//     qui a transformé un incident d'une seconde en trois mois de doublons :
//     une fois le 000001 posé, chaque document suivant le relisait et enchaînait.
//
// D'où la règle, et elle tient en une ligne : on cherche le plus grand numéro
// DE LA SÉRIE, on trie sur `number`, et on refuse d'inventer. Ne pas
// réintroduire de seconde implémentation — c'est la même consigne que pour
// l'agrégation de la caisse, et pour la même raison.
//
// ⚠️ Ce paquet ne répare PAS les doublons déjà en base : ils sont scellés, leur
// `number` entre dans le hash (backend/hash/hash.go:93). Il empêche le suivant.
// Diagnostic : `go run ./backend/cmd/facture-doublons`.
package numbering

import (
	"fmt"
	"strings"

	"github.com/pocketbase/pocketbase/daos"
)

// Padding est la largeur du compteur : FAC-2026-000105.
// Même valeur que hooks.NumberPadding, depositNumberPadding et
// reports.NumberPadding, qu'elle a vocation à remplacer.
const Padding = 6

// Serie rend le préfixe d'une série : Serie("FAC", 2026) → "FAC-2026-".
func Serie(prefixe string, exercice int) string {
	return fmt.Sprintf("%s-%d-", prefixe, exercice)
}

// Filtre rend le filtre PocketBase qui isole UNE série dans UNE partition.
//
// Le `%` final compte : `~` enveloppe sa valeur de `%…%` sauf si elle en porte
// déjà un. Sans lui on cherche « contient FAC-2026- », avec lui « commence par
// FAC-2026- » — la seule forme qui exclut à coup sûr les tickets et les avoirs.
func Filtre(ownerCompany string, exercice int, serie string) string {
	return fmt.Sprintf(
		"owner_company = '%s' && fiscal_year = %d && number ~ '%s%%'",
		ownerCompany, exercice, serie,
	)
}

// FiltreSansExercice est la même chose pour les collections qui ne portent pas
// `fiscal_year` — les devis. L'exercice y est déjà dans la série (DEV-2026-),
// donc l'ancrage sur le préfixe suffit à borner l'année.
func FiltreSansExercice(ownerCompany string, serie string) string {
	return fmt.Sprintf("owner_company = '%s' && number ~ '%s%%'", ownerCompany, serie)
}

// Tri : sur le NUMÉRO, décroissant. Les numéros sont à largeur fixe et remplis
// de zéros, donc l'ordre lexicographique est l'ordre numérique. Trier sur
// `-sequence_number` rendrait le document le plus récemment écrit, qui n'est
// pas nécessairement celui qui porte le plus grand numéro de la série.
const Tri = "-number"

// Suivant rend le prochain numéro de la série, ou une erreur.
//
// Il n'y a pas de troisième issue : soit on sait quel numéro attribuer, soit on
// refuse. Un repli silencieux sur 1 réattribue des numéros déjà remis à des
// clients — c'est exactement ce qui s'est produit le 3 juin 2026.
func Suivant(dao *daos.Dao, collection, filtre, serie string) (string, error) {
	if strings.Contains(filtre, "owner_company = ''") {
		return "", fmt.Errorf("numérotation %s : owner_company vide", serie)
	}

	records, err := dao.FindRecordsByFilter(collection, filtre, Tri, 1, 0)
	if err != nil {
		return "", fmt.Errorf("numérotation %s : %w", serie, err)
	}

	// Aucun document dans cette série : c'est le premier. Seul cas légitime
	// où la séquence vaut 1.
	if len(records) == 0 {
		return Composer(serie, 1), nil
	}

	dernier := records[0].GetString("number")
	rang, err := Rang(dernier, serie)
	if err != nil {
		return "", fmt.Errorf("numérotation %s : %w", serie, err)
	}

	return Composer(serie, rang+1), nil
}

// Composer rend "FAC-2026-000106" pour ("FAC-2026-", 106).
func Composer(serie string, rang int) string {
	return fmt.Sprintf("%s%0*d", serie, Padding, rang)
}

// Rang rend 105 pour ("FAC-2026-000105", "FAC-2026-").
//
// Toute forme inattendue est une erreur, jamais un zéro : rendre 0 ferait
// repartir la série à 1, ce qui est précisément le défaut qu'on corrige.
func Rang(number, serie string) (int, error) {
	if !strings.HasPrefix(number, serie) {
		return 0, fmt.Errorf("%q n'appartient pas à la série %q", number, serie)
	}

	suffixe := strings.TrimPrefix(number, serie)
	if len(suffixe) != Padding {
		return 0, fmt.Errorf("%q : compteur de %d caractères, %d attendus", number, len(suffixe), Padding)
	}
	for _, c := range suffixe {
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("%q : compteur non numérique", number)
		}
	}

	var rang int
	if _, err := fmt.Sscanf(suffixe, "%d", &rang); err != nil {
		return 0, fmt.Errorf("%q : compteur illisible : %w", number, err)
	}
	if rang <= 0 {
		return 0, fmt.Errorf("%q : compteur nul", number)
	}

	return rang, nil
}
