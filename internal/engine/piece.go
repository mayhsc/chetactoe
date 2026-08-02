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
		pieceType: ptype,
		player:    player,
		position: Position{
			Col: index,
			Row: int(ptype),
		},
		direction: None,
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
	row, col := pos.Row, pos.Col

	if row > 3 || row < 0 || col > 3 || col < 0 {
		return false
	}
	return true
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

func (p Piece) ValidMoves(pos Position, bd Board) []Position {
	return p.pieceType.Moves(pos, bd)
}

func clampMoves(origin Position, blocker Position, moves []Position) []Position {
	var clamped []Position

	dx := blocker.Col - origin.Col
	dy := blocker.Row - origin.Row

	for _, move := range moves {
		mx := move.Col - origin.Col
		my := move.Row - origin.Row

		sameRay := false

		switch {
		case dx == 0:
			sameRay = mx == 0 && my*dy > 0
		case dy == 0:
			sameRay = my == 0 && mx*dx > 0
		default:
			sameRay = mx*dy == my*dx && mx*dx > 0
		}

		if sameRay {
			if abs(mx) > abs(dx) || abs(my) > abs(dy) {
				continue
			}
		}

		clamped = append(clamped, move)
	}

	return clamped
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}