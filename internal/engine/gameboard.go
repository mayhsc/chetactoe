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

	matchesPlayer := func(row, col int) bool {
		piece := pieces[row][col]
		return piece != nil && piece.player == p
	}

	for i := range 4 {
		if matchesPlayer(i, 0) && matchesPlayer(i, 1) && matchesPlayer(i, 2) && matchesPlayer(i, 3) {
			return true
		}

		if matchesPlayer(0, i) && matchesPlayer(1, i) && matchesPlayer(2, i) && matchesPlayer(3, i) {
			return true
		}

		if !matchesPlayer(i, i) {
			leftDiagonal = false
		}

		if !matchesPlayer(3-i, i) {
			rightDiagonal = false
		}

	}

	return leftDiagonal || rightDiagonal
}
