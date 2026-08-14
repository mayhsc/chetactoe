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

- **place** a piece from your hand on any empty square, or
- **move** a piece you already have in play.

Pieces move as they do in chess, on a 4×4 board. A pawn has no facing — it steps one
square in any of the four orthogonal directions. Moving onto an enemy piece **captures**
it, and a captured piece **goes back to its owner's hand**, in the slot it came from,
ready to be placed again. Nothing is ever taken out of the game: the eight pieces are
always either on the board or in a hand.

**You win with `WinLength` of your own pieces consecutively in a row, a column or a
diagonal.** `WinLength` is 4 (`internal/engine/types.go`), so on a 4×4 board that
means all four of your pieces in one line — change the constant to 3 for much shorter
games. A player who has nothing in hand and no legal move is a draw, which is the only
draw there is.

## The engine

```go
act := make(chan engine.Action)
snapshots := make(chan engine.GameSnapshot)

go engine.StartGame(act, snapshots)

opening := <-snapshots        // empty board, four pieces in each hand
act <- engine.Action{ ... }   // one action
next := <-snapshots           // the answer
```

`StartGame` owns one game and is the only thing that touches its state. Every action
gets exactly one snapshot back, so a client never has to guess whether its move landed.
Close `act` to end the game; `snapshots` closes after it.

**Actions** are `Select`, `Execute` and `Cancel`. `Select` is a read — it answers with
the squares that source may go to and changes nothing; `Execute` performs a move;
`Cancel` clears the selection. A refused `Execute` comes back with `Rejected` set and
the game untouched.

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
	Rejected      string      // why an Execute was refused; the game is unchanged
	Winner        *Player     // nil with IsOver means a draw
	IsOver        bool
}
```

Snapshots and actions both encode as JSON with names rather than numbers
(`{"type":"knight","player":"black","position":{"row":1,"col":-2}}`), because a client
that hard-codes `2 == bishop` breaks silently the day a piece type is inserted.

```bash
go test ./internal/engine/     # the rules and the protocol
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
