package routes

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"strings"
	"time"

	"pocket-react/backend/secrets"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
)

// Détourage d'image relayé au mini-SaaS (PocketStick).
//
// La clé du fournisseur d'images vit chez l'éditeur : le poste ne la connaît
// pas et n'appelle jamais le fournisseur. Il envoie l'image au mini-SaaS avec
// la clé des notifications ; celui-ci détoure, décompte les crédits IA du
// client et renvoie le PNG. Cette route n'appelle donc PAS usage.php.
//
// ⚠️ Premier canal du dépôt qui porte le contenu d'une image vers un tiers.
//
// detourageTimeout doit rester AU-DESSUS du délai Runware du mini-SaaS
// (RUNWARE_TIMEOUT, 150 s depuis le 6 octobre 2026 ; 75 s avant, pour 90 s
// ici) : sinon c'est le poste qui cesse d'attendre une image que le serveur
// finit, et décompte. Les deux se changent ensemble.
const (
	pocketAppDetourageURL     = "https://pocketapp.5sensprod.com/api/detourage.php"
	detourageTimeout          = 165 * time.Second
	detourageImageMaxBytes    = 20 * 1024 * 1024
	detourageRequestMaxBytes  = detourageImageMaxBytes + 1024*1024
	detourageResponseMaxBytes = 40 * 1024 * 1024
	detourageUserAgent        = "PocketApp/1.0 (PocketStick background removal)"
)

var pngSignature = []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}

// detourageErreur est ce que le renderer reçoit : le code distingue « crédit
// épuisé » de « service en panne », le message est lisible tel quel.
type detourageErreur struct {
	Status  int
	Code    string
	Message string
}

func (e *detourageErreur) Error() string { return e.Code + ": " + e.Message }

// erreursDetourage : code du mini-SaaS → statut rendu au renderer et message.
// 401 n'est pas relayé tel quel (le renderer y lirait une session expirée) :
// une clé refusée est un problème de configuration du poste, comme pour Gemini.
// `delai_depasse` est rendu par le mini-SaaS quand le fournisseur n'a pas fini à
// temps : ce n'est pas une panne, et rien n'a été décompté (le décompte suit la
// livraison). Un mini-SaaS plus ancien ne le rend pas : `fournisseur_en_echec`.
var erreursDetourage = map[string]detourageErreur{
	"cle_invalide":          {http.StatusServiceUnavailable, "cle_invalide", "La clé PocketApp de ce poste est refusée. Vérifie-la dans « Clés API & Secrets »."},
	"credit_epuise":         {http.StatusPaymentRequired, "credit_epuise", "Les crédits IA sont épuisés. Le détourage n'a pas été fait ni facturé."},
	"image_trop_lourde":     {http.StatusRequestEntityTooLarge, "image_trop_lourde", "L'image est trop lourde pour le détourage."},
	"type_refuse":           {http.StatusUnsupportedMediaType, "type_refuse", "Format d'image refusé : PNG, JPEG ou WebP uniquement."},
	"fournisseur_en_echec":  {http.StatusBadGateway, "fournisseur_en_echec", "Le service de détourage est en panne. Réessaie dans un instant."},
	"delai_depasse":         {http.StatusGatewayTimeout, "delai_depasse", "Le service de détourage n'a pas répondu à temps. Réessaie : rien n'a été décompté."},
	"service_indisponible":  {http.StatusBadGateway, "service_indisponible", "Le service PocketApp est injoignable. Réessaie dans un instant."},
	"reponse_invalide":      {http.StatusBadGateway, "reponse_invalide", "Le service de détourage a rendu une réponse inexploitable."},
	"cle_absente":           {http.StatusServiceUnavailable, "cle_absente", "La clé PocketApp n'est pas configurée sur ce poste."},
	"adresse_non_securisee": {http.StatusServiceUnavailable, "adresse_non_securisee", "Le détourage exige une adresse HTTPS."},
	"qualite_inconnue":      {http.StatusBadRequest, "qualite_inconnue", "Cette qualité de détourage n'existe pas."},
}

func erreurDetourage(code string) *detourageErreur {
	return relaisDetourage.erreur(code)
}

// relaisImage est ce qui distingue deux relais d'image vers le mini-SaaS — le
// détourage et la retouche par consigne (retouche_routes.go) : leurs messages et
// leur User-Agent. Tout le reste du trajet est commun.
type relaisImage struct {
	erreurs   map[string]detourageErreur
	userAgent string
	// delaiPoste : message quand c'est le délai de CE poste qui a expiré.
	delaiPoste string
	// taches : nil pour un relais à UNE image (détourage). Sinon le champ
	// « tache » du formulaire choisit le relais — ses mots et ses images : la
	// clé vide est la tâche d'origine, une valeur inconnue est refusée.
	taches map[string]relaisImage
	// images : ce que la tâche envoie (imagesUne par défaut).
	images int
}

// Ce qu'un relais envoie comme images.
const (
	imagesUne       = iota // le champ « image », un fichier
	imagesAucune           // un texte seul (génération)
	imagesPlusieurs        // le champ « images[] », 1 à relaisImagesMax fichiers (composition)
)

// relaisImagesMax : le plafond du mini-SaaS (COMPOSITION_MAX_IMAGES). Au-delà,
// refus ici, jamais une troncature.
const relaisImagesMax = 4

// champImages est le champ multipart des images d'une composition, tel que PHP
// le lit en tableau.
const champImages = "images[]"

var relaisDetourage = relaisImage{
	erreurs:    erreursDetourage,
	userAgent:  detourageUserAgent,
	delaiPoste: "Le service de détourage n'a pas répondu à temps. Réessaie dans un instant.",
}

func (r relaisImage) erreur(code string) *detourageErreur {
	e := r.erreurs[code]
	return &e
}

// champRelais est un champ texte ajouté à l'envoi multipart, à côté de l'image.
type champRelais struct{ nom, valeur string }

// typeImageDetourage lit le type sur les OCTETS, jamais sur l'en-tête déclaré.
func typeImageDetourage(octets []byte) (string, bool) {
	switch t := http.DetectContentType(octets); t {
	case "image/png", "image/jpeg", "image/webp":
		return t, true
	}
	return "", false
}

// delaiDuPoste : c'est le délai de CE poste qui a expiré, pas celui du mini-SaaS.
// Même code, mais sans promettre que rien n'a été décompté : le serveur a pu
// finir après que le poste a cessé d'attendre.
func (r relaisImage) delaiDuPoste() *detourageErreur {
	return &detourageErreur{http.StatusGatewayTimeout, "delai_depasse", r.delaiPoste}
}

func estUnDelai(err error) bool {
	var delai interface{ Timeout() bool }
	return errors.As(err, &delai) && delai.Timeout()
}

type detourageResultat struct {
	PNG        []byte
	BilledCost string
	// DureeMs : durée de l'appel au fournisseur, mesurée par le mini-SaaS
	// (en-tête X-Detourage-Ms). Vide si le serveur ne la rend pas encore.
	DureeMs string
}

// dureeRelayee ne laisse passer qu'un entier : l'en-tête vient d'un tiers.
func dureeRelayee(v string) string {
	v = strings.TrimSpace(v)
	if v == "" || len(v) > 9 {
		return ""
	}
	for _, c := range v {
		if c < '0' || c > '9' {
			return ""
		}
	}
	return v
}

// relayerDetourage envoie l'image au mini-SaaS et rend le PNG reçu.
func relayerDetourage(ctx context.Context, client *http.Client, endpoint, apiKey string, image []byte) (*detourageResultat, *detourageErreur) {
	return relaisDetourage.relayer(ctx, client, endpoint, apiKey, image, nil)
}

// relayer envoie l'image (et d'éventuels champs texte) au mini-SaaS et rend le
// PNG reçu. UN envoi : jamais de second essai, un appel coupé a pu être facturé.
func (r relaisImage) relayer(ctx context.Context, client *http.Client, endpoint, apiKey string, image []byte, champs []champRelais) (*detourageResultat, *detourageErreur) {
	return r.relayerImages(ctx, client, endpoint, apiKey, "image", [][]byte{image}, champs)
}

// relayerImages est le même envoi pour ZÉRO, une ou plusieurs images, toutes
// sous le champ `champ`. Chaque image passe les gardes d'une image seule (type
// lu sur les octets), et leur poids TOTAL reste sous le plafond d'une seule.
func (r relaisImage) relayerImages(ctx context.Context, client *http.Client, endpoint, apiKey, champ string, images [][]byte, champs []champRelais) (*detourageResultat, *detourageErreur) {
	erreurDetourage := r.erreur
	delaiDuPoste := r.delaiDuPoste
	if u, err := url.Parse(endpoint); err != nil || u.Scheme != "https" {
		return nil, erreurDetourage("adresse_non_securisee")
	}
	types := make([]string, len(images))
	total := 0
	for i, image := range images {
		mimeType, ok := typeImageDetourage(image)
		if !ok {
			return nil, erreurDetourage("type_refuse")
		}
		types[i] = mimeType
		if total += len(image); total > detourageImageMaxBytes {
			return nil, erreurDetourage("image_trop_lourde")
		}
	}

	var corps bytes.Buffer
	mw := multipart.NewWriter(&corps)
	var err error
	for i, image := range images {
		if err != nil {
			break
		}
		entete := textproto.MIMEHeader{}
		entete.Set("Content-Disposition", `form-data; name="`+champ+`"; filename="image"`)
		entete.Set("Content-Type", types[i])
		var part io.Writer
		if part, err = mw.CreatePart(entete); err == nil {
			_, err = part.Write(image)
		}
	}
	for _, champ := range champs {
		if err == nil {
			err = mw.WriteField(champ.nom, champ.valeur)
		}
	}
	if err == nil {
		err = mw.Close()
	}
	if err != nil {
		return nil, erreurDetourage("service_indisponible")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &corps)
	if err != nil {
		return nil, erreurDetourage("service_indisponible")
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("X-API-Key", apiKey)
	req.Header.Set("User-Agent", r.userAgent)

	reponse, err := client.Do(req)
	if err != nil {
		if estUnDelai(err) {
			return nil, delaiDuPoste()
		}
		return nil, erreurDetourage("service_indisponible")
	}
	defer reponse.Body.Close()

	if reponse.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(io.LimitReader(reponse.Body, 8*1024))
		var echec struct {
			Code string `json:"code"`
		}
		if json.Unmarshal(raw, &echec) == nil {
			if _, connu := r.erreurs[echec.Code]; connu {
				return nil, erreurDetourage(echec.Code)
			}
		}
		return nil, erreurDetourage("fournisseur_en_echec")
	}

	octets, err := io.ReadAll(io.LimitReader(reponse.Body, detourageResponseMaxBytes+1))
	if err != nil && estUnDelai(err) {
		return nil, delaiDuPoste()
	}
	if err != nil || len(octets) > detourageResponseMaxBytes || !bytes.HasPrefix(octets, pngSignature) {
		return nil, erreurDetourage("reponse_invalide")
	}
	return &detourageResultat{
		PNG:        octets,
		BilledCost: reponse.Header.Get("X-Billed-Cost"),
		DureeMs:    dureeRelayee(reponse.Header.Get("X-Detourage-Ms")),
	}, nil
}

func repondreErreurDetourage(c echo.Context, e *detourageErreur) error {
	return c.JSON(e.Status, map[string]string{"error": e.Message, "code": e.Code})
}

type detourageDeps struct {
	cle      func() (string, error)
	endpoint string
	client   *http.Client
}

// champsDetourage lit la QUALITÉ envoyée par le renderer (« rapide » ou
// « precis »). Tout autre champ (un modèle) n'est pas lu, donc jamais relayé. La
// qualité n'est pas comparée à une liste : c'est le mini-SaaS qui la connaît, et
// qui refuse une inconnue (`qualite_inconnue`). Absente — un renderer plus
// ancien —, rien n'est joint et le mini-SaaS prend sa qualité par défaut ;
// présente mais vide ou mal formée, elle est refusée ici, jamais remplacée.
func champsDetourage(req *http.Request) ([]champRelais, *detourageErreur) {
	valeurs, presente := req.MultipartForm.Value["qualite"]
	if !presente || len(valeurs) == 0 {
		return nil, nil
	}
	qualite := strings.TrimSpace(valeurs[0])
	if qualite == "" || len(qualite) > retoucheQualiteMax {
		return nil, relaisDetourage.erreur("qualite_inconnue")
	}
	for _, c := range qualite {
		if (c < 'a' || c > 'z') && c != '_' {
			return nil, relaisDetourage.erreur("qualite_inconnue")
		}
	}
	return []champRelais{{"qualite", qualite}}, nil
}

// traiterDetourage est le corps de la route, sans l'authentification : lire
// l'image envoyée par le renderer, la relayer, rendre le PNG.
func traiterDetourage(c echo.Context, d detourageDeps) error {
	return relaisDetourage.traiter(c, d, champsDetourage)
}

// traiter est le corps commun des routes de relais. `champs` lit et valide,
// dans le formulaire déjà analysé, les champs texte à joindre à l'image ; nil
// quand il n'y en a pas.
func (r relaisImage) traiter(c echo.Context, d detourageDeps, champs func(*http.Request) ([]champRelais, *detourageErreur)) error {
	erreurDetourage := r.erreur
	cle, err := d.cle()
	cle = strings.TrimSpace(cle)
	if err != nil || cle == "" {
		return repondreErreurDetourage(c, erreurDetourage("cle_absente"))
	}

	req := c.Request()
	req.Body = http.MaxBytesReader(c.Response(), req.Body, detourageRequestMaxBytes)
	if err := req.ParseMultipartForm(8 * 1024 * 1024); err != nil {
		var trop *http.MaxBytesError
		if errors.As(err, &trop) {
			return repondreErreurDetourage(c, erreurDetourage("image_trop_lourde"))
		}
		return apis.NewBadRequestError("Envoi multipart invalide", err)
	}
	// La tâche choisit le relais : ses mots, et ce qu'il envoie comme images.
	if r.taches != nil {
		autre, connue := r.taches[strings.TrimSpace(req.FormValue("tache"))]
		if !connue {
			return repondreErreurDetourage(c, erreurDetourage("format_inconnu"))
		}
		r = autre
		erreurDetourage = r.erreur
	}

	champ := "image"
	var images [][]byte
	switch r.images {
	case imagesAucune:
		// Un texte seul : une image jointe par erreur n'est pas lue, donc jamais relayée.
	case imagesPlusieurs:
		champ = champImages
		recus := req.MultipartForm.File[champImages]
		if len(recus) == 0 {
			return apis.NewBadRequestError("Champ « images[] » manquant", nil)
		}
		if len(recus) > relaisImagesMax {
			return repondreErreurDetourage(c, erreurDetourage("trop_d_images"))
		}
		for _, recu := range recus {
			f, err := recu.Open()
			if err != nil {
				return apis.NewBadRequestError("Image illisible", err)
			}
			octets, err := io.ReadAll(io.LimitReader(f, detourageImageMaxBytes+1))
			f.Close()
			if err != nil {
				return apis.NewBadRequestError("Image illisible", err)
			}
			images = append(images, octets)
		}
	default:
		fichier, _, err := req.FormFile("image")
		if err != nil {
			return apis.NewBadRequestError("Champ « image » manquant", err)
		}
		defer fichier.Close()

		octets, err := io.ReadAll(io.LimitReader(fichier, detourageImageMaxBytes+1))
		if err != nil {
			return apis.NewBadRequestError("Image illisible", err)
		}
		images = [][]byte{octets}
	}

	var joints []champRelais
	if champs != nil {
		var refus *detourageErreur
		if joints, refus = champs(req); refus != nil {
			return repondreErreurDetourage(c, refus)
		}
	}

	resultat, echec := r.relayerImages(req.Context(), d.client, d.endpoint, cle, champ, images, joints)
	if echec != nil {
		return repondreErreurDetourage(c, echec)
	}
	if resultat.BilledCost != "" {
		c.Response().Header().Set("X-Billed-Cost", resultat.BilledCost)
	}
	if resultat.DureeMs != "" {
		c.Response().Header().Set("X-Detourage-Ms", resultat.DureeMs)
	}
	return c.Blob(http.StatusOK, "image/png", resultat.PNG)
}

func RegisterDetourageRoutes(pb *pocketbase.PocketBase, router *echo.Echo) {
	deps := detourageDeps{
		cle: func() (string, error) {
			return secrets.NewSecretManager(pb).GetSecret(secrets.KeyNotificationAPI)
		},
		endpoint: pocketAppDetourageURL,
		client:   &http.Client{Timeout: detourageTimeout},
	}

	router.POST("/api/ai/remove-background", func(c echo.Context) error {
		if apis.RequestInfo(c).AuthRecord == nil {
			return apis.NewForbiddenError("Non authentifié", nil)
		}
		if err := traiterDetourage(c, deps); err != nil {
			pb.Logger().Warn("Détourage refusé", "error", fmt.Sprint(err))
			return err
		}
		return nil
	})
}
