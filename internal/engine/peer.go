package engine

import (
	"encoding/gob"
	"net"
)

type NetworkPeer struct {
	conn net.Conn
	enc  *gob.Encoder
	dec  *gob.Decoder
}

func NewPeer(conn net.Conn) *NetworkPeer {
	return &NetworkPeer{
		conn: conn,
		enc:  gob.NewEncoder(conn),
		dec:  gob.NewDecoder(conn),
	}
}

func (p *NetworkPeer) sendMove(m Move) error {
	return p.enc.Encode(m)
}

func (p *NetworkPeer) receiveMoves(out chan<- Move) {
	defer close(out)
	for {
		var m Move
		if err := p.dec.Decode(&m); err != nil {
			return
		}
		out <- m
	}
}
