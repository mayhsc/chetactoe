package engine

type PieceType int

const (
	Pawn PieceType = iota
	Knight
	Bishop
	Rook
)

type Player int

const (
	White Player = iota
	Black 
)

type Position struct {
	Row int
	Col int
}

type Piece struct {
	pieceType PieceType
	position  Position
	player    Player
}

type Board struct {
	pieces [4][4]*Piece
}

type Hand struct {
	Pieces [4]*Piece
	player Player
}

type GameBaord struct {
	board Board
	hand  [2]Hand
}
