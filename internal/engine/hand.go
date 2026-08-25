package engine

func newHand(player Player) Hand {
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

// getValidPlacements is where a piece from the hand may go.
//
// Any empty square, less what the ruleset takes away: a square that would
// complete a line, and any square not touching a piece the player already has in
// play. Those two are what stop the game being a race to drop pieces in a row —
// measured without them, the first player wins better than nine games in ten.
func (gb *GameBaord) getValidPlacements(piece *Piece, p Player) []Position {
	if piece != nil && !piece.Ready() {
		return nil // still sitting out the turn it was captured on
	}

	rules := gb.board.rules
	mustTouch := rules.DropMustTouchOwn && gb.board.pieceCount[int(p)] > 0

	var validMoves []Position

	for r := range 4 {
		for c := range 4 {
			if gb.board.pieces[r][c] != nil {
				continue
			}

			square := Position{Row: r, Col: c}

			if mustTouch && !gb.board.touches(p, square) {
				continue
			}

			if rules.NoWinByDrop && piece != nil && gb.dropWouldWin(piece, square, p) {
				continue
			}

			validMoves = append(validMoves, square)
		}
	}

	return validMoves
}

// dropWouldWin asks whether putting this piece here finishes a line, by trying it
// and taking it straight back off. Cheaper than reasoning about which lines the
// square belongs to, and it cannot disagree with the win check.
func (gb *GameBaord) dropWouldWin(piece *Piece, square Position, p Player) bool {
	probe := *piece
	probe.Position = square

	gb.board.pieces[square.Row][square.Col] = &probe
	won := gb.board.isWinningState(p, gb.board.rules.WinLength)
	gb.board.pieces[square.Row][square.Col] = nil

	return won
}

// handPiece is the piece in one of a player's hand slots, or nil.
func (gb *GameBaord) handPiece(p Player, slot int) *Piece {
	if slot < 0 || slot >= len(gb.hand[int(p)].Pieces) {
		return nil
	}

	return gb.hand[int(p)].Pieces[slot]
}

func (h Hand) count() int {
	n := 0

	for _, piece := range h.Pieces {
		if piece != nil {
			n++
		}
	}

	return n
}
