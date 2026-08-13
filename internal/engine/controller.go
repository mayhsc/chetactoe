package engine

func StartGame(act <-chan Action, snapshot chan<- GameSnapshot, mode GameMode) {
	switch mode {
	case GameModeLocal:
		go StartLocalGame(act, snapshot)
	case GameModeBot:
		go StartBotGame(act, snapshot)
	}
}

func StartLocalGame(act <-chan Action, snapshot chan<- GameSnapshot) {
	game := NewGame()
	snapshot <- game.Snapshot()

	for action := range act {
		s := game.apply(action)
		snapshot <- s
	}

}

func StartBotGame(act <-chan Action, snapshot chan<- GameSnapshot) {
	game := NewGame()
	snapshot <- game.Snapshot()

	for action := range act {
		s := game.apply(action)
		snapshot <- s

		if s.IsOver || action.ActionType != Execute {
			continue
		}

		botMove := game.gb.getAllPossibleMoves(game.p)[0]

		s = game.apply(Action{
			ActionType: Execute,
			Move:       botMove,
		})

		snapshot <- s
	}
}
