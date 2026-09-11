// backend/routes/product_similarity.go
//
// LES DÉSIGNATIONS QUI SE RESSEMBLENT, sans être identiques.
//
// Complète `trouverDoublons` (product_duplicates_routes.go) : « Casio CDP110 »
// doit signaler « Bundle Casio CDP110 », « CDP-110 », « casio cdp110 noir » et
// la faute « Casio CPD110 » — mais jamais « Casio CDP130 », « Yamaha P145 »
// pour « P45 », ni un câble de 6 m pour un câble de 3 m.
//
// ── LA TECHNIQUE (mesurée le 11 septembre 2026, voir CLAUDE.md) ──────────────
// Jetons normalisés, en mémoire, recalculés à chaque requête — aucune
// dépendance, aucun index :
//
//  1. Accents retirés, minuscules. Un décimal se recolle (« 6,35 » = « 6.35 »
//     = « 635 ») et une unité rejoint son nombre (« 3 m » = « 3M » =
//     « 3 mètres »). Découpage sur tout le reste. Les mots vides métier (bundle,
//     pack, occasion, couleurs…) sont retirés, le pluriel simple ramené au
//     singulier.
//  2. Les CODES MODÈLE se recollent : « CDP-110 », « CDP 110 » et « cdp110 »
//     sont le même jeton, parce qu'une suite de un à trois jetons voisins d'un
//     côté est comparée à une suite de un à trois jetons de l'autre.
//  3. Un jeton qui porte un chiffre, ou de trois caractères au plus, est une
//     SPÉCIFICATION (modèle, longueur, taille, tonalité : P45, 3m, XLR (F),
//     Sib, en DO). Si CHAQUE côté garde une spécification que l'autre n'a pas,
//     la paire est EXCLUE, quel que soit le reste : CDP110/CDP130, P45/P145,
//     « A Mineur »/« E Mineur ». Une spécification présente d'un seul côté ne
//     suffit pas à exclure — « Casio CDP-S110 : … 88 touches » ressemble
//     toujours à « Bundle Casio CDP S110 ».
//  4. Fautes de frappe : sur un mot de quatre lettres ou plus, une édition
//     (Damerau : insertion, suppression, substitution ou transposition). Sur un
//     code modèle, SEULE la transposition de deux lettres voisines, chiffres
//     inchangés : CPD110 = CDP110, mais EDC34 ≠ EDQ34 et P45 ≠ P145.
//
// Le score mêle ce que la saisie retrouve dans la fiche (75 %) et ce que la
// fiche retrouve dans la saisie (25 %) ; une spécification pèse double. Une
// fiche de bundle énumère ses accessoires : la pondérer davantage la ferait
// disparaître, alors que c'est le cas même qui a motivé ce fichier.

package routes

import (
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

const (
	// seuilSemblable — en dessous, la fiche n'apparaît pas du tout.
	seuilSemblable = 0.55
	// seuilFort — à partir de là, la ressemblance ouvre le dialogue de
	// validation ; en dessous, l'encadré de saisie suffit.
	seuilFort = 0.9
)

var motsVidesProduit = func() map[string]bool {
	mots := map[string]bool{}
	for _, m := range strings.Fields(`
		bundle pack kit lot set occasion location neuf new
		noir noire black blanc blanche white rouge red bleu bleue blue vert verte
		green gris grise grey gray marron brown violet purple rose pink jaune
		yellow orange argent silver or gold beige creme
		de du des le les un une pour avec et en au aux sur par
		the for with and of`) {
		mots[m] = true
	}
	return mots
}()

// Ce qui suit un nombre et s'y recolle. Les formes longues se ramènent au
// symbole.
var unitesProduit = map[string]string{
	"m": "m", "metre": "m", "metres": "m", "meter": "m", "meters": "m",
	"mm": "mm", "cm": "cm", "w": "w", "v": "v", "kg": "kg", "g": "g",
}

type jetonDesignation struct {
	texte string
	// spec — porte un chiffre, ou tient en trois caractères au plus.
	spec bool
}

func (j jetonDesignation) poids() float64 {
	if j.spec {
		return 2
	}
	return 1
}

var sansSeparateurDecimal = strings.NewReplacer(".", "", ",", "")

// sansAccents — pas de `transform.Chain` partagé : il garde un état et la route
// sert plusieurs postes en même temps. `norm.NFD.String` n'en a pas.
func sansAccents(valeur string) string {
	for i := 0; i < len(valeur); i++ {
		if valeur[i] >= utf8.RuneSelf {
			var b strings.Builder
			for _, r := range norm.NFD.String(valeur) {
				if !unicode.Is(unicode.Mn, r) {
					b.WriteRune(r)
				}
			}
			return b.String()
		}
	}
	return valeur
}

func jetonsDesignation(valeur string) []jetonDesignation {
	plat := strings.ToLower(sansAccents(valeur))

	chiffre := func(i int) bool { return i >= 0 && i < len(plat) && plat[i] >= '0' && plat[i] <= '9' }
	var morceaux []string
	debut := -1
	for i := 0; i <= len(plat); i++ {
		alnum := i < len(plat) && (plat[i] >= 'a' && plat[i] <= 'z' || chiffre(i))
		// « 6,35 » et « 6.35 » : le séparateur décimal ne coupe pas.
		decimal := i < len(plat) && (plat[i] == '.' || plat[i] == ',') && chiffre(i-1) && chiffre(i+1)
		switch {
		case alnum && debut < 0:
			debut = i
		case !alnum && !decimal && debut >= 0:
			morceau := plat[debut:i]
			if strings.ContainsAny(morceau, ".,") {
				morceau = sansSeparateurDecimal.Replace(morceau)
			}
			morceaux = append(morceaux, morceau)
			debut = -1
		}
	}

	jetons := make([]jetonDesignation, 0, len(morceaux))
	for _, m := range morceaux {
		if motsVidesProduit[m] {
			continue
		}
		if u, ok := unitesProduit[m]; ok && len(jetons) > 0 && estNombre(jetons[len(jetons)-1].texte) {
			jetons[len(jetons)-1].texte += u
			continue
		}
		aChiffre := strings.ContainsAny(m, "0123456789")
		if !aChiffre && len(m) >= 5 && (m[len(m)-1] == 's' || m[len(m)-1] == 'x') && m[len(m)-2] != 's' {
			m = m[:len(m)-1]
		}
		jetons = append(jetons, jetonDesignation{texte: m, spec: aChiffre || len(m) <= 3})
	}
	return jetons
}

func estNombre(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return s != ""
}

// saisieAnalysee — la saisie, découpée une fois par requête : ses jetons et,
// pour chaque position, la concaténation des un, deux et trois jetons suivants.
type saisieAnalysee struct {
	jetons []jetonDesignation
	formes [][3]string
}

func analyserSaisie(designation string) saisieAnalysee {
	jetons := jetonsDesignation(designation)
	formes := make([][3]string, len(jetons))
	for i := range jetons {
		texte := ""
		for n := 0; n < 3 && i+n < len(jetons); n++ {
			texte += jetons[i+n].texte
			formes[i][n] = texte
		}
	}
	return saisieAnalysee{jetons: jetons, formes: formes}
}

// similariteDesignation — 0 si la paire est exclue ou trop lointaine, sinon un
// score dans [seuilSemblable, 1]. `fautes` active la tolérance aux fautes de
// frappe (étape 4) ; il n'est à faux que pour la mesure comparative.
func similariteDesignation(saisie saisieAnalysee, fiche []jetonDesignation, fautes bool) float64 {
	q := saisie.jetons
	if len(q) == 0 || len(fiche) == 0 {
		return 0
	}
	var tamponQ, tamponF [32]bool
	trouveSaisie, trouveFiche := tamponQ[:0], tamponF[:0]
	if len(q) > len(tamponQ) || len(fiche) > len(tamponF) {
		trouveSaisie, trouveFiche = make([]bool, len(q)), make([]bool, len(fiche))
	} else {
		trouveSaisie, trouveFiche = tamponQ[:len(q)], tamponF[:len(fiche)]
	}

	for i := 0; i < len(q); {
		avance := 0
		for n := min(3, len(q)-i); n >= 1 && avance == 0; n-- {
			if debut, fin := suiteEgale(saisie.formes[i][n-1], fiche, trouveFiche); debut >= 0 {
				for k := debut; k < fin; k++ {
					trouveFiche[k] = true
				}
				avance = n
			}
		}
		if avance == 0 && fautes {
			if j := jetonApproche(q[i], fiche); j >= 0 {
				trouveFiche[j] = true
				avance = 1
			}
		}
		if avance == 0 {
			i++
			continue
		}
		for k := i; k < i+avance; k++ {
			trouveSaisie[k] = true
		}
		i += avance
	}

	couvSaisie, specSaisie, nbTrouves := couverture(q, trouveSaisie)
	couvFiche, specFiche, _ := couverture(fiche, trouveFiche)
	if specSaisie && specFiche {
		return 0
	}
	// Un seul mot commun ne dit rien (« Capo », « Housse ») — sauf si c'est un
	// code modèle complet.
	if nbTrouves < 2 && !(nbTrouves == 1 && codeModeleTrouve(q, trouveSaisie)) {
		return 0
	}
	score := 0.75*couvSaisie + 0.25*couvFiche
	if score < seuilSemblable {
		return 0
	}
	return score
}

// suiteEgale — une suite de un à trois jetons voisins de la fiche dont la
// concaténation vaut `s`, en préférant une suite encore libre. Sans allocation :
// appelée pour chaque fiche du catalogue.
func suiteEgale(s string, fiche []jetonDesignation, pris []bool) (int, int) {
	repli := -1
	repliFin := -1
	for j := range fiche {
		reste, k := s, j
		for k < len(fiche) && k < j+3 && reste != "" && strings.HasPrefix(reste, fiche[k].texte) {
			reste = reste[len(fiche[k].texte):]
			k++
		}
		if reste != "" {
			continue
		}
		if !pris[j] {
			return j, k
		}
		if repli < 0 {
			repli, repliFin = j, k
		}
	}
	return repli, repliFin
}

// couverture — part pondérée des jetons trouvés, s'il reste une spécification
// non trouvée, et combien de jetons ont été trouvés.
func couverture(jetons []jetonDesignation, trouves []bool) (float64, bool, int) {
	total, pris := 0.0, 0.0
	specRestante := false
	nb := 0
	for i, j := range jetons {
		total += j.poids()
		if trouves[i] {
			pris += j.poids()
			nb++
		} else if j.spec {
			specRestante = true
		}
	}
	return pris / total, specRestante, nb
}

func codeModeleTrouve(jetons []jetonDesignation, trouves []bool) bool {
	for i, j := range jetons {
		if trouves[i] && len(j.texte) >= 4 && strings.ContainsAny(j.texte, "0123456789") &&
			strings.IndexFunc(j.texte, unicode.IsLetter) >= 0 {
			return true
		}
	}
	return false
}

// jetonApproche — l'indice d'un jeton de la fiche à une faute de frappe près,
// ou -1.
func jetonApproche(j jetonDesignation, fiche []jetonDesignation) int {
	chiffre := strings.ContainsAny(j.texte, "0123456789")
	for k, f := range fiche {
		if chiffre {
			if transpositionDeLettres(j.texte, f.texte) {
				return k
			}
			continue
		}
		if len(j.texte) >= 4 && len(f.texte) >= 4 &&
			!strings.ContainsAny(f.texte, "0123456789") && distanceUneEdition(j.texte, f.texte) {
			return k
		}
	}
	return -1
}

// transpositionDeLettres — même longueur, deux LETTRES voisines échangées,
// tout le reste identique. Les chiffres ne bougent jamais : P45 n'est pas P54.
func transpositionDeLettres(a, b string) bool {
	if len(a) != len(b) || a == b {
		return false
	}
	i := 0
	for i < len(a) && a[i] == b[i] {
		i++
	}
	return i+1 < len(a) && a[i] == b[i+1] && a[i+1] == b[i] &&
		unicode.IsLetter(rune(a[i])) && unicode.IsLetter(rune(a[i+1])) &&
		a[i+2:] == b[i+2:]
}

// distanceUneEdition — distance de Damerau (OSA) inférieure ou égale à 1.
func distanceUneEdition(a, b string) bool {
	if a == b {
		return true
	}
	if len(a) > len(b) {
		a, b = b, a
	}
	switch len(b) - len(a) {
	case 0:
		i := 0
		for i < len(a) && a[i] == b[i] {
			i++
		}
		if a[i+1:] == b[i+1:] {
			return true // substitution
		}
		return i+1 < len(a) && a[i] == b[i+1] && a[i+1] == b[i] && a[i+2:] == b[i+2:]
	case 1:
		i := 0
		for i < len(a) && a[i] == b[i] {
			i++
		}
		return a[i:] == b[i+1:] // insertion
	}
	return false
}
