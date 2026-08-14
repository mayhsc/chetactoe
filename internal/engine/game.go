package engine

import "fmt"

// StartGame owns one game. It reads actions from act and answers every one with
// a snapshot on snapshot, so the engine's state never leaves this goroutine and a
// client only ever holds a copy.
//
// It sends the opening position before reading anything, which is what puts all
// eight pieces in the two hands and none on the board.
//
// It returns when act is closed, and closes snapshot on the way out.
func StartGame(act <-chan Action, snapshot chan<- GameSnapshot) {
	defer close(snapshot)

	gb := InitializeGameBoard()
	player := White

	var (
		moveNo int
		winner *Player
		isOver bool
	)

	snapshot <- gb.Snapshot(player)

	for action := range act {
		source, destination := action.Move.Source, action.Move.Destination

		snap := gb.Snapshot(player)
		snap.MoveNo = moveNo
		snap.Winner = winner
		snap.IsOver = isOver

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
			case gb.board.isWinningState(player):
				// Copied, because player keeps moving after this.
				won := player
				winner, isOver = &won, true

			case !gb.hasLegalAction(opponent(player)):
				// Every piece of theirs is in play and boxed in: a draw, so no
				// winner is set.
				isOver = true

			default:
				switchTurn(&player)
			}

			snap.CurrentPlayer = player
			snap.Winner = winner
			snap.IsOver = isOver

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
