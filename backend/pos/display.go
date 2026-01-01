// backend/pos/display.go
package pos

import (
	"fmt"
	"sync"
)

// DisplayManager gère l'affichage client et broadcast les changements
type DisplayManager struct {
	portName     string
	baudRate     int
	protocol     VFDProtocol
	currentLine1 string
	currentLine2 string
	isActive     bool
	controllerID string // ID de l'appareil qui contrôle
	mu           sync.RWMutex
	subscribers  map[chan DisplayUpdate]bool
	subMu        sync.RWMutex
}

// DisplayUpdate représente un changement d'affichage
type DisplayUpdate struct {
	Line1 string `json:"line1"`
	Line2 string `json:"line2"`
}

// NewDisplayManager crée un nouveau gestionnaire d'affichage
func NewDisplayManager() *DisplayManager {
	return &DisplayManager{
		subscribers: make(map[chan DisplayUpdate]bool),
	}
}

// Global instance
var Display = NewDisplayManager()

// Configure définit les paramètres du port série
func (dm *DisplayManager) Configure(portName string, baudRate int, protocol VFDProtocol) {
	dm.mu.Lock()
	defer dm.mu.Unlock()

	dm.portName = portName
	dm.baudRate = baudRate
	dm.protocol = protocol
	dm.isActive = true
}

// UpdateDisplay met à jour l'affichage et broadcast aux subscribers
// Seul le contrôleur actif peut mettre à jour (ou deviceID vide = bypass pour tests)
func (dm *DisplayManager) UpdateDisplay(line1, line2 string, clearFirst bool, deviceID string) error {
	dm.mu.Lock()
	portName := dm.portName
	baudRate := dm.baudRate
	protocol := dm.protocol
	isActive := dm.isActive
	controllerID := dm.controllerID
	dm.mu.Unlock()

	if !isActive {
		return nil
	}

	// Vérifier le contrôle (sauf si deviceID vide = bypass pour tests)
	if deviceID != "" && controllerID != "" && controllerID != deviceID {
		return fmt.Errorf("display contrôlé par un autre appareil")
	}

	// Construire et envoyer la commande VFD
	msg := VFDMessage{
		Line1:      line1,
		Line2:      line2,
		ClearFirst: clearFirst,
	}

	data := BuildVFDCommand(msg, protocol, 100)

	err := SendToSerialPort(portName, baudRate, data)
	if err != nil {
		return err
	}

	// Mettre à jour l'état interne
	dm.mu.Lock()
	dm.currentLine1 = line1
	dm.currentLine2 = line2
	dm.mu.Unlock()

	// Broadcast aux subscribers
	update := DisplayUpdate{
		Line1: line1,
		Line2: line2,
	}
	dm.broadcast(update)

	return nil
}

// Clear efface l'affichage
func (dm *DisplayManager) Clear(deviceID string) error {
	dm.mu.Lock()
	portName := dm.portName
	baudRate := dm.baudRate
	isActive := dm.isActive
	controllerID := dm.controllerID
	dm.mu.Unlock()

	if !isActive {
		return nil
	}

	// Vérifier le contrôle
	if controllerID != "" && controllerID != deviceID {
		return fmt.Errorf("display contrôlé par un autre appareil")
	}

	data := VFD_Clear()
	err := SendToSerialPort(portName, baudRate, data)
	if err != nil {
		return err
	}

	dm.mu.Lock()
	dm.currentLine1 = ""
	dm.currentLine2 = ""
	dm.mu.Unlock()

	dm.broadcast(DisplayUpdate{Line1: "", Line2: ""})

	return nil
}

// GetStatus retourne le statut actuel
func (dm *DisplayManager) GetStatus() map[string]interface{} {
	dm.mu.RLock()
	defer dm.mu.RUnlock()

	dm.subMu.RLock()
	subscriberCount := len(dm.subscribers)
	dm.subMu.RUnlock()

	return map[string]interface{}{
		"active":       dm.isActive,
		"portName":     dm.portName,
		"baudRate":     dm.baudRate,
		"protocol":     dm.protocol,
		"line1":        dm.currentLine1,
		"line2":        dm.currentLine2,
		"subscribers":  subscriberCount,
		"controllerID": dm.controllerID,
	}
}

// Subscribe ajoute un subscriber pour recevoir les updates
func (dm *DisplayManager) Subscribe() chan DisplayUpdate {
	ch := make(chan DisplayUpdate, 10)

	dm.subMu.Lock()
	dm.subscribers[ch] = true
	dm.subMu.Unlock()

	// Envoyer l'état actuel immédiatement
	dm.mu.RLock()
	currentUpdate := DisplayUpdate{
		Line1: dm.currentLine1,
		Line2: dm.currentLine2,
	}
	dm.mu.RUnlock()

	ch <- currentUpdate

	return ch
}

// Unsubscribe retire un subscriber
func (dm *DisplayManager) Unsubscribe(ch chan DisplayUpdate) {
	dm.subMu.Lock()
	delete(dm.subscribers, ch)
	close(ch)
	dm.subMu.Unlock()
}

// broadcast envoie un update à tous les subscribers
func (dm *DisplayManager) broadcast(update DisplayUpdate) {
	dm.subMu.RLock()
	defer dm.subMu.RUnlock()

	for ch := range dm.subscribers {
		select {
		case ch <- update:
		default:
		}
	}
}

// TakeControl permet à un appareil de prendre le contrôle exclusif
func (dm *DisplayManager) TakeControl(deviceID string) error {
	dm.mu.Lock()
	defer dm.mu.Unlock()

	if dm.controllerID != "" && dm.controllerID != deviceID {
		return fmt.Errorf("display déjà contrôlé par %s", dm.controllerID)
	}

	dm.controllerID = deviceID

	// Broadcast le changement de contrôleur
	dm.broadcastControlChange()
	return nil
}

// ReleaseControl libère le contrôle
func (dm *DisplayManager) ReleaseControl(deviceID string) error {
	dm.mu.Lock()
	defer dm.mu.Unlock()

	if dm.controllerID != deviceID {
		return fmt.Errorf("vous ne contrôlez pas le display")
	}

	dm.controllerID = ""

	// Broadcast le changement
	dm.broadcastControlChange()
	return nil
}

// GetController retourne l'ID du contrôleur actuel
func (dm *DisplayManager) GetController() string {
	dm.mu.RLock()
	defer dm.mu.RUnlock()
	return dm.controllerID
}

// broadcastControlChange notifie tous les clients du changement de contrôleur
func (dm *DisplayManager) broadcastControlChange() {
	update := DisplayUpdate{
		Line1: dm.currentLine1,
		Line2: dm.currentLine2,
	}
	dm.broadcast(update)
}

// Deactivate désactive l'affichage
func (dm *DisplayManager) Deactivate() {
	dm.mu.Lock()
	defer dm.mu.Unlock()

	dm.isActive = false
	dm.portName = ""
	dm.currentLine1 = ""
	dm.currentLine2 = ""
	dm.controllerID = ""
}
