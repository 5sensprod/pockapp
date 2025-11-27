package backend

import (
	"fmt"
	"log"
	"net"
	"os"

	"github.com/grandcat/zeroconf"
)

var mdnsServer *zeroconf.Server

// GetLocalIP retourne l'IP locale de la machine
func GetLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "127.0.0.1"
	}
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String()
			}
		}
	}
	return "127.0.0.1"
}

// StartMDNS annonce le service sur le réseau local
func StartMDNS(port int, serviceName string) error {
	hostname, _ := os.Hostname()
	
	var err error
	mdnsServer, err = zeroconf.Register(
		serviceName,           // Nom du service (ex: "PocketReact")
		"_http._tcp",          // Type de service
		"local.",              // Domaine
		port,                  // Port
		[]string{"path=/"},    // TXT records
		nil,                   // Interfaces (nil = toutes)
	)
	if err != nil {
		return fmt.Errorf("mDNS register failed: %w", err)
	}
	
	log.Printf("mDNS: %s.local:%d (hostname: %s)", serviceName, port, hostname)
	return nil
}

// StopMDNS arrête l'annonce mDNS
func StopMDNS() {
	if mdnsServer != nil {
		mdnsServer.Shutdown()
		mdnsServer = nil
	}
}