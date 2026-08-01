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

	switch pt {
	case Pawn:
		offsets := []Position{
			{-1, 0},
			{0, -1},
			{1, 0},
			{0, 1},
		}

		addOffset(&moves, offsets, position)

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
		var offsets []Position

		for i := 1; i < 4; i++ {
			for j := 1; j < 4; j++ {
				offsets = append(offsets, Position{i, j})
				offsets = append(offsets, Position{-i, j})
				offsets = append(offsets, Position{i, -j})
				offsets = append(offsets, Position{-i, -j})

			}
		}

		addOffset(&moves, offsets, position)
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
			case slices.Contains(moves, pos):
				fmt.Print("* ")
			default:
				fmt.Print(". ")
			}
		}

		fmt.Println()
	}

	fmt.Println("    0 1 2 3")
}
