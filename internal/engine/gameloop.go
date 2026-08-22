package engine

import "slices"

type Game struct {
	gb         *GameBaord
	p          Player
	source     *Position
	validMoves []Position
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
		ValidMoves:    g.validMoves,
		Source:        g.source,
		IsOver:        false,
	}
}

func (g *Game) executeMove(m Move) GameSnapshot {
	g.gb.movePiece(m.Source, m.Destination, g.p)
	isWinningState := g.gb.board.isWinningState(g.p)

	var winningPlayer *Player
	if isWinningState {
		winningPlayer = &g.p
	} else {
		switchTurn(&g.p)
	}

	g.source = nil
	g.validMoves = nil

	return GameSnapshot{
		Board:         g.gb.board.pieces,
		WhiteHand:     g.gb.handPieces(White),
		BlackHand:     g.gb.handPieces(Black),
		CurrentPlayer: g.p,
		Winner:        winningPlayer,
		IsOver:        isWinningState,
	}
}

func (g *Game) apply(action Action) GameSnapshot {
	source, destination := action.Move.Source, action.Move.Destination

	switch action.ActionType {
	case Execute:
		if !g.matchesSelectedSource(source) || !g.isValidDestination(destination) {
			return g.Snapshot()
		}
		return g.executeMove(action.Move)

	case Select:
		if g.isValidSource(source) {
			if source.Col < 0 {
				g.validMoves = g.gb.getValidPlacements()
			} else {
				piece := g.gb.pieceAt(source)
				g.validMoves = piece.ValidMoves(g.gb.board)
			}
			g.source = &source
		} else {
			g.source = nil
			g.validMoves = nil
		}

	case Cancel:
		g.source = nil
		g.validMoves = nil
	}

	return g.Snapshot()
}

func (g *Game) applyTrustedMove(m Move) GameSnapshot {
	if !g.isValidSource(m.Source) {
		return g.Snapshot()
	}

	var validMoves []Position
	if m.Source.Col < 0 {
		validMoves = g.gb.getValidPlacements()
	} else {
		piece := g.gb.pieceAt(m.Source)
		validMoves = piece.ValidMoves(g.gb.board)
	}

	if !slices.Contains(validMoves, m.Destination) {
		return g.Snapshot()
	}

	return g.executeMove(m)
}

func (g *Game) isValidSource(pos Position) bool {
	if pos.Col < 0 {
		hand := g.gb.handPieces(g.p)
		return pos.Row >= 0 && pos.Row < len(hand) && hand[pos.Row] != nil
	}
	piece := g.gb.pieceAt(pos)
	return piece != nil && piece.Player == g.p
}

func (g *Game) matchesSelectedSource(pos Position) bool {
	return g.source != nil && *g.source == pos
}

func (g *Game) isValidDestination(pos Position) bool {
	return slices.Contains(g.validMoves, pos)
}

func switchTurn(turn *Player) {
	if *turn == White {
		*turn = Black
	} else {
		*turn = White
	}
}
