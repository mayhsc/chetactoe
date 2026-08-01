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
