package network

import (
	"fmt"
	"net"
	"slices"
	"sync"
	"time"
)

var (
	remoteAddrs []*net.UDPAddr
	addrsMu     sync.Mutex
)

// const port = 2000
const udpConnectionSignal = "HELLO_CHETACTOE"

func DiscoverDevices(listenPort int, tcpPort int) {

	listenAddr, _ := net.ResolveUDPAddr("udp", fmt.Sprintf("224.0.0.1:%d", listenPort))
	conn, err := net.ListenMulticastUDP("udp", nil, listenAddr)

	if err != nil {
		fmt.Printf("Error listening: %v\n", err)
		return
	}

	defer conn.Close()

	// go boradcastPresence(broadcst)

	fmt.Println("Listening for other players...")
	buf := make([]byte, 1024)
	// myIPs := getLocalIP()

	for {
		n, remoteAddr, err := conn.ReadFromUDP(buf)

		if err != nil {
			continue
		}

		// if myIPs[remoteAddr.IP.String()] {
		// 	continue
		// }

		message := string(buf[:n])

		if message == udpConnectionSignal {
			addrsMu.Lock()

			exists := slices.ContainsFunc(remoteAddrs, func(addr *net.UDPAddr) bool {
				return addr.IP.Equal(remoteAddr.IP) && addr.Port == remoteAddr.Port
			})

			if !exists {
				remoteAddrs = append(remoteAddrs, remoteAddr)
				fmt.Printf("Peer discovered at IP: %s\n", remoteAddr.IP.String())
			}

			addrsMu.Unlock()
		}
	}
}

func BoradcastPresence(broadcastPort int) {
	broadcastAddr, _ := net.ResolveUDPAddr(
		"udp",
		fmt.Sprintf(
			"224.0.0.1:%d",
			broadcastPort,
		),
	)

	conn, err := net.DialUDP("udp", nil, broadcastAddr)

	if err != nil {
		fmt.Printf("Error broadcasting: %v\n", err)
		return
	}

	defer conn.Close()

	for {
		_, _ = conn.Write([]byte(udpConnectionSignal))
		time.Sleep(2 * time.Second)
	}

}

func getLocalIP() map[string]bool {
	ips := make(map[string]bool)

	addrs, err := net.InterfaceAddrs()

	if err != nil {
		return ips
	}

	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				ips[ipnet.IP.String()] = true
			}
		}
	}

	return ips
}

