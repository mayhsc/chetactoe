package engine

func NewHand(player Player) Hand {
	return Hand{
		player: player,
		Pieces: InitializePieces(player),
	}
}

func InitializeHand() [2]Hand {
	var hands [2]Hand

	for i := range 2 {
		hands[i] = NewHand(Player(i))
	}

	return hands
}

func countPieces() int {

	return 0
}

func (gb *GameBaord) GetValidPlacements(handIndex int, player Player) []Position {
	pIndex := int(player)
	var validMoves []Position

	if handIndex < 0 || handIndex >= 4 || gb.hand[pIndex].Pieces[handIndex] == nil {
		return validMoves
	}

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