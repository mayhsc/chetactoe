package engine

import "fmt"

func initializeGameBoard(rules RuleSet) *GameBaord {
	gb := &GameBaord{
		board: newBoard(),
		hand:  initializeHand(),
	}

	// The rules live on the board because that is what move generation reads.
	// Forgetting this line is silent and expensive: every rule that shapes where a
	// piece may be dropped comes back false, four different rulesets measure
	// identically, and nothing fails. TestRulesReachTheBoard exists for that.
	gb.board.rules = rules

	return gb
}

func (gb *GameBaord) movePiece(oldPos Position, newPos Position, p Player) *Piece {
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

	var taken *Piece

	if !toHand {
		if captured := gb.board.pieces[r2][c2]; captured != nil {
			taken = captured

			gb.board.pieceCount[int(captured.Player)]--

			// Back to its owner's reserve rather than out of the game. Permanent
			// capture measured badly: with a line needing WinLength pieces, the
			// first capture puts the win out of the victim's reach for good, and
			// most games became unwinnable for both sides.
			if gb.board.rules.CaptureReturnsToHand {
				gb.returnToHand(captured)
			}
		}
	}

	piece.Position = newPos
	piece.Cooldown = 0

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

	return taken
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

// tick counts down this player's captured pieces. Called at the end of their own
// turn, not the start of the next one: ticking on entry would decrement a piece
// captured a moment ago before its owner had a turn to miss, so "sits out one
// turn" would mean sitting out nothing.
func (gb *GameBaord) tick(p Player) {
	for _, piece := range gb.hand[int(p)].Pieces {
		if piece != nil && piece.Cooldown > 0 {
			piece.Cooldown--
		}
	}
}

// positionKey identifies a position for repetition detection: what stands where,
// what is waiting in each hand, and whose turn it is.
func (gb *GameBaord) positionKey(toMove Player) string {
	key := make([]byte, 0, 32)

	for r := range 4 {
		for c := range 4 {
			piece := gb.board.pieces[r][c]
			if piece == nil {
				key = append(key, '.')
				continue
			}

			key = append(key, byte('a'+int(piece.PieceType)+4*int(piece.Player)))
		}
	}

	for _, hand := range gb.hand {
		key = append(key, '|')
		for _, piece := range hand.Pieces {
			switch {
			case piece == nil:
				key = append(key, '.')
			case piece.Ready():
				key = append(key, 'r')
			default:
				key = append(key, byte('0'+piece.Cooldown))
			}
		}
	}

	return string(append(key, '|', byte('0'+int(toMove))))
}

// swapSides hands every piece to the other player — the pie rule, applied. The
// seats do not move: whoever was playing White still is, but the position they
// just built now belongs to their opponent and they are the one to move with
// nothing on the board.
func (gb *GameBaord) swapSides() {
	for r := range 4 {
		for c := range 4 {
			if piece := gb.board.pieces[r][c]; piece != nil {
				piece.Player = opponent(piece.Player)
				if piece.PieceType == Pawn {
					piece.Direction = flipDirection(piece.Direction)
				}
			}
		}
	}

	gb.board.pieceCount[0], gb.board.pieceCount[1] = gb.board.pieceCount[1], gb.board.pieceCount[0]
	gb.hand[0].Pieces, gb.hand[1].Pieces = gb.hand[1].Pieces, gb.hand[0].Pieces

	for i := range 2 {
		for _, piece := range gb.hand[i].Pieces {
			if piece == nil {
				continue
			}

			piece.Player = Player(i)
			piece.Position = Position{Row: int(piece.PieceType), Col: handCol(Player(i))}
		}
	}
}

func flipDirection(d Direction) Direction {
	switch d {
	case Up:
		return Down
	case Down:
		return Up
	}

	return d
}

func handCol(p Player) int {
	if p == White {
		return -1
	}

	return -2
}

func opponent(p Player) Player {
	if p == White {
		return Black
	}

	return White
}

// hasAnyMove reports whether the player has anything at all they may do. With
// drops restricted this is reachable, and it loses the game for whoever it
// happens to.
func (gb *GameBaord) hasAnyMove(p Player) bool {
	return len(gb.getAllPossibleMoves(p)) > 0
}

func (gb *GameBaord) hasWon(p Player) bool {
	return gb.board.isWinningState(p, gb.board.rules.WinLength)
}

// returnToHand puts a captured piece back in its owner's hand. Its slot is its
// own type's index and each player owns one of each type, so the slot it left is
// always the one waiting for it.
func (gb *GameBaord) returnToHand(piece *Piece) {
	slot := int(piece.PieceType)

	piece.Position = Position{Row: slot, Col: handCol(piece.Player)}
	piece.Cooldown = gb.board.rules.CaptureCooldown
	piece.Direction = None

	gb.hand[int(piece.Player)].Pieces[slot] = piece
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

	for _, piece := range gb.hand[p].Pieces {
		if piece != nil {
			for _, placement := range gb.getValidPlacements(piece, p) {
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
