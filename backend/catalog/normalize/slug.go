// backend/catalog/normalize/slug.go
// ═══════════════════════════════════════════════════════════════════════════
// FABRICATION DES SLUGS  (ticket T3)
// ═══════════════════════════════════════════════════════════════════════════
// Les slugs ne se reprennent pas de NeDB : seuls 307 produits sur 2306 en ont
// un (13 %), et les catégories, marques et fournisseurs n'en ont presque pas.
// Ils se FABRIQUENT, décision consignée dans docs/DECISIONS.md.
//
// Le modèle cible impose une unicité PAR ENTREPRISE — index composite
// (company, slug). Tout allant dans une seule entreprise, l'unicité est ici de
// fait globale sur chaque collection.
//
// ── Pourquoi pas de dépendance de translittération ────────────────────────
//
// golang.org/x/text ferait le travail, mais le jeu de caractères à traiter est
// connu et borné : un catalogue d'instruments de musique en français. Une table
// explicite se lit, se corrige et ne se met pas à jour toute seule. Si des
// noms non latins apparaissent un jour, ce choix se rediscute.
package normalize

import (
	"fmt"
	"strings"
)

// accents — translittération explicite. Volontairement lisible : c'est une
// donnée, pas un algorithme.
var accents = strings.NewReplacer(
	"à", "a", "á", "a", "â", "a", "ä", "a", "ã", "a", "å", "a",
	"è", "e", "é", "e", "ê", "e", "ë", "e",
	"ì", "i", "í", "i", "î", "i", "ï", "i",
	"ò", "o", "ó", "o", "ô", "o", "ö", "o", "õ", "o",
	"ù", "u", "ú", "u", "û", "u", "ü", "u",
	"ç", "c", "ñ", "n", "ý", "y", "ÿ", "y",
	"œ", "oe", "æ", "ae", "ß", "ss",
	"'", "-", "'", "-",
)

// Slugify réduit un libellé à une forme d'URL stable.
//
// Rend "" si le libellé ne contient aucun caractère exploitable — un nom
// entièrement composé de ponctuation, par exemple. L'appelant doit traiter ce
// cas plutôt que de produire un slug vide en base.
func Slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = accents.Replace(s)

	var b strings.Builder
	b.Grow(len(s))
	lastDash := true // évite un tiret en tête
	for _, r := range s {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
			lastDash = false
		default:
			if !lastDash {
				b.WriteByte('-')
				lastDash = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}

// SlugAllocator attribue des slugs uniques et rend compte de ce qu'il a dû
// faire pour y parvenir.
//
// La désambiguïsation est explicite et ORDONNÉE, pour que deux exécutions sur
// les mêmes données produisent les mêmes slugs — condition de la rejouabilité
// de la migration (§6.5.2 du rituel) :
//
//  1. le slug de base ;
//  2. si pris : préfixé par un contexte, quand l'appelant en fournit un
//     (le parent, pour une catégorie — « Accessoires » existe deux fois) ;
//  3. si toujours pris : suffixé -2, -3, …
//
// Chaque recours au niveau 2 ou 3 est enregistré : un slug fabriqué qui ne
// ressemble pas à son libellé doit pouvoir s'expliquer.
type SlugAllocator struct {
	taken map[string]string // slug → identifiant d'origine du premier occupant
	// Adjusted liste les slugs ayant nécessité une désambiguïsation.
	Adjusted []SlugAdjustment
	// Empty liste les entités dont le libellé n'a produit aucun slug — donc
	// dont le NOM lui-même est inexploitable. Constaté : un produit publié,
	// en stock, dont le `name` vaut « / ».
	Empty []SlugEmpty
}

// SlugEmpty décrit un libellé dont rien ne peut être tiré.
type SlugEmpty struct {
	SourceID string
	Label    string
}

// SlugAdjustment décrit une désambiguïsation.
type SlugAdjustment struct {
	SourceID string // legacy_id de l'entité
	Label    string // libellé d'origine
	Wanted   string // slug souhaité
	Got      string // slug finalement attribué
	HeldBy   string // legacy_id de l'entité qui détenait le slug souhaité
}

func NewSlugAllocator() *SlugAllocator {
	return &SlugAllocator{taken: map[string]string{}}
}

// Allocate attribue un slug unique à `label`, en s'aidant de `context` si le
// slug de base est déjà pris. `context` peut être vide.
//
// `sourceID` n'est utilisé que pour la traçabilité des ajustements.
func (a *SlugAllocator) Allocate(sourceID, label, context string) string {
	base := Slugify(label)
	if base == "" {
		// Aucun caractère exploitable. On ne fabrique pas un slug de
		// remplacement en silence : on le signale, et on retombe sur
		// l'identifiant d'origine, qui est unique par construction.
		a.Empty = append(a.Empty, SlugEmpty{sourceID, label})
		base = Slugify(sourceID)
		if base == "" {
			base = "sans-nom"
		}
	}

	if _, exists := a.taken[base]; !exists {
		a.taken[base] = sourceID
		return base
	}
	heldBy := a.taken[base]

	// Niveau 2 : le contexte, quand il en existe un.
	if ctx := Slugify(context); ctx != "" {
		withCtx := ctx + "-" + base
		if _, exists := a.taken[withCtx]; !exists {
			a.taken[withCtx] = sourceID
			a.Adjusted = append(a.Adjusted, SlugAdjustment{sourceID, label, base, withCtx, heldBy})
			return withCtx
		}
	}

	// Niveau 3 : suffixe numérique.
	for n := 2; ; n++ {
		candidate := fmt.Sprintf("%s-%d", base, n)
		if _, exists := a.taken[candidate]; !exists {
			a.taken[candidate] = sourceID
			a.Adjusted = append(a.Adjusted, SlugAdjustment{sourceID, label, base, candidate, heldBy})
			return candidate
		}
	}
}
