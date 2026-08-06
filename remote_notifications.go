// remote_notifications.go
// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS DISTANTES - POLLING SERVEUR
// ═══════════════════════════════════════════════════════════════════════════
// La clé API est maintenant stockée de manière sécurisée via le SecretManager
// et configurée depuis l'interface Settings > Clés API
// ═══════════════════════════════════════════════════════════════════════════

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"pocket-react/backend/secrets"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	remoteNotifURL      = "http://pocketapp.5sensprod.com/api/notifications.php"
	remoteNotifInterval = 10 * time.Second
)

// Cache pour la clé API (évite de déchiffrer à chaque requête)
var (
	cachedAPIKey     string
	cachedAPIKeyTime time.Time
	apiKeyCacheTTL   = 5 * time.Minute
	apiKeyMutex      sync.RWMutex
)

type RemoteNotification struct {
	ID        int                    `json:"id"`
	Type      string                 `json:"type"`
	Title     string                 `json:"title"`
	Message   string                 `json:"message"`
	Meta      map[string]interface{} `json:"meta"`
	CreatedAt string                 `json:"created_at"`
}

type RemoteNotifResponse struct {
	Notifications []RemoteNotification `json:"notifications"`
	ServerTime    string               `json:"server_time"`
}

// getNotificationAPIKey récupère la clé API depuis le SecretManager avec cache
func (a *App) getNotificationAPIKey() (string, error) {
	apiKeyMutex.RLock()
	if cachedAPIKey != "" && time.Since(cachedAPIKeyTime) < apiKeyCacheTTL {
		key := cachedAPIKey
		apiKeyMutex.RUnlock()
		return key, nil
	}
	apiKeyMutex.RUnlock()

	// Récupérer depuis le SecretManager
	sm := secrets.NewSecretManager(a.pb)
	apiKey, err := sm.GetSecret(secrets.KeyNotificationAPI)
	if err != nil {
		return "", fmt.Errorf("clé API notifications non configurée: %w", err)
	}

	if apiKey == "" {
		return "", fmt.Errorf("clé API notifications vide")
	}

	// Mettre en cache
	apiKeyMutex.Lock()
	cachedAPIKey = apiKey
	cachedAPIKeyTime = time.Now()
	apiKeyMutex.Unlock()

	return apiKey, nil
}

// InvalidateAPIKeyCache invalide le cache de la clé API
// À appeler quand la clé est modifiée dans les settings
func (a *App) InvalidateAPIKeyCache() {
	apiKeyMutex.Lock()
	cachedAPIKey = ""
	cachedAPIKeyTime = time.Time{}
	apiKeyMutex.Unlock()
	log.Println("🔄 Cache clé API invalidé")
}

// IsNotificationAPIConfigured vérifie si la clé API est configurée (binding frontend)
func (a *App) IsNotificationAPIConfigured() bool {
	sm := secrets.NewSecretManager(a.pb)
	return sm.HasSecret(secrets.KeyNotificationAPI)
}

// FetchRemoteNotifications récupère les notifications depuis le serveur distant
func (a *App) FetchRemoteNotifications() ([]RemoteNotification, error) {
	apiKey, err := a.getNotificationAPIKey()
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("GET", remoteNotifURL, nil)
	if err != nil {
		return nil, err
	}

	// Headers pour éviter le blocage 503/403
	req.Header.Set("X-API-Key", apiKey)
	req.Header.Set("User-Agent", "PocketApp/1.0 (Wails Desktop)")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		msg := string(body)
		if len(msg) > 200 {
			msg = msg[:200] + "..."
		}
		return nil, fmt.Errorf("server returned %d: %s", resp.StatusCode, msg)
	}

	var result RemoteNotifResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return result.Notifications, nil
}

// MarkRemoteNotificationRead marque une notification comme lue (binding frontend)
func (a *App) MarkRemoteNotificationRead(notificationID int) error {
	apiKey, err := a.getNotificationAPIKey()
	if err != nil {
		return err
	}

	body := fmt.Sprintf(`{"notification_id":%d}`, notificationID)

	req, err := http.NewRequest("POST", remoteNotifURL, strings.NewReader(body))
	if err != nil {
		return err
	}

	req.Header.Set("X-API-Key", apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "PocketApp/1.0 (Wails Desktop)")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("server returned %d", resp.StatusCode)
	}

	return nil
}

// StartRemoteNotificationPoller démarre le polling en arrière-plan
func (a *App) StartRemoteNotificationPoller() {
	// Vérifier si la clé est configurée avant de démarrer
	if !a.IsNotificationAPIConfigured() {
		log.Println("⚠️ Clé API notifications non configurée - polling désactivé")
		log.Println("   → Configurez-la dans Paramètres > Clés API")
		return
	}

	go func() {
		// Attendre 2 secondes après le lancement
		time.Sleep(2 * time.Second)

		// Exécute immédiatement une première fois
		a.pollRemoteNotifications()

		// Puis toutes les X secondes
		ticker := time.NewTicker(remoteNotifInterval)
		defer ticker.Stop()

		for range ticker.C {
			// Revérifier si la clé est toujours configurée
			if !a.IsNotificationAPIConfigured() {
				log.Println("⚠️ Clé API supprimée - arrêt du polling")
				return
			}
			a.pollRemoteNotifications()
		}
	}()

	log.Println("🔔 Remote notification poller started")
}

func (a *App) pollRemoteNotifications() {
	notifications, err := a.FetchRemoteNotifications()
	if err != nil {
		// Ne pas spammer les logs si c'est juste "non configuré"
		if !strings.Contains(err.Error(), "non configurée") {
			log.Println("❌ Poll error:", err)
		}
		return
	}

	if len(notifications) > 0 {
		log.Println("✅ Got", len(notifications), "notifications")
	}

	for _, notif := range notifications {
		runtime.EventsEmit(a.ctx, "remote:notification", map[string]interface{}{
			"id":        notif.ID,
			"type":      notif.Type,
			"title":     notif.Title,
			"message":   notif.Message,
			"meta":      notif.Meta,
			"createdAt": notif.CreatedAt,
		})
	}
}
