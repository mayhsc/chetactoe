# Chetactoe

A 4×4 chess/tic-tac-toe hybrid.

| directory | what |
| --- | --- |
| `internal/engine` | the game engine — board, pieces, hands, rules, the action/snapshot protocol |
| `internal/network` | UDP discovery and the TCP session between two players |
| `web/` | the WebGPU web client — see [`web/README.md`](web/README.md) |

## The rules

Two players, **four pieces each — a pawn, a knight, a bishop and a rook**. The board
starts **empty**: every piece begins in its owner's hand, off the board, and getting
it into play is a move.

On your turn you do exactly one of two things:

- **place** a piece from your hand, or
- **move** a piece you already have in play.

Pieces move as they do in chess, on a 4×4 board. A pawn has no facing — it steps one
square in any of the four orthogonal directions. Moving onto an enemy piece **captures**
it, and a captured piece **goes back to its owner's hand**, in the slot it came from.
Nothing is ever taken out of the game: the eight pieces are always either on the board
or in a hand.

**Three of your pieces in a row, a column or a diagonal wins.** Four rules shape how
you get there, and every one of them is there because self-play said the game did not
work without it:

- **A placement may not be the move that completes a line.** You have to walk a piece
  in, which takes a turn longer and is visible to your opponent before it lands.
- **A placement must touch a piece you already have in play**, once you have any. The
  reserve builds a position rather than parachuting into one.
- **A captured piece sits out a turn** before it can be placed again, so taking
  something buys tempo rather than nothing at all.
- **The second player may take the first player's position** instead of replying to
  it — once, on their first turn. This is the pie rule, and it is what stops moving
  first from being decisive.

A game nobody is winning ends: the same position three times is a **draw**, so is
hitting the move limit, and a player with no legal move at all **loses**.

## Why these rules

The first version of this game did not work, and it took a self-play harness to see
why. Four in a line with four pieces and free re-placement is unreachable — the target
takes four turns to build and one capture to undo — so **58% of games between competent
players were unfinished after 150 moves each.** Lowering the target to three fixed
that and broke it the other way: with a piece droppable on any square, making a line is
a race, and **the first player won 92%** of games against a depth-4 searcher.

What fixed it was restricting the drops, and then handing the second player the swap:

```
$ go run ./cmd/sim

  classic          W 53% / B 44%  draws  4%  avg plies  59.7  first-player share 55%
  default          W 65% / B 35%  draws  0%  avg plies  12.8  first-player share 65%
  no-restriction   W 78% / B 21%  draws  0%  avg plies   8.2  first-player share 79%

$ go run ./cmd/sim -openings

  strongest opening         80%   (what the opener gets with no swap rule)
  most even opening         50%   — and it is all they can play, because anything
                                    better than even is taken off them
```

The harness is `cmd/sim` and it is the point: a rule change produces a number instead
of an argument.

```bash
go run ./cmd/sim                          # every variant, side by side
go run ./cmd/sim -variant classic -n 500  # one of them, harder
go run ./cmd/sim -depth 4 -n 60           # against a real searcher
go run ./cmd/sim -openings                # score every first move
go run ./cmd/sim -check                   # CI guard: does the shipped ruleset still play?
```

`-check` holds the shipped rules to the targets that matter — over 98% of games
finishing, a sane length, a first player who is not simply winning, and a deeper
search beating a shallower one — and exits non-zero if a rule change breaks one.

## The engine

```go
act := make(chan engine.Action)
snapshots := make(chan engine.GameSnapshot)

go engine.StartGame(act, snapshots)                            // the measured rules
go engine.StartGameWithRules(engine.ClassicRules(), act, snap) // or any other set

opening := <-snapshots        // empty board, four pieces in each hand
act <- engine.Action{ ... }   // one action
next := <-snapshots           // the answer
```

**The rules are data**, not constants: `RuleSet` carries the win length, the drop
restrictions, the capture cooldown, the pie rule and the two termination limits, and it
travels in every snapshot so a client draws the game it is actually playing rather than
the one it was compiled against. `DefaultRules()` is what came out of the measurements
above; `ClassicRules()` is the original design, kept because it is what any new variant
has to beat.

`StartGame` owns one game and is the only thing that touches its state. Every action
gets exactly one snapshot back, so a client never has to guess whether its move landed.
Close `act` to end the game; `snapshots` closes after it.

**Actions** are `Select`, `Execute`, `Cancel` and `Swap`. `Select` is a read — it answers with
the squares that source may go to and changes nothing; `Execute` performs a move;
`Cancel` clears the selection; `Swap` is the pie rule and is legal only on the second
player's first turn, which the snapshot flags with `CanSwap`. A refused action comes
back with `Rejected` set and the game untouched.

**Positions** address the board and both hands with one type. `Row`/`Col` inside 0–3 is
a square; a **negative column is a hand** — `-1` White's, `-2` Black's — with `Row` as
the slot. Each player owns one piece of each type, so a slot is the piece type's own
index, which is what gives a captured piece a slot to come back to. `HandCol`,
`InHand` and `HandOwner` are the helpers; nothing else should be doing the arithmetic.

**Snapshots** are copies, not views. The pieces in one are detached from the engine's,
so a client that holds a snapshot cannot be shown a board that changed underneath it,
and the engine cannot be mutated through one.

```go
type GameSnapshot struct {
	Board         [4][4]*Piece
	WhiteHand     [4]*Piece
	BlackHand     [4]*Piece
	CurrentPlayer Player
	Source        *Position   // what the last Select named
	ValidMoves    []Position  // and where it may go
	LastMove      *Move       // the move just executed
	Captured      *Piece      // which piece it sent back to a hand
	MoveNo        int
	Rejected      string      // why an action was refused; the game is unchanged
	CanSwap       bool        // the pie rule is open this turn
	Winner        *Player     // nil with IsOver means a draw
	IsOver        bool
	Ending        Ending      // won, repetition, length, or no-move
	Rules         RuleSet     // the game being played, not the one you compiled
}
```

Snapshots and actions both encode as JSON with names rather than numbers
(`{"type":"knight","player":"black","position":{"row":1,"col":-2}}`), because a client
that hard-codes `2 == bishop` breaks silently the day a piece type is inserted.

```bash
go test ./internal/engine/     # the rules and the protocol
go run ./cmd/sim -check        # and whether they still add up to a game
```

## Wiring the web client to the engine

The web client in `web/` plays a complete game **on its own** today: `web/src/game.js`
is the same rules in JavaScript, deliberately mirroring this package — the same hand of
four, the same capture-back-to-hand, the same win length, the same select / execute /
cancel. `web/tools/check-rules.mjs` and `internal/engine/engine_test.go` put the same
cases to the two of them, so a disagreement shows up as a failing check.

That is enough for one browser. It is not enough for two people on two machines, and
for that the engine has to be the only thing deciding anything. What is missing is a
transport, not rules:

1. **A WebSocket per session.** `StartGame` already has exactly the right shape for it
   — actions in, snapshots out, one goroutine — so the server end is a read loop that
   decodes an `Action` and writes back the `GameSnapshot` it gets. `net/http` plus a
   WebSocket library is the whole dependency.
2. **Tell each client which player it is.** A snapshot is symmetric and does not say
   who is looking at it. Send a hello frame with the player on connect; the client
   already draws whichever side the snapshot names.
3. **Fill in `Action.From` from the connection, never from the body.** The engine
   applies every action as the player whose turn it is, so without this either end of
   a socket could move the other's pieces simply by sending on their turn.
   `StartGame` refuses an action whose `From` disagrees with the player to move; nil
   means a trusted local caller, which is the hot-seat case and the tests.
4. **Replace `apply()` with a send in the client.** `web/src/game.js` exposes
   `toAction()`, `toPosition()` and `fromPosition()` for exactly that: the shell in
   `app.js` draws whatever state it is handed, so swapping the local rules for
   snapshots off a socket is a change in one place rather than a rewrite. Keep the JS
   rules for offline play and for the move hints, which do not need a round trip.

The existing `internal/network` handshake is the other half — two players find each
other over UDP and open a TCP session — but it currently only agrees to start and then
hands back a bare connection. The same JSON frames would work over that socket
unchanged, with the host running `StartGame`.

## TODO
1) Drop UDP scanning and broadcasting after TCP connection has been established
2) Serve the game over a WebSocket so the engine, not the browser, is the referee
   (see above)
3) The four pieces still do not earn their differences on a 4×4: the rook moves 6 ways
   from every square, the pawn and knight 3, and **the bishop can only ever reach 8 of
   the 16 squares**, which reads as a bug to anyone playing it. Giving the pawn a facing
   and letting the bishop change colour with a one-square step is the next ruleset
   change worth measuring.
4) Games run short — about 13 plies against a depth-2 searcher. If they should be
   longer, the lever is a 5×5 board with four in a line, which is a bigger change than
   it sounds: the board geometry and the camera fit are both matched to 4×4.
