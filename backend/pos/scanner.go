// backend/pos/scanner.go
package pos

import (
	"log"
	"strings"
	"sync"
	"time"

	"go.bug.st/serial"
)

// ScannerManager gère la connexion à la scanette et broadcast les scans
type ScannerManager struct {
	port        serial.Port
	portName    string
	baudRate    int
	isRunning   bool
	mu          sync.RWMutex
	subscribers map[chan string]bool
	subMu       sync.RWMutex
}

// NewScannerManager crée un nouveau gestionnaire de scanette
func NewScannerManager() *ScannerManager {
	return &ScannerManager{
		subscribers: make(map[chan string]bool),
	}
}

// Global instance
var Scanner = NewScannerManager()

// Start démarre l'écoute de la scanette sur le port série spécifié
func (sm *ScannerManager) Start(portName string, baudRate int) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	// Arrêter si déjà en cours
	if sm.isRunning && sm.port != nil {
		sm.port.Close()
	}

	log.Printf("[SCANNER] Tentative ouverture %s @ %d baud...", portName, baudRate)

	// Configuration du port série
	mode := &serial.Mode{
		BaudRate: baudRate,
		DataBits: 8,
		Parity:   serial.NoParity,
		StopBits: serial.OneStopBit,
	}

	port, err := serial.Open(portName, mode)
	if err != nil {
		log.Printf("[SCANNER] ERREUR ouverture port: %v", err)
		return err
	}

	// Timeout de lecture
	port.SetReadTimeout(100 * time.Millisecond)

	sm.port = port
	sm.portName = portName
	sm.baudRate = baudRate
	sm.isRunning = true

	// Lancer la goroutine de lecture
	go sm.readLoop()

	log.Printf("[SCANNER] ✓ Démarré sur %s @ %d baud", portName, baudRate)
	return nil
}

// Stop arrête l'écoute de la scanette
func (sm *ScannerManager) Stop() error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	sm.isRunning = false

	if sm.port != nil {
		err := sm.port.Close()
		sm.port = nil
		log.Println("[SCANNER] Arrêté")
		return err
	}

	return nil
}

// IsRunning retourne l'état de la scanette
func (sm *ScannerManager) IsRunning() bool {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return sm.isRunning
}

// GetStatus retourne le statut actuel
func (sm *ScannerManager) GetStatus() map[string]interface{} {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	sm.subMu.RLock()
	subscriberCount := len(sm.subscribers)
	sm.subMu.RUnlock()

	return map[string]interface{}{
		"running":     sm.isRunning,
		"portName":    sm.portName,
		"baudRate":    sm.baudRate,
		"subscribers": subscriberCount,
	}
}

// Subscribe ajoute un subscriber pour recevoir les scans
func (sm *ScannerManager) Subscribe() chan string {
	ch := make(chan string, 10) // Buffer de 10 scans

	sm.subMu.Lock()
	sm.subscribers[ch] = true
	sm.subMu.Unlock()

	log.Printf("[SCANNER] Nouveau subscriber (total: %d)", len(sm.subscribers))
	return ch
}

// Unsubscribe retire un subscriber
func (sm *ScannerManager) Unsubscribe(ch chan string) {
	sm.subMu.Lock()
	delete(sm.subscribers, ch)
	close(ch)
	sm.subMu.Unlock()

	log.Printf("[SCANNER] Subscriber retiré (total: %d)", len(sm.subscribers))
}

// broadcast envoie un scan à tous les subscribers
func (sm *ScannerManager) broadcast(barcode string) {
	sm.subMu.RLock()
	defer sm.subMu.RUnlock()

	log.Printf("[SCANNER] Broadcasting '%s' à %d subscribers", barcode, len(sm.subscribers))

	for ch := range sm.subscribers {
		select {
		case ch <- barcode:
			// Envoyé
		default:
			// Channel plein, on skip (évite le blocage)
			log.Println("[SCANNER] Channel plein, scan ignoré pour un subscriber")
		}
	}
}

// readLoop lit continuellement le port série
func (sm *ScannerManager) readLoop() {
	log.Println("[SCANNER] readLoop démarré, en attente de scans...")

	// Buffer pour accumuler les bytes
	var buffer []byte

	for {
		sm.mu.RLock()
		running := sm.isRunning
		port := sm.port
		sm.mu.RUnlock()

		if !running || port == nil {
			log.Println("[SCANNER] readLoop arrêté")
			return
		}

		// Lire des bytes (max 128 à la fois)
		tmp := make([]byte, 128)
		n, err := port.Read(tmp)

		if err != nil {
			// Timeout normal, on continue
			continue
		}

		if n > 0 {
			// Debug: afficher les bytes reçus
			log.Printf("[SCANNER] Reçu %d bytes: %v (string: %q)", n, tmp[:n], string(tmp[:n]))

			// Ajouter au buffer
			buffer = append(buffer, tmp[:n]...)

			// Chercher un délimiteur (CR, LF, ou les deux)
			for {
				idx := -1
				for i, b := range buffer {
					if b == '\n' || b == '\r' {
						idx = i
						break
					}
				}

				if idx == -1 {
					// Pas de délimiteur trouvé, attendre plus de données
					// Mais si le buffer est long (>50 chars), c'est peut-être une scanette sans délimiteur
					if len(buffer) > 50 {
						log.Printf("[SCANNER] Buffer long sans délimiteur, envoi forcé: %q", string(buffer))
						barcode := strings.TrimSpace(string(buffer))
						if barcode != "" {
							sm.broadcast(barcode)
						}
						buffer = nil
					}
					break
				}

				// Extraire le barcode
				barcode := strings.TrimSpace(string(buffer[:idx]))
				buffer = buffer[idx+1:]

				// Ignorer les lignes vides
				if barcode == "" {
					continue
				}

				log.Printf("[SCANNER] ✓ Barcode complet: %s", barcode)
				sm.broadcast(barcode)
			}
		}
	}
}

// SimulateScan simule un scan (utile pour les tests)
func (sm *ScannerManager) SimulateScan(barcode string) {
	log.Printf("[SCANNER] Scan simulé: %s", barcode)
	sm.broadcast(barcode)
}

// Broadcast envoie un scan à tous les clients (utilisé pour le mode HID)
func (sm *ScannerManager) Broadcast(barcode string) {
	log.Printf("[SCANNER] Broadcast HID: %s", barcode)
	sm.broadcast(barcode)
}
