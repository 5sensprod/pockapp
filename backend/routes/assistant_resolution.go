// backend/routes/assistant_resolution.go
//
// UN NOM DIT PAR LE VENDEUR → UNE MARQUE OU UNE CATÉGORIE (6 octobre 2026).
// Doc : frontend/modules/stock/PocketStock-docs/06-assistant-catalogue.md, §4.
//
// « prodipe », « guitare classique », « yamaa » : le modèle transmet les mots,
// c'est ICI qu'on cherche — en mémoire, sur les noms lus dans la base. Trois
// issues, et le code n'en choisit jamais une quatrième :
//
//   - UNE entité correspond : elle est retenue ;
//   - PLUSIEURS correspondent au même degré : on rend les candidates, et c'est
//     le vendeur qui tranche ;
//   - AUCUNE : on le dit.
//
// Les degrés, du plus strict au plus lâche — on s'arrête au premier qui trouve :
//
//  1. le nom, plié (casse, accents, œ) ;
//  2. les mêmes mots que le nom, au pluriel près (« guitare classique » /
//     « Guitares classiques ») ;
//  3. les mêmes mots que le CHEMIN (« guitare classique » / « Guitares ›
//     Classiques ») ;
//  4. chaque mot dit se retrouve dans le chemin (un début de mot suffit), dont
//     un au moins dans le nom lui-même ;
//  5. le degré 4, à UNE faute de frappe près par mot de quatre lettres ou plus.
//
// Un degré plus strict l'emporte toujours : « Yamaha » désigne la marque
// « Yamaha », pas « Yamaha Pianos ». Les entités qui portent des produits
// passent d'abord ; une entité vide n'est proposée que si rien d'autre ne
// correspond.
//
// Le pliage est celui de la recherche (`backend/catalog/searchkey`).

package routes

import (
	"sort"
	"strings"
	"unicode/utf8"

	"pocket-react/backend/catalog/searchkey"
)

// entiteNommee : une marque ou une catégorie, telle que la résolution la voit.
type entiteNommee struct {
	ID  string
	Nom string
	// Chemin : les noms de la racine à l'entité, elle comprise. Pour une marque,
	// le nom seul.
	Chemin []string
	// Total : les produits qu'elle porte (branche entière pour une catégorie),
	// lus dans les décomptes de `/api/catalog/counts`.
	Total int
}

const resolutionCandidatsMax = 5

type resolution struct {
	Trouvee   *entiteNommee
	Candidats []entiteNommee
	// EnTout : le nombre de candidates avant la coupe à `resolutionCandidatsMax`.
	EnTout int
}

var resolutionMotsVides = map[string]bool{
	"de": true, "du": true, "des": true, "d": true, "la": true, "le": true,
	"les": true, "l": true, "et": true, "pour": true, "a": true, "en": true,
}

var resolutionSeparateurs = strings.NewReplacer(">", " ", "›", " ", "/", " ", ",", " ", "'", " ", "’", " ")

// motSingulier : « guitares » et « guitare » doivent se rejoindre. Grossier à
// dessein — appliqué des DEUX côtés, il n'a pas besoin d'être juste, seulement
// constant.
func motSingulier(mot string) string {
	if utf8.RuneCountInString(mot) > 3 && (strings.HasSuffix(mot, "s") || strings.HasSuffix(mot, "x")) {
		return mot[:len(mot)-1]
	}
	return mot
}

func resolutionJetons(texte string) []string {
	var jetons []string
	for _, mot := range strings.Fields(searchkey.Cle(resolutionSeparateurs.Replace(texte))) {
		if !resolutionMotsVides[mot] {
			jetons = append(jetons, motSingulier(mot))
		}
	}
	return jetons
}

// ensembleDe : les jetons sans répétition, triés — deux textes qui disent les
// mêmes mots dans un autre ordre donnent la même chaîne.
func ensembleDe(jetons []string) string {
	vus := map[string]bool{}
	var uniques []string
	for _, j := range jetons {
		if !vus[j] {
			vus[j] = true
			uniques = append(uniques, j)
		}
	}
	sort.Strings(uniques)
	return strings.Join(uniques, " ")
}

// uneEditionAuPlus : a et b diffèrent d'une lettre ajoutée, retirée, changée,
// ou de deux lettres voisines inversées.
func uneEditionAuPlus(a, b string) bool {
	ra, rb := []rune(a), []rune(b)
	if len(ra) > len(rb) {
		ra, rb = rb, ra
	}
	if len(rb)-len(ra) > 1 {
		return false
	}
	i := 0
	for i < len(ra) && ra[i] == rb[i] {
		i++
	}
	if i == len(ra) {
		return true
	}
	if len(ra) == len(rb) {
		// Une lettre changée, ou deux inversées
		if string(ra[i+1:]) == string(rb[i+1:]) {
			return true
		}
		return i+1 < len(ra) && ra[i] == rb[i+1] && ra[i+1] == rb[i] && string(ra[i+2:]) == string(rb[i+2:])
	}
	// Une lettre de plus dans rb
	return string(ra[i:]) == string(rb[i+1:])
}

func motCorrespond(dit string, jetons []string, tolerant bool) bool {
	longueur := utf8.RuneCountInString(dit)
	for _, j := range jetons {
		if j == dit || (longueur >= 3 && strings.HasPrefix(j, dit)) {
			return true
		}
		if tolerant && longueur >= 4 && uneEditionAuPlus(dit, j) {
			return true
		}
	}
	return false
}

func resoudreParmi(demande string, entites []entiteNommee) []entiteNommee {
	dits := resolutionJetons(demande)
	if len(dits) == 0 {
		return nil
	}
	clePliee := searchkey.Cle(demande)
	ensembleDit := ensembleDe(dits)

	type vue struct {
		nom, chemin []string
	}
	vues := make([]vue, len(entites))
	for i, e := range entites {
		vues[i] = vue{nom: resolutionJetons(e.Nom), chemin: resolutionJetons(strings.Join(e.Chemin, " "))}
	}
	contenu := func(i int, tolerant bool) bool {
		dansLeNom := false
		for _, dit := range dits {
			if !motCorrespond(dit, vues[i].chemin, tolerant) {
				return false
			}
			dansLeNom = dansLeNom || motCorrespond(dit, vues[i].nom, tolerant)
		}
		return dansLeNom
	}
	degres := []func(i int) bool{
		func(i int) bool { return searchkey.Cle(entites[i].Nom) == clePliee },
		func(i int) bool { return ensembleDe(vues[i].nom) == ensembleDit },
		func(i int) bool { return ensembleDe(vues[i].chemin) == ensembleDit },
		func(i int) bool { return contenu(i, false) },
		func(i int) bool { return contenu(i, true) },
	}
	for _, degre := range degres {
		var retenues []entiteNommee
		for i := range entites {
			if degre(i) {
				retenues = append(retenues, entites[i])
			}
		}
		if len(retenues) > 0 {
			return retenues
		}
	}
	return nil
}

// resoudreNom cherche d'abord parmi les entités qui portent des produits.
func resoudreNom(demande string, entites []entiteNommee) resolution {
	var peuplees, vides []entiteNommee
	for _, e := range entites {
		if e.Total > 0 {
			peuplees = append(peuplees, e)
		} else {
			vides = append(vides, e)
		}
	}
	retenues := resoudreParmi(demande, peuplees)
	if len(retenues) == 0 {
		retenues = resoudreParmi(demande, vides)
	}
	switch len(retenues) {
	case 0:
		return resolution{}
	case 1:
		return resolution{Trouvee: &retenues[0], EnTout: 1}
	}
	sort.SliceStable(retenues, func(a, b int) bool {
		if retenues[a].Total != retenues[b].Total {
			return retenues[a].Total > retenues[b].Total
		}
		return strings.Join(retenues[a].Chemin, " ") < strings.Join(retenues[b].Chemin, " ")
	})
	r := resolution{EnTout: len(retenues), Candidats: retenues}
	if len(r.Candidats) > resolutionCandidatsMax {
		r.Candidats = r.Candidats[:resolutionCandidatsMax]
	}
	return r
}
