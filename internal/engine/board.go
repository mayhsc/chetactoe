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

// isWinningState reports whether the player has WinLength of their own pieces
// consecutively in a row, a column, or either diagonal direction.
func (b *Board) isWinningState(player Player) bool {
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
				if b.hasRun(Position{Row: r, Col: c}, dir, player) {
					return true
				}
			}
		}
	}

	return false
}

func (b *Board) hasRun(start Position, dir Position, player Player) bool {
	pos := start

	for range WinLength {
		piece := b.pieceAt(pos)
		if piece == nil || piece.player != player {
			return false
		}

		pos = Position{Row: pos.Row + dir.Row, Col: pos.Col + dir.Col}
	}

	return true
}
