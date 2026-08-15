package engine

import (
	"encoding/gob"
	"net"
)

func StartLocalGame(act <-chan Action, snapshot chan<- GameSnapshot) {
	game := NewGame()
	snapshot <- game.Snapshot()

	for action := range act {
		s := game.apply(action)
		snapshot <- s
	}

}

func StartBotGame(act <-chan Action, snapshot chan<- GameSnapshot, p Player) {
	game := NewGame()
	snapshot <- game.Snapshot()

	performBotMove := func() {
		botMove := game.gb.getAllPossibleMoves(game.p)[0]

		s := game.apply(Action{
			ActionType: Execute,
			Move:       botMove,
		})

		snapshot <- s
	}

	if p == Black {
		performBotMove()
	}

	for action := range act {
		s := game.apply(action)
		snapshot <- s

		if s.IsOver || action.ActionType != Execute {
			continue
		}

		performBotMove()
	}

}

func StartNetworkGame(act <-chan Action, snapshot chan<- GameSnapshot, conn net.Conn, localPlayer Player) {
	game := NewGame()
	snapshot <- game.Snapshot()

	receiveChannel := make(chan Move)
	go receiveMoves(conn, receiveChannel)


	for {
		select {
		case action, ok := <-act:
			if !ok {
				return 
			}

			s := game.apply(action)
			snapshot <- s

			if action.ActionType == Execute {
				if err := sendMove(conn, action.Move); err != nil {
					return
				}
			}

		case move, ok := <-receiveChannel:
			if !ok {
				return 
			}

			s := game.apply(Action{
				ActionType: Execute,
				Move:       move,
			})
			snapshot <- s
		}
	}
}

func sendMove(conn net.Conn, m Move) error {
	return gob.NewEncoder(conn).Encode(m)
}

func receiveMoves(conn net.Conn, out chan<- Move) {
	defer close(out)
	dec := gob.NewDecoder(conn)

	for {
		var m Move
		if err := dec.Decode(&m); err != nil {
			return
		}
		out <- m
	}
}