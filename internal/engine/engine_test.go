package engine

import (
	"testing"
)

func TestIsWinningState(t *testing.T) {
	pWhite := &Piece{Player: White}
	pBlack := &Piece{Player: Black}

	tests := []struct {
		name     string
		board    Board
		player   Player
		expected bool
	}{
		{
			name: "Empty board, no win",
			board: Board{
				pieces: [4][4]*Piece{},
			},
			player:   White,
			expected: false,
		},
		{
			name: "White wins with horizontal row 0",
			board: Board{
				pieces: [4][4]*Piece{
					{pWhite, pWhite, pWhite, pWhite},
					{nil, nil, nil, nil},
					{nil, nil, nil, nil},
					{nil, nil, nil, nil},
				},
			},
			player:   White,
			expected: true,
		},
		{
			name: "Black wins with vertical column 2",
			board: Board{
				pieces: [4][4]*Piece{
					{nil, nil, pBlack, nil},
					{nil, nil, pBlack, nil},
					{nil, nil, pBlack, nil},
					{nil, nil, pBlack, nil},
				},
			},
			player:   Black,
			expected: true,
		},
		{
			name: "White wins with main diagonal (top-left to bottom-right)",
			board: Board{
				pieces: [4][4]*Piece{
					{pWhite, nil, nil, nil},
					{nil, pWhite, nil, nil},
					{nil, nil, pWhite, nil},
					{nil, nil, nil, pWhite},
				},
			},
			player:   White,
			expected: true,
		},
		{
			name: "Black wins with anti-diagonal (top-right to bottom-left)",
			board: Board{
				pieces: [4][4]*Piece{
					{nil, nil, nil, pBlack},
					{nil, nil, pBlack, nil},
					{nil, pBlack, nil, nil},
					{pBlack, nil, nil, nil},
				},
			},
			player:   Black,
			expected: true,
		},
		{
			name: "Mixed pieces, no win for White",
			board: Board{
				pieces: [4][4]*Piece{
					{pWhite, pWhite, pBlack, pWhite},
					{nil, nil, nil, nil},
					{nil, nil, nil, nil},
					{nil, nil, nil, nil},
				},
			},
			player:   White,
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actual := tt.board.isWinningState(tt.player, 4)
			if actual != tt.expected {
				t.Errorf("isWinningState() = %v, expected %v", actual, tt.expected)
			}
		})
	}
}

func TestGetAllPossibleMoves(t *testing.T) {
	// Legacy rules, so placements are unrestricted and the arithmetic below is
	// just "every piece in hand times every empty square".
	gb := initializeGameBoard(LegacyRules())

	whiteMoves := gb.getAllPossibleMoves(White)
	if expected := 4 * 16; len(whiteMoves) != expected {
		t.Errorf("expected %d opening moves for White, got %d", expected, len(whiteMoves))
	}

	// Placed through movePiece rather than written into the array, because that is
	// what maintains pieceCount and gives a pawn its facing. Writing the piece in
	// directly leaves the count at zero, and MinPiecesToMove then blocks every
	// move — which is what this test used to trip over.
	drop := func(slot int, to Position) {
		t.Helper()
		gb.movePiece(Position{Row: slot, Col: handCol(White)}, to, White)
	}

	drop(int(Pawn), Position{Row: 1, Col: 1})
	drop(int(Knight), Position{Row: 3, Col: 3})
	drop(int(Bishop), Position{Row: 3, Col: 0})

	if got := gb.board.pieceCount[int(White)]; got != 3 {
		t.Fatalf("three pieces should be in play, pieceCount says %d", got)
	}

	pawn := gb.board.pieces[1][1]
	if pawn == nil || pawn.PieceType != Pawn {
		t.Fatalf("(1,1) should hold the pawn, holds %v", pawn)
	}

	// A pawn placed by White faces down the board; forward is one row on.
	step := 1
	if pawn.Direction == Up {
		step = -1
	}

	forward := Position{Row: 1 + step, Col: 1}

	moves := gb.getAllPossibleMoves(White)

	found := false
	for _, m := range moves {
		if m.Source == (Position{Row: 1, Col: 1}) && m.Destination == forward {
			found = true
			break
		}
	}

	if !found {
		t.Errorf("the pawn on (1,1) facing %v should be able to step to %v; moves were %v",
			pawn.Direction, forward, moves)
	}
}

// TestRulesReachTheBoard guards a failure that is invisible from the outside: if
// the ruleset does not make it onto the board, move generation silently falls
// back to the zero value — no drop restrictions, no cooldown, captures permanent
// — and completely different rulesets measure identically.
func TestRulesReachTheBoard(t *testing.T) {
	rules := DefaultRules()
	gb := initializeGameBoard(rules)

	if gb.board.rules != rules {
		t.Fatalf("the board is playing %+v, not %+v", gb.board.rules, rules)
	}

	g := NewGameWithRules(LegacyRules())
	if g.gb.board.rules.WinLength != LegacyRules().WinLength {
		t.Errorf("NewGameWithRules did not carry its rules to the board")
	}
}

// TestDropRulesActuallyRestrict is the behavioural half of the above: two
// rulesets that differ only in the drop rules must not offer the same moves.
func TestDropRulesActuallyRestrict(t *testing.T) {
	loose := DefaultRules()
	loose.NoWinByDrop = false
	loose.DropMustTouchOwn = false

	// Built explicitly rather than taken from DefaultRules, which does not have
	// these on: at four in a line they measured worse than leaving them off.
	strict := DefaultRules()
	strict.NoWinByDrop = true
	strict.DropMustTouchOwn = true

	place := func(g *Game, from, to Position) {
		t.Helper()
		g.applyTrustedMove(Move{Source: from, Destination: to})
	}

	// One piece each in a corner, then count what the next placement may do.
	counts := map[string]int{}

	for name, rules := range map[string]RuleSet{"loose": loose, "strict": strict} {
		g := NewGameWithRules(rules)

		place(g, Position{Row: int(Rook), Col: handCol(White)}, Position{Row: 0, Col: 0})
		place(g, Position{Row: int(Rook), Col: handCol(Black)}, Position{Row: 3, Col: 3})

		counts[name] = len(g.gb.getValidPlacements(g.gb.handPiece(White, int(Pawn)), White))
	}

	if counts["strict"] >= counts["loose"] {
		t.Errorf("the drop rules are not restricting anything: strict offered %d placements, loose %d",
			counts["strict"], counts["loose"])
	}

	// Touching the rook on (0,0) leaves exactly three squares.
	if counts["strict"] != 3 {
		t.Errorf("with a rook on (0,0), a placement should have 3 squares to touch, got %d", counts["strict"])
	}
}
