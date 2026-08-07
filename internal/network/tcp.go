package network

import (
	"fmt"
	"log"
	"net"
)

func StartTcpServer(port int, connChan chan net.Conn) {
	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", port))

	if err != nil {
		log.Fatal("Error starting TCP")
		return
	}

	fmt.Printf("TCP Server started on port %d\n", port)

	// for {
	conn, err := listener.Accept()

	if err != nil {
		fmt.Println("Connection error: ", err)
	}
	// 	go handleClient(conn)
	// }
	fmt.Printf("Client disconnected: %s\n", conn.RemoteAddr().String())

	connChan <- conn
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

	StartGamePrompt(conn)

}
