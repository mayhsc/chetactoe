package engine

func NewBoard() Board {
	return Board{
		pieces: [4][4]*Piece{},
	}
}

func (b *Board) SetPiece(row int, col int, piece Piece) {
	b.pieces[row][col] = &piece
}

func (bd *Board) isWinningState(p Player) bool {
	pieces := bd.pieces
	leftDiagonal, rightDiagonal := true, true

	matchesPlayer := func(row, col int) bool {
		piece := pieces[row][col]
		return piece != nil && piece.player == p
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
