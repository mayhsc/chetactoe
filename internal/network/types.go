package network

type NetworkPlayertype int

const (
	Host NetworkPlayertype = iota
	Peer
)