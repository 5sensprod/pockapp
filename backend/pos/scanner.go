// backend/pos/scanner.go
package pos

import (
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

	if sm.isRunning && sm.port != nil {
		sm.port.Close()
	}

	mode := &serial.Mode{
		BaudRate: baudRate,
		DataBits: 8,
		Parity:   serial.NoParity,
		StopBits: serial.OneStopBit,
	}

	port, err := serial.Open(portName, mode)
	if err != nil {
		return err
	}

	port.SetReadTimeout(100 * time.Millisecond)

	sm.port = port
	sm.portName = portName
	sm.baudRate = baudRate
	sm.isRunning = true

	go sm.readLoop()
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
	ch := make(chan string, 10)

	sm.subMu.Lock()
	sm.subscribers[ch] = true
	sm.subMu.Unlock()

	return ch
}

// Unsubscribe retire un subscriber
func (sm *ScannerManager) Unsubscribe(ch chan string) {
	sm.subMu.Lock()
	delete(sm.subscribers, ch)
	close(ch)
	sm.subMu.Unlock()
}

// broadcast envoie un scan à tous les subscribers
func (sm *ScannerManager) broadcast(barcode string) {
	sm.subMu.RLock()
	defer sm.subMu.RUnlock()

	for ch := range sm.subscribers {
		select {
		case ch <- barcode:
		default:
		}
	}
}

// readLoop lit continuellement le port série
func (sm *ScannerManager) readLoop() {
	var buffer []byte

	for {
		sm.mu.RLock()
		running := sm.isRunning
		port := sm.port
		sm.mu.RUnlock()

		if !running || port == nil {
			return
		}

		tmp := make([]byte, 128)
		n, err := port.Read(tmp)
		if err != nil {
			continue
		}

		if n > 0 {
			buffer = append(buffer, tmp[:n]...)

			for {
				idx := -1
				for i, b := range buffer {
					if b == '\n' || b == '\r' {
						idx = i
						break
					}
				}

				if idx == -1 {
					if len(buffer) > 50 {
						barcode := strings.TrimSpace(string(buffer))
						if barcode != "" {
							sm.broadcast(barcode)
						}
						buffer = nil
					}
					break
				}

				barcode := strings.TrimSpace(string(buffer[:idx]))
				buffer = buffer[idx+1:]

				if barcode == "" {
					continue
				}

				sm.broadcast(barcode)
			}
		}
	}
}

// SimulateScan simule un scan (utile pour les tests)
func (sm *ScannerManager) SimulateScan(barcode string) {
	sm.broadcast(barcode)
}

// Broadcast envoie un scan à tous les clients (utilisé pour le mode HID)
func (sm *ScannerManager) Broadcast(barcode string) {
	sm.broadcast(barcode)
}
