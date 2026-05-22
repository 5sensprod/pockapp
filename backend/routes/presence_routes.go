// backend/routes/presence_routes.go
package routes

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/tools/security"
)

// ═══════════════════════════════════════════════════════════════
// STORE EN MÉMOIRE — pas de BDD, données volatiles
// ═══════════════════════════════════════════════════════════════

type PresenceSession struct {
	SessionID string    `json:"sessionId"`
	UserID    string    `json:"userId"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	IP        string    `json:"ip"`
	UserAgent string    `json:"userAgent"`
	LastSeen  time.Time `json:"lastSeen"`
	ConnectedAt time.Time `json:"connectedAt"`
}

type presenceStore struct {
	mu       sync.RWMutex
	sessions map[string]*PresenceSession // key = sessionId
}

var store = &presenceStore{
	sessions: make(map[string]*PresenceSession),
}

// upsert crée ou rafraîchit une session
func (s *presenceStore) upsert(sess *PresenceSession) {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, ok := s.sessions[sess.SessionID]
	if ok {
		existing.LastSeen = sess.LastSeen
		existing.IP = sess.IP
	} else {
		sess.ConnectedAt = sess.LastSeen
		s.sessions[sess.SessionID] = sess
	}
}

// purge supprime les sessions inactives depuis plus de ttl
func (s *presenceStore) purge(ttl time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cutoff := time.Now().Add(-ttl)
	for id, sess := range s.sessions {
		if sess.LastSeen.Before(cutoff) {
			delete(s.sessions, id)
		}
	}
}

// list retourne toutes les sessions actives
func (s *presenceStore) list() []*PresenceSession {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]*PresenceSession, 0, len(s.sessions))
	for _, sess := range s.sessions {
		result = append(result, sess)
	}
	return result
}

// remove supprime explicitement une session (logout)
func (s *presenceStore) remove(sessionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, sessionID)
}

// ═══════════════════════════════════════════════════════════════
// HELPER AUTH — réutilise le même pattern que user_management
// ═══════════════════════════════════════════════════════════════

func parseUserFromToken(pb *pocketbase.PocketBase, token string) (userID, role string, err error) {
	token = strings.TrimPrefix(token, "Bearer ")
	token = strings.TrimSpace(token)

	claims, err := security.ParseUnverifiedJWT(token)
	if err != nil {
		return "", "", err
	}

	userID, _ = claims["id"].(string)
	if userID == "" {
		return "", "", nil
	}

	record, err := pb.Dao().FindRecordById("users", userID)
	if err != nil {
		return "", "", err
	}

	return userID, record.GetString("role"), nil
}

func getClientIP(r *http.Request) string {
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		return strings.Split(ip, ",")[0]
	}
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	return r.RemoteAddr
}

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════

func RegisterPresenceRoutes(pb *pocketbase.PocketBase, router *echo.Echo) {

	// ── POST /api/presence/ping ─────────────────────────────────
	// Appelé par chaque client toutes les 30s
	// Corps : { sessionId: string }
	router.POST("/api/presence/ping", func(c echo.Context) error {
		token := c.Request().Header.Get("Authorization")
		if token == "" {
			return c.JSON(http.StatusUnauthorized, map[string]string{"error": "Non authentifié"})
		}

		var body struct {
			SessionID string `json:"sessionId"`
			Label     string `json:"label"` // ex: "Caisse 1", optionnel
		}
		if err := c.Bind(&body); err != nil || body.SessionID == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "sessionId requis"})
		}

		// Récupérer userId + role depuis le token
		token = strings.TrimPrefix(token, "Bearer ")
		token = strings.TrimSpace(token)
		claims, err := security.ParseUnverifiedJWT(token)
		if err != nil {
			return c.JSON(http.StatusUnauthorized, map[string]string{"error": "Token invalide"})
		}

		userID, _ := claims["id"].(string)
		if userID == "" {
			return c.JSON(http.StatusUnauthorized, map[string]string{"error": "Token sans ID"})
		}

		record, err := pb.Dao().FindRecordById("users", userID)
		if err != nil {
			return c.JSON(http.StatusUnauthorized, map[string]string{"error": "Utilisateur inconnu"})
		}

		// Purger les sessions expirées à chaque ping (60s TTL)
		store.purge(60 * time.Second)

		store.upsert(&PresenceSession{
			SessionID: body.SessionID,
			UserID:    userID,
			Name:      record.GetString("name"),
			Email:     record.GetString("email"),
			Role:      record.GetString("role"),
			IP:        getClientIP(c.Request()),
			UserAgent: c.Request().Header.Get("User-Agent"),
			LastSeen:  time.Now(),
		})

		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})

	// ── DELETE /api/presence/ping ───────────────────────────────
	// Appelé au logout pour retirer la session immédiatement
	router.DELETE("/api/presence/ping", func(c echo.Context) error {
		var body struct {
			SessionID string `json:"sessionId"`
		}
		if err := c.Bind(&body); err != nil || body.SessionID == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "sessionId requis"})
		}
		store.remove(body.SessionID)
		return c.JSON(http.StatusOK, map[string]string{"status": "removed"})
	})

	// ── GET /api/presence/sessions ──────────────────────────────
	// Réservé aux admins — retourne les sessions actives
	router.GET("/api/presence/sessions", func(c echo.Context) error {
		token := c.Request().Header.Get("Authorization")
		userID, role, err := parseUserFromToken(pb, token)
		if err != nil || userID == "" {
			return c.JSON(http.StatusUnauthorized, map[string]string{"error": "Non authentifié"})
		}
		if role != "admin" {
			return c.JSON(http.StatusForbidden, map[string]string{"error": "Réservé aux admins"})
		}

		// Purger avant de lister
		store.purge(60 * time.Second)
		sessions := store.list()

		// Enrichir avec "secondsAgo" pour le frontend
		type SessionDTO struct {
			SessionID   string `json:"sessionId"`
			UserID      string `json:"userId"`
			Name        string `json:"name"`
			Email       string `json:"email"`
			Role        string `json:"role"`
			IP          string `json:"ip"`
			UserAgent   string `json:"userAgent"`
			LastSeen    string `json:"lastSeen"`
			ConnectedAt string `json:"connectedAt"`
			SecondsAgo  int    `json:"secondsAgo"`
		}

		result := make([]SessionDTO, len(sessions))
		for i, s := range sessions {
			result[i] = SessionDTO{
				SessionID:   s.SessionID,
				UserID:      s.UserID,
				Name:        s.Name,
				Email:       s.Email,
				Role:        s.Role,
				IP:          s.IP,
				UserAgent:   s.UserAgent,
				LastSeen:    s.LastSeen.Format(time.RFC3339),
				ConnectedAt: s.ConnectedAt.Format(time.RFC3339),
				SecondsAgo:  int(time.Since(s.LastSeen).Seconds()),
			}
		}

		return c.JSON(http.StatusOK, result)
	})
}
