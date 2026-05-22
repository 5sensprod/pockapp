// backend/routes/sse_routes.go
package routes

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
)

// ─── Types ───────────────────────────────────────────────────────────────────

type SSEClient struct {
	UserID  string
	Name    string
	Role    string
	Channel chan SSEEvent
	Done    chan struct{}
}

type SSEEvent struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

type BroadcastRequest struct {
	Type         string                 `json:"type"`
	TargetUserID *string                `json:"targetUserId"`
	From         BroadcastFrom          `json:"from"`
	Payload      map[string]interface{} `json:"payload"`
}

type BroadcastFrom struct {
	UserID string `json:"userId"`
	Name   string `json:"name"`
	Role   string `json:"role"`
}

// ─── Store SSE ────────────────────────────────────────────────────────────────

type SSEStore struct {
	mu      sync.RWMutex
	clients map[string]*SSEClient
}

var sseStore = &SSEStore{
	clients: make(map[string]*SSEClient),
}

func (s *SSEStore) Add(userID string, client *SSEClient) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if old, ok := s.clients[userID]; ok {
		select {
		case old.Done <- struct{}{}:
		default:
		}
	}
	s.clients[userID] = client
}

func (s *SSEStore) Remove(userID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.clients, userID)
}

func (s *SSEStore) Send(targetUserID *string, event SSEEvent) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sent := 0
	for uid, client := range s.clients {
		if targetUserID != nil && uid != *targetUserID {
			continue
		}
		select {
		case client.Channel <- event:
			sent++
		default:
			log.Printf("⚠️  SSE channel full for user %s, skipping", uid)
		}
	}
	return sent
}

func (s *SSEStore) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.clients)
}

// ─── Enregistrement ──────────────────────────────────────────────────────────

func RegisterSSERoutes(pb *pocketbase.PocketBase, router *echo.Echo) {
	router.GET("/api/presence/events", handleSSEConnect(pb))
	router.POST("/api/presence/broadcast", handleSSEBroadcast(pb))
	log.Println("📡 SSE routes registered")
}

// ─── Auth helper : token depuis header OU query string ───────────────────────
// EventSource ne supporte pas les headers custom → token passé en ?token=

func extractAndValidateToken(pb *pocketbase.PocketBase, c echo.Context) (userID, userName, userRole string, err error) {
	// 1. Query string ?token=
	token := c.QueryParam("token")
	// 2. Header Authorization: Bearer <token>
	if token == "" {
		auth := c.Request().Header.Get("Authorization")
		if len(auth) > 7 && auth[:7] == "Bearer " {
			token = auth[7:]
		}
	}
	if token == "" {
		err = fmt.Errorf("missing token")
		return
	}

	// Injecter dans le header pour que apis.RequestInfo fonctionne normalement
	c.Request().Header.Set("Authorization", "Bearer "+token)

	// Valider via RequestInfo (qui lit le header Authorization)
	info := apis.RequestInfo(c)
	if info.AuthRecord == nil {
		// Fallback : validation directe du JWT PocketBase
		record, findErr := pb.Dao().FindAuthRecordByToken(
			token,
			pb.Settings().RecordAuthToken.Secret,
		)
		if findErr != nil || record == nil {
			err = fmt.Errorf("invalid token")
			return
		}
		userID = record.Id
		userName, _ = record.Get("name").(string)
		userRole, _ = record.Get("role").(string)
		return
	}

	userID = info.AuthRecord.Id
	userName, _ = info.AuthRecord.Get("name").(string)
	userRole, _ = info.AuthRecord.Get("role").(string)
	return
}

// ─── Connexion SSE ────────────────────────────────────────────────────────────

func handleSSEConnect(pb *pocketbase.PocketBase) echo.HandlerFunc {
	return func(c echo.Context) error {
		userID, userName, userRole, err := extractAndValidateToken(pb, c)
		if err != nil {
			log.Printf("❌ SSE auth error: %v", err)
			return c.JSON(http.StatusUnauthorized, map[string]string{"error": err.Error()})
		}

		// Headers SSE
		w := c.Response().Writer
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		c.Response().WriteHeader(http.StatusOK)

		flusher, ok := w.(http.Flusher)
		if !ok {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "streaming not supported"})
		}

		client := &SSEClient{
			UserID:  userID,
			Name:    userName,
			Role:    userRole,
			Channel: make(chan SSEEvent, 16),
			Done:    make(chan struct{}, 1),
		}

		sseStore.Add(userID, client)
		log.Printf("📡 SSE connected: %s (%s) — %d clients", userName, userID, sseStore.Count())

		writeSSEEvent(w, flusher, SSEEvent{
			Type:    "connected",
			Payload: map[string]interface{}{"userId": userID, "name": userName},
		})

		ticker := time.NewTicker(25 * time.Second)
		defer ticker.Stop()
		defer func() {
			sseStore.Remove(userID)
			log.Printf("📡 SSE disconnected: %s — %d clients", userName, sseStore.Count())
		}()

		req := c.Request()
		for {
			select {
			case event := <-client.Channel:
				writeSSEEvent(w, flusher, event)
			case <-ticker.C:
				fmt.Fprintf(w, ": heartbeat\n\n")
				flusher.Flush()
			case <-client.Done:
				return nil
			case <-req.Context().Done():
				return nil
			}
		}
	}
}

// ─── Broadcast ────────────────────────────────────────────────────────────────

func handleSSEBroadcast(pb *pocketbase.PocketBase) echo.HandlerFunc {
	return func(c echo.Context) error {
		// Broadcast accepte aussi bien header que query string
		_, _, _, err := extractAndValidateToken(pb, c)
		if err != nil {
			return c.JSON(http.StatusUnauthorized, map[string]string{"error": err.Error()})
		}

		var req BroadcastRequest
		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid body"})
		}

		switch req.Type {
		case "message", "task", "invalidate":
		default:
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": fmt.Sprintf("unknown type: %s", req.Type),
			})
		}

		event := SSEEvent{
			Type: req.Type,
			Payload: map[string]interface{}{
				"from":    req.From,
				"payload": req.Payload,
			},
		}

		sent := sseStore.Send(req.TargetUserID, event)
		log.Printf("📤 Broadcast type=%s target=%v sent=%d", req.Type, req.TargetUserID, sent)

		return c.JSON(http.StatusOK, map[string]interface{}{"ok": true, "sent": sent})
	}
}

// ─── Utilitaire ───────────────────────────────────────────────────────────────

func writeSSEEvent(w http.ResponseWriter, flusher http.Flusher, event SSEEvent) {
	data, err := json.Marshal(event.Payload)
	if err != nil {
		log.Printf("⚠️  SSE marshal error: %v", err)
		return
	}
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Type, string(data))
	flusher.Flush()
}
