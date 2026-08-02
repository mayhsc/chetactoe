package main

import (
	"chetactoe/internal/engine"
	"fmt"
)

// var assets embed.FS

func main() {
	// ptype := engine.Rook

	// for i := range 4 {
	// 	for j := range 4 {
	// 		pos := engine.Position{Row: i, Col: j}
	// 		ptype.ViewMoves(pos, ptype.Moves(pos))
	// 		print("\n")
	// 	}
	// 	print("\n")
	// }
	// gameBoard := engine.InitializeGameBoard()
	board := engine.NewBoard()
	piece := engine.CreatePiece(
		engine.Rook,
		engine.White,
	)

	pos := engine.Position{Row: 1, Col: -1}
	for i, move := range piece.ValidMoves(pos, board) {
		fmt.Printf("%d: (%d, %d)\n", i, move.Row, move.Col)
	}

	println()
	board.SetPiece(1, 1, *piece)
	for i, move := range piece.ValidMoves(pos, board) {
		fmt.Printf("%d: (%d, %d)\n", i, move.Row, move.Col)
	}

	println()
	board.SetPiece(2, 1, *piece)
	for i, move := range piece.ValidMoves(engine.Position{Row: 1, Col: 1}, board) {
		fmt.Printf("%d: (%d, %d)\n", i, move.Row, move.Col)
	}

}
