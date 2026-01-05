package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	remoteNotifURL      = "https://pocketapp.5sensprod.com/api/notifications.php"
	remoteNotifInterval = 10 * time.Second
)

// ⚠️ API KEY EN DUR POUR TEST
const remoteNotifApiKey = "bae46852858b81746c3316e0f1ae16fff3889e1abda6e0732e3f17b6161fe353"

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

// FetchRemoteNotifications récupère les notifications depuis le serveur distant
func (a *App) FetchRemoteNotifications() ([]RemoteNotification, error) {
	if remoteNotifApiKey == "" || remoteNotifApiKey == "COLLE_TON_API_KEY_ICI" {
		return nil, fmt.Errorf("API key not configured")
	}

	req, err := http.NewRequest("GET", remoteNotifURL, nil)
	if err != nil {
		return nil, err
	}

	// ✅ CORRECTION : Ajout de User-Agent et Accept pour éviter le blocage 503/403
	req.Header.Set("X-API-Key", remoteNotifApiKey)
	req.Header.Set("User-Agent", "PocketApp/1.0 (Wails Desktop)") // Indispensable pour passer les filtres anti-bot
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		// On limite l'affichage du body s'il est très long (cas du HTML d'erreur)
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
	if remoteNotifApiKey == "" || remoteNotifApiKey == "COLLE_TON_API_KEY_ICI" {
		return fmt.Errorf("API key not configured")
	}

	body := fmt.Sprintf(`{"notification_id":%d}`, notificationID)

	req, err := http.NewRequest("POST", remoteNotifURL, strings.NewReader(body))
	if err != nil {
		return err
	}

	// ✅ CORRECTION : Ajout headers ici aussi
	req.Header.Set("X-API-Key", remoteNotifApiKey)
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
	if remoteNotifApiKey == "" || remoteNotifApiKey == "COLLE_TON_API_KEY_ICI" {
		return
	}

	go func() {
		// 👇 CHANGE ICI : Met 2 secondes au lieu de 30 secondes
		// C'est le temps d'attente juste après le lancement de l'app
		time.Sleep(2 * time.Second)

		// Exécute immédiatement une première fois
		a.pollRemoteNotifications()

		// Puis toutes les X secondes (défini plus haut)
		ticker := time.NewTicker(remoteNotifInterval)
		defer ticker.Stop()

		for range ticker.C {
			a.pollRemoteNotifications()
		}
	}()
}
func (a *App) pollRemoteNotifications() {
	log.Println("🔔 Polling remote notifications...")

	notifications, err := a.FetchRemoteNotifications()
	if err != nil {
		log.Println("❌ Poll error:", err)
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
