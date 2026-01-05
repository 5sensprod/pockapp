// backend/secrets/secrets.go
// ═══════════════════════════════════════════════════════════════════════════
// SERVICE DE GESTION DES SECRETS - CLÉS API, TOKENS, ETC.
// ═══════════════════════════════════════════════════════════════════════════
// Ce service gère le stockage sécurisé des données sensibles :
// - Clés API (notifications, webhooks, etc.)
// - Mots de passe SMTP (alternative au stockage PocketBase natif)
// - Tokens d'intégration tierces
//
// Les secrets sont chiffrés avec AES-256-GCM avant stockage dans PocketBase.
// La clé de chiffrement est dérivée d'un secret machine-spécifique.
// ═══════════════════════════════════════════════════════════════════════════

package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
)

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES - CLÉS DE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const (
	// KeyNotificationAPI est la clé pour l'API de notifications push
	KeyNotificationAPI = "notification_api_key"

	// KeyWebhookSecret est la clé pour signer les webhooks sortants
	KeyWebhookSecret = "webhook_secret"

	// KeySMTPPassword est une alternative pour stocker le mot de passe SMTP
	// (si tu ne veux pas utiliser le stockage natif PocketBase)
	KeySMTPPassword = "smtp_password"

	// KeyLicenseKey est la clé de licence de l'application
	KeyLicenseKey = "license_key"

	// KeyEncryptionSalt est utilisé pour dériver des clés supplémentaires
	KeyEncryptionSalt = "encryption_salt"
)

// ═══════════════════════════════════════════════════════════════════════════
// GESTION DE LA CLÉ DE CHIFFREMENT
// ═══════════════════════════════════════════════════════════════════════════

var (
	encryptionKey []byte
	keyOnce       sync.Once
	keyError      error
)

// getOrCreateEncryptionKey récupère ou génère la clé de chiffrement maître.
// La clé est stockée dans le dossier de configuration utilisateur.
// Elle est unique par machine, ce qui signifie que les données chiffrées
// ne peuvent être déchiffrées que sur la même machine.
func getOrCreateEncryptionKey() ([]byte, error) {
	keyOnce.Do(func() {
		// 1. Priorité : variable d'environnement (pour déploiements serveur)
		if envKey := os.Getenv("APP_SECRET_KEY"); envKey != "" {
			log.Println("🔐 Using encryption key from environment variable")
			hash := sha256.Sum256([]byte(envKey))
			encryptionKey = hash[:]
			return
		}

		// 2. Sinon : générer/charger une clé machine-spécifique
		configDir, err := getSecureConfigDir()
		if err != nil {
			keyError = err
			return
		}

		keyFile := filepath.Join(configDir, ".machine_key")

		// Essayer de lire une clé existante
		if data, err := os.ReadFile(keyFile); err == nil && len(data) == 32 {
			log.Println("🔐 Loaded existing machine encryption key")
			encryptionKey = data
			return
		}

		// Générer une nouvelle clé cryptographiquement sécurisée
		newKey := make([]byte, 32) // 256 bits pour AES-256
		if _, err := rand.Read(newKey); err != nil {
			keyError = err
			return
		}

		// Sauvegarder avec permissions restrictives (lecture/écriture propriétaire uniquement)
		if err := os.WriteFile(keyFile, newKey, 0600); err != nil {
			keyError = err
			return
		}

		log.Println("🔐 Generated new machine encryption key")
		encryptionKey = newKey
	})

	if keyError != nil {
		return nil, keyError
	}
	return encryptionKey, nil
}

// getSecureConfigDir retourne le dossier de configuration sécurisé de l'app
func getSecureConfigDir() (string, error) {
	// Windows: %LOCALAPPDATA%/PocketReact/secrets
	// Linux: ~/.config/PocketReact/secrets
	// macOS: ~/Library/Application Support/PocketReact/secrets

	var baseDir string

	// Priorité à LOCALAPPDATA (Windows)
	if appData := os.Getenv("LOCALAPPDATA"); appData != "" {
		baseDir = appData
	} else {
		// Fallback vers UserConfigDir (cross-platform)
		configDir, err := os.UserConfigDir()
		if err != nil {
			return "", err
		}
		baseDir = configDir
	}

	secretsDir := filepath.Join(baseDir, "PocketReact", "secrets")

	// Créer le dossier avec permissions restrictives
	if err := os.MkdirAll(secretsDir, 0700); err != nil {
		return "", err
	}

	return secretsDir, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// CHIFFREMENT / DÉCHIFFREMENT AES-256-GCM
// ═══════════════════════════════════════════════════════════════════════════

// Encrypt chiffre une valeur en clair avec AES-256-GCM.
// Retourne une chaîne base64 contenant le nonce + ciphertext.
func Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}

	key, err := getOrCreateEncryptionKey()
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	// Générer un nonce unique pour chaque chiffrement
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	// Chiffrer et préfixer avec le nonce
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)

	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt déchiffre une valeur chiffrée avec AES-256-GCM.
func Decrypt(encrypted string) (string, error) {
	if encrypted == "" {
		return "", nil
	}

	key, err := getOrCreateEncryptionKey()
	if err != nil {
		return "", err
	}

	ciphertext, err := base64.StdEncoding.DecodeString(encrypted)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", errors.New("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]

	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", errors.New("decryption failed - invalid key or corrupted data")
	}

	return string(plaintext), nil
}

// ═══════════════════════════════════════════════════════════════════════════
// SECRET MANAGER - INTERFACE HAUT NIVEAU
// ═══════════════════════════════════════════════════════════════════════════

// SecretManager gère les secrets dans PocketBase avec chiffrement
type SecretManager struct {
	pb *pocketbase.PocketBase
}

// NewSecretManager crée un nouveau gestionnaire de secrets
func NewSecretManager(pb *pocketbase.PocketBase) *SecretManager {
	return &SecretManager{pb: pb}
}

// SetSecret stocke un secret chiffré dans la table app_settings
func (sm *SecretManager) SetSecret(key, value string) error {
	log.Printf("🔐 Setting secret: %s", key)

	// Chiffrer la valeur
	encrypted, err := Encrypt(value)
	if err != nil {
		log.Printf("❌ Encryption error for %s: %v", key, err)
		return err
	}

	// Chercher si le setting existe déjà
	existing, _ := sm.pb.Dao().FindFirstRecordByFilter(
		"app_settings",
		"key = {:key}",
		map[string]interface{}{"key": key},
	)

	if existing != nil {
		// Mettre à jour l'existant
		existing.Set("value", encrypted)
		existing.Set("encrypted", true)
		if err := sm.pb.Dao().SaveRecord(existing); err != nil {
			log.Printf("❌ Update error for %s: %v", key, err)
			return err
		}
		log.Printf("✅ Secret updated: %s", key)
		return nil
	}

	// Créer un nouveau record
	collection, err := sm.pb.Dao().FindCollectionByNameOrId("app_settings")
	if err != nil {
		log.Printf("❌ Collection app_settings not found: %v", err)
		return err
	}

	record := models.NewRecord(collection)
	record.Set("key", key)
	record.Set("value", encrypted)
	record.Set("encrypted", true)

	if err := sm.pb.Dao().SaveRecord(record); err != nil {
		log.Printf("❌ Create error for %s: %v", key, err)
		return err
	}

	log.Printf("✅ Secret created: %s", key)
	return nil
}

// GetSecret récupère et déchiffre un secret
func (sm *SecretManager) GetSecret(key string) (string, error) {
	record, err := sm.pb.Dao().FindFirstRecordByFilter(
		"app_settings",
		"key = {:key}",
		map[string]interface{}{"key": key},
	)
	if err != nil {
		return "", err
	}

	value := record.GetString("value")
	isEncrypted := record.GetBool("encrypted")

	if isEncrypted {
		decrypted, err := Decrypt(value)
		if err != nil {
			log.Printf("❌ Decryption error for %s: %v", key, err)
			return "", err
		}
		return decrypted, nil
	}

	// Valeur non chiffrée (legacy ou non sensible)
	return value, nil
}

// HasSecret vérifie si un secret existe (sans le déchiffrer)
func (sm *SecretManager) HasSecret(key string) bool {
	record, err := sm.pb.Dao().FindFirstRecordByFilter(
		"app_settings",
		"key = {:key}",
		map[string]interface{}{"key": key},
	)
	return err == nil && record != nil
}

// DeleteSecret supprime un secret
func (sm *SecretManager) DeleteSecret(key string) error {
	log.Printf("🗑️ Deleting secret: %s", key)

	record, err := sm.pb.Dao().FindFirstRecordByFilter(
		"app_settings",
		"key = {:key}",
		map[string]interface{}{"key": key},
	)
	if err != nil {
		return err
	}

	if err := sm.pb.Dao().DeleteRecord(record); err != nil {
		log.Printf("❌ Delete error for %s: %v", key, err)
		return err
	}

	log.Printf("✅ Secret deleted: %s", key)
	return nil
}

// GetSetting récupère un setting non chiffré (pour les valeurs publiques)
func (sm *SecretManager) GetSetting(key string) (string, error) {
	record, err := sm.pb.Dao().FindFirstRecordByFilter(
		"app_settings",
		"key = {:key}",
		map[string]interface{}{"key": key},
	)
	if err != nil {
		return "", err
	}

	return record.GetString("value"), nil
}

// SetSetting stocke un setting non chiffré
func (sm *SecretManager) SetSetting(key, value string) error {
	existing, _ := sm.pb.Dao().FindFirstRecordByFilter(
		"app_settings",
		"key = {:key}",
		map[string]interface{}{"key": key},
	)

	if existing != nil {
		existing.Set("value", value)
		existing.Set("encrypted", false)
		return sm.pb.Dao().SaveRecord(existing)
	}

	collection, err := sm.pb.Dao().FindCollectionByNameOrId("app_settings")
	if err != nil {
		return err
	}

	record := models.NewRecord(collection)
	record.Set("key", key)
	record.Set("value", value)
	record.Set("encrypted", false)

	return sm.pb.Dao().SaveRecord(record)
}

// ListSettings retourne tous les settings (valeurs masquées pour les secrets)
func (sm *SecretManager) ListSettings() ([]map[string]interface{}, error) {
	records, err := sm.pb.Dao().FindRecordsByFilter(
		"app_settings",
		"id != ''",
		"-created",
		100,
		0,
	)
	if err != nil {
		return nil, err
	}

	result := make([]map[string]interface{}, len(records))
	for i, record := range records {
		isEncrypted := record.GetBool("encrypted")

		result[i] = map[string]interface{}{
			"id":          record.Id,
			"key":         record.GetString("key"),
			"encrypted":   isEncrypted,
			"description": record.GetString("description"),
			"created":     record.Created,
			"updated":     record.Updated,
		}

		// Ne pas exposer les valeurs chiffrées
		if !isEncrypted {
			result[i]["value"] = record.GetString("value")
		} else {
			result[i]["value"] = "••••••••" // Masqué
		}
	}

	return result, nil
}
