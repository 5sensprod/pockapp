// backend/pos/serialport_windows.go
//go:build windows

package pos

import (
	"fmt"
	"sort"
	"sync"
	"time"

	"go.bug.st/serial"
)

// ================================
// List ports
// ================================

// ListSerialPorts returns available COM ports on Windows
func ListSerialPorts() ([]string, error) {
	ports, err := serial.GetPortsList()
	if err != nil {
		return nil, fmt.Errorf("failed to list serial ports: %w", err)
	}

	var validPorts []string
	for _, port := range ports {
		if port != "" {
			validPorts = append(validPorts, port)
		}
	}

	sort.Strings(validPorts)
	return validPorts, nil
}

// ================================
// Single shared serial handle + mutex
// ================================

var (
	serialMu   sync.Mutex
	serialPort serial.Port

	currentPortName string
	currentBaudRate int
)

// CloseSerialPort releases the COM port (call on disable/change port/shutdown).
func CloseSerialPort() {
	serialMu.Lock()
	defer serialMu.Unlock()

	if serialPort != nil {
		_ = serialPort.Close()
		serialPort = nil
	}

	currentPortName = ""
	currentBaudRate = 0
}

// ensureSerialOpen opens (or reuses) the serial port with the given config.
// Caller MUST hold serialMu.
func ensureSerialOpen(portName string, baudRate int) error {
	if portName == "" {
		return fmt.Errorf("portName is empty")
	}
	if baudRate <= 0 {
		return fmt.Errorf("invalid baudRate: %d", baudRate)
	}

	// Already open with same config
	if serialPort != nil && currentPortName == portName && currentBaudRate == baudRate {
		return nil
	}

	// Close previous if open
	if serialPort != nil {
		_ = serialPort.Close()
		serialPort = nil
		currentPortName = ""
		currentBaudRate = 0
	}

	mode := &serial.Mode{
		BaudRate: baudRate,
		DataBits: 8,
		Parity:   serial.NoParity,
		StopBits: serial.OneStopBit,
	}

	p, err := serial.Open(portName, mode)
	if err != nil {
		return fmt.Errorf("failed to open port %s: %w", portName, err)
	}

	// Safe even if you never read
	if err := p.SetReadTimeout(2 * time.Second); err != nil {
		_ = p.Close()
		return fmt.Errorf("failed to set read timeout: %w", err)
	}

	serialPort = p
	currentPortName = portName
	currentBaudRate = baudRate
	return nil
}

// ================================
// Send API
// ================================

// SendToSerialPort opens (or reuses) the port and writes data.
// This prevents "Serial port busy" when your app tries to open the same COM port multiple times.
func SendToSerialPort(portName string, baudRate int, data []byte) error {
	serialMu.Lock()
	defer serialMu.Unlock()

	if err := ensureSerialOpen(portName, baudRate); err != nil {
		return err
	}

	n, err := serialPort.Write(data)
	if err != nil {
		return fmt.Errorf("failed to write to port: %w", err)
	}

	if n != len(data) {
		return fmt.Errorf("incomplete write: sent %d/%d bytes", n, len(data))
	}

	// IMPORTANT: Délai plus long pour VFD
	time.Sleep(200 * time.Millisecond)

	return nil
}
