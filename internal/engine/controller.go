package engine

import (
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

func StartBotGame(act <-chan Action, snapshot chan<- GameSnapshot, playerSide Player) {
	botSide := White
	if playerSide == White {
		botSide = Black
	}

	game := NewGame()
	snapshot <- game.Snapshot()

	performBotMove := func() {
		if game.p != botSide {
			return
		}
		moves := game.gb.getAllPossibleMoves(game.p)
		if len(moves) == 0 {
			return
		}
		botMove := moves[0]
		s := game.applyTrustedMove(botMove)
		snapshot <- s
	}

	performBotMove()

	for action := range act {
		s := game.apply(action)
		snapshot <- s

		if s.IsOver {
			continue
		}

		performBotMove()
	}
}

func StartNetworkGame(act <-chan Action, snapshot chan<- GameSnapshot, conn net.Conn, localPlayer Player) {
	peer := NewPeer(conn)

	game := NewGame()
	snapshot <- game.Snapshot()

	receiveChannel := make(chan Move)
	go peer.receiveMoves(receiveChannel)

	for {
		select {
		case action, ok := <-act:
			if !ok {
				return
			}
			s := game.apply(action)
			snapshot <- s

			if action.ActionType == Execute {
				if err := peer.sendMove(action.Move); err != nil {
					return
				}
			}

		case move, ok := <-receiveChannel:
			if !ok {
				return
			}
			s := game.apply(Action{ActionType: Execute, Move: move})
			snapshot <- s
		}
	}
}
