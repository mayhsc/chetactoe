package engine

func newBoard() Board {
	return Board{
		pieces: [4][4]*Piece{},
	}
}

// isWinningState reports whether the player has `length` of their own pieces
// consecutively in a row, a column or a diagonal. Written generally rather than
// unrolled for four, because the length is a rule now and 3 is what measured
// best.
func (bd *Board) isWinningState(p Player, length int) bool {
	return bd.winningLine(p, length) != nil
}

// winningLine is the run itself, so a client can draw it.
func (bd *Board) winningLine(p Player, length int) []Position {
	directions := []Position{{0, 1}, {1, 0}, {1, 1}, {-1, 1}}

	for r := range 4 {
		for c := range 4 {
			for _, dir := range directions {
				start := Position{Row: r, Col: c}
				if line := bd.runFrom(start, dir, p, length); line != nil {
					return line
				}
			}
		}
	}

	return nil
}

func (bd *Board) runFrom(start Position, dir Position, p Player, length int) []Position {
	line := make([]Position, 0, length)
	pos := start

	for range length {
		if !validPosition(pos) {
			return nil
		}

		piece := bd.pieces[pos.Row][pos.Col]
		if piece == nil || piece.Player != p {
			return nil
		}

		line = append(line, pos)
		pos = Position{Row: pos.Row + dir.Row, Col: pos.Col + dir.Col}
	}

	return line
}

// touches reports whether a square is next to one of the player's own pieces,
// diagonals included — the test behind DropMustTouchOwn.
func (bd *Board) touches(p Player, pos Position) bool {
	for dr := -1; dr <= 1; dr++ {
		for dc := -1; dc <= 1; dc++ {
			if dr == 0 && dc == 0 {
				continue
			}

			near := Position{Row: pos.Row + dr, Col: pos.Col + dc}
			if !validPosition(near) {
				continue
			}

			if piece := bd.pieces[near.Row][near.Col]; piece != nil && piece.Player == p {
				return true
			}
		}
	}

	return false
}

func (bd *Board) isWinningStateLegacy(p Player) bool {
	pieces := bd.pieces
	leftDiagonal, rightDiagonal := true, true

	matchesPlayer := func(row, col int) bool {
		piece := pieces[row][col]
		return piece != nil && piece.Player == p
	}

	for i := range 4 {
		if matchesPlayer(i, 0) && matchesPlayer(i, 1) && matchesPlayer(i, 2) && matchesPlayer(i, 3) {
			return true
		}

		if matchesPlayer(0, i) && matchesPlayer(1, i) && matchesPlayer(2, i) && matchesPlayer(3, i) {
			return true
		}

		if !matchesPlayer(i, i) {
			leftDiagonal = false
		}

		if !matchesPlayer(3-i, i) {
			rightDiagonal = false
		}

	}

	return leftDiagonal || rightDiagonal
}
