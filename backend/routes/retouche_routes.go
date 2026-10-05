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

var relaisRetouche = relaisImage{
	erreurs:    erreursRetouche,
	userAgent:  retoucheUserAgent,
	delaiPoste: "Le service de retouche n'a pas répondu à temps. Réessaie dans un instant.",
}

// champsRetouche lit la consigne et la qualité envoyées par le renderer. Tout
// autre champ (un modèle, des dimensions) n'est pas lu, donc jamais relayé. La
// qualité n'est pas comparée à une liste : c'est le mini-SaaS qui la connaît.
func champsRetouche(req *http.Request) ([]champRelais, *detourageErreur) {
	consigne := strings.TrimSpace(req.FormValue("prompt"))
	if consigne == "" || !utf8.ValidString(consigne) {
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
	return champs, nil
}

// traiterRetouche est le corps de la route, sans l'authentification.
func traiterRetouche(c echo.Context, d detourageDeps) error {
	return relaisRetouche.traiter(c, d, champsRetouche)
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
