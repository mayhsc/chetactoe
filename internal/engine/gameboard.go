package engine

import (
	"fmt"
	"slices"
)

// InitializeGameBoard starts a game under the measured ruleset.
func InitializeGameBoard() GameBoard {
	return NewGameBoard(DefaultRules())
}

// NewGameBoard starts a game under any ruleset — which is how the harness plays
// a hundred variants against each other without a patch.
func NewGameBoard(rules RuleSet) GameBoard {
	return GameBoard{
		board: NewBoard(),
		hand:  InitializeHand(),
		rules: rules,
	}
}

// pieceAt is the piece on a square, or the piece in a hand slot if the position
// is a hand one.
func (gb *GameBoard) pieceAt(pos Position) *Piece {
	if InHand(pos) {
		owner := HandOwner(pos)
		if int(owner) >= len(gb.hand) || pos.Row < 0 || pos.Row >= HandSize {
			return nil
		}

		return gb.hand[int(owner)].Pieces[pos.Row]
	}

	return gb.board.pieceAt(pos)
}

// PieceAt exposes pieceAt to callers outside the engine.
func (gb *GameBoard) PieceAt(pos Position) *Piece { return gb.pieceAt(pos) }

// getValidPlacements is where a piece from the hand may go.
//
// Any empty square, less whatever the ruleset takes away: a square that would
// complete a line (NoWinByDrop), and any square not touching a piece the player
// already has in play (DropMustTouchOwn). Those two restrictions are what stop
// the game being a race to drop four pieces in a row, which is what it measured
// as without them.
func (gb *GameBoard) getValidPlacements(piece *Piece, p Player) []Position {
	var out []Position

	mustTouch := gb.rules.DropMustTouchOwn && gb.board.has(p)

	for _, square := range gb.board.emptySquares() {
		if mustTouch && !gb.board.touches(p, square) {
			continue
		}

		if gb.rules.NoWinByDrop && gb.dropWouldWin(piece, square, p) {
			continue
		}

		out = append(out, square)
	}

	return out
}

// dropWouldWin asks whether putting this piece here finishes a line, by trying
// it on the board and taking it straight back off. Cheaper than reasoning about
// which lines the square belongs to, and it cannot disagree with the win check.
func (gb *GameBoard) dropWouldWin(piece *Piece, square Position, p Player) bool {
	probe := *piece
	probe.position = square

	gb.board.setPiece(square, &probe)
	won := gb.board.isWinningState(p, gb.rules.WinLength)
	gb.board.setPiece(square, nil)

	return won
}

// validDestinations is the single source of truth for what a player may do with
// one source, and the only thing MovePiece checks against. Select reads it to
// light up squares; Execute uses it to refuse anything else.
//
// It returns nothing when the source is empty, is the other player's, or is the
// other player's hand — so an out-of-turn or made-up move has no destinations at
// all rather than a bad one.
func (gb *GameBoard) validDestinations(source Position, p Player) []Position {
	if InHand(source) {
		if HandOwner(source) != p || source.Row < 0 || source.Row >= HandSize {
			return nil
		}

		piece := gb.hand[int(p)].Pieces[source.Row]

		// An empty slot, or one holding a piece still sitting out the turn it was
		// captured on.
		if piece == nil || !piece.Ready() {
			return nil
		}

		return gb.getValidPlacements(piece, p)
	}

	piece := gb.board.pieceAt(source)
	if piece == nil || piece.player != p {
		return nil
	}

	return piece.ValidMoves(gb.board)
}

// ValidDestinations exposes validDestinations to callers outside the engine.
func (gb *GameBoard) ValidDestinations(source Position, p Player) []Position {
	return gb.validDestinations(source, p)
}

// MovePiece applies one legal action for p — placing a piece out of p's hand
// (source in the hand) or moving one of p's pieces already in play — and returns
// the piece captured, if any.
//
// An illegal move changes nothing and comes back as an error. The old version
// moved first and asked later, which dereferenced a nil piece the moment a client
// named an empty square.
func (gb *GameBoard) MovePiece(source Position, destination Position, p Player) (*Piece, error) {
	if !slices.Contains(gb.validDestinations(source, p), destination) {
		return nil, fmt.Errorf("%v: %v -> %v is not a legal move", p, source, destination)
	}

	var piece *Piece

	if InHand(source) {
		piece = gb.hand[int(p)].Pieces[source.Row]
		gb.hand[int(p)].Pieces[source.Row] = nil
	} else {
		piece = gb.board.pieceAt(source)
		gb.board.setPiece(source, nil)
	}

	captured := gb.board.pieceAt(destination)
	if captured != nil {
		gb.returnToHand(captured)
		captured.cooldown = gb.rules.CaptureCooldown
	}

	piece.position = destination
	piece.cooldown = 0
	gb.board.setPiece(destination, piece)

	return captured, nil
}

// swapSides hands every piece to the other player — the pie rule, applied.
//
// The seats do not move: whoever was playing White still is, but the position
// they just built now belongs to their opponent and they are the one to move
// with nothing on the board. That is the whole point of the rule, and it is why
// it needs no judgement about how much a first move is worth.
func (gb *GameBoard) swapSides() {
	for r := range Cells {
		for c := range Cells {
			if piece := gb.board.pieces[r][c]; piece != nil {
				piece.player = opponent(piece.player)
			}
		}
	}

	gb.hand[0].Pieces, gb.hand[1].Pieces = gb.hand[1].Pieces, gb.hand[0].Pieces

	for i := range 2 {
		for _, piece := range gb.hand[i].Pieces {
			if piece == nil {
				continue
			}

			piece.player = Player(i)
			piece.position = Position{Row: int(piece.pieceType), Col: HandCol(Player(i))}
		}
	}
}

// tick counts down the player's captured pieces at the start of their turn.
func (gb *GameBoard) tick(p Player) {
	for _, piece := range gb.hand[int(p)].Pieces {
		if piece != nil && piece.cooldown > 0 {
			piece.cooldown--
		}
	}
}

// positionKey identifies a position for repetition detection: what stands where,
// what is waiting in each hand, and whose turn it is. Two positions with the same
// key offer the same game, so seeing one three times means nobody is making
// progress.
func (gb *GameBoard) positionKey(toMove Player) string {
	key := make([]byte, 0, 32)

	for r := range Cells {
		for c := range Cells {
			piece := gb.board.pieces[r][c]
			if piece == nil {
				key = append(key, '.')
				continue
			}

			key = append(key, byte('a'+int(piece.pieceType)+HandSize*int(piece.player)))
		}
	}

	for _, hand := range gb.hand {
		key = append(key, '|')
		for _, piece := range hand.Pieces {
			switch {
			case piece == nil:
				key = append(key, '.')
			case piece.Ready():
				key = append(key, 'r')
			default:
				key = append(key, byte('0'+piece.cooldown))
			}
		}
	}

	return string(append(key, '|', byte('0'+int(toMove))))
}

// returnToHand puts a captured piece back in its owner's hand, ready to be
// placed again. Its slot is its own type's index and each player owns one piece
// of each type, so the slot it left is always the slot waiting for it.
func (gb *GameBoard) returnToHand(piece *Piece) {
	slot := int(piece.pieceType)

	piece.position = Position{Row: slot, Col: HandCol(piece.player)}
	gb.hand[int(piece.player)].Pieces[slot] = piece
}

// handPieces is a detached copy of a player's hand, for a snapshot. Empty slots
// stay nil and keep their index, so a client can draw the hand as four fixed
// places — pawn, knight, bishop, rook — rather than a shifting list.
func (gb *GameBoard) handPieces(p Player) [HandSize]*Piece {
	var out [HandSize]*Piece

	for i, piece := range gb.hand[int(p)].Pieces {
		if piece != nil {
			copied := *piece
			out[i] = &copied
		}
	}

	return out
}

// hasLegalAction reports whether the player has anything at all they may do.
//
// Under the classic rules this was unreachable — 8 pieces on 16 squares means a
// player holding anything can always drop it somewhere — which is why the game
// had no ending it could actually arrive at. With drops restricted it is a real
// possibility, and it loses the game for the player it happens to.
func (gb *GameBoard) hasLegalAction(p Player) bool {
	for slot := range HandSize {
		source := Position{Row: slot, Col: HandCol(p)}
		if len(gb.validDestinations(source, p)) > 0 {
			return true
		}
	}

	for r := range Cells {
		for c := range Cells {
			source := Position{Row: r, Col: c}
			if len(gb.validDestinations(source, p)) > 0 {
				return true
			}
		}
	}

	return false
}

// Snapshot is the current position as a client sees it, with the pieces copied
// out of the engine. Fields describing a particular action — Source, ValidMoves,
// LastMove — are the caller's to fill in.
func (gb *GameBoard) Snapshot(current Player) GameSnapshot {
	return GameSnapshot{
		Board:         gb.board.copyPieces(),
		WhiteHand:     gb.handPieces(White),
		BlackHand:     gb.handPieces(Black),
		CurrentPlayer: current,
		Rules:         gb.rules,
	}
}

// WinningLine is the run that ended the game, for drawing it.
func (gb *GameBoard) WinningLine(p Player) []Position {
	return gb.board.winningLine(p, gb.rules.WinLength)
}

func (gb *GameBoard) Print() {
	fmt.Print("\n=================== 4x4 BOARD ===================\n")

	fmt.Print("Black Hand: ")
	for _, piece := range gb.hand[1].Pieces {
		if piece != nil {
			fmt.Printf("%s ", gb.getLabelForPiece(piece.pieceType, piece.player))
		} else {
			fmt.Print("_ ")
		}
	}
	fmt.Print("\n-----------------------------------------------\n")

	for r := range Cells {
		fmt.Printf("%d | ", r)

		for c := range Cells {
			piece := gb.board.pieces[r][c]
			if piece != nil {
				fmt.Printf("%s\t", gb.getLabelForPiece(piece.pieceType, piece.player))
			} else {
				fmt.Print(".\t")
			}
		}
		fmt.Println()
	}

	fmt.Print("-----------------------------------------------\n")

	fmt.Print("White Hand: ")
	for _, piece := range gb.hand[0].Pieces {
		if piece != nil {
			fmt.Printf("%s ", gb.getLabelForPiece(piece.pieceType, piece.player))
		} else {
			fmt.Print("_ ")
		}
	}
	fmt.Print("\n===============================================\n\n")
}

func (gb *GameBoard) getLabelForPiece(pType PieceType, p Player) string {
	i := int(p)

	labels := [2][4]string{
		{"♟", "♞", "♝", "♜"},
		{"♙", "♘", "♗", "♖"},
	}

	return labels[i][int(pType)]
}
