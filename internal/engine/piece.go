package engine

func CreatePiece(ptype PieceType, player Player) *Piece {
	return &Piece{
		pieceType: ptype,
		player: player,
		position: Position{
			Col: int(-player),
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