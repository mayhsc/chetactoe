package engine

import "fmt"

func initializeGameBoard() *GameBaord {
	return &GameBaord{
		board: newBoard(),
		hand:  initializeHand(),
	}
}

func (gb *GameBaord) movePiece(oldPos Position, newPos Position, p Player) {
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

	piece.Position = newPos

	if piece.PieceType == Pawn && !toHand {
		if d, atEdge := edgeDirection(newPos.Row); atEdge {
			piece.Direction = d
		} else if inHand {
			piece.Direction = initialPawnDirection(p)
		}
	}

	if toHand {
		gb.hand[i].Pieces[r2] = piece
	} else {
		gb.board.pieces[r2][c2] = piece
		if inHand {
			gb.board.pieceCount[i]++
		}
	}
}

func edgeDirection(row int) (Direction, bool) {
	switch row {
	case 0:
		return Down, true
	case 3:
		return Up, true
	default:
		return None, false
	}
}

func initialPawnDirection(p Player) Direction {
	if p == White {
		return Down
	}
	return Up
}

func (gb *GameBaord) hasWon(p Player) bool {
	return gb.board.isWinningState(p)
}

func (gb *GameBaord) pieceAt(pos Position) *Piece {
	return gb.board.pieces[pos.Row][pos.Col]
}

func (gb *GameBaord) handPieces(p Player) [4]*Piece {
	return gb.hand[int(p)].Pieces
}

func (gb *GameBaord) validMovesFor(pos Position) []Position {
	piece := gb.board.pieces[pos.Row][pos.Col]
	if piece == nil {
		return nil
	}

	return piece.ValidMoves(gb.board)
}

func (gb GameBaord) Print(turn Player) {
	var player string
	if turn == 0 {
		player = "White"
	} else {
		player = "Black"
	}

	fmt.Print("\n=================== 4x4 BOARD ===================\n")

	fmt.Print("Black Hand: ")
	for _, piece := range gb.hand[1].Pieces {
		if piece != nil {
			fmt.Printf("%s ", gb.getLabelForPiece(piece.PieceType, piece.Player))
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
				fmt.Printf("%s\t", gb.getLabelForPiece(piece.PieceType, piece.Player))
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
			fmt.Printf("%s ", gb.getLabelForPiece(piece.PieceType, piece.Player))
		} else {
			fmt.Print("_ ")
		}
	}

	fmt.Printf("\nTurn: %s", player)
	fmt.Print("\n===============================================\n\n")
}

func (gb GameBaord) getLabelForPiece(pType PieceType, p Player) string {
	i := int(p)

	labels := [2][4]string{
		{"♟", "♞", "♝", "♜"},
		{"♙", "♘", "♗", "♖"},
	}

	return labels[i][int(pType)]
}

func (gb GameBaord) getAllPossibleMoves(p Player) []Move {
	var moves []Move

	placements := gb.getValidPlacements()

	for _, piece := range gb.hand[p].Pieces {
		if piece != nil {
			for _, placement := range placements {
				moves = append(moves, Move{
					Source:      piece.Position,
					Destination: placement,
				})
			}
		}
	}

	for _, row := range gb.board.pieces {
		for _, piece := range row {
			if piece != nil && piece.Player == p {
				for _, destination := range piece.ValidMoves(gb.board) {
					moves = append(moves, Move{
						Source:      piece.Position,
						Destination: destination,
					})

				}
			}
		}
	}

	return moves
}
