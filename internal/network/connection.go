package network

import (
	"fmt"
	"net"
	"time"
)

const port = 1052
const connectionSignal = "HELLO_CHETACTOE"

func DiscoverDevices() {
	listenAddr, _ := net.ResolveUDPAddr("udp", fmt.Sprintf(":%d", port))
	conn, err := net.ListenUDP("udp", listenAddr)

	if err != nil {
		fmt.Printf("Error listening: %v\n", err)
		return
	}

	defer conn.Close()

	go boradcastPresence()

	fmt.Println("Listening for other players...")
	buf := make([]byte, 1024)

	for {
		n, remoteAddr, err := conn.ReadFromUDP(buf)

		if (err != nil) {
			continue
		}

		message := string(buf[:n])

		if message == connectionSignal {
			fmt.Printf("Peer discovered at IP: %s", remoteAddr.IP.String())
		}
	}
}

func boradcastPresence() {
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
