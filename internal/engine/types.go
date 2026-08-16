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
	None
)

const (
	White Player = iota
	Black
)

type Position struct {
	Row int `json:"row"`
	Col int `json:"col"`
}

type Piece struct {
	PieceType PieceType `json:"pieceType"`
	Position  Position  `json:"position"`
	Player    Player    `json:"player"`
	Direction Direction `json:"direction"`
}

type Board struct {
	pieces [4][4]*Piece
	pieceCount [2]int
}

type Hand struct {
	Pieces [4]*Piece
	player Player
}

type GameBaord struct {
	board Board
	hand  [2]Hand
}

type Move struct {
	Source      Position `json:"source"`
	Destination Position `json:"destination"`
}

type GameSnapshot struct {
	Board         [4][4]*Piece `json:"board"`
	WhiteHand     [4]*Piece    `json:"whiteHand"`
	BlackHand     [4]*Piece    `json:"blackHand"`
	CurrentPlayer Player       `json:"currentPlayer"`
	ValidMoves    []Position   `json:"validMoves"`
	Source        *Position    `json:"source"`
	Winner        *Player      `json:"winner"`
	IsOver        bool         `json:"isOver"`
}

type ActionType int

const (
	Execute ActionType = iota
	Select
	Cancel
)

type Action struct {
	Move       Move       `json:"move"`
	ActionType ActionType `json:"actionType"`
}

type GameMode int

const (
	GameModeLocal GameMode = iota
	GameModeBot
	GameModeNetwork
)
