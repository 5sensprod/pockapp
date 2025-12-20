// backend/pos/serialport_windows.go
//go:build windows

package pos

import (
	"fmt"
	"sort"
	"time"

	"go.bug.st/serial"
)

// ListSerialPorts returns available COM ports on Windows
func ListSerialPorts() ([]string, error) {
	ports, err := serial.GetPortsList()
	if err != nil {
		return nil, fmt.Errorf("failed to list serial ports: %w", err)
	}

	// Filter empty ports and sort
	var validPorts []string
	for _, port := range ports {
		if port != "" {
			validPorts = append(validPorts, port)
		}
	}

	sort.Strings(validPorts)
	return validPorts, nil
}

// SendToSerialPort sends data to a serial port
func SendToSerialPort(portName string, baudRate int, data []byte) error {
	mode := &serial.Mode{
		BaudRate: baudRate,
		DataBits: 8,
		Parity:   serial.NoParity,
		StopBits: serial.OneStopBit,
	}

	port, err := serial.Open(portName, mode)
	if err != nil {
		return fmt.Errorf("failed to open port %s: %w", portName, err)
	}
	defer port.Close()

	// Set timeouts
	err = port.SetReadTimeout(time.Second * 2)
	if err != nil {
		return fmt.Errorf("failed to set read timeout: %w", err)
	}

	// Send data
	n, err := port.Write(data)
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
