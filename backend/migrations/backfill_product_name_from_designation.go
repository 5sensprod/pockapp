// backend/migrations/backfill_product_name_from_designation.go
// ═══════════════════════════════════════════════════════════════════════════
// RÉPARER LES FICHES DONT LE NOM EN LIGNE N'EST QUE LA RÉFÉRENCE
// ═══════════════════════════════════════════════════════════════════════════
//
// ── Ce qu'on répare, et d'où ça vient ──────────────────────────────────────
//
// Depuis le 27 août 2026, les deux noms du produit ont chacun leur rôle :
// `designation` est le nom imprimé sur le TICKET, `name` est le titre de la
// fiche sur axemusique.shop — et c'est de `name` que le slug est dérivé.
//
// L'import de la base AppPos a laissé une population de produits dont le
// `name` n'est que le `sku`, là où il aurait dû reprendre la `designation`.
// Constaté au comptoir : `name` = « ABGS14SH » pour un `sku` « ABG S14SH » et
// une désignation « Cordons - Cordon confort crochet à pompe ». Le défaut ne
// se voit pas dans la caisse — qui affiche la désignation — mais il titre la
// page publique avec une référence.
//
// Le normaliseur d'import n'en est PAS la cause : il refuse un `name` vide
// (`backend/catalog/normalize/catalog.go:299-303`) et ne fabrique aucun repli.
// La valeur vient de la NeDB elle-même, en amont, et on n'écrit jamais dans
// AppPos.
//
// ── Pourquoi la comparaison porte sur une forme réduite ────────────────────
//
// « ABGS14SH » n'est PAS égal à « ABG S14SH » caractère pour caractère. Une
// égalité stricte ne verrait donc rien du cas mesuré. On compare des formes
// réduites — espaces, tirets, points, barres et casse retirés —, exactement la
// règle du repli d'affichage `nomFicheParDefaut`
// (`frontend/modules/stock/components/detail/product-detail-form.ts`) : les
// deux doivent désigner la même population, sans quoi l'écran répare des
// fiches que la migration ignore, ou l'inverse.
//
// ── Ce qu'elle ne touche pas ───────────────────────────────────────────────
//
// **Le slug.** Un slug non vide ne se retouche jamais (DECISIONS, 2026-08-20) :
// renommer un produit ne déplace pas sa page, sans quoi cette migration
// casserait d'un coup l'adresse de chaque fiche réparée, et les liens déjà
// partagés avec elle. Un produit sans slug reste sans slug ; c'est
// l'enregistrement de la fiche qui le pose.
//
// **Un produit sans désignation**, ou dont le `name` dit déjà autre chose que
// la référence : il n'y a rien à mettre à la place, on passe.
//
// ⚠️ CONSÉQUENCE ASSUMÉE : `name` entre dans le checksum d'export
// (§4.4 du contrat catalogue). Chaque fiche réparée repassera donc
// « modifiée » et repartira vers `products-sync.php` au prochain export. C'est
// le but — la page publique porte aujourd'hui une référence en guise de titre.
package migrations

import (
	"log"
	"strings"

	"github.com/pocketbase/pocketbase"
)

// reduireLibelle rend la forme comparable d'un libellé : minuscules, et sans
// les séparateurs qu'une saisie de référence place ou non. Doit rester
// identique à `reduire()` côté front (voir l'en-tête).
func reduireLibelle(valeur string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(valeur) {
		switch r {
		case ' ', '\t', '-', '_', '.', '/':
			continue
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// BackfillProductNameFromDesignation remet la désignation dans `name` pour les
// fiches dont le nom en ligne est vide ou réduit à la référence.
//
// Elle est IDEMPOTENTE : une fois `name` porteur de la désignation, il ne
// ressemble plus au `sku` et la fiche n'est plus retenue au passage suivant.
func BackfillProductNameFromDesignation(app *pocketbase.PocketBase) error {
	records, err := app.Dao().FindRecordsByFilter("products", "1=1", "", 0, 0)
	if err != nil {
		// Pas de collection `products` — base neuve : rien à réparer, et surtout
		// pas de quoi interrompre la chaîne de migrations.
		log.Printf("⚠️ Backfill nom de fiche : lecture impossible (%v)", err)
		return nil
	}

	repares := 0
	sansDesignation := 0

	for _, r := range records {
		name := strings.TrimSpace(r.GetString("name"))
		designation := strings.TrimSpace(r.GetString("designation"))
		sku := strings.TrimSpace(r.GetString("sku"))

		aReparer := name == ""
		// Le garde sur `sku` non vide est indispensable : `reduireLibelle("")`
		// vaut "", et sans lui TOUT nom serait jugé identique à une référence
		// absente.
		if !aReparer && sku != "" {
			aReparer = reduireLibelle(name) == reduireLibelle(sku)
		}
		if !aReparer {
			continue
		}

		if designation == "" {
			// Rien à mettre à la place. On le compte pour que le journal dise
			// combien de fiches restent à titrer à la main.
			sansDesignation++
			continue
		}

		r.Set("name", designation)
		// Aucun `r.Set("slug", …)` ici, et c'est délibéré : voir l'en-tête.
		if err := app.Dao().SaveRecord(r); err != nil {
			log.Printf("⚠️ Backfill nom de fiche : %s non enregistré (%v)", r.Id, err)
			continue
		}
		repares++
	}

	if repares == 0 && sansDesignation == 0 {
		return nil
	}
	log.Printf(
		"✅ Nom de fiche : %d produit(s) réparé(s) depuis la désignation, %d sans désignation laissé(s) tel(s) quel(s)",
		repares, sansDesignation,
	)
	return nil
}
