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
		PieceType: ptype,
		Player:    player,
		Position: Position{
			Col: index,
			Row: int(ptype),
		},
		Direction: None,
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

func (pt PieceType) Moves(position Position, bd Board, player Player) []Position {
	var moves []Position

	switch pt {
	case Knight:
		offsets := []Position{
			{1, 2}, {2, 1}, {-1, 2}, {-2, 1},
			{1, -2}, {2, -1}, {-1, -2}, {-2, -1},
		}

		var candidates []Position
		addOffset(&candidates, offsets, position)

		for _, move := range candidates {
			target := bd.pieces[move.Row][move.Col]
			if target == nil || target.Player != player {
				moves = append(moves, move)
			}
		}
		return moves

	case Bishop:
		directions := []Position{
			{1, 1}, {-1, 1}, {1, -1}, {-1, -1},
		}
		addSlidingMoves(&moves, position, directions, bd, player)

	case Rook:
		directions := []Position{
			{1, 0}, {-1, 0}, {0, 1}, {0, -1},
		}
		addSlidingMoves(&moves, position, directions, bd, player)
	}

	return moves
}

func addSlidingMoves(moves *[]Position, position Position, directions []Position, bd Board, player Player) {
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

			target := bd.pieces[current.Row][current.Col]

			if target == nil {
				*moves = append(*moves, current)
				continue
			}

			if target.Player != player {
				*moves = append(*moves, current)
			}
			break
		}
	}
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

func (p *Piece) Type() PieceType { return p.PieceType }
func (p *Piece) Pos() Position   { return p.Position }

func (p Piece) ValidMoves(bd Board) []Position {
	// Keep placing until you have enough on the board. It opens the game with
	// development instead of manoeuvring, and it is a rule now rather than a 3.
	if bd.pieceCount[int(p.Player)] < bd.rules.MinPiecesToMove {
		return nil
	}

	pos := p.Position

	if p.PieceType == Pawn {
		return p.pawnMoves(pos, bd)
	}

	return p.PieceType.Moves(pos, bd, p.Player)
}

func (p Piece) pawnMoves(pos Position, bd Board) []Position {
	var rowStep int
	switch p.Direction {
	case Down:
		rowStep = 1
	case Up:
		rowStep = -1
	default:
		return nil
	}

	var moves []Position

	forward := Position{Row: pos.Row + rowStep, Col: pos.Col}
	if validPosition(forward) && bd.pieces[forward.Row][forward.Col] == nil {
		moves = append(moves, forward)
	}

	for _, colOffset := range []int{-1, 1} {
		diag := Position{Row: pos.Row + rowStep, Col: pos.Col + colOffset}
		if !validPosition(diag) {
			continue
		}
		target := bd.pieces[diag.Row][diag.Col]
		if target != nil && target.Player != p.Player {
			moves = append(moves, diag)
		}
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
	return pos.Row >= 0 &&
		pos.Row < 4 &&
		pos.Col >= 0 &&
		pos.Col < 4
}
