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

	// Cooldown counts its owner's turns left before a captured piece may be
	// placed again. It travels in the snapshot so a client can grey out the slot
	// rather than silently refusing the drop.
	Cooldown int `json:"cooldown"`
}

// Ready reports whether a piece in hand may be placed this turn.
func (p Piece) Ready() bool { return p.Cooldown == 0 }

type Board struct {
	pieces     [4][4]*Piece
	pieceCount [2]int

	// The rules live on the board because that is what every move-generation
	// question needs them for, and Board is already what gets passed around.
	rules RuleSet
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

	// Ending says how a finished game finished — IsOver with no Winner is a draw.
	Ending Ending `json:"ending"`

	// WinningLine is the run that ended it, so a client can mark the squares
	// rather than work out the geometry a second time.
	WinningLine []Position `json:"winningLine"`

	// LastMove and Captured describe the move just played. A captured piece is
	// already back in its owner's hand by the time this arrives; it is named here
	// so a client can say what was taken.
	LastMove  *Move   `json:"lastMove"`
	LastMover *Player `json:"lastMover"`
	Captured  *Piece  `json:"captured"`

	// CanSwap is true only on the one turn the pie rule is open, so a client can
	// offer it without knowing the rule.
	CanSwap bool `json:"canSwap"`

	// Swapped records that the position was taken rather than played.
	Swapped bool `json:"swapped"`

	MoveNo int `json:"moveNo"`

	// Rules travels with the snapshot so a client draws the game it is actually
	// playing rather than the one it was compiled against.
	Rules RuleSet `json:"rules"`
}

type ActionType int

const (
	Execute ActionType = iota
	Select
	Cancel

	// Swap is the pie rule: the second player, on their first turn only, takes
	// the position the first player just built instead of answering it.
	Swap
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
