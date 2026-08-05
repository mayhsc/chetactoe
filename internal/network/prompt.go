package network

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
)

func StartDevicePrompt(tcpPort int) {
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
			go establishTcpConnection(tcpTarget)

		case "3":
			fmt.Println("Exiting prompt...")
			return
		default:
			fmt.Println("Invalid option, please try again.")
		}
	}
}
