package engine

import "slices"

type Game struct {
	gb         *GameBaord
	p          Player
	source     *Position
	validMoves []Position

	rules  RuleSet
	moveNo int
	winner *Player
	ending Ending
	over   bool

	// how often each position has come up, so a game nobody is winning ends
	seen map[string]int
}

// NewGame starts a game under the measured ruleset.
func NewGame() *Game {
	return NewGameWithRules(DefaultRules())
}

// NewGameWithRules starts a game under any ruleset, which is how `cmd/sim` plays
// a matrix of them without a patch.
func NewGameWithRules(rules RuleSet) *Game {
	g := &Game{
		gb:    initializeGameBoard(rules),
		p:     White,
		rules: rules,
		seen:  map[string]int{},
	}

	g.seen[g.gb.positionKey(g.p)] = 1

	return g
}

// Rules is the ruleset this game is being played under.
func (g *Game) Rules() RuleSet { return g.rules }

// canSwap reports whether the pie rule is open — the second player's first turn,
// and only then.
func (g *Game) canSwap() bool {
	return g.rules.SwapRule && g.moveNo == 1 && !g.over
}

func (g *Game) Snapshot() GameSnapshot {
	return GameSnapshot{
		Board:         g.gb.board.pieces,
		WhiteHand:     g.gb.handPieces(White),
		BlackHand:     g.gb.handPieces(Black),
		CurrentPlayer: g.p,
		ValidMoves:    g.validMoves,
		Source:        g.source,
		Winner:        g.winner,
		IsOver:        g.over,
		Ending:        g.ending,
		CanSwap:       g.canSwap(),
		MoveNo:        g.moveNo,
		Rules:         g.rules,
		WinningLine:   g.winningLine(),
	}
}

// winningLine is the run that ended the game, or nothing while it is still on.
func (g *Game) winningLine() []Position {
	if !g.over || g.winner == nil {
		return nil
	}

	return g.gb.board.winningLine(*g.winner, g.rules.WinLength)
}

func (g *Game) executeMove(m Move) GameSnapshot {
	captured := g.gb.movePiece(m.Source, m.Destination, g.p)
	g.moveNo++

	g.source = nil
	g.validMoves = nil

	mover := g.p

	if g.gb.board.isWinningState(g.p, g.rules.WinLength) {
		won := g.p
		g.winner, g.over, g.ending = &won, true, WonByLine
	} else {
		g.endTurn()
	}

	snap := g.Snapshot()
	snap.LastMove = &m
	snap.Captured = captured

	// Whose move it was, which the snapshot's CurrentPlayer no longer says once
	// the turn has passed.
	snap.LastMover = &mover

	return snap
}

// endTurn cools the mover's own pieces, hands over, and then looks for the
// endings a game nobody is winning needs. The original loop ended only on a win,
// which is why games without one simply went on.
func (g *Game) endTurn() {
	g.gb.tick(g.p)
	switchTurn(&g.p)

	if !g.gb.hasAnyMove(g.p) {
		// Boxed in with nothing to place: the player to move has run out of game.
		won := opponent(g.p)
		g.winner, g.over, g.ending = &won, true, LostWithNoMove

		return
	}

	key := g.gb.positionKey(g.p)
	g.seen[key]++

	switch {
	case g.rules.RepetitionLimit > 0 && g.seen[key] >= g.rules.RepetitionLimit:
		g.over, g.ending = true, DrawnByRepetition

	case g.rules.MaxPlies > 0 && g.moveNo >= g.rules.MaxPlies:
		g.over, g.ending = true, DrawnByLength
	}
}

func (g *Game) apply(action Action) GameSnapshot {
	if g.over {
		return g.Snapshot()
	}

	source, destination := action.Move.Source, action.Move.Destination

	switch action.ActionType {
	case Execute:
		if !g.matchesSelectedSource(source) || !g.isValidDestination(destination) {
			return g.Snapshot()
		}
		return g.executeMove(action.Move)

	case Swap:
		if !g.canSwap() {
			return g.Snapshot()
		}
		return g.executeSwap()

	case Select:
		if g.isValidSource(source) {
			g.validMoves = g.destinationsFor(source)
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

// executeSwap is the pie rule. It counts as the second player's move, so the turn
// passes as normal and the opener is left to play on without the position they
// built.
func (g *Game) executeSwap() GameSnapshot {
	g.gb.swapSides()
	g.moveNo++

	g.source = nil
	g.validMoves = nil

	g.endTurn()

	snap := g.Snapshot()
	snap.Swapped = true

	return snap
}

// destinationsFor is the single source of truth for where one source may go, so
// Select lights up exactly what Execute will accept.
func (g *Game) destinationsFor(source Position) []Position {
	if source.Col < 0 {
		return g.gb.getValidPlacements(g.gb.handPiece(g.p, source.Row), g.p)
	}

	piece := g.gb.pieceAt(source)
	if piece == nil {
		return nil
	}

	return piece.ValidMoves(g.gb.board)
}

func (g *Game) applyTrustedMove(m Move) GameSnapshot {
	if g.over || !g.isValidSource(m.Source) {
		return g.Snapshot()
	}

	if !slices.Contains(g.destinationsFor(m.Source), m.Destination) {
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
	*turn = opponent(*turn)
}
