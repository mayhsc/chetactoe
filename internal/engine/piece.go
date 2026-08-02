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

func (pt PieceType) Moves(position Position) []Position {
	var moves []Position
	var offsets []Position

	switch pt {
	case Pawn:
		offsets = []Position{
			{-1, 0},
			{0, -1},
			{1, 0},
			{0, 1},
		}

	case Knight:
		offsets = []Position{
			{1, 2},
			{2, 1},
			{-1, 2},
			{-2, 1},
			{1, -2},
			{2, -1},
			{-1, -2},
			{-2, -1},
		}

	case Bishop:
		for i := 1; i < 4; i++ {
			offsets = append(offsets, Position{i, i})
			offsets = append(offsets, Position{-i, i})
			offsets = append(offsets, Position{i, -i})
			offsets = append(offsets, Position{-i, -i})
		}

	case Rook:
		for i := range 4 {
			offsets = append(offsets, Position{i, 0})
			offsets = append(offsets, Position{-i, 0})
			offsets = append(offsets, Position{0, -i})
			offsets = append(offsets, Position{0, i})

		}
	}
	addOffset(&moves, offsets, position)

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
	var emptyPos []Position
	var validMoves []Position

	for i, row := range bd.pieces {
		for j, piece := range row {
			if piece == nil {
				emptyPos = append(emptyPos, Position{Row: i, Col: j})
			}
		}
	}

	if pos.Col < 0 {
		return emptyPos
	}

	moves := p.pieceType.Moves(pos)

	for _, move := range moves {
		if contains(emptyPos, move) {
			// validMoves = append(validMoves, move)
		}
	}
	// clampMoves()

	Bishop.ViewMoves(Position{1, 1}, clampMoves(Position{1, 1}, Position{2, 1}, moves))

	return validMoves
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