// backend/pos/customerdisplay.go
package pos

import (
	"context"
	"fmt"
	"strconv"
	"time"
)

// CustomerDisplay handles VFD customer display operations
type CustomerDisplay struct {
	ctx context.Context
}

// NewCustomerDisplay creates a new CustomerDisplay instance
func NewCustomerDisplay() *CustomerDisplay {
	return &CustomerDisplay{}
}

// Startup is called when the app starts
func (d *CustomerDisplay) Startup(ctx context.Context) {
	d.ctx = ctx
}

// ListPorts returns available serial ports
func (d *CustomerDisplay) ListPorts() ([]string, error) {
	return ListSerialPorts()
}

// SendText sends text to the VFD display
func (d *CustomerDisplay) SendText(
	portName string,
	baudRateStr string,
	protocolStr string,
	line1 string,
	line2 string,
	clearFirst bool,
) error {
	// Parse baud rate
	baudRate, err := strconv.Atoi(baudRateStr)
	if err != nil {
		return fmt.Errorf("invalid baud rate: %w", err)
	}

	// Validate protocol
	protocol := VFDProtocol(protocolStr)

	// Build VFD message
	msg := VFDMessage{
		Line1:      line1,
		Line2:      line2,
		ClearFirst: clearFirst,
	}

	// Build command with default brightness (100%)
	data := BuildVFDCommand(msg, protocol, 100)

	// Send to serial port
	err = SendToSerialPort(portName, baudRate, data)
	if err != nil {
		return fmt.Errorf("failed to send to display: %w", err)
	}

	return nil
}

// TestDisplay sends a test message to the VFD
func (d *CustomerDisplay) TestDisplay(
	portName string,
	baudRateStr string,
	protocolStr string,
) error {
	baudRate, err := strconv.Atoi(baudRateStr)
	if err != nil {
		return fmt.Errorf("invalid baud rate: %w", err)
	}

	protocol := VFDProtocol(protocolStr)

	// Clear first
	clear := VFD_Clear()
	err = SendToSerialPort(portName, baudRate, clear)
	if err != nil {
		return fmt.Errorf("failed to clear: %w", err)
	}

	time.Sleep(100 * time.Millisecond)

	// Send line 1
	msg1 := VFDMessage{
		Line1:      "TEST AFFICHEUR",
		Line2:      "",
		ClearFirst: false,
	}
	data1 := BuildVFDCommand(msg1, protocol, 100)
	err = SendToSerialPort(portName, baudRate, data1)
	if err != nil {
		return fmt.Errorf("failed to send line 1: %w", err)
	}

	time.Sleep(100 * time.Millisecond)

	// Send line 2
	msg2 := VFDMessage{
		Line1:      "",
		Line2:      "20 colonnes x 2",
		ClearFirst: false,
	}
	data2 := BuildVFDCommand(msg2, protocol, 100)
	err = SendToSerialPort(portName, baudRate, data2)
	if err != nil {
		return fmt.Errorf("failed to send line 2: %w", err)
	}

	return nil
}

// ClearDisplay clears the VFD display
func (d *CustomerDisplay) ClearDisplay(
	portName string,
	baudRateStr string,
) error {
	// Parse baud rate
	baudRate, err := strconv.Atoi(baudRateStr)
	if err != nil {
		return fmt.Errorf("invalid baud rate: %w", err)
	}

	// Send clear command
	data := VFD_Clear()

	err = SendToSerialPort(portName, baudRate, data)
	if err != nil {
		return fmt.Errorf("failed to clear display: %w", err)
	}

	return nil
}
