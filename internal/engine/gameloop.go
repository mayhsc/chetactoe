package engine

import "fmt"

func StartLocalGameLoop() {
	var choice int
	turn := White
	gameboard := InitializeGameBoard()

	for !gameboard.board.isWinningState(turn) {
		gameboard.Print(turn)

		moves := gameboard.getAllPossibleMoves(turn)
		printMoves(moves)
		print("\n\nEnter your choice: ")

		_, err := fmt.Scan(&choice)
		if err != nil {
			fmt.Println("Error reading input: ", err)
		}
		move := moves[choice]

		gameboard.MovePiece(move.source, move.destination, turn)
		switchTurn(&turn)
	}
}

func printMoves(moves []Move) {
	for i, move := range moves {
		fmt.Printf("[%d]: ", i)
		printMove(move)
	}
}

func printMove(move Move) {
	fmt.Printf("(%d, %d) -> (%d, %d)", move.source.Row, move.source.Col, move.destination.Row, move.destination.Col)
}

func switchTurn(turn *Player) {
	if (*turn == White) {
		*turn = Black
	} else {
		*turn = White
	}
}