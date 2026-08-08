package engine

import "fmt"

func InitializeGameBoard() GameBaord {
	return GameBaord{
		board: NewBoard(),
		hand:  InitializeHand(),
	}
}

func (gb *GameBaord) MovePiece(oldPos Position, newPos Position, p Player) {
	r1, c1 := oldPos.Row, oldPos.Col
	r2, c2 := newPos.Row, newPos.Col

	inHand := c1 < 0
	toHand := c2 < 0

	var piece *Piece
	i := int(p)

	if inHand {
		piece = gb.hand[i].Pieces[r1]
		gb.hand[i].Pieces[r1] = nil
	} else {
		piece = gb.board.pieces[r1][c1]
		gb.board.pieces[r1][c1] = nil
	}

	piece.position = newPos

	if toHand {
		gb.hand[i].Pieces[r2] = piece
	} else {
		gb.board.pieces[r2][c2] = piece
	}
}

func (gb *GameBaord) Print() {
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

	for r := range 4 {
		fmt.Printf("%d | ", r)

		for c := range 4 {
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

func (gb *GameBaord) getLabelForPiece(pType PieceType, p Player) string {
	i := int(p)

	labels := [2][4]string{
		{"♟", "♞", "♝", "♜"},
		{"♙", "♘", "♗", "♖"},
	}

	return labels[i][int(pType)]
}

func isWinningState(bd Board, p Player) bool {
	pieces := bd.pieces
	leftDiagonal, rightDiagonal := true, true

	for i := range 4 {
		if pieces[i][0].player == p && pieces[i][1].player == p && pieces[i][2].player == p && pieces[i][3].player == 0 {
			return true
		}

		if pieces[0][i].player == p && pieces[1][i].player == p && pieces[2][i].player == p && pieces[3][i].player == 0 {
			return true
		}

		if pieces[3-i][i].player != p {
			leftDiagonal = false
		}
	}

	return leftDiagonal || rightDiagonal
}
