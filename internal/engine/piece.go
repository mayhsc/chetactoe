package engine

import (
	"fmt"
	"slices"
)

func CreatePiece(ptype PieceType, player Player) *Piece {
	var index int
	if player == White {
		index = -1
	} else {
		index = -2
	}

	return &Piece{
		PieceType: ptype,
		Player:    player,
		Position: Position{
			Col: index,
			Row: int(ptype),
		},
		Direction: None,
	}
}

func InitializePieces(player Player) [4]*Piece {
	pieceTypes := []PieceType{Pawn, Knight, Bishop, Rook}

	var pieces [4]*Piece

	for i, pieceType := range pieceTypes {
		pieces[i] = CreatePiece(pieceType, player)
	}

	return pieces
}

func (pt PieceType) Moves(position Position, bd Board) []Position {
	var moves []Position
	var validMoves []Position

	switch pt {
	case Knight:
		offsets := []Position{
			{1, 2},
			{2, 1},
			{-1, 2},
			{-2, 1},
			{1, -2},
			{2, -1},
			{-1, -2},
			{-2, -1},
		}

		addOffset(&moves, offsets, position)
		for _, move := range moves {
			if bd.pieces[move.Row][move.Col] == nil {
				validMoves = append(validMoves, move)
			}
		}
		return validMoves

	case Bishop:
		directions := []Position{
			{1, 1},
			{-1, 1},
			{1, -1},
			{-1, -1},
		}

		addSlidingMoves(&moves, position, directions, bd)

	case Rook:
		directions := []Position{
			{1, 0},
			{-1, 0},
			{0, 1},
			{0, -1},
		}

		addSlidingMoves(&moves, position, directions, bd)
	}

	return moves
}

func addSlidingMoves(moves *[]Position, position Position, directions []Position, bd Board) {
	for _, dir := range directions {
		current := position

		for {
			current = Position{
				Row: current.Row + dir.Row,
				Col: current.Col + dir.Col,
			}

			if !validPosition(current) {
				break
			}

			if bd.pieces[current.Row][current.Col] == nil {
				*moves = append(*moves, current)
				continue
			}

			*moves = append(*moves, current)
			break
		}
	}
}

func (pt PieceType) ViewMoves(pos Position, moves []Position) {
	for r := range 4 {
		fmt.Printf("%d | ", r)

		for c := range 4 {
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

func (p *Piece) Type() PieceType { return p.PieceType }
func (p *Piece) Pos() Position   { return p.Position }

func (p Piece) ValidMoves(bd Board) []Position {
	pos := p.Position

	if p.PieceType == Pawn {
		return p.pawnMoves(pos, bd)
	}

	return p.PieceType.Moves(pos, bd)
}

func (p Piece) pawnMoves(pos Position, bd Board) []Position {
	var moves []Position

	switch p.Direction {
	case Up:
		next := Position{
			Row: pos.Row + 1,
			Col: pos.Col,
		}
		if validPosition(next) && bd.pieces[next.Row][next.Col] == nil {
			moves = append(moves, next)
		}

	case Down:
		next := Position{
			Row: pos.Row - 1,
			Col: pos.Col,
		}
		if validPosition(next) && bd.pieces[next.Row][next.Col] == nil {
			moves = append(moves, next)
		}

	case Right:
		next := Position{
			Row: pos.Row,
			Col: pos.Col + 1,
		}
		if validPosition(next) && bd.pieces[next.Row][next.Col] == nil {
			moves = append(moves, next)
		}

	case Left:
		next := Position{
			Row: pos.Row,
			Col: pos.Col - 1,
		}
		if validPosition(next) && bd.pieces[next.Row][next.Col] == nil {
			moves = append(moves, next)
		}

	case None:
		offsets := []Position{
			{Row: -1, Col: 0},
			{Row: 0, Col: -1},
			{Row: 1, Col: 0},
			{Row: 0, Col: 1},
		}

		addOffset(&moves, offsets, pos)

		var validMoves []Position
		for _, move := range moves {
			if bd.pieces[move.Row][move.Col] == nil {
				validMoves = append(validMoves, move)
			}
		}

		return validMoves
	}

	return moves
}

func addOffset(moves *[]Position, offsets []Position, position Position) {
	for _, offset := range offsets {
		newPosition := Position{
			Row: position.Row + offset.Row,
			Col: position.Col + offset.Col,
		}

		if validPosition(newPosition) {
			*moves = append(*moves, newPosition)
		}
	}
}

func validPosition(pos Position) bool {
	return pos.Row >= 0 &&
		pos.Row < 4 &&
		pos.Col >= 0 &&
		pos.Col < 4
}
