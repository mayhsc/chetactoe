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

	flag.IntVar(&listen, "listen", 1025, "Port server to listen on")
	flag.IntVar(&broadcast, "broadcast", 1026, "Port server to broadcast on")

	flag.Parse()

	network.DiscoverDevices(listen, broadcast)
}
