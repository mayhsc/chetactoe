package main

import (
	"chetactoe/internal/engine"
)

// var assets embed.FS

func main() {
	ptype := engine.Knight

	for i := range 4 {
		for j := range 4 {
			// fmt.Printf("For: {%d, %d}", i, j)
			// for _, pos := range ptype.Moves(engine.Position{Row: i, Col: j}) {
			// 	fmt.Printf("%d\t", pos)
			// }
			pos := engine.Position{Row: i, Col: j}
			ptype.ViewMoves(pos, ptype.Moves(pos))
			print("\n")
		}
		// print("\n")
		print("\n")

	}
}
