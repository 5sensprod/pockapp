package backend

import (
	"net"
	"testing"
)

func TestAdresseLANPlausible(t *testing.T) {
	ok := []string{"192.168.1.12", "10.0.0.5", "172.16.4.2", "172.31.255.1"}
	non := []string{
		"255.255.255.0", "255.1.2.3", "240.0.0.1", // réservé
		"25.4.5.6", "26.1.1.1", // Hamachi, Radmin
		"198.18.0.1", "198.19.5.5", // bancs d'essai (antivirus, proxys)
		"100.64.0.1", "169.254.1.1", "8.8.8.8", "172.32.0.1", "172.15.0.1",
	}
	for _, a := range ok {
		if !adresseLANPlausible(net.ParseIP(a)) {
			t.Errorf("%s devrait être acceptée", a)
		}
	}
	for _, a := range non {
		if adresseLANPlausible(net.ParseIP(a)) {
			t.Errorf("%s devrait être refusée", a)
		}
	}
}

func TestNomEcarteAntivirus(t *testing.T) {
	for _, n := range []string{"Kaspersky Security Data Escort", "Npcap Loopback Adapter", "NordLynx", "vEthernet (Default Switch)"} {
		if !nomEcarte(n) {
			t.Errorf("%q devrait être écartée", n)
		}
	}
	for _, n := range []string{"Ethernet", "Wi-Fi", "Ethernet 2"} {
		if nomEcarte(n) {
			t.Errorf("%q ne doit pas être écartée", n)
		}
	}
}
