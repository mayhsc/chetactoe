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
		var player Player;
		if i == 0 {
			player = White
		} else {
			player = Black
		}
		hands[i] = NewHand(player)
	}

	return hands
}