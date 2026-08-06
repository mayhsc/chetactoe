package network

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
)

const startSignal = "START_CHETACTOE"

func StartDevicePrompt(tcpPort int) net.Conn {
	reader := bufio.NewReader(os.Stdin)

	for {
		fmt.Println("\n--- Options ---")
		fmt.Println("1. List discovered devices")
		fmt.Println("2. Connect to a device by index")
		fmt.Println("3. Exit menu")
		fmt.Print("Choose an option: ")

		input, _ := reader.ReadString('\n')
		input = strings.TrimSpace(input)

		switch input {
		case "1":
			addrsMu.Lock()
			if len(remoteAddrs) == 0 {
				fmt.Println("No devices discovered yet.")
			} else {
				fmt.Println("\nDiscovered Devices:")
				for i, addr := range remoteAddrs {
					fmt.Printf("[%d] %s\n", i, addr.IP.String())
				}
			}
			addrsMu.Unlock()

		case "2":
			addrsMu.Lock()
			if len(remoteAddrs) == 0 {
				fmt.Println("No devices available to connect.")
				addrsMu.Unlock()
				continue
			}

			fmt.Println("\nDiscovered Devices:")
			for i, addr := range remoteAddrs {
				fmt.Printf("[%d] %s\n", i, addr.IP.String())
			}
			fmt.Print("Enter the index of the device to connect: ")

			idxStr, _ := reader.ReadString('\n')
			idxStr = strings.TrimSpace(idxStr)
			idx, err := strconv.Atoi(idxStr)

			if err != nil || idx < 0 || idx >= len(remoteAddrs) {
				fmt.Println("Invalid index provided.")
				addrsMu.Unlock()
				continue
			}

			targetAddr := remoteAddrs[idx]
			addrsMu.Unlock()

			tcpTarget := &net.TCPAddr{
				IP:   targetAddr.IP,
				Port: tcpPort,
				Zone: targetAddr.Zone,
			}
			// go establishTcpConnection(tcpTarget)
			conn, err := net.DialTCP("tcp", nil, tcpTarget)
			if err != nil {
				fmt.Println("Error connecting to server:", err)
				continue
			}

			return conn

		case "3":
			fmt.Println("Exiting prompt...")
			return nil

		default:
			fmt.Println("Invalid option, please try again.")
		}
	}
}

func StartGamePrompt(conn net.Conn) {
	clearScreen()

	fmt.Printf("Type 1 and press enter to ready: ")

	localReadyChan := make(chan bool, 1)
	peerReadyChan := make(chan bool, 1)

	go func() {
		reader := bufio.NewReader(os.Stdin)
		for {
			text, _ := reader.ReadString('\n')
			if strings.TrimSpace(text) == "1" {
				fmt.Fprintln(conn, startSignal)
				localReadyChan <- true
				return
			}
		}
	}()

	go func() {
		reader := bufio.NewReader(conn)

		for {
			text, err := reader.ReadString('\n')

			if err != nil {
				return
			}

			if strings.TrimSpace(text) == startSignal {
				peerReadyChan <- true
				return
			}
		}
	}()

	ready, peerReady := false, false

	for {
		select {
		case <-localReadyChan:
			ready = true
		case <-peerReadyChan:
			peerReady = true
		}

		if ready && peerReady {
			clearScreen()
			fmt.Println("Chetactoe has started!")
			return
		}
	}

}

func clearScreen() {
	os.Stdout.WriteString("\x1b[H\x1b[2J")

}
