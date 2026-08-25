// backend/catalog/mapping/appliquer.go
// ═══════════════════════════════════════════════════════════════════════════
// LA TRANSFORMATION — le catalogue tel qu'il doit être écrit
// ═══════════════════════════════════════════════════════════════════════════
//
// `Appliquer` prend le catalogue normalisé depuis NeDB et rend le catalogue
// CIBLE : 12 rayons au lieu de 463 catégories, marques fusionnées, clés stables
// conservées, état commercial posé.
//
// ── Pourquoi une transformation, et pas un second chargeur ─────────────────
//
// L'écriture reste celle de `load.Run` : une transaction unique, la garde de
// `guard.go`, la copie des images, la résolution des relations. Tout cela est
// écrit, éprouvé, et n'a aucune raison d'être refait.
//
// Un second chemin d'écriture aurait été la vraie prise de risque : deux codes
// qui écrivent les mêmes collections divergent, et c'est exactement le défaut
// qu'on a trouvé entre les deux gardes de la reprise (voir catalog_v2.go). On
// transforme donc la DONNÉE, et le chargeur ne sait même pas qu'il charge une
// reprise.
//
// ── Ce que la transformation ne fait pas ───────────────────────────────────
//
// Elle n'écrit rien, n'ouvre aucune base, et ne décide rien qui ne soit dans
// les tables. Tout ce qu'elle ne sait pas ranger, elle le laisse SANS rayon
// plutôt que de l'inventer — c'est le plan qui le compte, et l'opérateur qui
// le voit.
package mapping

import (
	"fmt"
	"sort"
	"strings"

	"pocket-react/backend/catalog/normalize"
)

// prefixeRayon nomme la clé stable des rayons créés par la reprise.
//
// Volontairement DIFFÉRENT de `pa_`, qui signale une entité née en caisse et
// que `guard.go` protège comme irremplaçable. Un rayon, lui, se reconstruit
// intégralement depuis `categories.json`, versionné dans le dépôt : le
// présenter comme irremplaçable ferait bloquer la garde sur une donnée qu'un
// `git checkout` suffit à retrouver.
const prefixeRayon = "rayon_"

// CleRayon rend la clé stable d'un rayon, dérivée de son nom.
func CleRayon(nom string) string {
	var b strings.Builder
	b.WriteString(prefixeRayon)
	precedentTiret := true // évite un tiret en tête
	for _, r := range strings.ToLower(nom) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			precedentTiret = false
		default:
			if base, ok := accentsLatins[r]; ok {
				b.WriteRune(base)
				precedentTiret = false
				continue
			}
			if !precedentTiret {
				b.WriteByte('-')
				precedentTiret = true
			}
		}
	}
	return strings.TrimSuffix(b.String(), "-")
}

// Options règle ce que la transformation change, au-delà du strict nécessaire.
type Options struct {
	// RefondreCategories remplace l'arbre d'origine par 12 rayons et leurs
	// natures (voir « LE NIVEAU 1 »).
	//
	// ── Pourquoi c'est FAUX par défaut ────────────────────────────────────
	//
	// Parce que la reprise et la refonte sont deux chantiers, et que les
	// mélanger a coûté deux allers-retours sur la base de production le
	// 25 août 2026. La reprise doit rendre au client SON catalogue, celui
	// qu'il connaît, avec les rayons qu'il a construits ; la refonte est une
	// décision de rangement qui se prend à froid, se regarde, et se corrige
	// dans l'écran plutôt que dans un import.
	//
	// L'arbre d'origine a par ailleurs des qualités que la refonte perdait :
	// 46 racines et 417 rattachements parent-enfant portant des noms que le
	// magasin utilise, et 36 catégories illustrées.
	RefondreCategories bool
}

// Appliquer rend le catalogue cible, sans refonte des catégories.
func Appliquer(cat *normalize.Catalog, ct *CategoryTable, bt *BrandTable, kt *KeyTable) *normalize.Catalog {
	return AppliquerAvec(cat, ct, bt, kt, Options{})
}

// AppliquerAvec rend le catalogue cible. `cat` n'est pas modifié.
func AppliquerAvec(cat *normalize.Catalog, ct *CategoryTable, bt *BrandTable,
	kt *KeyTable, opts Options,
) *normalize.Catalog {
	out := &normalize.Catalog{
		Suppliers: append([]normalize.Supplier(nil), cat.Suppliers...),
	}
	regles := reglesParCategorie(cat, ct)

	if !opts.RefondreCategories {
		return sansRefonte(cat, ct, bt, kt, regles, out)
	}

	// ── Les rayons remplacent l'arbre ─────────────────────────────────────
	// Ils sont créés À PLAT, sans parent : c'est la forme cible — un niveau de
	// rayons, un niveau de natures. La hiérarchie de NeDB ne survit pas, et
	// c'est l'objet même de la refonte.
	slugsPris := map[string]bool{}
	for _, nom := range ct.Rayons() {
		out.Categories = append(out.Categories, normalize.Category{
			LegacyID: CleRayon(nom),
			Name:     nom,
			Slug:     slugUnique(nom, nom, slugsPris),
		})
	}

	// ── Le niveau 1 : les natures ─────────────────────────────────────────
	natures, categoriesNatures := NaturesDe(cat, ct, regles)
	for i := range categoriesNatures {
		c := &categoriesNatures[i]
		c.Slug = slugUnique(c.Name, ct.rayonDe(c.ParentLegacyID), slugsPris)
	}
	out.Categories = append(out.Categories, categoriesNatures...)

	// ── Marques : les perdantes disparaissent ─────────────────────────────
	survivanteDe, marquesGardees := fusionnerMarques(cat, bt)
	out.Brands = marquesGardees

	// ── Produits ──────────────────────────────────────────────────────────
	regleDe := regles
	// Même attribution que la simulation, et pour la même raison : si les deux
	// divergeaient, l'opérateur validerait une répartition des clés et l'outil
	// en écrirait une autre.
	clesRetenues := AttribuerCles(cat.Products, kt)

	for _, p := range cat.Products {
		q := p // copie : `cat` reste intact

		// La marque perdante cède la place à la survivante.
		if nouvelle, absorbee := survivanteDe[q.BrandLegacyID]; absorbee {
			q.BrandLegacyID = nouvelle
		}

		// Les rattachements deviennent des rayons, dédoublonnés.
		rayons := map[string]bool{}
		for _, catID := range q.CategoryLegacyID {
			r := regleDe[catID]
			if r == nil {
				continue
			}
			switch r.Action {
			case ActionRattacher:
				// Le produit va à sa NATURE quand elle existe, au rayon sinon.
				// Jamais aux deux : chaque comptage serait doublé.
				if n, ok := natures[catID]; ok {
					rayons[n] = true
				} else {
					rayons[CleRayon(r.RayonCible)] = true
				}
			case ActionChampProduit:
				// La catégorie n'était pas un rangement : elle devient un champ.
				q.CommercialState = r.ChampProduit.Valeur
			}
		}
		q.CategoryLegacyID = triees(rayons)

		// La clé stable, si elle existe. Sinon celle de NeDB, qui est neuve —
		// le produit n'a jamais été exporté, rien ne le désigne encore en ligne.
		q.LegacyID = LegacyIDFinal(p, clesRetenues)

		out.Products = append(out.Products, q)
	}

	return out
}

// fusionnerMarques rend la correspondance perdante→survivante (en legacy_id)
// et la liste des marques qui survivent.
//
// La survivante est choisie EN COMPTANT, jamais par son nom : deux groupes sur
// huit sont strictement homonymes. Même règle que `Build`, et c'est délibéré —
// si les deux divergeaient, la simulation annoncerait une fusion et
// l'application en ferait une autre.
func fusionnerMarques(cat *normalize.Catalog, bt *BrandTable) (map[string]string, []normalize.Brand) {
	produits := map[string]int{}
	for _, p := range cat.Products {
		if p.BrandLegacyID != "" {
			produits[p.BrandLegacyID]++
		}
	}

	groupes := map[string][]normalize.Brand{}
	for _, b := range cat.Brands {
		if g, doublon := bt.GroupeDe(b.Name); doublon {
			groupes[g.Cle] = append(groupes[g.Cle], b)
		}
	}

	survivanteDe := map[string]string{}
	for _, membres := range groupes {
		if len(membres) < 2 {
			continue
		}
		sort.SliceStable(membres, func(i, j int) bool {
			pi, pj := produits[membres[i].LegacyID], produits[membres[j].LegacyID]
			if pi != pj {
				return pi > pj
			}
			return membres[i].ImageSrc != "" && membres[j].ImageSrc == ""
		})
		for _, perdante := range membres[1:] {
			survivanteDe[perdante.LegacyID] = membres[0].LegacyID
		}
	}

	gardees := make([]normalize.Brand, 0, len(cat.Brands))
	for _, b := range cat.Brands {
		if _, absorbee := survivanteDe[b.LegacyID]; !absorbee {
			gardees = append(gardees, b)
		}
	}
	return survivanteDe, gardees
}

// reglesParCategorie associe chaque catégorie NeDB à sa règle, par le chemin.
func reglesParCategorie(cat *normalize.Catalog, ct *CategoryTable) map[string]*CategoryRule {
	chemins := cheminsDesCategories(cat.Categories)
	out := make(map[string]*CategoryRule, len(cat.Categories))
	for _, c := range cat.Categories {
		if r := ct.Rule(chemins[c.LegacyID]); r != nil {
			out[c.LegacyID] = r
		}
	}
	return out
}

func triees(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// ═══════════════════════════════════════════════════════════════════════════
// LE NIVEAU 1 — la nature du produit, sous le rayon
// ═══════════════════════════════════════════════════════════════════════════
//
// Un rayon seul ne suffit pas à ranger. « Cordes & frettés » dit dans quelle
// allée on va ; il ne dit pas si l'on cherche une guitare électrique, un jeu de
// cordes folk ou un ukulélé. La première version de la reprise n'a créé que les
// 12 rayons, et le catalogue est devenu inutilisable pour chercher — constaté
// par le propriétaire le 25 août 2026, et c'était un oubli, pas un choix : le
// §4.3 de l'état des lieux annonçait « 12 rayons et 90 à 110 catégories de
// niveau 1 ».
//
// ── Quatre règles, et chacune règle une scorie observée ────────────────────
//
//  1. Seules les catégories qui PORTENT des produits deviennent une nature.
//     Une branche vide n'aide personne à ranger.
//  2. Une catégorie qui porte le nom de son rayon n'en devient pas une : ses
//     produits vont au rayon directement. Sans cela on obtenait
//     « Batterie & percussions / Batterie & Percussion ».
//  3. L'astérisque de la strate importée est retiré du nom. « * Instruments à
//     vents » et « Instruments à vent » sont le même rangement.
//  4. Deux natures de même nom dans un même rayon FUSIONNENT — accents, casse
//     et ponctuation ignorés.
//
// ⚠️ **Le PLURIEL, lui, ne fusionne pas**, et c'est délibéré. « Harmonica » et
// « Harmonicas » sont visiblement la même chose ; « Bec » et « Becs » aussi.
// Mais la règle qui les rapprocherait rapprocherait aussi des natures qui n'ont
// rien à voir, et le faire en silence rangerait des articles ensemble sans que
// personne ne l'ait décidé. Deux natures voisines se voient et se fusionnent à
// la main ; un rangement faux ne se voit pas.
//
// Le produit est rattaché à sa NATURE, pas au rayon : le rayon se déduit du
// parent. Le rattacher aux deux doublerait chaque comptage.

// slugLisible rend un slug en minuscules à tirets : « Peaux Batterie » →
// « peaux-batterie ».
func slugLisible(nom string) string {
	var b strings.Builder
	tiret := true
	for _, r := range strings.ToLower(nom) {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
			tiret = false
		default:
			if base, ok := accentsLatins[r]; ok {
				b.WriteRune(base)
				tiret = false
				continue
			}
			if !tiret {
				b.WriteByte('-')
				tiret = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}

// slugUnique rend un slug libre, en préfixant par le rayon si le nom seul est
// déjà pris.
//
// `categories.slug` porte un index unique PAR ENTREPRISE, pas par rayon —
// « Accessoires divers » sous Lutherie et « ACCESSOIRES Divers » sous
// Accessoires & pièces se heurtaient, et la transaction entière échouait
// (mesuré le 25 août 2026). Préfixer par le rayon garde un slug lisible tout en
// levant l'ambiguïté : « accessoires-pieces-accessoires-divers ».
func slugUnique(nom, rayon string, pris map[string]bool) string {
	base := slugLisible(nom)
	if base != "" && !pris[base] {
		pris[base] = true
		return base
	}
	avecRayon := slugLisible(rayon) + "-" + base
	if !pris[avecRayon] {
		pris[avecRayon] = true
		return avecRayon
	}
	// Troisième tour : on suffixe. Le cas ne s'est jamais présenté, mais un
	// slug vide ou dupliqué ferait échouer TOUTE l'écriture.
	for i := 2; ; i++ {
		essai := fmt.Sprintf("%s-%d", avecRayon, i)
		if !pris[essai] {
			pris[essai] = true
			return essai
		}
	}
}

// natureDe rend le nom de la nature sous laquelle ranger une catégorie, ou ""
// s'il faut la rattacher directement au rayon.
func natureDe(nomCategorie, rayon string) string {
	nom := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(nomCategorie), "*"))
	nom = strings.TrimSpace(nom)
	if nom == "" || CleMarque(nom) == CleMarque(rayon) {
		return ""
	}
	return nom
}

// NaturesDe construit le niveau 1 : la table `catégorie NeDB -> clé de nature`,
// et les catégories à créer.
//
// Partagée par `Build` et `Appliquer`, et c'est la raison d'être de cette
// fonction : si la simulation annonçait un arbre et l'écriture en produisait un
// autre, l'opérateur validerait un rangement qu'il ne recevrait pas. Le même
// piège que pour les fusions de marques, et il a déjà servi une fois.
func NaturesDe(cat *normalize.Catalog, ct *CategoryTable,
	regles map[string]*CategoryRule,
) (map[string]string, []normalize.Category) {
	produitsPar := map[string]int{}
	for _, prod := range cat.Products {
		for _, id := range prod.CategoryLegacyID {
			produitsPar[id]++
		}
	}

	natures := map[string]string{}
	vues := map[string]bool{}
	var creees []normalize.Category

	for _, c := range cat.Categories {
		r := regles[c.LegacyID]
		if r == nil || r.Action != ActionRattacher || produitsPar[c.LegacyID] == 0 {
			continue
		}
		nom := natureDe(c.Name, r.RayonCible)
		if nom == "" {
			continue // se range dans le rayon lui-même
		}
		cle := CleRayon(r.RayonCible) + "__" + CleMarque(nom)
		natures[c.LegacyID] = cle
		if vues[cle] {
			continue // deux catégories homonymes : une seule nature
		}
		vues[cle] = true
		creees = append(creees, normalize.Category{
			LegacyID: cle,
			Name:     nom,
			// Le slug est posé par Appliquer : il doit être unique sur TOUTE
			// la collection, ce qu'une construction locale ne peut pas savoir.
			ParentLegacyID: CleRayon(r.RayonCible),
		})
	}
	return natures, creees
}

// ═══════════════════════════════════════════════════════════════════════════
// LA REPRISE SANS REFONTE — l'arbre du magasin, tel qu'il est
// ═══════════════════════════════════════════════════════════════════════════
//
// C'est le mode par défaut, et le seul qui rende au client le catalogue qu'il
// connaît : ses 46 racines, ses 417 rattachements, ses 36 catégories
// illustrées. Rien n'est réorganisé.
//
// Deux choses seulement ne suivent pas :
//
//  1. « Occasion » et « LOCATION » deviennent `commercial_state` — décision du
//     24 août 2026, indépendante de la refonte. Elles ne sont donc pas créées,
//     et le rattachement qui y menait est remplacé par le champ.
//  2. Les marques fusionnées, comme partout ailleurs.
func sansRefonte(cat *normalize.Catalog, ct *CategoryTable, bt *BrandTable,
	kt *KeyTable, regles map[string]*CategoryRule, out *normalize.Catalog,
) *normalize.Catalog {
	// Les catégories devenues un champ ne sont pas reprises.
	champ := map[string]string{}
	for _, c := range cat.Categories {
		if r := regles[c.LegacyID]; r != nil && r.Action == ActionChampProduit {
			champ[c.LegacyID] = r.ChampProduit.Valeur
		}
	}
	for _, c := range cat.Categories {
		if _, estChamp := champ[c.LegacyID]; estChamp {
			continue
		}
		out.Categories = append(out.Categories, c)
	}

	survivanteDe, marquesGardees := fusionnerMarques(cat, bt)
	out.Brands = marquesGardees
	clesRetenues := AttribuerCles(cat.Products, kt)

	for _, p := range cat.Products {
		q := p
		if nouvelle, absorbee := survivanteDe[q.BrandLegacyID]; absorbee {
			q.BrandLegacyID = nouvelle
		}
		// Le rattachement d'origine est conservé, moins ce qui est devenu un
		// champ. Un produit qui n'avait QUE « Occasion » se retrouve sans
		// catégorie : c'est exact, et c'est la dette que le §4 de l'état des
		// lieux chiffre — 18 produits sur 19.
		garde := make([]string, 0, len(q.CategoryLegacyID))
		for _, id := range q.CategoryLegacyID {
			if v, estChamp := champ[id]; estChamp {
				q.CommercialState = v
				continue
			}
			garde = append(garde, id)
		}
		q.CategoryLegacyID = garde
		q.LegacyID = LegacyIDFinal(p, clesRetenues)
		out.Products = append(out.Products, q)
	}
	return out
}
