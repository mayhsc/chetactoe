package main

import (
	"chetactoe/internal/engine"
	"fmt"
)

// var assets embed.FS

func main() {
	ptype := engine.Pawn

	for i := range 4 {
		for j := range 4 {
			for _, pos := range ptype.Moves(engine.Position{Row: i, Col: j}) {
				fmt.Printf("%d\t", pos)
			}
			print("\n")
		}
		print("\n")
		print("\n")

	}
}
