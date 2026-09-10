// backend/catalog/load/image_unitaire.go
// ═══════════════════════════════════════════════════════════════════════════
// POSER UNE IMAGE SUR UN PRODUIT QUI N'EN A PAS
// ═══════════════════════════════════════════════════════════════════════════
// 164 produits publiés n'avaient aucun visuel au 7 septembre 2026. Pour douze
// d'entre eux, le fichier existe encore quelque part — sur le disque d'AppPos,
// ou dans la médiathèque WordPress dont l'ancien site se sert.
//
// ─── Pourquoi une fonction à part, et pas le chargeur ──────────────────────
// `loadProducts` écrit un produit NEUF, image comprise. Ici le produit existe,
// il porte des ventes et un slug publié : on ne le réécrit pas, on lui ajoute
// un fichier. Réutiliser le chargeur reviendrait à recréer la fiche.
//
// ─── La règle que ce fichier respecte ──────────────────────────────────────
// « L'image principale d'un produit ne s'écrase pas, elle se désigne »
// (CLAUDE.md, 19 août 2026). D'où le REFUS d'écrire sur un produit qui a déjà
// une image : ce cas relève de la promotion depuis la galerie
// (`POST /api/catalog/products/:id/promote-image`), pas d'ici. Le fichier
// entre dans la galerie ET est désigné comme principale — sur une fiche qui
// n'avait ni l'une ni l'autre, les deux gestes n'en font qu'un.
package load

import (
	"bytes"
	"fmt"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

// ImageAPoser décrit un fichier à rattacher à un produit.
type ImageAPoser struct {
	ProduitID string
	// NomFichier est le nom d'origine ; PocketBase lui ajoutera son suffixe
	// aléatoire, comme pour tout fichier qu'il stocke.
	NomFichier string
	Octets     []byte
	// Origine, pour le compte rendu : d'où vient ce fichier.
	Origine string
}

// ResultatPoseImages résume ce qui a été fait.
type ResultatPoseImages struct {
	Simulation bool
	Posees     []PoseImage
	Refusees   []PoseImage
}

// PoseImage est le sort d'une image.
type PoseImage struct {
	ProduitID  string
	Nom        string
	NomFichier string
	NomStocke  string
	Octets     int
	Origine    string
	Refus      string
}

// PoserImagesPrincipales rattache un fichier à chaque produit désigné.
//
// Deux refus, et ils ne se forcent pas :
//   - le produit est introuvable ;
//   - il a DÉJÀ une image — on ne remplace jamais un visuel existant sans
//     qu'on l'ait demandé explicitement, et ce n'est pas ce que fait cet outil.
//
// La copie des fichiers n'est PAS transactionnelle (SQLite l'est, le disque
// non) : un échec en cours laisse des fichiers dans le stockage que plus rien
// ne référence. Sans conséquence — ils dorment —, mais il faut le savoir.
func PoserImagesPrincipales(
	app *pocketbase.PocketBase,
	images []ImageAPoser,
	simulation bool,
) (*ResultatPoseImages, error) {
	out := &ResultatPoseImages{Simulation: simulation}

	fsys, err := app.NewFilesystem()
	if err != nil {
		return nil, fmt.Errorf("ouverture du stockage PocketBase: %w", err)
	}
	defer fsys.Close()

	col, err := app.Dao().FindCollectionByNameOrId("products")
	if err != nil {
		return nil, err
	}
	_ = col

	// ── Contrôle préalable, avant toute écriture ────────────────────────────
	var retenues []ImageAPoser
	for _, img := range images {
		p := PoseImage{
			ProduitID:  img.ProduitID,
			NomFichier: img.NomFichier,
			Octets:     len(img.Octets),
			Origine:    img.Origine,
		}
		rec, err := app.Dao().FindRecordById("products", img.ProduitID)
		switch {
		case err != nil:
			p.Refus = "produit introuvable"
		case len(img.Octets) == 0:
			p.Refus = "fichier vide"
		case rec.GetString("image") != "":
			p.Nom = rec.GetString("name")
			p.Refus = fmt.Sprintf("le produit a déjà une image (%s) — "+
				"promouvoir depuis la galerie, pas écraser", rec.GetString("image"))
		default:
			p.Nom = rec.GetString("name")
		}
		if p.Refus != "" {
			out.Refusees = append(out.Refusees, p)
			continue
		}
		retenues = append(retenues, img)
		out.Posees = append(out.Posees, p)
	}

	if simulation || len(retenues) == 0 {
		return out, nil
	}

	// ── Copie des fichiers, puis écriture ───────────────────────────────────
	stockes := map[string]string{}
	for _, img := range retenues {
		rec, err := app.Dao().FindRecordById("products", img.ProduitID)
		if err != nil {
			return nil, err
		}
		f, err := filesystem.NewFileFromBytes(img.Octets, img.NomFichier)
		if err != nil {
			return nil, fmt.Errorf("%s : fichier illisible : %w", img.ProduitID, err)
		}
		if err := fsys.UploadFile(f, rec.BaseFilesPath()+"/"+f.Name); err != nil {
			return nil, fmt.Errorf("%s : copie refusée : %w", img.ProduitID, err)
		}
		stockes[img.ProduitID] = f.Name
	}

	err = app.Dao().RunInTransaction(func(tx *daos.Dao) error {
		for _, img := range retenues {
			rec, err := tx.FindRecordById("products", img.ProduitID)
			if err != nil {
				return err
			}
			nom := stockes[img.ProduitID]
			// La galerie porte le fichier, `image` le désigne. Sur une fiche
			// qui n'avait rien, les deux se posent ensemble.
			rec.Set("gallery", []string{nom})
			rec.Set("image", nom)
			if err := tx.SaveRecord(rec); err != nil {
				return fmt.Errorf("%s : %w", img.ProduitID, err)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	for i := range out.Posees {
		out.Posees[i].NomStocke = stockes[out.Posees[i].ProduitID]
	}
	return out, nil
}

// RetirerImagePosee annule une pose : vide `image` et `gallery` d'un produit.
//
// Elle existe parce qu'une pose peut être JUSTE au regard du titre et FAUSSE
// au regard du produit — mesuré le 7 septembre 2026 : « Strat Switch Tip Knobs
// (2) white » a reçu l'image des mêmes boutons en NOIR, les deux titres ne
// différant que par le dernier mot. Sans ce geste, la seule issue était de
// restaurer toute la base pour un enregistrement.
//
// Elle ne s'applique QUE si le fichier désigné est bien celui qu'on croit :
// passer le mauvais nom ne doit pas vider une fiche au hasard. Les octets
// restent dans le stockage, non référencés — sans conséquence, et récupérables
// tant que personne n'a purgé.
func RetirerImagePosee(app *pocketbase.PocketBase, produitID, nomFichierAttendu string) error {
	return app.Dao().RunInTransaction(func(tx *daos.Dao) error {
		rec, err := tx.FindRecordById("products", produitID)
		if err != nil {
			return fmt.Errorf("produit %s introuvable : %w", produitID, err)
		}
		actuel := rec.GetString("image")
		if actuel == "" {
			return fmt.Errorf("produit %s : aucune image à retirer", produitID)
		}
		if nomFichierAttendu != "" && actuel != nomFichierAttendu {
			return fmt.Errorf("produit %s porte %q, pas %q — rien n'a été retiré",
				produitID, actuel, nomFichierAttendu)
		}
		rec.Set("image", "")
		rec.Set("gallery", []string{})
		return tx.SaveRecord(rec)
	})
}

// EstUneImage dit si des octets commencent par une signature d'image connue.
//
// Le contrôle a lieu AVANT d'écrire : une page d'erreur HTML rendue en 200 par
// un hébergeur mutualisé, enregistrée comme visuel de produit, ne se verrait
// qu'à l'écran, des semaines plus tard.
func EstUneImage(b []byte) (string, bool) {
	switch {
	case len(b) >= 12 && bytes.Equal(b[0:4], []byte("RIFF")) && bytes.Equal(b[8:12], []byte("WEBP")):
		return "webp", true
	case len(b) >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF:
		return "jpeg", true
	case len(b) >= 8 && bytes.Equal(b[0:8], []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}):
		return "png", true
	case len(b) >= 12 && bytes.Equal(b[4:8], []byte("ftyp")):
		return "avif/heif", true
	case len(b) >= 6 && (bytes.Equal(b[0:6], []byte("GIF87a")) || bytes.Equal(b[0:6], []byte("GIF89a"))):
		return "gif", true
	}
	return "", false
}
