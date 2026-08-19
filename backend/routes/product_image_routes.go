// backend/routes/product_image_routes.go
//
// PROMOUVOIR UNE IMAGE DE LA GALERIE EN IMAGE PRINCIPALE.
//
// ── LA RÈGLE, tranchée par le propriétaire le 19 août 2026 ────────────────
// « Une image ne se perd pas, et la principale se désigne. » Promouvoir B
// rétrograde A dans la galerie ; aucun fichier n'est détruit, aucun n'est
// copié. Voir docs/DECISIONS.md.
//
// ── POURQUOI CE GESTE NE PEUT PAS ÊTRE FAIT PAR LE CLIENT ─────────────────
// Ce n'est pas un choix d'architecture, c'est une contrainte lue dans la
// bibliothèque. `forms/record_upsert.go:428-435` (v0.22.22) compare les noms
// de fichiers soumis aux anciens **du même champ** :
//
//	oldNames := form.record.GetStringSlice(key)
//	submittedNames := list.ToUniqueStringSlice(value)
//	if len(submittedNames) > len(oldNames) || len(list.SubtractSlice(...)) != 0 {
//	    return ... "validation_unknown_filenames"
//	}
//
// Envoyer par l'API REST un nom qui vit dans `gallery` vers le champ `image`
// est donc REFUSÉ : le nom est inconnu de `image`. Un client ne peut promouvoir
// qu'en téléversant à nouveau l'octet — ce qui duplique le fichier et contredit
// la règle.
//
// ── POURQUOI C'EST SANS DANGER ICI ────────────────────────────────────────
// `Dao().SaveRecord` n'est pas `RecordUpsert` : il n'a ni la validation des
// noms, ni la liste `filesToDelete`. Il écrit les deux colonnes, un point.
// Et il peut le faire parce que **`image` et `gallery` partagent le même
// dossier** — `storage/<collectionId>/<idDuProduit>/` : le fichier promu est
// déjà à l'emplacement où `pb.files.getUrl` ira le chercher sous son nouveau
// champ. Rien à déplacer.
//
// La transaction reprend la raison de `stock_routes.go` : lire puis réécrire
// en deux appels laisserait deux postes se croiser, et ici le croisement
// perdrait une image.
//
// Pas de nouvelle sortie réseau : route locale, servie par le PocketBase
// embarqué (point 1 de CLAUDE.md).

package routes

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/daos"
)

type PromoteImageInput struct {
	// Le nom de fichier à promouvoir, tel qu'il figure dans `gallery`.
	Filename string `json:"filename"`
}

type PromoteImageOutput struct {
	Image   string   `json:"image"`
	Gallery []string `json:"gallery"`
}

// ErrImageAbsente — le nom soumis ne figure pas dans la galerie du produit.
// Nommée pour que le test la reconnaisse sans comparer des chaînes.
var ErrImageAbsente = errors.New("cette image n'est pas dans la galerie du produit")

func RegisterProductImageRoutes(app *pocketbase.PocketBase, router *echo.Echo) {
	router.POST("/api/catalog/products/:id/promote-image", func(c echo.Context) error {
		var payload PromoteImageInput
		if err := c.Bind(&payload); err != nil {
			return apis.NewBadRequestError("Corps invalide", err)
		}
		if payload.Filename == "" {
			return apis.NewBadRequestError("filename requis", nil)
		}

		image, galerie, err := PromoteProductImage(app, c.PathParam("id"), payload.Filename)
		if err != nil {
			if errors.Is(err, ErrImageAbsente) {
				return apis.NewBadRequestError(err.Error(), nil)
			}
			return apis.NewNotFoundError("Produit introuvable", err)
		}

		return c.JSON(http.StatusOK, PromoteImageOutput{Image: image, Gallery: galerie})
	}, apis.RequireRecordAuth())
}

// PromoteProductImage échange `image` et une entrée de `gallery`, dans une
// seule transaction. Exportée pour être testée seule.
//
// L'échange se fait EN PLACE : la principale sortante prend le rang qu'occupait
// la promue. L'ordre de la galerie est une donnée (règle 3 du 19 août), et un
// réordonnancement implicite la trahirait — l'ordre décidera de l'ordre des
// vignettes sur le site.
func PromoteProductImage(app *pocketbase.PocketBase, cle string, filename string) (string, []string, error) {
	var image string
	var galerie []string

	err := app.Dao().RunInTransaction(func(tx *daos.Dao) error {
		// Identifiant PocketBase OU clé stable NeDB, comme `stock_routes.go` :
		// le pont `legacy_id` reste nécessaire en lecture (CLAUDE.md).
		produit, err := tx.FindFirstRecordByFilter(
			"products",
			"id = {:cle} || legacy_id = {:cle}",
			dbx.Params{"cle": cle},
		)
		if err != nil {
			return err
		}

		ancienne := produit.GetString("image")
		suivante := append([]string{}, produit.GetStringSlice("gallery")...)

		rang := -1
		for i, nom := range suivante {
			if nom == filename {
				rang = i
				break
			}
		}
		if rang == -1 {
			return ErrImageAbsente
		}

		if ancienne == "" {
			// Aucune principale à rétrograder : la promue quitte simplement la
			// galerie. 360 produits sur 2999 sont dans ce cas (mesuré le
			// 19 août 2026 : 2639 portent une image principale).
			suivante = append(suivante[:rang], suivante[rang+1:]...)
		} else {
			suivante[rang] = ancienne
		}

		produit.Set("image", filename)
		produit.Set("gallery", suivante)

		image = filename
		galerie = suivante

		// SaveRecord et non RecordUpsert : c'est ce qui rend l'échange possible
		// (voir l'en-tête). Aucun fichier n'est marqué pour suppression.
		return tx.SaveRecord(produit)
	})

	if err != nil {
		return "", nil, err
	}
	return image, galerie, nil
}
