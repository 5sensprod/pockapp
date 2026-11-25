package backend

import (
	"fmt"
	"log"
	"net"
	"os"
	"strings"

	"github.com/grandcat/zeroconf"
)

var mdnsServer *zeroconf.Server

// GetLocalIP retourne l'IP locale de la machine.
//
// Portage à l'identique de `AppServe/utils/network.js` d'AppPos
// (`getLocalIpAddress`) : la première IPv4 non-loopback venue n'est PAS la
// bonne. Les antivirus, VPN et hyperviseurs posent des adaptateurs virtuels
// que `net.InterfaceAddrs()` peut rendre en premier — le poste annonçait alors
// au QR code une adresse que personne sur le réseau ne peut joindre.
// On écarte donc par nom d'interface et par plage d'adresse, puis on classe :
// Ethernet, puis Wi-Fi, puis le reste.
//
// Nettoyage possible : la blacklist est une liste en dur, comme dans AppPos.
// Un jour, préférer l'interface qui porte la route par défaut.
func GetLocalIP() string {
	candidats := ipsCandidates()
	if len(candidats) == 0 {
		return "127.0.0.1"
	}

	meilleur := candidats[0]
	for _, c := range candidats[1:] {
		if c.priorite > meilleur.priorite {
			meilleur = c
		}
	}

	log.Printf("réseau: IP retenue %s (%s)", meilleur.adresse, meilleur.interfaceNom)
	return meilleur.adresse
}

type ipCandidate struct {
	adresse      string
	interfaceNom string
	priorite     int
}

// nomsEcartes : fragments de noms d'interface virtuels (comparaison sans casse).
var nomsEcartes = []string{
	"vmware", "virtualbox", "hyper-v", "tap-windows", "openvpn",
	"hamachi", "zerotier", "tailscale", "wireguard", "vethernet",
	"docker", "br-", "vboxnet", "vmnet",
	// Antivirus / pare-feu / VPN commerciaux : ils posent des adaptateurs
	// filtrants dont l'adresse n'est joignable par personne.
	"kaspersky", "avast", "bitdefender", "eset", "norton", "malwarebytes",
	"mcafee", "sophos", "fortinet", "forticlient", "anyconnect", "checkpoint",
	"nordlynx", "nordvpn", "protonvpn", "expressvpn", "windscribe", "surfshark",
	"npcap", "wfp", "wan miniport", "teredo", "isatap", "bluetooth",
	"loopback pseudo", "radmin", "clash", "wsl", "default switch",
}

// prefixesEcartes : plages d'adresses attribuées par les couches virtuelles.
var prefixesEcartes = []string{
	"100.",                                     // CGNAT / VPN
	"172.16.", "172.17.", "172.18.", "172.19.", // Docker
	"10.0.53.",     // Hyper-V
	"192.168.56.",  // VirtualBox
	"169.254.",     // APIPA / lien-local
	"192.168.99.",  // Docker Toolbox
	"192.168.137.", // partage de connexion Windows (hotspot)
}

// adresseLANPlausible : une adresse qu'un autre poste du magasin peut joindre
// est une adresse PRIVÉE (10/8, 172.16/12, 192.168/16). Tout le reste —
// 25.x (Hamachi), 26.x (Radmin), 198.18.x (bancs d'essai, utilisés par des
// antivirus et proxys), 240.0.0.0/4 jusqu'à 255.x (réservé), 100.64/10
// (CGNAT), adresses publiques — n'est pas une adresse de réseau local.
// Plus sûr qu'une liste d'exclusions : une plage inconnue est refusée.
func adresseLANPlausible(ip net.IP) bool {
	v4 := ip.To4()
	if v4 == nil {
		return false
	}
	switch {
	case v4[0] == 10:
		return true
	case v4[0] == 172 && v4[1] >= 16 && v4[1] <= 31:
		return true
	case v4[0] == 192 && v4[1] == 168:
		return true
	}
	return false
}

// ipRouteParDefaut : l'adresse que le système utilise pour sortir (route par
// défaut). Aucun paquet n'est envoyé : une socket UDP « connectée » ne fait que
// choisir l'interface. Vide si le poste n'a pas de route.
func ipRouteParDefaut() string {
	conn, err := net.Dial("udp4", "192.0.2.1:9")
	if err != nil {
		return ""
	}
	defer conn.Close()
	if a, ok := conn.LocalAddr().(*net.UDPAddr); ok {
		return a.IP.String()
	}
	return ""
}

// GetAllLocalIPs rend toutes les IPv4 non-loopback, sans filtre ni tri.
// Sert au diagnostic quand l'adresse retenue ne convient pas.
func GetAllLocalIPs() []string {
	var toutes []string
	ifaces, err := net.Interfaces()
	if err != nil {
		return toutes
	}
	for _, iface := range ifaces {
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			if ipnet, ok := addr.(*net.IPNet); ok &&
				!ipnet.IP.IsLoopback() && ipnet.IP.To4() != nil {
				toutes = append(toutes, ipnet.IP.String())
			}
		}
	}
	return toutes
}

func ipsCandidates() []ipCandidate {
	var candidats []ipCandidate

	ifaces, err := net.Interfaces()
	if err != nil {
		return candidats
	}
	parDefaut := ipRouteParDefaut()

	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		if nomEcarte(iface.Name) {
			log.Printf("réseau: interface ignorée (%s)", iface.Name)
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			ipnet, ok := addr.(*net.IPNet)
			if !ok || ipnet.IP.IsLoopback() || ipnet.IP.To4() == nil {
				continue
			}
			adresse := ipnet.IP.String()
			if !adresseLANPlausible(ipnet.IP) {
				log.Printf("réseau: adresse hors réseau local ignorée %s (%s)", adresse, iface.Name)
				continue
			}
			if adresseEcartee(adresse) {
				log.Printf("réseau: adresse VPN/VM ignorée %s (%s)", adresse, iface.Name)
				continue
			}
			priorite := prioriteInterface(iface.Name)
			// L'interface qui porte la route par défaut est celle du réseau du
			// magasin : elle passe avant le classement par nom.
			if adresse == parDefaut {
				priorite += 1000
			}
			candidats = append(candidats, ipCandidate{
				adresse:      adresse,
				interfaceNom: iface.Name,
				priorite:     priorite,
			})
		}
	}

	return candidats
}

func nomEcarte(nom string) bool {
	bas := strings.ToLower(nom)
	for _, fragment := range nomsEcartes {
		if strings.Contains(bas, fragment) {
			return true
		}
	}
	return false
}

func adresseEcartee(ip string) bool {
	for _, prefixe := range prefixesEcartes {
		if strings.HasPrefix(ip, prefixe) {
			return true
		}
	}
	return false
}

// prioriteInterface : Ethernet d'abord, puis Wi-Fi, puis le reste.
func prioriteInterface(nom string) int {
	bas := strings.ToLower(nom)
	switch {
	case strings.Contains(bas, "ethernet"), strings.Contains(bas, "eth"),
		strings.HasPrefix(bas, "en"):
		return 100
	case strings.Contains(bas, "wi-fi"), strings.Contains(bas, "wifi"),
		strings.Contains(bas, "wlan"):
		return 80
	case strings.Contains(bas, "local area connection"):
		return 60
	default:
		return 10
	}
}

// StartMDNS annonce le service sur le réseau local
func StartMDNS(port int, serviceName string) error {
	hostname, _ := os.Hostname()

	var err error
	mdnsServer, err = zeroconf.Register(
		serviceName,        // Nom du service (ex: "PocketReact")
		"_http._tcp",       // Type de service
		"local.",           // Domaine
		port,               // Port
		[]string{"path=/"}, // TXT records
		nil,                // Interfaces (nil = toutes)
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
