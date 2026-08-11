package engine

// import "fmt"

// func StartLocalGameLoop() {
// 	var choice int
// 	turn := White
// 	gameboard := InitializeGameBoard()

// 	for !gameboard.board.isWinningState(turn) {
// 		gameboard.Print(turn)

// 		moves := gameboard.getAllPossibleMoves(turn)
// 		printMoves(moves)
// 		print("\n\nEnter your choice: ")

// 		_, err := fmt.Scan(&choice)
// 		if err != nil {
// 			fmt.Println("Error reading input: ", err)
// 		}
// 		move := moves[choice]

// 		gameboard.MovePiece(move.source, move.destination, turn)
// 		switchTurn(&turn)
// 	}
// }

// func printMoves(moves []Move) {
// 	for i, move := range moves {
// 		fmt.Printf("[%d]: ", i)
// 		printMove(move)
// 	}
// }

// func printMove(move Move) {
// 	fmt.Printf("(%d, %d) -> (%d, %d)", move.source.Row, move.source.Col, move.destination.Row, move.destination.Col)
// }

func switchTurn(turn *Player) {
	if *turn == White {
		*turn = Black
	} else {
		*turn = White
	}
}

func StartGame(act <-chan Action, snapshot chan<- GameSnapshot) {
	gb := initializeGameBoard()
	player := White

	snapshot <- GameSnapshot{
		Board:         gb.board.pieces,
		WhiteHand:     gb.handPieces(White),
		BlackHand:     gb.handPieces(Black),
		CurrentPlayer: player,
		IsOver:        false,
	}

	for action := range act {
		source, destination := action.Move.source, action.Move.destination
		var validMoves []Position
		var isWinningState bool

		switch action.ActionType {
		case Execute:
			gb.movePiece(source, destination, player)
			isWinningState = gb.board.isWinningState(player)
			if !isWinningState {
				switchTurn(&player)

			}

		case Select:
			piece := gb.pieceAt(source)
			if piece != nil && piece.Player() == player {
				validMoves = piece.ValidMoves(gb.board)
			}
		case Cancel:
		}

		snapshot <- GameSnapshot{
			Board:         gb.board.pieces,
			WhiteHand:     gb.handPieces(White),
			BlackHand:     gb.handPieces(Black),
			CurrentPlayer: player,
			ValidMoves:    validMoves,
			Winner:        player,
			IsOver:        isWinningState,
			Source:        &source,
		}
	}
}
