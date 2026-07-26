package engine

func NewHand(player Player) Hand {
	return Hand{
		player: player,
		pieces: InitializePieces(player),
	}
}

func InitializeHand() [2]Hand {
	var hands [2]Hand

	for i := range 2 {
		hands[i] = NewHand(Player(i))
	}

	return hands
}