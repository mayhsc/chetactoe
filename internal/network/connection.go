package network

import (
	"bufio"
	"fmt"
	"log"
	"net"
	"time"
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
			fmt.Printf("Peer discovered at IP: %s\n", remoteAddr.IP.String())

			tcpTarget := &net.TCPAddr{
				IP:   remoteAddr.IP,
				Port: tcpPort,
				Zone: remoteAddr.Zone,
			}
			go establishTcpConnection(tcpTarget)

			// return
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

func StartTcpServer(port int) {
	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", port))

	if err != nil {
		log.Fatal("Error starting TCP")
		return
	}

	defer listener.Close()

	fmt.Printf("TCP Server started on port %d\n", port)

	for {
		conn, err := listener.Accept()

		if err != nil {
			fmt.Println("Connection error: ", err)
		}
		go handleClient(conn)
	}
}

func handleClient(conn net.Conn) {
	defer conn.Close()

	scanner := bufio.NewScanner(conn)

	for scanner.Scan() {
		text := scanner.Text()

		fmt.Printf("Received: %s\n", text)
	}

	if err := scanner.Err(); err != nil {
		fmt.Printf("Error reading stream: %v\n", err)
	}
	fmt.Printf("Client disconnected: %s\n", conn.RemoteAddr().String())
}

func establishTcpConnection(target *net.TCPAddr) {
	conn, err := net.DialTCP("tcp", nil, target)

	if err != nil {
		fmt.Println("Error connecting to server:", err)
		return
	}

	message := "Hello from Go Client\n"
	fmt.Printf("Sending: %s", message)
	_, err = conn.Write([]byte(message))

	if err != nil {
		fmt.Println("Error writing to server:", err)
		return
	}

	defer conn.Close()
}
