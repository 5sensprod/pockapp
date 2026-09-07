// backend/backup/selectif_travail.go
// ═══════════════════════════════════════════════════════════════════════════
// LE FICHIER DE TRAVAIL DE LA RESTAURATION SÉLECTIVE
// ═══════════════════════════════════════════════════════════════════════════
// Un snapshot déchiffré, posé dans un dossier à part de `pb_data`, et
// CONSERVÉ entre la simulation et l'écriture.
//
// ─── Pourquoi le conserver, plutôt que retélécharger ───────────────────────
// Ce n'est pas une optimisation de réseau, c'est une garantie : le geste de
// validation doit porter sur EXACTEMENT ce qui a été montré. Retélécharger au
// moment d'appliquer rouvrirait la porte à un écart entre l'aperçu et
// l'écriture — un second snapshot déposé entre-temps, un octet perdu — et
// l'utilisateur aurait validé un écart qui n'est plus celui qu'on applique.
//
// ─── Pourquoi PAS dans `pb_data` directement ───────────────────────────────
// `restauration.go` y dépose déjà `data.db.restauration`, et son marqueur ARME
// un remplacement complet au démarrage suivant. Un fichier de travail qui
// ressemblerait à celui-là, dans le même dossier, est exactement le genre de
// voisinage dont on se mord les doigts. Le nôtre vit dans un sous-dossier
// nommé, ne s'appelle jamais `data.db*`, et n'arme rien.
// ═══════════════════════════════════════════════════════════════════════════

package backup

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
)

// DossierTravailSelectif est le sous-dossier de `pb_data` où vivent les
// snapshots déchiffrés en attente d'être comparés.
const DossierTravailSelectif = "restauration-selective"

// CheminSnapshotDeTravail rend le chemin d'un snapshot de travail. Ne crée
// rien : sert aussi à savoir s'il est déjà là.
func CheminSnapshotDeTravail(dataDir, idSnapshot string) (string, error) {
	// L'identifiant vient du serveur et sert à nommer un fichier : il ne doit
	// pas pouvoir désigner un chemin. Un `..` ou une barre oblique ici
	// écrirait ailleurs que dans le dossier de travail.
	if idSnapshot == "" ||
		strings.ContainsAny(idSnapshot, `/\:`) ||
		strings.Contains(idSnapshot, "..") {
		return "", fmt.Errorf("identifiant de snapshot inutilisable : %q", idSnapshot)
	}
	return filepath.Join(dataDir, DossierTravailSelectif, idSnapshot+".db"), nil
}

// PreparerSnapshotDeTravail déchiffre un flux, VÉRIFIE son empreinte et sa
// forme, et dépose le résultat dans le dossier de travail.
//
// Les mêmes contrôles que `PreparerRestauration`, et pour la même raison :
// comparer une base tronquée à celle du client produirait un écart faux —
// des milliers de fiches « absentes » qui ne le sont pas.
func PreparerSnapshotDeTravail(
	dataDir string,
	source io.Reader,
	cle []byte,
	idSnapshot string,
	verifSHA string,
) (string, error) {
	destination, err := CheminSnapshotDeTravail(dataDir, idSnapshot)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
		return "", fmt.Errorf("dossier de travail : %w", err)
	}

	// Temporaire puis rename : un déchiffrement coupé ne doit pas laisser un
	// fichier que le passage suivant prendrait pour un snapshot complet.
	temporaire := destination + ".partiel"
	_ = os.Remove(temporaire)

	f, err := os.OpenFile(temporaire, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return "", fmt.Errorf("création du fichier de travail : %w", err)
	}

	empreinte, err := Restaurer(source, f, cle, idSnapshot)
	cerr := f.Close()
	if err != nil {
		os.Remove(temporaire)
		return "", fmt.Errorf("déchiffrement : %w", err)
	}
	if cerr != nil {
		os.Remove(temporaire)
		return "", fmt.Errorf("écriture : %w", cerr)
	}

	if verifSHA != "" && empreinte != verifSHA {
		os.Remove(temporaire)
		return "", fmt.Errorf(
			"empreinte divergente — le snapshot déchiffré n'est PAS celui du manifeste (attendu %s, obtenu %s)",
			verifSHA, empreinte)
	}
	if err := verifierEnteteSQLite(temporaire); err != nil {
		os.Remove(temporaire)
		return "", err
	}

	_ = os.Remove(destination)
	if err := os.Rename(temporaire, destination); err != nil {
		os.Remove(temporaire)
		return "", fmt.Errorf("mise en place du fichier de travail : %w", err)
	}

	log.Printf("♻️  snapshot %s déchiffré pour comparaison : %s", idSnapshot, destination)
	return destination, nil
}

// PurgerTravailSelectif efface les snapshots de travail, en gardant
// éventuellement celui qu'on vient d'utiliser.
//
// Appelée après une écriture réussie : un snapshot déchiffré, c'est la base du
// client EN CLAIR sur le disque. Le laisser traîner annulerait une partie de
// ce que le chiffrement achète (docs/SAUVEGARDE.md §3).
func PurgerTravailSelectif(dataDir string, garder string) (int, error) {
	racine := filepath.Join(dataDir, DossierTravailSelectif)
	entrees, err := os.ReadDir(racine)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}

	var efaces int
	for _, e := range entrees {
		if e.IsDir() {
			continue
		}
		chemin := filepath.Join(racine, e.Name())
		if garder != "" && chemin == garder {
			continue
		}
		if err := os.Remove(chemin); err != nil {
			log.Printf("⚠️  travail sélectif : %s non effacé (%v)", chemin, err)
			continue
		}
		efaces++
	}
	return efaces, nil
}
