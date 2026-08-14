package engine

import (
	"fmt"
	"slices"
)

var (
	knightOffsets = []Position{
		{Row: 1, Col: 2},
		{Row: 2, Col: 1},
		{Row: -1, Col: 2},
		{Row: -2, Col: 1},
		{Row: 1, Col: -2},
		{Row: 2, Col: -1},
		{Row: -1, Col: -2},
		{Row: -2, Col: -1},
	}

	orthogonals = []Position{
		{Row: 1, Col: 0},
		{Row: -1, Col: 0},
		{Row: 0, Col: 1},
		{Row: 0, Col: -1},
	}

	diagonals = []Position{
		{Row: 1, Col: 1},
		{Row: -1, Col: 1},
		{Row: 1, Col: -1},
		{Row: -1, Col: -1},
	}
)

// CreatePiece makes a piece in its owner's hand. Hand pieces sit at the column
// their player's hand reports and the row of their own type, so the slot a piece
// starts in is the slot it returns to if it is ever captured.
func CreatePiece(ptype PieceType, player Player) *Piece {
	return &Piece{
		pieceType: ptype,
		player:    player,
		position: Position{
			Row: int(ptype),
			Col: HandCol(player),
		},
		direction: None,
	}
}

func InitializePieces(player Player) [HandSize]*Piece {
	pieceTypes := []PieceType{Pawn, Knight, Bishop, Rook}

	var pieces [HandSize]*Piece

	for i, pieceType := range pieceTypes {
		pieces[i] = CreatePiece(pieceType, player)
	}

	return pieces
}

// ValidMoves lists the squares this piece may move to from where it stands.
//
// A square holding an enemy piece is included — that is a capture, and the
// captured piece goes back to its owner's hand. A square holding one of the
// mover's own pieces is not. A piece still in the hand has no moves of its own:
// its destinations are the board's empty squares, which GameBoard supplies,
// because they do not depend on which piece is being placed.
func (p Piece) ValidMoves(bd Board) []Position {
	if p.InHand() {
		return nil
	}

	switch p.pieceType {
	case Pawn:
		return p.stepMoves(bd, p.pawnOffsets())

	case Knight:
		return p.stepMoves(bd, knightOffsets)

	case Bishop:
		return p.slideMoves(bd, diagonals)

	case Rook:
		return p.slideMoves(bd, orthogonals)
	}

	return nil
}

// pawnOffsets is the pawn's one step. A pawn with no direction set steps any of
// the four ways — which is how CreatePiece makes them, and what keeps a piece
// placed from the hand from needing a facing.
func (p Piece) pawnOffsets() []Position {
	switch p.direction {
	case Up:
		return []Position{{Row: 1, Col: 0}}
	case Down:
		return []Position{{Row: -1, Col: 0}}
	case Right:
		return []Position{{Row: 0, Col: 1}}
	case Left:
		return []Position{{Row: 0, Col: -1}}
	}

	return orthogonals
}

// stepMoves is the jumping pieces: each offset is one candidate square, and what
// stands between does not matter.
func (p Piece) stepMoves(bd Board, offsets []Position) []Position {
	var moves []Position

	for _, offset := range offsets {
		target := Position{
			Row: p.position.Row + offset.Row,
			Col: p.position.Col + offset.Col,
		}

		if p.canLand(target, bd) {
			moves = append(moves, target)
		}
	}

	return moves
}

// slideMoves is the sliding pieces: run down each direction until the board ends
// or something is in the way. An enemy in the way can be taken, one of your own
// cannot, and either stops the slide.
func (p Piece) slideMoves(bd Board, directions []Position) []Position {
	var moves []Position

	for _, dir := range directions {
		current := p.position

		for {
			current = Position{
				Row: current.Row + dir.Row,
				Col: current.Col + dir.Col,
			}

			if !validPosition(current) {
				break
			}

			occupant := bd.pieceAt(current)

			if occupant == nil {
				moves = append(moves, current)
				continue
			}

			if occupant.player != p.player {
				moves = append(moves, current)
			}

			break
		}
	}

	return moves
}

// canLand is the one rule shared by every piece: on the board, and not onto one
// of your own.
func (p Piece) canLand(pos Position, bd Board) bool {
	if !validPosition(pos) {
		return false
	}

	occupant := bd.pieceAt(pos)

	return occupant == nil || occupant.player != p.player
}

func (p Piece) ViewMoves(moves []Position) {
	pos := p.position

	for r := range Cells {
		fmt.Printf("%d | ", r)

		for c := range Cells {
			switch {
			case r == pos.Row && c == pos.Col:
				fmt.Print("P ")
			case contains(moves, Position{Row: r, Col: c}):
				fmt.Print("* ")
			default:
				fmt.Print(". ")
			}
		}

		fmt.Println()
	}

	fmt.Println("    0 1 2 3")
}

func contains(moves []Position, pos Position) bool {
	return slices.Contains(moves, pos)
}

func validPosition(pos Position) bool {
	return pos.Row >= 0 &&
		pos.Row < Cells &&
		pos.Col >= 0 &&
		pos.Col < Cells
}
