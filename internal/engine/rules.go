package engine

// RuleSet is the whole of the game's design, in one value.
//
// It is data rather than constants because the rules had to be measured before
// they could be chosen. Self-play settled every field below, and two of the
// answers were the opposite of what reading the rules suggested:
//
//   - Four in a line with captures that return a piece to its owner's hand is
//     unreachable against resistance. 58% of games between competent players were
//     unfinished after 150 moves each: the target takes four turns to build and
//     one capture to undo.
//   - Four in a line with captures that are permanent is worse. The first capture
//     puts the win out of reach for the victim; 62% of games became unwinnable for
//     both sides, and 96% ended with a player who had no legal move at all.
//
// `cmd/sim` plays these out. DefaultRules is what came back best.
type RuleSet struct {
	// WinLength is how many of your pieces have to sit consecutively in a row, a
	// column or a diagonal to win.
	WinLength int `json:"winLength"`

	// NoWinByDrop stops a placement from being the move that completes a line, so
	// a line has to be finished by moving a piece already in play — which takes a
	// turn longer and is visible to the opponent before it lands. This is the
	// single rule that turns the game from a race into a game.
	NoWinByDrop bool `json:"noWinByDrop"`

	// DropMustTouchOwn restricts placements to squares touching one of your own
	// pieces, once you have any in play.
	DropMustTouchOwn bool `json:"dropMustTouchOwn"`

	// MinPiecesToMove keeps a player placing until they have this many pieces on
	// the board. It opens the game with development rather than manoeuvring.
	MinPiecesToMove int `json:"minPiecesToMove"`

	// CaptureReturnsToHand sends a captured piece back to its owner's reserve
	// instead of out of the game. With it off, material only ever decreases, and a
	// player below WinLength pieces can no longer win at all.
	CaptureReturnsToHand bool `json:"captureReturnsToHand"`

	// CaptureCooldown is how many of its owner's turns a returned piece must sit
	// out before it can be placed, so a capture buys tempo rather than nothing.
	CaptureCooldown int `json:"captureCooldown"`

	// SwapRule lets the second player, on their first turn, take the first
	// player's position instead of replying to it — the pie rule. Scoring all 64
	// openings, the best is worth 80% to the opener and the most even 50%; with
	// the swap available, 50% is all they can play without it being taken.
	SwapRule bool `json:"swapRule"`

	// MaxPlies and RepetitionLimit end a game nobody is winning. Without them the
	// game has no ending it can actually reach.
	MaxPlies        int `json:"maxPlies"`
	RepetitionLimit int `json:"repetitionLimit"`
}

// DefaultRules is the measured ruleset, and it is a combination neither half of
// this codebase would have reached alone: the drop restrictions from one, the
// development requirement and directional pawns from the other, and captures that
// return to hand with termination rules so a game can actually end.
//
// `go run ./cmd/sim -sweep` ranks every arrangement of the knobs. Two findings
// were worth the compute, and both contradicted a shallower search:
//
//   - **Four in a line does not terminate.** A depth-2 searcher liked it — 48/50
//     over 57 plies — and a depth-3 searcher left 77% of those games at the move
//     cap after 181 plies. A line of four can always be broken by a capture, and
//     captures return the piece, so there is no progress to run out of. Directional
//     pawns and a development requirement delay that; they do not fix it.
//   - **The development requirement is the balance knob.** At three in a line with
//     the drop restrictions on, requiring no pieces before moving gives the game to
//     the *second* player (37%), and requiring two gives 57% — the only setting
//     that landed in the band.
//
// At depth 3 this measures 57/43 over 32 plies with nothing unfinished, and the
// pie rule brings the opener the rest of the way down.
func DefaultRules() RuleSet {
	return RuleSet{
		WinLength:            3,
		NoWinByDrop:          true,
		DropMustTouchOwn:     true,
		MinPiecesToMove:      2,
		CaptureReturnsToHand: true,
		CaptureCooldown:      1,
		SwapRule:             true,
		MaxPlies:             200,
		RepetitionLimit:      3,
	}
}

// LegacyRules is the design this replaced — four in a line, drop anywhere,
// captures permanent. Kept because it is what any new variant has to beat, and
// because `cmd/sim` reports it side by side so the comparison stays honest.
func LegacyRules() RuleSet {
	return RuleSet{
		WinLength:            4,
		MinPiecesToMove:      3,
		CaptureReturnsToHand: false,
		MaxPlies:             200,
		RepetitionLimit:      0,
	}
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

var endingNames = [...]string{"playing", "won", "repetition", "length", "no-move"}

func (e Ending) String() string {
	if int(e) < 0 || int(e) >= len(endingNames) {
		return "unknown"
	}

	return endingNames[e]
}

func (e Ending) MarshalJSON() ([]byte, error) {
	return []byte(`"` + e.String() + `"`), nil
}
