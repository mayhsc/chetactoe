package engine

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"
)

func hand(p Player, pType PieceType) Position {
	return Position{Row: Slot(pType), Col: HandCol(p)}
}

func at(row, col int) Position {
	return Position{Row: row, Col: col}
}

// place puts a piece from p's hand onto a square through the same path a client
// would, so the tests never build a position the rules would refuse.
func place(t *testing.T, gb *GameBoard, p Player, pType PieceType, to Position) {
	t.Helper()

	if _, err := gb.MovePiece(hand(p, pType), to, p); err != nil {
		t.Fatalf("placing %v %v on %v: %v", p, pType, to, err)
	}
}

func TestOpeningPositionHasEveryPieceInHand(t *testing.T) {
	gb := InitializeGameBoard()

	if got := len(gb.board.emptySquares()); got != Cells*Cells {
		t.Errorf("board should start empty, %d of %d squares free", got, Cells*Cells)
	}

	for _, p := range []Player{White, Black} {
		if got := gb.hand[int(p)].Count(); got != HandSize {
			t.Errorf("%v should hold %d pieces, holds %d", p, HandSize, got)
		}

		for slot, piece := range gb.handPieces(p) {
			if piece == nil {
				t.Fatalf("%v hand slot %d is empty", p, slot)
			}

			if int(piece.Type()) != slot {
				t.Errorf("%v hand slot %d holds a %v", p, slot, piece.Type())
			}

			if !piece.InHand() {
				t.Errorf("%v %v reports %v, not a hand slot", p, piece.Type(), piece.Position())
			}
		}
	}
}

func TestPlacementTakesAnyEmptySquareAndOnlyFromYourOwnHand(t *testing.T) {
	gb := InitializeGameBoard()

	if got := len(gb.validDestinations(hand(White, Rook), White)); got != 16 {
		t.Errorf("a rook in hand should have 16 placements on an empty board, has %d", got)
	}

	if got := gb.validDestinations(hand(Black, Rook), White); got != nil {
		t.Errorf("White should not be able to place out of Black's hand, got %v", got)
	}

	place(t, &gb, White, Rook, at(0, 0))

	if got := len(gb.validDestinations(hand(White, Pawn), White)); got != 15 {
		t.Errorf("15 squares should be left, %d offered", got)
	}

	if gb.hand[int(White)].Pieces[Slot(Rook)] != nil {
		t.Error("the placed rook is still in hand")
	}

	if piece := gb.pieceAt(at(0, 0)); piece == nil || piece.Type() != Rook {
		t.Fatalf("A1 should hold the rook, holds %v", piece)
	}

	// The slot it left is empty, so nothing may be placed out of it.
	if got := gb.validDestinations(hand(White, Rook), White); got != nil {
		t.Errorf("an empty hand slot should offer nothing, offered %v", got)
	}
}

func TestMovesCanCaptureAnEnemyButNotLandOnYourOwn(t *testing.T) {
	gb := InitializeGameBoard()

	place(t, &gb, White, Rook, at(0, 0))
	place(t, &gb, White, Pawn, at(0, 2))
	place(t, &gb, Black, Bishop, at(2, 0))

	moves := gb.validDestinations(at(0, 0), White)

	// Down its column the black bishop on (2,0) is a capture and the stop; along
	// its row the white pawn on (0,2) blocks before it.
	for _, want := range []Position{at(1, 0), at(2, 0), at(0, 1)} {
		if !slices.Contains(moves, want) {
			t.Errorf("rook should be able to reach %v, moves are %v", want, moves)
		}
	}

	for _, dont := range []Position{at(3, 0), at(0, 2), at(0, 3)} {
		if slices.Contains(moves, dont) {
			t.Errorf("rook should not reach %v, moves are %v", dont, moves)
		}
	}
}

func TestCaptureSendsThePieceBackToItsOwnersHand(t *testing.T) {
	gb := InitializeGameBoard()

	place(t, &gb, White, Rook, at(0, 0))
	place(t, &gb, Black, Bishop, at(2, 0))

	captured, err := gb.MovePiece(at(0, 0), at(2, 0), White)
	if err != nil {
		t.Fatalf("capture refused: %v", err)
	}

	if captured == nil || captured.Type() != Bishop || captured.Player() != Black {
		t.Fatalf("expected to capture the black bishop, got %v", captured)
	}

	back := gb.hand[int(Black)].Pieces[Slot(Bishop)]
	if back == nil {
		t.Fatal("the captured bishop did not come back to Black's hand")
	}

	if !back.InHand() || back.Position() != hand(Black, Bishop) {
		t.Errorf("captured bishop sits at %v, want %v", back.Position(), hand(Black, Bishop))
	}

	if piece := gb.pieceAt(at(2, 0)); piece == nil || piece.Player() != White {
		t.Errorf("the white rook should now hold (2,0), it holds %v", piece)
	}

	// Nothing is ever destroyed: 8 pieces, always somewhere.
	total := gb.hand[0].Count() + gb.hand[1].Count()
	for r := range Cells {
		for c := range Cells {
			if gb.board.pieces[r][c] != nil {
				total++
			}
		}
	}

	if total != 2*HandSize {
		t.Errorf("%d pieces accounted for, want %d", total, 2*HandSize)
	}
}

func TestIllegalMovesChangeNothing(t *testing.T) {
	gb := InitializeGameBoard()

	place(t, &gb, White, Rook, at(0, 0))
	place(t, &gb, Black, Rook, at(3, 3))

	cases := []struct {
		what   string
		source Position
		dest   Position
		player Player
	}{
		{"from an empty square", at(1, 1), at(1, 2), White},
		{"someone else's piece", at(3, 3), at(3, 2), White},
		{"a rook moving diagonally", at(0, 0), at(1, 1), White},
		{"off the board", at(0, 0), at(0, 4), White},
		{"onto itself", at(0, 0), at(0, 0), White},
		{"out of the other player's hand", hand(Black, Pawn), at(1, 1), White},
	}

	for _, c := range cases {
		before := gb.board.copyPieces()

		if _, err := gb.MovePiece(c.source, c.dest, c.player); err == nil {
			t.Errorf("%s was allowed", c.what)
		}

		for r := range Cells {
			for c2 := range Cells {
				had, has := before[r][c2] != nil, gb.board.pieces[r][c2] != nil
				if had != has {
					t.Fatalf("%s changed the board at (%d,%d)", c.what, r, c2)
				}
			}
		}
	}
}

func TestWinningStateNeedsWinLengthInALine(t *testing.T) {
	gb := InitializeGameBoard()

	for col := range WinLength - 1 {
		place(t, &gb, White, PieceType(col), at(1, col))
	}

	if gb.board.isWinningState(White) {
		t.Fatalf("%d in a row should not win with WinLength %d", WinLength-1, WinLength)
	}

	place(t, &gb, White, PieceType(WinLength-1), at(1, WinLength-1))

	if !gb.board.isWinningState(White) {
		t.Error("a full row of White should win")
	}

	if gb.board.isWinningState(Black) {
		t.Error("Black should not win off White's row")
	}
}

func TestWinningStateFindsADiagonal(t *testing.T) {
	gb := InitializeGameBoard()

	for i := range Cells {
		place(t, &gb, Black, PieceType(i), at(i, i))
	}

	if !gb.board.isWinningState(Black) {
		t.Error("the main diagonal should win")
	}
}

func TestALineOfMixedPiecesDoesNotWin(t *testing.T) {
	gb := InitializeGameBoard()

	place(t, &gb, White, Pawn, at(2, 0))
	place(t, &gb, White, Knight, at(2, 1))
	place(t, &gb, Black, Bishop, at(2, 2))
	place(t, &gb, White, Rook, at(2, 3))

	if gb.board.isWinningState(White) || gb.board.isWinningState(Black) {
		t.Error("a row shared by both players should not win for either")
	}
}

// StartGame is the whole protocol, so it gets driven the way a client drives it.
func TestStartGameOpensWithEveryPieceInHand(t *testing.T) {
	act, snapshots := run(t)
	defer close(act)

	snap := <-snapshots

	if snap.CurrentPlayer != White {
		t.Errorf("White should be to move, %v is", snap.CurrentPlayer)
	}

	if snap.IsOver || snap.Winner != nil {
		t.Error("a fresh game should not be over")
	}

	for r := range Cells {
		for c := range Cells {
			if snap.Board[r][c] != nil {
				t.Fatalf("opening board should be empty, (%d,%d) is not", r, c)
			}
		}
	}

	for _, h := range [][HandSize]*Piece{snap.WhiteHand, snap.BlackHand} {
		for slot, piece := range h {
			if piece == nil {
				t.Errorf("hand slot %d should be filled", slot)
			}
		}
	}
}

func TestStartGameSelectListsPlacementsAndExecutePlaces(t *testing.T) {
	act, snapshots := run(t)
	defer close(act)

	<-snapshots

	act <- Action{ActionType: Select, Move: Move{Source: hand(White, Knight)}}
	snap := <-snapshots

	if len(snap.ValidMoves) != 16 {
		t.Errorf("selecting a piece in hand should offer 16 squares, offered %d", len(snap.ValidMoves))
	}

	if snap.Source == nil || *snap.Source != hand(White, Knight) {
		t.Errorf("snapshot should echo the selection, got %v", snap.Source)
	}

	if snap.CurrentPlayer != White {
		t.Error("selecting must not pass the turn")
	}

	act <- Action{ActionType: Execute, Move: Move{Source: hand(White, Knight), Destination: at(1, 1)}}
	snap = <-snapshots

	if snap.Rejected != "" {
		t.Fatalf("placement refused: %s", snap.Rejected)
	}

	if snap.Board[1][1] == nil || snap.Board[1][1].Type() != Knight {
		t.Errorf("(1,1) should hold the knight, holds %v", snap.Board[1][1])
	}

	if snap.WhiteHand[Slot(Knight)] != nil {
		t.Error("the placed knight is still in White's hand")
	}

	if snap.CurrentPlayer != Black {
		t.Errorf("the turn should have passed to Black, it is %v's", snap.CurrentPlayer)
	}

	if snap.Source != nil || snap.ValidMoves != nil {
		t.Error("a completed move should clear the selection")
	}

	if snap.MoveNo != 1 {
		t.Errorf("move number should be 1, is %d", snap.MoveNo)
	}
}

func TestStartGameRefusesAnOutOfTurnMoveAndKeepsGoing(t *testing.T) {
	act, snapshots := run(t)
	defer close(act)

	<-snapshots

	act <- Action{ActionType: Execute, Move: Move{Source: hand(Black, Pawn), Destination: at(0, 0)}}
	snap := <-snapshots

	if snap.Rejected == "" {
		t.Error("Black moving on White's turn should be refused")
	}

	if snap.Board[0][0] != nil {
		t.Error("the refused move changed the board")
	}

	if snap.CurrentPlayer != White {
		t.Error("a refused move should not pass the turn")
	}

	// The session is still usable.
	act <- Action{ActionType: Execute, Move: Move{Source: hand(White, Pawn), Destination: at(0, 0)}}
	snap = <-snapshots

	if snap.Rejected != "" || snap.Board[0][0] == nil {
		t.Errorf("the next legal move should still work: %q", snap.Rejected)
	}
}

func TestStartGameCancelClearsTheSelection(t *testing.T) {
	act, snapshots := run(t)
	defer close(act)

	<-snapshots

	act <- Action{ActionType: Select, Move: Move{Source: hand(White, Pawn)}}
	if snap := <-snapshots; len(snap.ValidMoves) == 0 {
		t.Fatal("select offered nothing")
	}

	act <- Action{ActionType: Cancel}
	snap := <-snapshots

	if snap.Source != nil || snap.ValidMoves != nil {
		t.Error("cancel should leave nothing selected")
	}

	if snap.CurrentPlayer != White {
		t.Error("cancel should not pass the turn")
	}
}

func TestStartGameEndsOnAWinAndStaysEnded(t *testing.T) {
	act, snapshots := run(t)
	defer close(act)

	<-snapshots

	// White fills row 1, Black answers in row 3 out of the way. Placements only,
	// so nothing here depends on how a particular piece moves.
	for col := range Cells {
		act <- Action{ActionType: Execute, Move: Move{Source: hand(White, PieceType(col)), Destination: at(1, col)}}
		snap := <-snapshots

		if snap.Rejected != "" {
			t.Fatalf("White's placement on (1,%d) refused: %s", col, snap.Rejected)
		}

		if col == Cells-1 {
			if !snap.IsOver {
				t.Fatal("a full row should end the game")
			}

			if snap.Winner == nil || *snap.Winner != White {
				t.Fatalf("White should be the winner, got %v", snap.Winner)
			}

			break
		}

		if snap.IsOver {
			t.Fatalf("the game ended early, after %d in a row", col+1)
		}

		act <- Action{ActionType: Execute, Move: Move{Source: hand(Black, PieceType(col)), Destination: at(3, col)}}
		if snap := <-snapshots; snap.Rejected != "" {
			t.Fatalf("Black's placement on (3,%d) refused: %s", col, snap.Rejected)
		}
	}

	// Anything after the win is answered with the final position.
	act <- Action{ActionType: Execute, Move: Move{Source: at(1, 0), Destination: at(0, 0)}}
	snap := <-snapshots

	if snap.Rejected == "" {
		t.Error("a move after the game ended should be refused")
	}

	if snap.Board[0][0] != nil {
		t.Error("a move after the game ended changed the board")
	}

	if snap.Winner == nil || *snap.Winner != White {
		t.Error("the winner should still be reported after the game ends")
	}
}

func TestSnapshotsAreDetachedFromTheEngine(t *testing.T) {
	gb := InitializeGameBoard()
	place(t, &gb, White, Rook, at(0, 0))

	snap := gb.Snapshot(White)

	if _, err := gb.MovePiece(at(0, 0), at(0, 1), White); err != nil {
		t.Fatalf("move refused: %v", err)
	}

	if snap.Board[0][0] == nil {
		t.Error("the snapshot changed when the engine did")
	}

	if snap.Board[0][1] != nil {
		t.Error("the snapshot picked up a move made after it was taken")
	}
}

func TestSnapshotSurvivesJSON(t *testing.T) {
	gb := InitializeGameBoard()
	place(t, &gb, Black, Knight, at(2, 2))

	snap := gb.Snapshot(Black)
	snap.ValidMoves = gb.validDestinations(at(2, 2), Black)

	data, err := json.Marshal(snap)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	// The whole point of the wire format: unexported fields would encode as {}.
	if strings.Contains(string(data), `"board":[[{},`) {
		t.Fatalf("pieces encoded as empty objects: %s", data)
	}

	for _, want := range []string{`"type":"knight"`, `"player":"black"`, `"row":2`, `"currentPlayer":"black"`} {
		if !strings.Contains(string(data), want) {
			t.Errorf("encoded snapshot is missing %s: %s", want, data)
		}
	}

	var back GameSnapshot
	if err := json.Unmarshal(data, &back); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	piece := back.Board[2][2]
	if piece == nil || piece.Type() != Knight || piece.Player() != Black {
		t.Fatalf("round trip lost the knight, got %v", piece)
	}

	if len(back.ValidMoves) != len(snap.ValidMoves) {
		t.Errorf("round trip changed the valid moves: %v vs %v", back.ValidMoves, snap.ValidMoves)
	}
}

func TestActionDecodesFromJSON(t *testing.T) {
	var action Action

	body := `{"actionType":"execute","move":{"source":{"row":1,"col":-2},"destination":{"row":0,"col":3}}}`
	if err := json.Unmarshal([]byte(body), &action); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if action.ActionType != Execute {
		t.Errorf("action type is %v", action.ActionType)
	}

	if !InHand(action.Move.Source) || HandOwner(action.Move.Source) != Black {
		t.Errorf("source should be a slot in Black's hand, is %v", action.Move.Source)
	}
}

// run starts a game and cleans up after the test. Snapshots are buffered so a
// test can send before it reads.
func run(t *testing.T) (chan Action, chan GameSnapshot) {
	t.Helper()

	act := make(chan Action, 8)
	snapshots := make(chan GameSnapshot, 8)

	go StartGame(act, snapshots)

	return act, snapshots
}

func TestStartGameRefusesAnActionFromTheWrongSender(t *testing.T) {
	act, snapshots := run(t)
	defer close(act)

	<-snapshots

	black := Black

	// A legal move for White, but sent by Black. Over a socket this is the whole
	// difference between a game and a free-for-all.
	act <- Action{
		ActionType: Execute,
		From:       &black,
		Move:       Move{Source: hand(White, Pawn), Destination: at(0, 0)},
	}

	snap := <-snapshots

	if snap.Rejected == "" {
		t.Error("an action from the player who is not to move should be refused")
	}

	if snap.Board[0][0] != nil {
		t.Error("it changed the board anyway")
	}

	// Selects are reads, but they still leak whose piece is where, so they go too.
	act <- Action{ActionType: Select, From: &black, Move: Move{Source: hand(White, Pawn)}}

	if snap := <-snapshots; snap.ValidMoves != nil {
		t.Error("a select from the wrong sender was answered")
	}

	// The same action without a sender is the local case, and still works.
	act <- Action{ActionType: Execute, Move: Move{Source: hand(White, Pawn), Destination: at(0, 0)}}

	if snap := <-snapshots; snap.Rejected != "" || snap.Board[0][0] == nil {
		t.Errorf("a local action should still be trusted: %q", snap.Rejected)
	}
}
