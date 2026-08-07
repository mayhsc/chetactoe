package main

import (
	// "chetactoe/internal/engine"
	"chetactoe/internal/network"
	"flag"
	"fmt"
	"net"
)

// var assets embed.FS

func main() {
	var udpPort int
	var host bool
	tcpPort := 1060

	flag.IntVar(&udpPort, "port", 1025, "UDP discovery port")
	flag.BoolVar(&host, "host", false, "Run as Host (true) or Client (false)")
	flag.Parse()

	var conn net.Conn

	if host {
		serverConnChan := make(chan net.Conn)
		go network.StartTcpServer(tcpPort, serverConnChan)

		go network.BoradcastPresence(udpPort)

		conn = <- serverConnChan
	} else {
		go network.DiscoverDevices(udpPort, tcpPort)
		conn = network.StartDevicePrompt(tcpPort)
	}

	if (conn == nil) {
		fmt.Println("No active connections. Exiting Program")
		return
	}

	defer conn.Close()
	network.StartGamePrompt(conn)
}
