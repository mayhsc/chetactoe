# Chetactoe

A 4×4 chess/tic-tac-toe hybrid.

| directory | what |
| --- | --- |
| `internal/engine` | the game engine — board, pieces, hands, rules, bot, the action/snapshot protocol |
| `internal/ui` | the terminal client |
| `internal/network` | UDP discovery and the TCP session between two players |
| `cmd/wasm` | the engine compiled for the browser, and its JavaScript bindings |
| `cmd/sim` | self-play — plays a ruleset a few thousand times and reports whether it is a game |
| `web/` | the WebGPU web client — see [`web/README.md`](web/README.md) |

**One engine, three front ends.** The terminal, the browser and a network session all
drive `internal/engine` through the same protocol — actions in, snapshots out — and the
browser reaches it through WebAssembly rather than through a second copy of the rules
written in JavaScript. That is what `cmd/wasm` is for: a rule fixed once is fixed
everywhere.

## The rules

Two players, **four pieces each — a pawn, a knight, a bishop and a rook**. The board
starts **empty**: every piece begins in its owner's hand, and getting one into play is a
move. On your turn you do exactly one of two things: **place** a piece from your hand, or
**move** one you already have in play.

Pieces move as they do in chess, with one wrinkle: **a pawn faces away from whoever
places it**, steps one square forward, takes one square diagonally forward, and **turns
around at the far edge** — so it never becomes dead wood. Taking a piece sends it back to
its owner's hand rather than out of the game; nothing is ever destroyed.

**Three of your pieces in a row, a column or a diagonal wins.** Five rules shape how you
get there, and each is there because self-play said the game did not work without it:

- **Nothing may move until two of your pieces are on the board.** This is also the
  balance knob: with no requirement the *second* player wins more often; with three, the
  first player runs away with it.
- **A placement may not be the move that completes a line.** You have to walk a piece in,
  which costs a turn and is visible before it lands.
- **A placement must touch a piece you already have in play**, once you have any.
- **A captured piece sits out a turn** before it can be placed again, so taking something
  buys tempo rather than nothing.
- **The second player may take the first player's position** instead of replying to it,
  once, on their first turn — the pie rule.

A game nobody is winning ends: the same position three times is a draw, so is the move
cap, and a player with no legal move loses.

## Why these rules

Two rulesets came before this one and neither worked, in opposite ways. Four in a line
with captures returning to hand is unreachable against resistance — the target takes four
turns to build and one capture to undo. Four in a line with **permanent** captures is
worse: the first capture puts the win out of the victim's reach for good, and measured on
the real code, **96% of games ended with a player who had no legal move** and 62% became
unwinnable for both sides.

Neither of those is visible by reading the rules. Both take a minute to find by playing
them, which is what `cmd/sim` is for.

```
$ go run ./cmd/sim -sweep -depth 3

  win 3  move-after 2  drop-rules true    first player  57%   plies  31.9   draws  0%
  win 3  move-after 0  drop-rules true    first player  37%   plies  34.4   draws  0%
  win 4  move-after 3  drop-rules false   first player  43%   plies 181.4   draws 77%   <- does not finish
```

The last row is the trap: a **depth-2** searcher rates that ruleset 48/50 over 57 plies
and a depth-3 one leaves three quarters of the games at the move cap. Shallow self-play
will happily recommend a game that does not end.

```bash
go run ./cmd/sim                 # every variant, side by side
go run ./cmd/sim -sweep          # every combination of the knobs, ranked by balance
go run ./cmd/sim -openings       # score every first move — what the pie rule turns on
go run ./cmd/sim -check          # CI guard: does the shipped ruleset still play?
go run ./cmd/sim -depth 3 -n 60  # and never trust depth 2 on its own
```

## The engine

```go
game := engine.NewGame()                          // the measured rules
game := engine.NewGameWithRules(engine.LegacyRules())  // or any other set

snap := game.apply(engine.Action{ ... })          // one action, one snapshot back
```

**The rules are data.** `RuleSet` carries the win length, the drop restrictions, the
development requirement, the capture behaviour, the pie rule and the two termination
limits, and it travels in every snapshot so a client draws the game it is actually
playing rather than the one it was compiled against.

**Actions** are `Execute`, `Select`, `Cancel` and `Swap`. `Select` is a read — it answers
with the squares that source may go to; `Execute` plays a move and is only accepted for a
source that was selected first; `Swap` is the pie rule, legal on exactly one turn, which
the snapshot flags with `CanSwap`. An action the rules refuse comes back as a snapshot
that has simply not changed.

**Positions** address the board and both hands with one type: `Row`/`Col` inside 0–3 is a
square, and a **negative column is a hand** — `-1` White's, `-2` Black's — with `Row` as
the slot.

```bash
go test ./internal/engine/     # the rules and the protocol
go run ./cmd/sim -check        # and whether they still add up to a game
GOOS=js GOARCH=wasm go build ./cmd/wasm    # the browser build
```

## TODO
1) Drop UDP scanning and broadcasting after TCP connection has been established
2) `web/public/chetactoe.wasm` is committed, because the deploy has no Go toolchain.
   Re-run `npm run build:wasm` in `web/` after changing the engine, or the browser plays
   yesterday's rules.
3) The bot picks from `getAllPossibleMoves` without ranking them. Now that `cmd/sim` has
   an alpha-beta searcher, the bot could use it.
