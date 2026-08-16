package engine

import (
	"testing"
)

func TestIsWinningState(t *testing.T) {
	pWhite := &Piece{Player: White}
	pBlack := &Piece{Player: Black}

	tests := []struct {
		name     string
		board    Board
		player   Player
		expected bool
	}{
		{
			name: "Empty board, no win",
			board: Board{
				pieces: [4][4]*Piece{},
			},
			player:   White,
			expected: false,
		},
		{
			name: "White wins with horizontal row 0",
			board: Board{
				pieces: [4][4]*Piece{
					{pWhite, pWhite, pWhite, pWhite},
					{nil, nil, nil, nil},
					{nil, nil, nil, nil},
					{nil, nil, nil, nil},
				},
			},
			player:   White,
			expected: true,
		},
		{
			name: "Black wins with vertical column 2",
			board: Board{
				pieces: [4][4]*Piece{
					{nil, nil, pBlack, nil},
					{nil, nil, pBlack, nil},
					{nil, nil, pBlack, nil},
					{nil, nil, pBlack, nil},
				},
			},
			player:   Black,
			expected: true,
		},
		{
			name: "White wins with main diagonal (top-left to bottom-right)",
			board: Board{
				pieces: [4][4]*Piece{
					{pWhite, nil, nil, nil},
					{nil, pWhite, nil, nil},
					{nil, nil, pWhite, nil},
					{nil, nil, nil, pWhite},
				},
			},
			player:   White,
			expected: true,
		},
		{
			name: "Black wins with anti-diagonal (top-right to bottom-left)",
			board: Board{
				pieces: [4][4]*Piece{
					{nil, nil, nil, pBlack},
					{nil, nil, pBlack, nil},
					{nil, pBlack, nil, nil},
					{pBlack, nil, nil, nil},
				},
			},
			player:   Black,
			expected: true,
		},
		{
			name: "Mixed pieces, no win for White",
			board: Board{
				pieces: [4][4]*Piece{
					{pWhite, pWhite, pBlack, pWhite},
					{nil, nil, nil, nil},
					{nil, nil, nil, nil},
					{nil, nil, nil, nil},
				},
			},
			player:   White,
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actual := tt.board.isWinningState(tt.player)
			if actual != tt.expected {
				t.Errorf("isWinningState() = %v, expected %v", actual, tt.expected)
			}
		})
	}
}

func TestGetAllPossibleMoves(t *testing.T) {
	gb := initializeGameBoard()

	whiteMoves := gb.getAllPossibleMoves(White)
	expectedWhiteInitialDrops := 4 * 16
	if len(whiteMoves) != expectedWhiteInitialDrops {
		t.Errorf("Expected %d initial moves for White, got %d", expectedWhiteInitialDrops, len(whiteMoves))
	}

	pawnPiece := gb.hand[0].Pieces[0]
	gb.hand[0].Pieces[0] = nil
	pawnPiece.Position = Position{Row: 1, Col: 1}
	pawnPiece.Direction = Up
	gb.board.pieces[1][1] = pawnPiece

	whiteMovesAfterDrop := gb.getAllPossibleMoves(White)
	expectedMoves := 45 + 1
	if len(whiteMovesAfterDrop) != expectedMoves {
		t.Errorf("Expected %d total moves after dropping a piece, got %d", expectedMoves, len(whiteMovesAfterDrop))
	}

	foundPawnMove := false
	for _, m := range whiteMovesAfterDrop {
		if m.Source.Row == 1 && m.Source.Col == 1 && m.Destination.Row == 2 && m.Destination.Col == 1 {
			foundPawnMove = true
			break
		}
	}

	if !foundPawnMove {
		t.Errorf("Expected to find the valid board move for the pawn from (1,1) to (2,1), but it was missing")
	}
}
