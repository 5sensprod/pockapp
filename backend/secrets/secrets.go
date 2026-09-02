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

	// KeySitePublishAPI est la clé X-API-Key attendue par l'endpoint de
	// publication du site (server/api/publish-menu.php sur axemusique.shop).
	//
	// DISTINCTE de KeyNotificationAPI, et volontairement : celle-là authentifie
	// le mini-SaaS de télémétrie, celle-ci la publication du menu. Deux
	// services sans rapport, deux propriétaires, deux durées de vie — et
	// GET /api/settings/pocketapp-key expose la première en clair sans garde
	// admin (backend/routes/secrets_routes.go:125), ce qui suffit à ne pas
	// réutiliser la même valeur ici.
	//
	// Ticket 5b. Consommée au ticket 6, qui pose l'en-tête au moment du POST.
	KeySitePublishAPI = "site_publish_api_key"

	// KeySiteCatalogAPI est la clé X-API-Key attendue par l'endpoint d'export
	// du catalogue (server/api/products-sync.php).
	//
	// DISTINCTE de KeySitePublishAPI, et pour une raison de portée : celle-là
	// autorise à publier un menu de quelques kilo-octets, celle-ci à ÉCRIRE
	// DANS LA BASE DE DONNÉES du catalogue. Révoquer l'une ne doit pas
	// condamner l'autre.
	KeySiteCatalogAPI = "site_catalog_api_key"
)

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES - RÉGLAGES NON CHIFFRÉS
// ═══════════════════════════════════════════════════════════════════════════

const (
	// SettingSitePublishURL est l'URL de l'endpoint de publication.
	//
	// Ce n'est pas un secret : elle est stockée en clair via SetSetting. La
	// mettre en réglage plutôt qu'en dur permet de viser un autre serveur sans
	// recompiler, et documente à elle seule où part la publication.
	SettingSitePublishURL = "site_publish_url"

	// SettingSiteCatalogURL est l'URL de l'endpoint d'export du catalogue,
	// typiquement https://axemusique.shop/server/api/products-sync.php.
	//
	// Comme la précédente : pas un secret, en réglage plutôt qu'en dur pour
	// viser un autre serveur sans recompiler.
	SettingSiteCatalogURL = "site_catalog_url"

	// SettingSiteImagesURL est l'URL du miroir d'images,
	// typiquement https://axemusique.shop/server/api/images-sync.php.
	//
	// DISTINCTE de SettingSiteCatalogURL : ce sont deux scripts, parce que
	// leurs plafonds de corps n'ont rien à voir — 1 Mio pour un lot d'entités,
	// plusieurs Mio pour une seule image de catégorie (§4.4 de
	// PocketSite-docs/16-conception-images.md). La CLÉ, elle, est partagée avec
	// l'export du catalogue : même base, même portée d'écriture.
	SettingSiteImagesURL = "site_images_url"

	// SettingBackupURL est l'URL du point d'entrée de sauvegarde du mini-SaaS,
	// typiquement https://pocketapp.5sensprod.com/api/backup.php.
	//
	// Le client REFUSE de partir si elle n'est pas en HTTPS
	// (backend/backup/envoi.go, NouveauClient) : le corps est chiffré, mais la
	// clé d'API voyage en clair dans un en-tête, et sur du HTTP simple elle
	// est lisible par le réseau du magasin.
	SettingBackupURL = "backup_url"

	// SettingBackupIntervalHeures est l'écart minimal entre deux sauvegardes,
	// en heures. Vide ou illisible vaut 24.
	SettingBackupIntervalHeures = "backup_interval_hours"

	// SettingBackupActif vaut "1" ou "0". Absent vaut ACTIF : une sauvegarde
	// qui ne démarre pas parce qu'un réglage manque n'est pas une sauvegarde.
	SettingBackupActif = "backup_enabled"

	// SettingBackupDernierEtat porte le dernier résultat, en JSON, pour que
	// l'écran des réglages puisse dire « dernière sauvegarde le … » sans
	// interroger le serveur. Purement informatif.
	SettingBackupDernierEtat = "backup_last_state"

	// SettingBackupOrigine remplace le nom de machine dans le manifeste.
	//
	// Facultatif : sans lui, le nom de machine sert d'étiquette. Il existe pour
	// les cas où ce nom ne dit rien à personne (« DESKTOP-4F7K2P ») ou lorsque
	// deux postes portent le même.
	SettingBackupOrigine = "backup_origin"

	// SettingBackupAdminURL est l'endpoint SUPER-ADMIN, typiquement
	// https://pocketapp.5sensprod.com/api/backup-admin.php.
	//
	// Distinct de SettingBackupURL, et pas par goût du rangement : ce sont deux
	// scripts, avec deux authentifications et deux pouvoirs. Celui-ci LIT et
	// SUPPRIME, l'autre DÉPOSE. Vide, il est déduit de SettingBackupURL en
	// remplaçant `backup.php` par `backup-admin.php`.
	SettingBackupAdminURL = "backup_admin_url"
)

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES - SECRETS DE LA SAUVEGARDE
// ═══════════════════════════════════════════════════════════════════════════

const (
	// KeyBackupAPI est la clé d'API qui identifie CETTE installation auprès du
	// mini-SaaS. C'est elle qui détermine dans quel espace privé le snapshot
	// atterrit : le serveur ne lit jamais d'identifiant de client dans le
	// corps de la requête, il le DÉDUIT de la clé. Un poste ne peut donc pas
	// écrire — ni lire — dans l'espace d'un autre, même en le demandant.
	KeyBackupAPI = "backup_api_key"

	// KeyBackupChiffrement est la clé AES-256 des snapshots, en hexadécimal
	// (64 caractères). Elle ne quitte JAMAIS le poste et n'est jamais envoyée
	// au serveur : c'est ce qui rend le dépôt distant inexploitable en cas de
	// fuite de l'hébergement mutualisé.
	//
	// ⚠️ Corollaire à ne pas découvrir le jour d'un sinistre : PERDRE cette
	// clé, c'est perdre toutes les sauvegardes. Elle doit être conservée
	// ailleurs que sur le poste qu'elle sauvegarde.
	KeyBackupChiffrement = "backup_encryption_key"

	// KeyBackupSuperAdmin est la clé super-admin de l'ÉDITEUR. Elle donne accès
	// aux sauvegardes de TOUS les clients — lister, télécharger, supprimer —
	// mais ne permet PAS d'en déposer.
	//
	// ⚠️ Sur le poste d'un client, elle est saisie pour une intervention et doit
	// être EFFACÉE en repartant : c'est la clé qui ouvre les sauvegardes de
	// tous les autres clients. D'où une route de suppression dédiée, et un
	// avertissement à l'écran tant qu'elle est présente.
	KeyBackupSuperAdmin = "backup_super_key"
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
