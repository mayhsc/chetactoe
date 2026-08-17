package engine

import "fmt"

// StartGame owns one game under the measured ruleset. See StartGameWithRules.
func StartGame(act <-chan Action, snapshot chan<- GameSnapshot) {
	StartGameWithRules(DefaultRules(), act, snapshot)
}

// StartGameWithRules owns one game. It reads actions from act and answers every
// one with a snapshot on snapshot, so the engine's state never leaves this
// goroutine and a client only ever holds a copy.
//
// It sends the opening position before reading anything, which is what puts all
// eight pieces in the two hands and none on the board.
//
// It returns when act is closed, and closes snapshot on the way out.
func StartGameWithRules(rules RuleSet, act <-chan Action, snapshot chan<- GameSnapshot) {
	defer close(snapshot)

	gb := NewGameBoard(rules)
	player := White

	var (
		moveNo int
		winner *Player
		isOver bool
		ending Ending
	)

	// How often each position has come up. Three sightings of one position means
	// neither side is making progress, and the game says so rather than going on
	// until somebody closes the tab.
	seen := map[string]int{gb.positionKey(player): 1}

	// The pie rule is open on exactly one turn: the second player's first.
	canSwap := func() bool { return rules.SwapRule && moveNo == 1 }

	opening := gb.Snapshot(player)
	opening.CanSwap = canSwap()
	snapshot <- opening

	for action := range act {
		source, destination := action.Move.Source, action.Move.Destination

		snap := gb.Snapshot(player)
		snap.MoveNo = moveNo
		snap.Winner = winner
		snap.IsOver = isOver
		snap.Ending = ending
		snap.CanSwap = canSwap()

		// Once the game is over the position is final; an action against it is
		// answered with that same position rather than changing it.
		if isOver {
			snap.Rejected = "the game is over"
			snapshot <- snap
			continue
		}

		// Every action is applied as the player to move, so an action that says who
		// sent it has to agree. Without this a socket could move its opponent's
		// pieces simply by sending on their turn.
		if action.From != nil && *action.From != player {
			snap.Rejected = fmt.Sprintf("%v may not act on %v's turn", *action.From, player)
			snapshot <- snap
			continue
		}

		switch action.ActionType {
		case Select:
			// Reads only. A source that is empty, is the other player's, or is
			// their hand comes back with no destinations at all.
			snap.Source = &source
			snap.ValidMoves = gb.validDestinations(source, player)

		case Execute:
			captured, err := gb.MovePiece(source, destination, player)
			if err != nil {
				// Nothing moved, so leave the client holding the selection it
				// had and let it try another square.
				snap.Rejected = err.Error()
				snap.Source = &source
				snap.ValidMoves = gb.validDestinations(source, player)
				break
			}

			moveNo++

			// The board changed under us, so rebuild rather than patching the
			// copy taken before the move.
			snap = gb.Snapshot(player)
			snap.MoveNo = moveNo
			snap.LastMove = &action.Move
			snap.Captured = captured

			switch {
			case gb.board.isWinningState(player, rules.WinLength):
				// Copied, because player keeps moving after this.
				won := player
				winner, isOver, ending = &won, true, WonByLine

			default:
				// Cool the mover's own pieces at the *end* of their turn, not the
				// start of the next one. Ticking on entry would decrement a piece
				// captured a moment ago before its owner had a turn to miss, so
				// "sits out one turn" would mean sitting out nothing at all.
				gb.tick(player)
				switchTurn(&player)

				key := gb.positionKey(player)
				seen[key]++

				switch {
				case !gb.hasLegalAction(player):
					// Boxed in with nothing to place: the player to move has run
					// out of game, and loses it.
					won := opponent(player)
					winner, isOver, ending = &won, true, LostWithNoMove

				case rules.RepetitionLimit > 0 && seen[key] >= rules.RepetitionLimit:
					isOver, ending = true, DrawnByRepetition

				case rules.MaxPlies > 0 && moveNo >= rules.MaxPlies:
					isOver, ending = true, DrawnByLength
				}
			}

			snap.CurrentPlayer = player
			snap.Winner = winner
			snap.IsOver = isOver
			snap.Ending = ending
			snap.CanSwap = canSwap()

		case Swap:
			if !canSwap() {
				snap.Rejected = "the position can only be taken on the second player's first turn"
				break
			}

			gb.swapSides()
			moveNo++

			snap = gb.Snapshot(player)
			snap.MoveNo = moveNo
			snap.Swapped = true

			gb.tick(player)
			switchTurn(&player)
			seen[gb.positionKey(player)]++

			snap.CurrentPlayer = player
			snap.CanSwap = canSwap()

		case Cancel:
			// Nothing selected, nothing moved — the snapshot with no Source is
			// how the client learns to clear its highlights.
		}

		snapshot <- snap
	}
}

func switchTurn(player *Player) {
	*player = opponent(*player)
}

func opponent(p Player) Player {
	if p == White {
		return Black
	}

	return White
}
