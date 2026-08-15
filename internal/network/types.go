package network

import "net"

type NetworkPlayertype int

const (
	Host NetworkPlayertype = iota
	Peer
)

type NetworkSnapshot struct {
	UDPPort int
	TCPPort int
	RemoteAddrs []*net.Addr
	Conn net.Conn
}