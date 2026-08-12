package engine

func  newHand(player Player) Hand {
	return Hand{
		player: player,
		Pieces: InitializePieces(player),
	}
}

func initializeHand() [2]Hand {
	var hands [2]Hand

	for i := range 2 {
		hands[i] = newHand(Player(i))
	}

	return hands
}

func (gb *GameBaord) getValidPlacements() []Position {
	var validMoves []Position

	for r := range 4 {
		for c := range 4 {
			if gb.board.pieces[r][c] == nil {
				validMoves = append(validMoves, Position{
					Row: r,
					Col: c, 
				})
			}
		}
	}

	return validMoves
}