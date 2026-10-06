// backend/routes/facebook_routes.go
//
// « PUBLIER SUR FACEBOOK » de PocketStick : l'affiche courante part comme photo
// sur une Page du magasin, avec un message. Doc :
// frontend/modules/stick/PocketStick-docs/16-publication-facebook.md.
//
// Cinq routes locales :
//
//	GET  /api/facebook/etat         connecté ? sur quelle Page ?        (session)
//	POST /api/facebook/connecter    un jeton utilisateur collé          (admin)
//	POST /api/facebook/choisir      une des Pages proposées             (admin)
//	POST /api/facebook/deconnecter  efface les jetons gardés là-bas     (admin)
//	POST /api/facebook/publier      image + message + envoi → le lien   (session)
//
// UNE sortie réseau, le mini-SaaS : `/api/facebook.php` (point 11), clé des
// notifications en `X-API-Key`. Le poste n'appelle JAMAIS Facebook : ni le secret
// de l'application ni le jeton de Page ne sont ici, et c'est le mini-SaaS qui
// publie. Le jeton utilisateur collé ne fait que traverser ce processus : il
// n'est ni gardé, ni journalisé, ni rendu au renderer — comme aucun jeton.
//
// ⚠️ Ce qui sort est PUBLIÉ : une image de l'affiche (prix compris) et un texte du
// vendeur. Un seul envoi, jamais de second essai : un post parti deux fois est
// public deux fois. Rien n'est journalisé ici qu'un code.

package routes

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/textproto"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"pocket-react/backend/secrets"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
)

const (
	pocketAppFacebookURL = "https://pocketapp.5sensprod.com/api/facebook.php"
	facebookUserAgent    = "PocketApp/1.0 (PocketStick facebook)"
	// La connexion fait jusqu'à trois appels à Graph côté mini-SaaS (15 s chacun).
	facebookTimeout = 60 * time.Second
	// Au-delà de FB_PUBLIER_TIMEOUT du mini-SaaS (60 s).
	facebookPublierTimeout        = 90 * time.Second
	facebookJetonMax              = 1024
	facebookMessageMax            = 2000            // FB_MESSAGE_MAX du mini-SaaS
	facebookImageMaxBytes         = 8 * 1024 * 1024 // DETOURAGE_MAX_BYTES du mini-SaaS
	facebookRequeteMaxBytes       = facebookImageMaxBytes + 1024*1024
	facebookReponseMaxBytes int64 = 64 * 1024
	facebookLienPrefixe           = "https://www.facebook.com/"
)

var (
	facebookEnvoiValide = regexp.MustCompile(`^[A-Za-z0-9_-]{16,64}$`)
	facebookPageValide  = regexp.MustCompile(`^[0-9]{1,32}$`)
	facebookPostValide  = regexp.MustCompile(`^[0-9]{1,40}(_[0-9]{1,40})?$`)
)

// erreursFacebook : code → statut rendu au renderer et message. Ni 401 ni 403 ne
// sont relayés tels quels : le renderer y lirait une session expirée ou un droit
// de l'utilisateur, alors que c'est la connexion à Facebook qui est en cause.
var erreursFacebook = map[string]detourageErreur{
	"cle_invalide":           {http.StatusServiceUnavailable, "cle_invalide", "La clé PocketApp de ce poste est refusée. Vérifie-la dans « Clés API & Secrets »."},
	"cle_absente":            {http.StatusServiceUnavailable, "cle_absente", "La clé PocketApp n'est pas configurée sur ce poste."},
	"adresse_non_securisee":  {http.StatusServiceUnavailable, "adresse_non_securisee", "La publication sur Facebook exige une adresse HTTPS."},
	"configuration_absente":  {http.StatusServiceUnavailable, "configuration_absente", "La publication sur Facebook n'est pas configurée sur le serveur PocketApp."},
	"service_indisponible":   {http.StatusBadGateway, "service_indisponible", "Le service PocketApp est injoignable. Rien n'est parti ; réessaie dans un instant."},
	"reponse_invalide":       {http.StatusBadGateway, "reponse_invalide", "Le service PocketApp a rendu une réponse inexploitable."},
	"delai_depasse":          {http.StatusGatewayTimeout, "delai_depasse", "Facebook n'a pas répondu à temps. Réessaie dans un instant."},
	"fournisseur_en_echec":   {http.StatusBadGateway, "fournisseur_en_echec", "Facebook n'a pas répondu comme attendu. Rien n'a été publié ; réessaie dans un instant."},
	"jeton_absent":           {http.StatusBadRequest, "jeton_absent", "Colle le jeton généré dans les outils de Meta."},
	"jeton_refuse":           {http.StatusBadRequest, "jeton_refuse", "Facebook refuse ce jeton : il est expiré, mal copié, ou vient d'une autre application. Génères-en un nouveau."},
	"permission_manquante":   {http.StatusConflict, "permission_manquante", "Il manque une permission Facebook (pages_show_list, pages_read_engagement, pages_manage_posts). Rien n'a été publié."},
	"aucune_page":            {http.StatusNotFound, "aucune_page", "Ce compte ne gère aucune Page Facebook, ou le jeton ne donne accès à aucune."},
	"page_inconnue":          {http.StatusNotFound, "page_inconnue", "Cette Page n'est plus proposée : colle de nouveau un jeton pour relire les Pages."},
	"page_non_connectee":     {http.StatusConflict, "page_non_connectee", "Aucune Page Facebook n'est connectée. Un administrateur doit le faire dans « Clés API & Secrets »."},
	"jeton_expire":           {http.StatusConflict, "jeton_expire", "La connexion à Facebook a expiré. Un administrateur doit la refaire dans « Clés API & Secrets ». Rien n'a été publié."},
	"message_trop_long":      {http.StatusBadRequest, "message_trop_long", "Le message est trop long (2000 caractères au plus)."},
	"envoi_invalide":         {http.StatusBadRequest, "envoi_invalide", "La publication n'a pas pu être préparée. Ferme la fenêtre et recommence."},
	"deja_envoye":            {http.StatusConflict, "deja_envoye", "Cette publication a déjà été envoyée. Vérifie la Page avant d'en préparer une nouvelle."},
	"contenu_refuse":         {http.StatusUnprocessableEntity, "contenu_refuse", "Facebook a refusé ce contenu. Rien n'a été publié ; ne renvoie pas la même publication."},
	"publication_incertaine": {http.StatusGatewayTimeout, "publication_incertaine", "La publication n'a pas été confirmée : elle est peut-être en ligne. Vérifie la Page avant de réessayer."},
	"image_absente":          {http.StatusBadRequest, "image_absente", "L'image de l'affiche est absente."},
	"image_illisible":        {http.StatusBadRequest, "image_illisible", "L'image de l'affiche n'a pas pu être lue."},
	"image_trop_lourde":      {http.StatusRequestEntityTooLarge, "image_trop_lourde", "L'image de l'affiche est trop lourde pour être publiée."},
	"type_refuse":            {http.StatusUnsupportedMediaType, "type_refuse", "Format d'image refusé : PNG, JPEG ou WebP uniquement."},
}

func erreurFacebook(code string) *detourageErreur {
	e := erreursFacebook[code]
	return &e
}

type facebookDeps struct {
	// cle : la clé PocketApp (celle des notifications), en-tête X-API-Key.
	cle      func() (string, error)
	endpoint string
	client   *http.Client
}

type facebookPage struct {
	ID  string `json:"id"`
	Nom string `json:"nom"`
}

// facebookEtat est TOUT ce que le renderer reçoit de l'état. La réponse du
// mini-SaaS est relue dans cette forme puis réécrite : un champ de plus là-bas
// (un jeton, par erreur) ne traverserait pas.
type facebookEtat struct {
	Configure bool           `json:"configure"`
	Connecte  bool           `json:"connecte"`
	Page      *facebookPage  `json:"page"`
	Depuis    string         `json:"depuis,omitempty"`
	AChoisir  []facebookPage `json:"a_choisir"`
}

type facebookPublication struct {
	Lien string        `json:"lien"`
	Page *facebookPage `json:"page"`
}

// rienNestParti : l'échec vient de l'établissement de la liaison (résolution,
// connexion, TLS) — aucun octet de la requête n'a quitté le poste.
func rienNestParti(err error) bool {
	var dns *net.DNSError
	if errors.As(err, &dns) {
		return true
	}
	var op *net.OpError
	return errors.As(err, &op) && op.Op == "dial"
}

// posterFacebook envoie UN formulaire à facebook.php et rend le corps d'un 200.
// Mêmes gardes que posterPhotos : HTTPS seul, clé, User-Agent, lecture bornée,
// codes connus, un seul envoi. `publication` change la lecture d'un échec SANS
// réponse nette : l'affiche a pu partir, on ne dit donc jamais « rien n'est parti »
// sans le savoir.
func posterFacebook(ctx context.Context, d facebookDeps, contentType string, corps io.Reader, publication bool) ([]byte, *detourageErreur) {
	cle, err := d.cle()
	cle = strings.TrimSpace(cle)
	if err != nil || cle == "" {
		return nil, erreurFacebook("cle_absente")
	}
	if u, err := url.Parse(d.endpoint); err != nil || u.Scheme != "https" {
		return nil, erreurFacebook("adresse_non_securisee")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.endpoint, corps)
	if err != nil {
		return nil, erreurFacebook("service_indisponible")
	}
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("X-API-Key", cle)
	req.Header.Set("User-Agent", facebookUserAgent)
	// Un POST n'est jamais rejoué par net/http après une coupure : c'est voulu.

	incertain := "service_indisponible"
	if publication {
		incertain = "publication_incertaine"
	}
	reponse, err := d.client.Do(req)
	if err != nil {
		switch {
		case rienNestParti(err):
			return nil, erreurFacebook("service_indisponible")
		case publication:
			return nil, erreurFacebook("publication_incertaine")
		case estUnDelai(err):
			return nil, erreurFacebook("delai_depasse")
		}
		return nil, erreurFacebook("service_indisponible")
	}
	defer reponse.Body.Close()

	if reponse.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(io.LimitReader(reponse.Body, 8*1024))
		var echec struct {
			Code string `json:"code"`
		}
		if json.Unmarshal(raw, &echec) == nil {
			if _, connu := erreursFacebook[echec.Code]; connu {
				return nil, erreurFacebook(echec.Code)
			}
		}
		// Un 5xx sans code connu ne dit pas ce que le serveur a eu le temps de faire
		if reponse.StatusCode >= 500 {
			return nil, erreurFacebook(incertain)
		}
		return nil, erreurFacebook("fournisseur_en_echec")
	}
	octets, err := io.ReadAll(io.LimitReader(reponse.Body, facebookReponseMaxBytes+1))
	if err != nil || int64(len(octets)) > facebookReponseMaxBytes {
		if publication {
			return nil, erreurFacebook("publication_incertaine")
		}
		return nil, erreurFacebook("reponse_invalide")
	}
	return octets, nil
}

// actionFacebook envoie une action sans fichier et rend l'état relu.
func actionFacebook(c echo.Context, d facebookDeps, champs url.Values) error {
	ctx, cancel := context.WithTimeout(c.Request().Context(), facebookTimeout)
	defer cancel()
	corps, echec := posterFacebook(ctx, d, "application/x-www-form-urlencoded", strings.NewReader(champs.Encode()), false)
	if echec != nil {
		return repondreErreurDetourage(c, echec)
	}
	var etat facebookEtat
	if json.Unmarshal(corps, &etat) != nil {
		return repondreErreurDetourage(c, erreurFacebook("reponse_invalide"))
	}
	if etat.Page != nil && !facebookPageValide.MatchString(etat.Page.ID) {
		return repondreErreurDetourage(c, erreurFacebook("reponse_invalide"))
	}
	propres := make([]facebookPage, 0, len(etat.AChoisir))
	for _, p := range etat.AChoisir {
		if facebookPageValide.MatchString(p.ID) {
			propres = append(propres, p)
		}
	}
	etat.AChoisir = propres
	c.Response().Header().Set("Cache-Control", "no-store")
	return c.JSON(http.StatusOK, etat)
}

func traiterFacebookEtat(c echo.Context, d facebookDeps) error {
	return actionFacebook(c, d, url.Values{"action": {"etat"}})
}

// traiterFacebookConnecter relaie le jeton UTILISATEUR collé par un
// administrateur. Il ne fait que passer : rien ne le garde ni ne l'écrit ici.
func traiterFacebookConnecter(c echo.Context, d facebookDeps) error {
	var input struct {
		Jeton string `json:"jeton"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(c.Response(), c.Request().Body, 8*1024)).Decode(&input); err != nil {
		return apis.NewBadRequestError("Demande invalide", nil)
	}
	jeton := strings.TrimSpace(input.Jeton)
	if jeton == "" {
		return repondreErreurDetourage(c, erreurFacebook("jeton_absent"))
	}
	if len(jeton) > facebookJetonMax || strings.ContainsAny(jeton, " \t\r\n") {
		return repondreErreurDetourage(c, erreurFacebook("jeton_refuse"))
	}
	return actionFacebook(c, d, url.Values{"action": {"connecter"}, "jeton": {jeton}})
}

func traiterFacebookChoisir(c echo.Context, d facebookDeps) error {
	var input struct {
		PageID string `json:"page_id"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(c.Response(), c.Request().Body, 8*1024)).Decode(&input); err != nil {
		return apis.NewBadRequestError("Demande invalide", nil)
	}
	if !facebookPageValide.MatchString(input.PageID) {
		return repondreErreurDetourage(c, erreurFacebook("page_inconnue"))
	}
	return actionFacebook(c, d, url.Values{"action": {"choisir"}, "page_id": {input.PageID}})
}

func traiterFacebookDeconnecter(c echo.Context, d facebookDeps) error {
	return actionFacebook(c, d, url.Values{"action": {"deconnecter"}})
}

// messageFacebook : sauts de ligne normalisés, bords rognés. Le texte du vendeur
// n'est ni réécrit ni tronqué.
func messageFacebook(brut string) string {
	return strings.TrimSpace(strings.NewReplacer("\r\n", "\n", "\r", "\n").Replace(brut))
}

// traiterFacebookPublier est le corps de la route, sans l'authentification :
// lire l'image, le message et l'identifiant d'envoi, tout vérifier AVANT de
// partir, puis UN envoi.
func traiterFacebookPublier(c echo.Context, d facebookDeps) error {
	if cle, err := d.cle(); err != nil || strings.TrimSpace(cle) == "" {
		return repondreErreurDetourage(c, erreurFacebook("cle_absente"))
	}
	req := c.Request()
	req.Body = http.MaxBytesReader(c.Response(), req.Body, facebookRequeteMaxBytes)
	if err := req.ParseMultipartForm(8 * 1024 * 1024); err != nil {
		var trop *http.MaxBytesError
		if errors.As(err, &trop) {
			return repondreErreurDetourage(c, erreurFacebook("image_trop_lourde"))
		}
		return apis.NewBadRequestError("Envoi multipart invalide", nil)
	}
	message := messageFacebook(req.FormValue("message"))
	if utf8.RuneCountInString(message) > facebookMessageMax {
		return repondreErreurDetourage(c, erreurFacebook("message_trop_long"))
	}
	envoi := req.FormValue("envoi")
	if !facebookEnvoiValide.MatchString(envoi) {
		return repondreErreurDetourage(c, erreurFacebook("envoi_invalide"))
	}
	fichier, _, err := req.FormFile("image")
	if err != nil {
		return repondreErreurDetourage(c, erreurFacebook("image_absente"))
	}
	defer fichier.Close()
	image, err := io.ReadAll(io.LimitReader(fichier, facebookImageMaxBytes+1))
	if err != nil {
		return repondreErreurDetourage(c, erreurFacebook("image_illisible"))
	}
	if len(image) > facebookImageMaxBytes {
		return repondreErreurDetourage(c, erreurFacebook("image_trop_lourde"))
	}
	// Le type se lit sur les octets, jamais sur l'en-tête déclaré
	mimeType, ok := typeImageDetourage(image)
	if !ok {
		return repondreErreurDetourage(c, erreurFacebook("type_refuse"))
	}

	var corps bytes.Buffer
	mw := multipart.NewWriter(&corps)
	entete := textproto.MIMEHeader{}
	entete.Set("Content-Disposition", `form-data; name="image"; filename="image"`)
	entete.Set("Content-Type", mimeType)
	part, err := mw.CreatePart(entete)
	if err == nil {
		_, err = part.Write(image)
	}
	for _, champ := range [][2]string{{"action", "publier"}, {"envoi", envoi}, {"message", message}} {
		if err == nil {
			err = mw.WriteField(champ[0], champ[1])
		}
	}
	if err == nil {
		err = mw.Close()
	}
	if err != nil {
		return repondreErreurDetourage(c, erreurFacebook("service_indisponible"))
	}

	ctx, cancel := context.WithTimeout(req.Context(), facebookPublierTimeout)
	defer cancel()
	rendu, echec := posterFacebook(ctx, d, mw.FormDataContentType(), &corps, true)
	if echec != nil {
		return repondreErreurDetourage(c, echec)
	}
	// Le mini-SaaS a répondu 200 : la photo est en ligne. Une réponse illisible
	// n'y change rien — on ne propose surtout pas de renvoyer.
	var publie struct {
		Lien   string        `json:"lien"`
		PostID string        `json:"post_id"`
		Page   *facebookPage `json:"page"`
	}
	if json.Unmarshal(rendu, &publie) != nil || !facebookPostValide.MatchString(publie.PostID) ||
		publie.Lien != facebookLienPrefixe+publie.PostID {
		return repondreErreurDetourage(c, erreurFacebook("publication_incertaine"))
	}
	if publie.Page != nil && !facebookPageValide.MatchString(publie.Page.ID) {
		publie.Page = nil
	}
	c.Response().Header().Set("Cache-Control", "no-store")
	return c.JSON(http.StatusOK, facebookPublication{Lien: publie.Lien, Page: publie.Page})
}

func RegisterFacebookRoutes(pb *pocketbase.PocketBase, router *echo.Echo) {
	deps := facebookDeps{
		cle: func() (string, error) {
			return secrets.NewSecretManager(pb).GetSecret(secrets.KeyNotificationAPI)
		},
		endpoint: pocketAppFacebookURL,
		// Le délai est porté par le contexte de chaque route ; celui-ci est le filet.
		client: &http.Client{Timeout: facebookPublierTimeout + 5*time.Second},
	}
	// La session est celle que PocketBase a VÉRIFIÉE (signature du jeton comprise).
	connecte := func(traiter func(echo.Context, facebookDeps) error) echo.HandlerFunc {
		return func(c echo.Context) error {
			if apis.RequestInfo(c).AuthRecord == nil {
				return apis.NewForbiddenError("Non authentifié", nil)
			}
			return traiter(c, deps)
		}
	}
	admin := func(traiter func(echo.Context, facebookDeps) error) echo.HandlerFunc {
		return func(c echo.Context) error {
			utilisateur := apis.RequestInfo(c).AuthRecord
			if utilisateur == nil {
				return apis.NewForbiddenError("Non authentifié", nil)
			}
			if utilisateur.GetString("role") != "admin" {
				return apis.NewForbiddenError("Réservé aux administrateurs", nil)
			}
			return traiter(c, deps)
		}
	}

	router.GET("/api/facebook/etat", connecte(traiterFacebookEtat))
	router.POST("/api/facebook/connecter", admin(traiterFacebookConnecter))
	router.POST("/api/facebook/choisir", admin(traiterFacebookChoisir))
	router.POST("/api/facebook/deconnecter", admin(traiterFacebookDeconnecter))
	router.POST("/api/facebook/publier", connecte(traiterFacebookPublier))
}
