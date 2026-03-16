package migrations

import (
	"crypto/rand"
	"encoding/hex"
	"log"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
)

// FixTokenKeys répare les tokenKey dupliqués ou vides dans la table users
func FixTokenKeys(pb *pocketbase.PocketBase) error {
	log.Println("🔧 Migration: Fixing duplicate/empty tokenKeys in users...")

	db := pb.DB()

	// 1. Lire tous les users avec leur tokenKey via dbx
	type userRow struct {
		Id       string `db:"id"`
		TokenKey string `db:"tokenKey"`
	}

	var users []userRow
	err := db.NewQuery(`SELECT id, tokenKey FROM users ORDER BY created ASC`).All(&users)
	if err != nil {
		log.Printf("❌ Error querying users: %v", err)
		return err
	}

	// 2. Détecter les doublons et tokenKey vides
	seen := map[string]bool{}
	toFix := []string{}

	for _, u := range users {
		if u.TokenKey == "" || seen[u.TokenKey] {
			toFix = append(toFix, u.Id)
			log.Printf("⚠️  User %s a un tokenKey dupliqué/vide → sera régénéré", u.Id)
		} else {
			seen[u.TokenKey] = true
		}
	}

	if len(toFix) == 0 {
		log.Println("✅ Aucun problème de tokenKey détecté")
		return nil
	}

	// 3. Régénérer un tokenKey unique pour chaque user concerné
	for _, id := range toFix {
		newToken, err := generateRandomToken(seen)
		if err != nil {
			log.Printf("❌ Impossible de générer un token pour user %s: %v", id, err)
			continue
		}

		_, err = db.NewQuery(`UPDATE users SET tokenKey = {:token} WHERE id = {:id}`).
			Bind(dbx.Params{
				"token": newToken,
				"id":    id,
			}).
			Execute()

		if err != nil {
			log.Printf("❌ Erreur UPDATE tokenKey pour user %s: %v", id, err)
		} else {
			seen[newToken] = true
			log.Printf("✅ tokenKey réparé pour user %s", id)
		}
	}

	// 4. Reconstruire l'index unique
	_, err = db.NewQuery(`REINDEX users`).Execute()
	if err != nil {
		log.Printf("⚠️  REINDEX warning: %v", err)
	} else {
		log.Println("✅ REINDEX users terminé")
	}

	log.Printf("✅ FixTokenKeys: %d user(s) réparé(s)", len(toFix))
	return nil
}

// generateRandomToken génère un token hex 64 chars unique (non présent dans seen)
func generateRandomToken(seen map[string]bool) (string, error) {
	for {
		b := make([]byte, 32)
		if _, err := rand.Read(b); err != nil {
			return "", err
		}
		token := hex.EncodeToString(b)
		if !seen[token] {
			return token, nil
		}
	}
}
