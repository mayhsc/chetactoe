package engine

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
		source, destination := action.Move.Source, action.Move.Destination
		var newSource *Position
		var validMoves []Position
		var isWinningState bool
		var winningPlayer *Player

		switch action.ActionType {
		case Execute:
			gb.movePiece(source, destination, player)
			isWinningState = gb.board.isWinningState(player)
			if !isWinningState {
				switchTurn(&player)
				newSource = nil
			} else {
				winningPlayer = &player
			}

		case Select:
			if source.Col < 0 {
				validMoves = gb.getValidPlacements()
			} else {
				piece := gb.pieceAt(source)
				if piece != nil && piece.Player() == player {
					validMoves = piece.ValidMoves(gb.board)
				}

			}
			newSource = &source

		case Cancel:
			newSource = nil
		}

		snapshot <- GameSnapshot{
			Board:         gb.board.pieces,
			WhiteHand:     gb.handPieces(White),
			BlackHand:     gb.handPieces(Black),
			CurrentPlayer: player,
			ValidMoves:    validMoves,
			Winner:        winningPlayer,
			IsOver:        isWinningState,
			Source:        newSource,
		}
	}
}
