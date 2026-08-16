package engine

type Game struct {
	gb *GameBaord
	p  Player
}

func NewGame() *Game {
	return &Game{
		gb: initializeGameBoard(),
		p:  White,
	}
}

func (g *Game) Snapshot() GameSnapshot {
	return GameSnapshot{
		Board:         g.gb.board.pieces,
		WhiteHand:     g.gb.handPieces(White),
		BlackHand:     g.gb.handPieces(Black),
		CurrentPlayer: g.p,
	}
}

func (g *Game) apply(action Action) GameSnapshot {
	source, destination := action.Move.Source, action.Move.Destination
	var newSource *Position
	var validMoves []Position
	var isWinningState bool
	var winningPlayer *Player

	switch action.ActionType {
	case Execute:
		g.gb.movePiece(source, destination, g.p)
		isWinningState = g.gb.board.isWinningState(g.p)
		if !isWinningState {
			switchTurn(&g.p)
			newSource = nil
		} else {
			winningPlayer = &g.p
		}

	case Select:
		if source.Col < 0 {
			validMoves = g.gb.getValidPlacements()
		} else {
			piece := g.gb.pieceAt(source)
			if piece != nil && piece.Player == g.p {
				validMoves = piece.ValidMoves(g.gb.board)
			}

		}
		newSource = &source

	case Cancel:
		newSource = nil
	}

	return GameSnapshot{
		Board:         g.gb.board.pieces,
		WhiteHand:     g.gb.handPieces(White),
		BlackHand:     g.gb.handPieces(Black),
		CurrentPlayer: g.p,
		ValidMoves:    validMoves,
		Winner:        winningPlayer,
		IsOver:        isWinningState,
		Source:        newSource,
	}
}

func switchTurn(turn *Player) {
	if *turn == White {
		*turn = Black
	} else {
		*turn = White
	}
}
