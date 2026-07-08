package engine

type PiectType int

const (
	Empty PiectType = iota
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
	pieceType PiectType
	player    Player
}

type Board struct {
	pieces [4][4]PiectType
}
