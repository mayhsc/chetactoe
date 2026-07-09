package engine

func NewBoard() Board {
	return Board{
		pieces: [4][4]Piece{},
	}
}

func (b *Board) SetPiece(row int, col int, piece Piece) {
	b.pieces[row][col] = piece
}