package engine

type PieceType int

const (
	Pawn PieceType = iota
	Knight
	Bishop
	Rook
)

type Player int

type Direction int

const (
	Up Direction = iota
	Down
	Left
	Right
	None
)

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
	direction Direction
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
