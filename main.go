package main

import (
	// "chetactoe/internal/engine"
	"chetactoe/internal/network"
	// "fmt"
	"flag"
)

// var assets embed.FS

func main() {
	var listen, broadcast int
	var host bool

	flag.IntVar(&listen, "listen", 1025, "Port server to listen on")
	flag.IntVar(&broadcast, "broadcast", 1025, "Port server to broadcast on")
	flag.BoolVar(&host, "host", false, "Host or client")

	flag.Parse()

	if host {
		network.StartTcpServer(1060)
		network.DiscoverDevices(listen)
	} else {
		network.BoradcastPresence(broadcast)
	}
}
