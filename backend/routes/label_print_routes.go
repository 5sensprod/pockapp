// backend/routes/label_print_routes.go
//
// IMPRIMER UNE ÉTIQUETTE PRODUIT.
//
// Le client rend l'étiquette dans un canvas (nom, prix TTC, code-barres) et
// envoie l'image ; le serveur la pose sur l'étiqueteuse par le pilote Windows
// (`pos.PrintImageGDI`). Le partage des rôles est celui du ticket de caisse :
// le dessin appartient au client, l'accès au matériel au processus Go — un
// poste au navigateur n'a pas d'imprimante à lui.
//
// Pas de nouvelle sortie réseau : la route est locale, servie par le
// PocketBase embarqué (point 1 de CLAUDE.md).
package routes

import (
	"net/http"
	"pocket-react/backend/pos"
	"strconv"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
)

// Une étiquette 29 mm rendue à 300 dpi pèse quelques dizaines de kio ; la
// borne existe pour qu'un corps aberrant ne soit pas décodé en mémoire.
const maxLabelImageBytes = 8 << 20 // 8 Mio de base64

// Au-delà, c'est une erreur de saisie, pas une intention : le rouleau
// contient de l'ordre de 400 étiquettes.
const maxLabelCopies = 100

type labelPrintInput struct {
	// PNG en data-URL (`data:image/png;base64,...`) ou base64 nu.
	Image       string `json:"image"`
	PrinterName string `json:"printerName"`
	Copies      int    `json:"copies"`
	// Longueur de coupe, en millimètres, sur un rouleau CONTINU. Zéro = on
	// garde le réglage du pilote.
	LengthMM float64 `json:"lengthMm"`
}

// Bornes de bon sens : en deçà la QL ne coupe pas proprement, au-delà on n'est
// plus sur une étiquette produit.
const (
	minLabelLengthMM = 15.0
	maxLabelLengthMM = 300.0
)

func parseLengthMM(raw string) (float64, error) {
	if raw == "" {
		return 0, nil
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, err
	}
	return value, nil
}

func validLengthMM(length float64) bool {
	return length == 0 || (length >= minLabelLengthMM && length <= maxLabelLengthMM)
}

func RegisterLabelPrintRoutes(pb *pocketbase.PocketBase, router *echo.Echo) {
	// Le format de l'étiquette n'est pas dans le code : il est dans le pilote.
	router.GET("/api/labels/page-size", func(c echo.Context) error {
		printerName := c.QueryParam("printer")
		if printerName == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "le paramètre printer est obligatoire",
			})
		}

		length, err := parseLengthMM(c.QueryParam("lengthMm"))
		if err != nil || !validLengthMM(length) {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "longueur invalide",
			})
		}

		size, err := pos.PrinterPageMM(printerName, length)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": err.Error(),
			})
		}

		return c.JSON(http.StatusOK, size)
	}, apis.RequireRecordAuth())

	router.POST("/api/labels/print", func(c echo.Context) error {
		var input labelPrintInput
		if err := c.Bind(&input); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "corps de requête invalide",
			})
		}

		if input.PrinterName == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "printerName est obligatoire",
			})
		}
		if input.Image == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "image est obligatoire",
			})
		}
		if len(input.Image) > maxLabelImageBytes {
			return c.JSON(http.StatusRequestEntityTooLarge, map[string]string{
				"error": "image trop volumineuse",
			})
		}

		copies := input.Copies
		if copies < 1 {
			copies = 1
		}
		if copies > maxLabelCopies {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "nombre d'exemplaires trop élevé",
			})
		}

		imgBytes, err := pos.DecodeBase64Image(input.Image)
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "image illisible: " + err.Error(),
			})
		}

		if !validLengthMM(input.LengthMM) {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "longueur invalide",
			})
		}

		if err := pos.PrintImageGDI(input.PrinterName, imgBytes, copies, input.LengthMM); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": err.Error(),
			})
		}

		return c.JSON(http.StatusOK, map[string]any{
			"success": true,
			"copies":  copies,
		})
	}, apis.RequireRecordAuth())
}
