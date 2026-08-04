package network

import (
	"fmt"
	"net"
	"time"
)

// const port = 2000
const connectionSignal = "HELLO_CHETACTOE"

func DiscoverDevices(listen int, broadcst int) {
	listenAddr, _ := net.ResolveUDPAddr("udp", fmt.Sprintf(":%d", listen))
	conn, err := net.ListenUDP("udp", listenAddr)

	if err != nil {
		fmt.Printf("Error listening: %v\n", err)
		return
	}

	defer conn.Close()

	go boradcastPresence(broadcst)

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

		if message == connectionSignal {
			fmt.Printf("Peer discovered at IP: %s\n", remoteAddr.IP.String())
		}
	}
}

func boradcastPresence(port int) {
	broadcastAddr, _ := net.ResolveUDPAddr(
		"udp",
		fmt.Sprintf(
			"255.255.255.255:%d",
			port,
		),
	)

	conn, err := net.DialUDP("udp", nil, broadcastAddr)

	if err != nil {
		fmt.Printf("Error broadcasting: %v\n", err)
		return
	}

	defer conn.Close()

	for {
		_, _ = conn.Write([]byte(connectionSignal))
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

func initiateTcpConnection(address net.IPNet) {
	
}