// ═══════════════════════════════════════════════════════════════════════════
// DONNER UNE ADRESSE AUX CATÉGORIES CRÉÉES DANS POCKETAPP
// ═══════════════════════════════════════════════════════════════════════════
//
// Une catégorie créée dans PocketApp ne passait pas par la règle commune des
// slugs. Dès qu'un produit publié la citait, l'export envoyait donc `slug:
// null` ; le serveur le conservait sans en inventer un, conformément au
// contrat, et la page publique devenait `/categorie-produit/null`.
//
// Mesuré le 27 août 2026 dans la base active : 462 catégories, UNE sans slug.
// Elle est citée directement par un produit publié. La base porte 198
// catégories directement citées et 206 destinées au site en comptant leurs
// ancêtres. Son empreinte changera après cette réparation : elle repassera
// « modifiée » et devra être renvoyée, ce qui est voulu.
//
// ⚠️ Un slug NON VIDE n'est JAMAIS retouché. Renommer une catégorie ne déplace
// pas sa page. Cette migration ne sélectionne que les chaînes vides et elle est
// donc idempotente.
package migrations

import (
	"fmt"
	"log"
	"sort"
	"strings"
	"unicode"

	"github.com/pocketbase/pocketbase"
	"golang.org/x/text/unicode/norm"
)

const longueurMaxSlugCategorie = 80

// slugDepuisNomCategorie est le jumeau Go de `toSlug` (`frontend/lib/queries/
// slug.ts`) : minuscules, accents retirés, groupes de séparateurs remplacés
// par un tiret, et 80 caractères ASCII au maximum.
func slugDepuisNomCategorie(nom string) string {
	var b strings.Builder
	separateur := false

	for _, r := range norm.NFD.String(nom) {
		if unicode.Is(unicode.Mn, r) {
			continue
		}

		r = unicode.ToLower(r)
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			if separateur && b.Len() > 0 && b.Len() < longueurMaxSlugCategorie {
				b.WriteByte('-')
			}
			separateur = false
			if b.Len() < longueurMaxSlugCategorie {
				b.WriteRune(r)
			}
			continue
		}

		separateur = b.Len() > 0
	}

	return strings.TrimRight(b.String(), "-")
}

// BackfillCategorySlugs pose un slug uniquement sur les catégories qui n'en
// ont pas. Les collisions sont résolues contre les slugs réellement présents
// dans PocketBase ; le serveur du site ne participe jamais à la décision.
func BackfillCategorySlugs(app *pocketbase.PocketBase) error {
	records, err := app.Dao().FindRecordsByFilter("categories", "1=1", "", 0, 0)
	if err != nil {
		// Base sans catalogue : rien à réparer, sans interrompre les migrations.
		log.Printf("⚠️ Backfill slug catégories : lecture impossible (%v)", err)
		return nil
	}

	// L'ordre rend le suffixage déterministe si plusieurs catégories vides ont
	// le même nom. Contrairement à `slugLibre`, cette recherche est locale et
	// finie : elle n'a pas besoin de la borne prévue pour les appels réseau.
	sort.Slice(records, func(i, j int) bool { return records[i].Id < records[j].Id })

	utilises := make(map[string]struct{}, len(records))
	for _, r := range records {
		if slug := strings.TrimSpace(r.GetString("slug")); slug != "" {
			utilises[slug] = struct{}{}
		}
	}

	repares := 0
	sansAdresse := 0
	echecs := 0

	for _, r := range records {
		if strings.TrimSpace(r.GetString("slug")) != "" {
			continue
		}

		base := slugDepuisNomCategorie(r.GetString("name"))
		if base == "" {
			sansAdresse++
			continue
		}

		candidat := base
		for rang := 2; ; rang++ {
			if _, pris := utilises[candidat]; !pris {
				break
			}
			candidat = fmt.Sprintf("%s-%d", base, rang)
		}

		r.Set("slug", candidat)
		if err := app.Dao().SaveRecord(r); err != nil {
			log.Printf(
				"⚠️ Backfill slug catégories : %s non enregistré (%v)",
				r.Id,
				err,
			)
			echecs++
			continue
		}

		utilises[candidat] = struct{}{}
		repares++
	}

	if repares == 0 && sansAdresse == 0 && echecs == 0 {
		return nil
	}
	log.Printf(
		"✅ Slug catégories : %d réparée(s), %d nom(s) inutilisable(s), %d échec(s)",
		repares,
		sansAdresse,
		echecs,
	)
	return nil
}
