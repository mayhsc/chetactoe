package engine

import (
	"fmt"
	"slices"
)

func InitializeGameBoard() GameBoard {
	return GameBoard{
		board: NewBoard(),
		hand:  InitializeHand(),
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

// getValidPlacements is where a piece from the hand may go: any empty square.
// It does not depend on which piece is being placed.
func (gb *GameBoard) getValidPlacements() []Position {
	return gb.board.emptySquares()
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

		if gb.hand[int(p)].Pieces[source.Row] == nil {
			return nil
		}

		return gb.getValidPlacements()
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
	}

	piece.position = destination
	gb.board.setPiece(destination, piece)

	return captured, nil
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

// hasLegalAction reports whether the player has anything at all they may do. A
// player holding a piece always does, since the board cannot fill up: 8 pieces,
// 16 squares. It can only come back false once every piece is in play and every
// one of them is boxed in, which is the game's only draw.
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
	}
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
