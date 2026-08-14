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

// Count is how many pieces are still waiting to be placed. Slots keep their
// index when a piece leaves, so this is not the length of the array.
func (h Hand) Count() int {
	n := 0

	for _, piece := range h.Pieces {
		if piece != nil {
			n++
		}
	}

	return n
}

// Slot is where a piece of this type lives in a hand. One piece of each type per
// player, so the type index is the slot and a captured piece always has its own
// place to come back to.
func Slot(pType PieceType) int {
	return int(pType)
}
