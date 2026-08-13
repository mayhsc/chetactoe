package engine

func StartGame(act <-chan Action, snapshot chan<- GameSnapshot, mode GameMode) {
	game := NewGame()
	snapshot <- game.Snapshot()

	for action := range act {
		s := game.apply(action)
		snapshot <- s
	}

}
