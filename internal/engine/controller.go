package engine

import "net"

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

	for action := range act {
		s := game.apply(action)
		snapshot <- s
	}

}

