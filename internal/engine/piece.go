package engine

func CreatePiece(ptype PieceType, player Player) *Piece {
	var index int;
	if (player == White) {
		index = -1;
	} else {
		index = -2;
	}

	return &Piece{
		pieceType: ptype,
		player: player,
		position: Position{
			Col: int(index),
			Row: int(ptype),
		},
	};
}

func InitializePieces(player Player) [4]*Piece {
	pieceTypes := []PieceType{Pawn, Knight, Bishop, Rook}

	var pieces [4]*Piece

	for i, pieceType := range pieceTypes {
		pieces[i] = CreatePiece(pieceType, player)
	}

	return pieces
}