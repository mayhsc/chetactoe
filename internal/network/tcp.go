package network

import (
	"bufio"
	"fmt"
	"log"
	"net"
)

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
