package engine

import "fmt"

func InitializeGameBoard() GameBaord {
	return GameBaord{
		board: NewBoard(),
		hand:  InitializeHand(),
	}
}

func (gb *GameBaord) Print() {
	fmt.Print("-----------------------------------------------\n")
	for i := range 2 {
		for _, piece := range gb.hand[i].Pieces {
			// print(piece.position.Col)
			var printText string
			if piece.position.Col < 0 {
				printText = gb.getLabelForPiece(piece.pieceType, piece.player)
			} else {
				printText = "_"
			}

			fmt.Printf("%s\t", printText)
		}
		println()
	}
	fmt.Print("-----------------------------------------------\n")
}

func (gb *GameBaord) getLabelForPiece(pType PieceType, p Player) string {
	var i int;
	if (p == White) {
		i = 0
	} else {
		i = 1
	}
	labels := [2][4]string{
		{"♙", "♘", "♗", "♖"},
		{"♟", "♞", "♝", "♜"},
	}

	return labels[i][int(pType)]
}