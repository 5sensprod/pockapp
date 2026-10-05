package routes

import (
	"fmt"
	"net/http"
	"strings"
	"unicode/utf8"

	"pocket-react/backend/secrets"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
)

// Retouche d'image par consigne (« Modifier par IA », PocketStick), relayée au
// mini-SaaS sur le MÊME trajet que le détourage (detourage_routes.go) : même
// clé, mêmes vérifications, même délai, même en-tête de durée. Seuls changent
// l'adresse, les deux champs joints et les messages.
//
// ⚠️ Cette sortie porte le contenu d'une image ET un texte saisi par le vendeur.
// La consigne n'est jamais journalisée ici. Le poste n'envoie qu'une QUALITÉ :
// le modèle, les dimensions et le prix sont décidés par le mini-SaaS.
//
// Depuis le 6 octobre 2026 la même route porte deux autres TÂCHES, choisies par
// le champ « tache » : « generation » — un TEXTE SEUL part, aucune image — et
// « composition » — 1 à 4 images (« images[] »). Absent : la retouche d'origine,
// dont le contrat n'a pas changé. Doc : PocketStick-docs/12-composition-et-generation.md.
const (
	pocketAppRetoucheURL = "https://pocketapp.5sensprod.com/api/retouche.php"
	retoucheUserAgent    = "PocketApp/1.0 (PocketStick image edit)"
	// Même plafond que le mini-SaaS (RETOUCHE_PROMPT_MAX), en caractères.
	retoucheConsigneMax = 500
	retoucheQualiteMax  = 32
)

// erreursRetouche : les codes du détourage avec les mots de la retouche, plus
// les siens. `contenu_refuse` n'invite pas à réessayer à l'identique.
var erreursRetouche = map[string]detourageErreur{
	"cle_invalide":          erreursDetourage["cle_invalide"],
	"credit_epuise":         {http.StatusPaymentRequired, "credit_epuise", "Les crédits IA ne suffisent pas pour cette qualité. La retouche n'a pas été faite ni facturée."},
	"image_trop_lourde":     {http.StatusRequestEntityTooLarge, "image_trop_lourde", "L'image est trop lourde pour la retouche."},
	"type_refuse":           erreursDetourage["type_refuse"],
	"fournisseur_en_echec":  {http.StatusBadGateway, "fournisseur_en_echec", "Le service de retouche est en panne. Réessaie dans un instant."},
	"delai_depasse":         {http.StatusGatewayTimeout, "delai_depasse", "Le service de retouche n'a pas répondu à temps. Réessaie : rien n'a été décompté."},
	"service_indisponible":  erreursDetourage["service_indisponible"],
	"reponse_invalide":      {http.StatusBadGateway, "reponse_invalide", "Le service de retouche a rendu une réponse inexploitable."},
	"cle_absente":           erreursDetourage["cle_absente"],
	"adresse_non_securisee": {http.StatusServiceUnavailable, "adresse_non_securisee", "La retouche exige une adresse HTTPS."},
	"prompt_absent":         {http.StatusBadRequest, "prompt_absent", "Écris ce que tu veux changer dans l'image."},
	"prompt_trop_long":      {http.StatusBadRequest, "prompt_trop_long", "La consigne est trop longue (500 caractères au plus)."},
	"qualite_inconnue":      {http.StatusBadRequest, "qualite_inconnue", "Cette qualité de retouche n'existe pas."},
	"format_inconnu":        {http.StatusBadRequest, "format_inconnu", "Ce format de résultat n'existe pas."},
	"contenu_refuse":        {http.StatusUnprocessableEntity, "contenu_refuse", "Cette demande a été refusée par le service : change la consigne ou l'image. Rien n'a été décompté."},
}

// erreursDeTache : les codes de la retouche, avec les mots d'une autre tâche de
// la même porte. `service` : « de génération » ; `rien` : ce qui n'a pas eu lieu.
func erreursDeTache(service, rien, refus string) map[string]detourageErreur {
	m := make(map[string]detourageErreur, len(erreursRetouche)+1)
	for code, e := range erreursRetouche {
		m[code] = e
	}
	m["credit_epuise"] = detourageErreur{http.StatusPaymentRequired, "credit_epuise", "Les crédits IA ne suffisent pas pour cette qualité. " + rien}
	m["image_trop_lourde"] = detourageErreur{http.StatusRequestEntityTooLarge, "image_trop_lourde", "Les images sont trop lourdes, ensemble, pour être envoyées."}
	m["fournisseur_en_echec"] = detourageErreur{http.StatusBadGateway, "fournisseur_en_echec", "Le service " + service + " est en panne. Réessaie dans un instant."}
	m["delai_depasse"] = detourageErreur{http.StatusGatewayTimeout, "delai_depasse", "Le service " + service + " n'a pas répondu à temps. Réessaie : rien n'a été décompté."}
	m["reponse_invalide"] = detourageErreur{http.StatusBadGateway, "reponse_invalide", "Le service " + service + " a rendu une réponse inexploitable."}
	m["prompt_absent"] = detourageErreur{http.StatusBadRequest, "prompt_absent", "Écris ce que tu veux obtenir."}
	m["qualite_inconnue"] = detourageErreur{http.StatusBadRequest, "qualite_inconnue", "Cette qualité n'existe pas."}
	m["contenu_refuse"] = detourageErreur{http.StatusUnprocessableEntity, "contenu_refuse", refus}
	m["trop_d_images"] = detourageErreur{http.StatusBadRequest, "trop_d_images", "Une composition accepte 4 éléments au plus."}
	return m
}

var relaisGeneration = relaisImage{
	erreurs: erreursDeTache("de génération", "L'image n'a pas été générée ni facturée.",
		"Cette demande a été refusée par le service : change la consigne. Rien n'a été décompté."),
	userAgent:  "PocketApp/1.0 (PocketStick image generation)",
	delaiPoste: "Le service de génération n'a pas répondu à temps. Réessaie dans un instant.",
	images:     imagesAucune,
}

var relaisComposition = relaisImage{
	erreurs: erreursDeTache("de composition", "La composition n'a pas été faite ni facturée.",
		"Cette demande a été refusée par le service : change la consigne ou les éléments. Rien n'a été décompté."),
	userAgent:  "PocketApp/1.0 (PocketStick image composition)",
	delaiPoste: "Le service de composition n'a pas répondu à temps. Réessaie dans un instant.",
	images:     imagesPlusieurs,
}

var relaisRetouche = relaisImage{
	erreurs:    erreursRetouche,
	userAgent:  retoucheUserAgent,
	delaiPoste: "Le service de retouche n'a pas répondu à temps. Réessaie dans un instant.",
}

// relaisDeLaRoute est ce que la route monte : la retouche, plus les tâches que
// le champ « tache » choisit. Sans ce champ, c'est `relaisRetouche` tel quel.
var relaisDeLaRoute = relaisImage{
	erreurs:    erreursRetouche,
	userAgent:  retoucheUserAgent,
	delaiPoste: relaisRetouche.delaiPoste,
	taches: map[string]relaisImage{
		"":            relaisRetouche,
		"generation":  relaisGeneration,
		"composition": relaisComposition,
	},
}

// champsRetouche lit la consigne et la qualité envoyées par le renderer. Tout
// autre champ (un modèle, des dimensions) n'est pas lu, donc jamais relayé. La
// qualité n'est pas comparée à une liste : c'est le mini-SaaS qui la connaît.
func champsRetouche(req *http.Request) ([]champRelais, *detourageErreur) {
	tache := strings.TrimSpace(req.FormValue("tache"))
	consigne := strings.TrimSpace(req.FormValue("prompt"))
	if consigne == "" || !utf8.ValidString(consigne) {
		if autre, ok := relaisDeLaRoute.taches[tache]; ok {
			return nil, autre.erreur("prompt_absent")
		}
		return nil, relaisRetouche.erreur("prompt_absent")
	}
	if utf8.RuneCountInString(consigne) > retoucheConsigneMax {
		return nil, relaisRetouche.erreur("prompt_trop_long")
	}
	qualite := strings.TrimSpace(req.FormValue("qualite"))
	if qualite == "" || len(qualite) > retoucheQualiteMax {
		return nil, relaisRetouche.erreur("qualite_inconnue")
	}
	for _, c := range qualite {
		if (c < 'a' || c > 'z') && c != '_' {
			return nil, relaisRetouche.erreur("qualite_inconnue")
		}
	}
	champs := []champRelais{{"prompt", consigne}, {"qualite", qualite}}
	// Format et définition du résultat : facultatifs (embellissement d'une page).
	// Des identifiants, jamais des pixels ; absents, le mini-SaaS prend ses défauts.
	for _, nom := range []string{"format", "definition"} {
		valeur := strings.TrimSpace(req.FormValue(nom))
		if valeur == "" {
			continue
		}
		if len(valeur) > retoucheQualiteMax {
			return nil, relaisRetouche.erreur("format_inconnu")
		}
		for _, c := range valeur {
			if (c < 'a' || c > 'z') && (c < '0' || c > '9') && c != '_' {
				return nil, relaisRetouche.erreur("format_inconnu")
			}
		}
		champs = append(champs, champRelais{nom, valeur})
	}
	// La tâche, déjà reconnue par `traiter`, et le NOMBRE d'images envoyées : PHP
	// écarte sans le dire les fichiers au-delà de max_file_uploads, et le
	// mini-SaaS refuse alors au lieu de composer avec moins d'images.
	switch tache {
	case "generation":
		champs = append(champs, champRelais{"tache", tache})
	case "composition":
		n := 0
		if req.MultipartForm != nil {
			n = len(req.MultipartForm.File[champImages])
		}
		champs = append(champs, champRelais{"tache", tache}, champRelais{"nombre", fmt.Sprint(n)})
	}
	return champs, nil
}

// traiterRetouche est le corps de la route, sans l'authentification.
func traiterRetouche(c echo.Context, d detourageDeps) error {
	return relaisDeLaRoute.traiter(c, d, champsRetouche)
}

func RegisterRetoucheRoutes(pb *pocketbase.PocketBase, router *echo.Echo) {
	deps := detourageDeps{
		cle: func() (string, error) {
			return secrets.NewSecretManager(pb).GetSecret(secrets.KeyNotificationAPI)
		},
		endpoint: pocketAppRetoucheURL,
		client:   &http.Client{Timeout: detourageTimeout},
	}

	router.POST("/api/ai/image-to-image", func(c echo.Context) error {
		if apis.RequestInfo(c).AuthRecord == nil {
			return apis.NewForbiddenError("Non authentifié", nil)
		}
		if err := traiterRetouche(c, deps); err != nil {
			pb.Logger().Warn("Retouche refusée", "error", fmt.Sprint(err))
			return err
		}
		return nil
	})
}
