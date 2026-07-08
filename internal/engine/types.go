package engine

type PiecType int

const (
	Empty PiecType = iota
	Pawn
	Knight
	Bishop
	Rook
)

type Player int

const (
	White Player = iota
	Black
)

type Piece struct {
	pieceType PiecType
	player    Player
}

type Board struct {
	pieces [4][4]Piece
}

