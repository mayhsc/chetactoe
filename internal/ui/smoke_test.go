package ui

import (
	"chetactoe/internal/engine"
	"fmt"
	"testing"
)

func TestRenderSmoke(t *testing.T) {
	m := New()
	fmt.Println("=== initial ===")
	fmt.Println(m.View())

	pieces := m.game.HandPieces(engine.White)
	for i, p := range pieces {
		if p != nil {
			m.game.MovePiece(engine.Position{Row: i, Col: -1}, engine.Position{Row: i, Col: 0}, engine.White)
			break
		}
	}
	fmt.Println("=== after one placement ===")
	fmt.Println(m.View())
}
