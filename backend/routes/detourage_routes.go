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
const (
	pocketAppDetourageURL     = "https://pocketapp.5sensprod.com/api/detourage.php"
	detourageTimeout          = 90 * time.Second
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
}

func erreurDetourage(code string) *detourageErreur {
	e := erreursDetourage[code]
	return &e
}

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
func delaiDuPoste() *detourageErreur {
	return &detourageErreur{http.StatusGatewayTimeout, "delai_depasse", "Le service de détourage n'a pas répondu à temps. Réessaie dans un instant."}
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
	if u, err := url.Parse(endpoint); err != nil || u.Scheme != "https" {
		return nil, erreurDetourage("adresse_non_securisee")
	}
	mimeType, ok := typeImageDetourage(image)
	if !ok {
		return nil, erreurDetourage("type_refuse")
	}
	if len(image) > detourageImageMaxBytes {
		return nil, erreurDetourage("image_trop_lourde")
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
	req.Header.Set("User-Agent", detourageUserAgent)

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
			if _, connu := erreursDetourage[echec.Code]; connu {
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

// traiterDetourage est le corps de la route, sans l'authentification : lire
// l'image envoyée par le renderer, la relayer, rendre le PNG.
func traiterDetourage(c echo.Context, d detourageDeps) error {
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
	fichier, _, err := req.FormFile("image")
	if err != nil {
		return apis.NewBadRequestError("Champ « image » manquant", err)
	}
	defer fichier.Close()

	octets, err := io.ReadAll(io.LimitReader(fichier, detourageImageMaxBytes+1))
	if err != nil {
		return apis.NewBadRequestError("Image illisible", err)
	}

	resultat, echec := relayerDetourage(req.Context(), d.client, d.endpoint, cle, octets)
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
