package engine

func NewBoard() Board {
	return Board{
		pieces: [Cells][Cells]*Piece{},
	}
}

func (b *Board) pieceAt(pos Position) *Piece {
	if !validPosition(pos) {
		return nil
	}

	return b.pieces[pos.Row][pos.Col]
}

func (b *Board) setPiece(pos Position, piece *Piece) {
	b.pieces[pos.Row][pos.Col] = piece
}

// SetPiece puts a piece on a square, for tests and for setting up a position by
// hand. It does not check the square is free.
func (b *Board) SetPiece(pos Position, piece *Piece) {
	if piece != nil {
		piece.position = pos
	}

	b.setPiece(pos, piece)
}

// emptySquares lists every square with nothing on it — which is also the list of
// squares a piece may be placed on from the hand.
func (b *Board) emptySquares() []Position {
	var squares []Position

	for r := range Cells {
		for c := range Cells {
			if b.pieces[r][c] == nil {
				squares = append(squares, Position{Row: r, Col: c})
			}
		}
	}

	return squares
}

// winningLine is the run itself, for a client that wants to draw it.
func (b *Board) winningLine(player Player, length int) []Position {
	directions := []Position{
		{Row: 0, Col: 1},
		{Row: 1, Col: 0},
		{Row: 1, Col: 1},
		{Row: -1, Col: 1},
	}

	for r := range Cells {
		for c := range Cells {
			for _, dir := range directions {
				start := Position{Row: r, Col: c}
				if !b.hasRun(start, dir, player, length) {
					continue
				}

				line := make([]Position, 0, length)
				pos := start

				for range length {
					line = append(line, pos)
					pos = Position{Row: pos.Row + dir.Row, Col: pos.Col + dir.Col}
				}

				return line
			}
		}
	}

	return nil
}

// touches reports whether a square is next to one of the player's own pieces,
// including diagonally — the test behind DropMustTouchOwn.
func (b *Board) touches(player Player, pos Position) bool {
	for dr := -1; dr <= 1; dr++ {
		for dc := -1; dc <= 1; dc++ {
			if dr == 0 && dc == 0 {
				continue
			}

			near := Position{Row: pos.Row + dr, Col: pos.Col + dc}
			if piece := b.pieceAt(near); piece != nil && piece.player == player {
				return true
			}
		}
	}

	return false
}

// has reports whether the player has anything in play at all.
func (b *Board) has(player Player) bool {
	for r := range Cells {
		for c := range Cells {
			if piece := b.pieces[r][c]; piece != nil && piece.player == player {
				return true
			}
		}
	}

	return false
}

// copyPieces is the board half of a snapshot: same layout, detached pieces, so
// the caller cannot be handed a piece the engine is still moving around.
func (b *Board) copyPieces() [Cells][Cells]*Piece {
	var out [Cells][Cells]*Piece

	for r := range Cells {
		for c := range Cells {
			if piece := b.pieces[r][c]; piece != nil {
				copied := *piece
				out[r][c] = &copied
			}
		}
	}

	return out
}

// isWinningState reports whether the player has `length` of their own pieces
// consecutively in a row, a column, or either diagonal direction.
func (b *Board) isWinningState(player Player, length int) bool {
	// East, south, south-east, north-east. Their opposites would only find the
	// same runs from the other end, since every start square is tried.
	directions := []Position{
		{Row: 0, Col: 1},
		{Row: 1, Col: 0},
		{Row: 1, Col: 1},
		{Row: -1, Col: 1},
	}

	for r := range Cells {
		for c := range Cells {
			for _, dir := range directions {
				if b.hasRun(Position{Row: r, Col: c}, dir, player, length) {
					return true
				}
			}
		}
	}

	return false
}

func (b *Board) hasRun(start Position, dir Position, player Player, length int) bool {
	pos := start

	for range length {
		piece := b.pieceAt(pos)
		if piece == nil || piece.player != player {
			return false
		}

		pos = Position{Row: pos.Row + dir.Row, Col: pos.Col + dir.Col}
	}

	return true
}
