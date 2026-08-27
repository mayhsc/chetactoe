package engine

import (
	"encoding/json"
	"syscall/js"
)

type JSPeer struct {
	send   js.Value
	remote chan Move
}

func NewJSPeer(send js.Value) *JSPeer {
	return &JSPeer{send: send, remote: make(chan Move, 100)}
}

func (p *JSPeer) SendMove(m Move) error {
	b, err := json.Marshal(m)
	if err != nil {
		return err
	}
	p.send.Invoke(string(b))
	return nil
}

func (p *JSPeer) ReceiveMoves(out chan<- Move) {
	defer close(out)
	for m := range p.remote {
		out <- m
	}
}

func (p *JSPeer) PushRemoteMove(m Move) {
	p.remote <- m
}
