package network

import (
	"fmt"
	"net"
	"sync"
	"time"
)

type discoveredHost struct {
	addr    net.Addr
	lastSeen time.Time
}

var (
	discoveryMu sync.Mutex
	discovered  = map[string]discoveredHost{} 
)

const udpConnectionSignal = "HELLO_CHETACTOE"


func StartDiscoveryListener(udpPort int) error {
	conn, err := net.ListenUDP("udp", &net.UDPAddr{Port: udpPort})
	if err != nil {
		return fmt.Errorf("listening for discovery broadcasts: %w", err)
	}

	go func() {
		defer conn.Close()
		buf := make([]byte, 256)

		for {
			n, addr, err := conn.ReadFromUDP(buf)
			if err != nil {
				return 
			}

			if _, err := fmt.Sscanf(string(buf[:n]), udpConnectionSignal); err != nil {
				continue
			}

			discoveryMu.Lock()
			discovered[addr.String()] = discoveredHost{
				addr:     addr,
				lastSeen: time.Now(),
			}
			discoveryMu.Unlock()
		}
	}()

	return nil
}

func DiscoverPeers(udpPort int) []*net.Addr {
	discoveryMu.Lock()
	defer discoveryMu.Unlock()

	var out []*net.Addr
	cutoff := time.Now().Add(-5 * time.Second)

	for key, host := range discovered {
		if host.lastSeen.Before(cutoff) {
			delete(discovered, key) 
			continue
		}
		addr := host.addr
		out = append(out, &addr)
	}

	return out
}

func BoradcastPresence(broadcastPort int, stop <- chan struct{}) {
	broadcastAddr, _ := net.ResolveUDPAddr(
		"udp",
		fmt.Sprintf(
			"224.0.0.1:%d",
			broadcastPort,
		),
	)

	conn, err := net.DialUDP("udp", nil, broadcastAddr)

	if err != nil {
		return
	}

	defer conn.Close()

	msg := []byte(udpConnectionSignal)
	ticker := time.NewTicker(time.Second)

	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			conn.Write(msg)
		}
	}

}