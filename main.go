package main

import (
	// "chetactoe/internal/engine"
	"chetactoe/internal/network"
	"flag"
)

// var assets embed.FS

func main() {
	var udpPort int
	var host bool
	tcpPort := 1060

	flag.IntVar(&udpPort, "port", 1025, "UDP discovery port")
	flag.BoolVar(&host, "host", false, "Run as Host (true) or Client (false)")
	flag.Parse()

	if host {
		go network.StartTcpServer(tcpPort)
		network.BoradcastPresence(udpPort)
	} else {
		go network.DiscoverDevices(udpPort, tcpPort)
		network.StartDevicePrompt(tcpPort)
	}
}
