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

// Cells is the width of the board, HandSize the number of pieces each player
// starts with. One piece of each type per player, so a hand slot is the piece
// type's own index — which is what lets a captured piece always go back to a
// free slot.
const (
	Cells    = 4
	HandSize = 4
)

// WinLength is how many of one player's pieces have to sit consecutively in a
// row, a column or a diagonal to end the game. At 4 on a 4x4 board that means
// every piece you own is in the same line; 3 gives much shorter games.
const WinLength = 4

type Position struct {
	Row int `json:"row"`
	Col int `json:"col"`
}

// HandCol is the column a player's hand pieces report while off the board:
// -1 for White, -2 for Black. Hand positions are outside the playing field on
// purpose, so one Position type addresses both the board and the two hands and
// a negative column is the whole test for "not in play".
func HandCol(p Player) int {
	return -1 - int(p)
}

// InHand reports whether a position addresses a hand slot rather than a square.
func InHand(pos Position) bool {
	return pos.Col < 0
}

// HandOwner is the player whose hand a hand position belongs to.
func HandOwner(pos Position) Player {
	return Player(-1 - pos.Col)
}

type Piece struct {
	pieceType PieceType
	position  Position
	player    Player
	direction Direction
}

func (p Piece) Type() PieceType      { return p.pieceType }
func (p Piece) Player() Player       { return p.player }
func (p Piece) Position() Position   { return p.position }
func (p Piece) Direction() Direction { return p.direction }

// InHand reports whether this piece is waiting off the board.
func (p Piece) InHand() bool { return InHand(p.position) }

type Board struct {
	pieces [Cells][Cells]*Piece
}

type Hand struct {
	Pieces [HandSize]*Piece
	player Player
}

type GameBoard struct {
	board Board
	hand  [2]Hand
}

// ActionType is what a client is asking for. Select asks which squares a piece
// may go to and changes nothing; Execute performs a move; Cancel drops the
// current selection.
type ActionType int

const (
	Select ActionType = iota
	Execute
	Cancel
)

type Move struct {
	Source      Position `json:"source"`
	Destination Position `json:"destination"`
}

type Action struct {
	ActionType ActionType `json:"actionType"`
	Move       Move       `json:"move"`

	// From is who sent this action, when that is known. A transport should fill it
	// in from the connection it arrived on rather than from the body, because the
	// engine otherwise applies every action as the player whose turn it is — which
	// over a socket means either end could move the other's pieces on their turn.
	//
	// nil means a local caller and is trusted: one screen with two people at it,
	// or a test.
	From *Player `json:"from,omitempty"`
}

// GameSnapshot is everything a client needs to draw the game after one action.
// It is a copy, not a view: the pieces in it are detached from the engine's own,
// so holding on to a snapshot cannot show a board that changed underneath it.
//
// Board holds only pieces in play. A piece not on the board is in one of the
// hands, which is where the four-per-side reserve and any captured piece show
// up — nothing is ever destroyed, so the 8 pieces are always somewhere.
type GameSnapshot struct {
	Board         [Cells][Cells]*Piece `json:"board"`
	WhiteHand     [HandSize]*Piece     `json:"whiteHand"`
	BlackHand     [HandSize]*Piece     `json:"blackHand"`
	CurrentPlayer Player               `json:"currentPlayer"`

	// Source is the square or hand slot the last Select named, and ValidMoves
	// the destinations open to it. Both are empty after an Execute or a Cancel.
	Source     *Position  `json:"source,omitempty"`
	ValidMoves []Position `json:"validMoves,omitempty"`

	// LastMove and Captured describe the move just executed, if any. A captured
	// piece is in its owner's hand by the time the snapshot is built; it is
	// named here so a client can animate it leaving the board.
	LastMove *Move  `json:"lastMove,omitempty"`
	Captured *Piece `json:"captured,omitempty"`
	MoveNo   int    `json:"moveNo"`

	// Rejected carries why an Execute was refused. The game is unchanged when
	// it is set.
	Rejected string `json:"rejected,omitempty"`

	// IsOver with a nil Winner is a draw — the player to move has no legal
	// action left.
	Winner *Player `json:"winner,omitempty"`
	IsOver bool    `json:"isOver"`
}
