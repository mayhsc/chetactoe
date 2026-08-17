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

// RuleSet is the whole of the game's design, in one value.
//
// It is data rather than constants because the rules had to be measured before
// they could be chosen: self-play over a matrix of these is what says whether a
// variant produces a game or a stalemate. `cmd/sim` plays them; DefaultRules is
// the one that came out best.
type RuleSet struct {
	// WinLength is how many of your pieces have to sit consecutively in a row, a
	// column or a diagonal to win. At 4 on a 4x4 board that means every piece you
	// own in one line — which measured as unreachable against any resistance,
	// because a single capture undoes a turn of work for free.
	WinLength int `json:"winLength"`

	// NoWinByDrop stops a placement from being the move that completes a line.
	// The line has to be finished by moving a piece already in play, so it is
	// visible a turn ahead and can be answered. This is the single rule that
	// turns the game from a first-player race into a game.
	NoWinByDrop bool `json:"noWinByDrop"`

	// DropMustTouchOwn restricts placements to squares touching one of your own
	// pieces, once you have any in play. It makes the reserve build a position
	// rather than parachute into one.
	DropMustTouchOwn bool `json:"dropMustTouchOwn"`

	// CaptureCooldown is how many of its owner's turns a captured piece has to
	// sit out before it can be placed again, so a capture buys tempo rather than
	// nothing at all.
	CaptureCooldown int `json:"captureCooldown"`

	// SwapRule lets the second player, on their first turn, take the first
	// player's position instead of replying to it — the pie rule. It exists
	// because nothing else fixed the first move being worth too much: every
	// variant measured, however the line length and the drops were restricted,
	// still handed the opener around 65-70% of decisive games. The swap is
	// self-correcting rather than a guess at compensation: an opening strong
	// enough to be worth taking is one the first player stops making.
	SwapRule bool `json:"swapRule"`

	// MaxPlies and RepetitionLimit end a game nobody is winning. Without them
	// the game has no draw it can actually reach: 8 pieces on 16 squares means a
	// player holding anything can always place it somewhere, so "no legal action"
	// never happens.
	MaxPlies        int `json:"maxPlies"`
	RepetitionLimit int `json:"repetitionLimit"`
}

// DefaultRules is the measured ruleset: three in a line, finished by moving
// rather than by dropping, drops built off your own position, and a captured
// piece that has to wait a turn.
func DefaultRules() RuleSet {
	return RuleSet{
		WinLength:        3,
		NoWinByDrop:      true,
		DropMustTouchOwn: true,
		CaptureCooldown:  1,
		SwapRule:         true,
		MaxPlies:         200,
		RepetitionLimit:  3,
	}
}

// ClassicRules is the original design — four in a line, place anywhere, capture
// returns a piece with no delay. Kept because the harness compares against it,
// and because it is the thing every other variant has to beat.
func ClassicRules() RuleSet {
	return RuleSet{
		WinLength:       4,
		MaxPlies:        200,
		RepetitionLimit: 3,
	}
}

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

	// cooldown counts its owner's turns left before a captured piece may be
	// placed again. It lives on the piece because that is what it describes, and
	// it travels in the snapshot so a client can grey out the slot.
	cooldown int
}

func (p Piece) Type() PieceType      { return p.pieceType }
func (p Piece) Player() Player       { return p.player }
func (p Piece) Position() Position   { return p.position }
func (p Piece) Direction() Direction { return p.direction }

// Cooldown is how many of its owner's turns this piece must still wait before it
// can be placed. Zero for anything in play or ready.
func (p Piece) Cooldown() int { return p.cooldown }

// Ready reports whether a piece in hand may be placed this turn.
func (p Piece) Ready() bool { return p.cooldown == 0 }

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
	rules RuleSet
}

// Rules is the ruleset this game is being played under.
func (gb *GameBoard) Rules() RuleSet { return gb.rules }

// ActionType is what a client is asking for. Select asks which squares a piece
// may go to and changes nothing; Execute performs a move; Cancel drops the
// current selection.
type ActionType int

const (
	Select ActionType = iota
	Execute
	Cancel

	// Swap is the pie rule: the second player, on their first turn only, takes
	// the position the first player just built instead of answering it.
	Swap
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

	// IsOver with a nil Winner is a draw, and Ending says which kind. A game can
	// now actually reach one: repetition and the ply cap both end it.
	Winner *Player `json:"winner,omitempty"`
	IsOver bool    `json:"isOver"`
	Ending Ending  `json:"ending,omitempty"`

	// CanSwap is true only on the one turn the pie rule is open, so a client
	// knows to offer it without having to know the rule.
	CanSwap bool `json:"canSwap"`

	// Swapped records that the position was taken rather than played.
	Swapped bool `json:"swapped,omitempty"`

	// Rules travels with the snapshot so a client draws the game it is actually
	// playing rather than the one it was compiled against.
	Rules RuleSet `json:"rules"`
}

// Ending is why a finished game finished.
type Ending int

const (
	Playing Ending = iota
	WonByLine
	DrawnByRepetition
	DrawnByLength
	LostWithNoMove
)
