package engine

import (
	"testing"
)

func TestIsWinningState(t *testing.T) {
	pWhite := &Piece{player: White}
	pBlack := &Piece{player: Black}

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
			actual := isWinningState(tt.board, tt.player)
			if actual != tt.expected {
				t.Errorf("isWinningState() = %v, expected %v", actual, tt.expected)
			}
		})
	}
}