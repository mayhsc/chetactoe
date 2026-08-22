package engine

import (
	"fmt"
	"math/rand"
	"sort"
	"strings"
)

// Self-play, so a rule change produces a number instead of an argument.
//
// This exists because neither of the rulesets that came before it could be
// argued about usefully. Four in a line with pieces returning to hand left 58% of
// games unfinished after 150 moves each; four in a line with permanent captures
// deadlocked 96% of the time, with a player left holding no legal move. Reading
// either ruleset does not show that. Playing it shows it in a minute.

// clone deep-copies a game so a player can look ahead without playing.
func (g *Game) clone() *Game {
	next := &Game{
		gb:     &GameBaord{board: g.gb.board, hand: g.gb.hand},
		p:      g.p,
		rules:  g.rules,
		moveNo: g.moveNo,
		over:   g.over,
		ending: g.ending,
		seen:   make(map[string]int, len(g.seen)),
	}

	// The board and hands hold pointers, so the arrays have to be walked.
	for r := range 4 {
		for c := range 4 {
			if piece := g.gb.board.pieces[r][c]; piece != nil {
				copied := *piece
				next.gb.board.pieces[r][c] = &copied
			}
		}
	}

	for i := range 2 {
		for slot, piece := range g.gb.hand[i].Pieces {
			if piece == nil {
				next.gb.hand[i].Pieces[slot] = nil
				continue
			}

			copied := *piece
			next.gb.hand[i].Pieces[slot] = &copied
		}
	}

	if g.winner != nil {
		won := *g.winner
		next.winner = &won
	}

	for k, v := range g.seen {
		next.seen[k] = v
	}

	return next
}

func (g *Game) winsNow(m Move) bool {
	next := g.clone()
	next.gb.movePiece(m.Source, m.Destination, next.p)

	return next.gb.board.isWinningState(g.p, g.rules.WinLength)
}

// Searcher chooses a move. Depth 0 plays at random; deeper searches alpha-beta
// with a terminal-only evaluation, so any win it reports is real rather than a
// guess from a heuristic.
type Searcher struct {
	Depth int
	Rand  *rand.Rand
}

func (s Searcher) choose(g *Game, moves []Move) Move {
	if s.Depth <= 0 {
		return moves[s.Rand.Intn(len(moves))]
	}

	best, bestScore := moves[0], -1<<30
	var ties []Move

	for _, m := range moves {
		score := 0

		if g.winsNow(m) {
			score = 1 << 20
		} else {
			next := g.clone()
			next.applyTrustedMove(m)
			score = -search(next, s.Depth-1, -(1 << 30), 1<<30)
		}

		switch {
		case score > bestScore:
			bestScore, best, ties = score, m, []Move{m}
		case score == bestScore:
			ties = append(ties, m)
		}
	}

	if len(ties) > 0 {
		return ties[s.Rand.Intn(len(ties))]
	}

	return best
}

func search(g *Game, depth, alpha, beta int) int {
	if g.over {
		if g.winner == nil {
			return 0
		}
		if *g.winner == g.p {
			return 1 << 20
		}
		return -(1 << 20)
	}

	moves := g.gb.getAllPossibleMoves(g.p)
	if len(moves) == 0 {
		return -(1 << 20)
	}

	for _, m := range moves {
		if g.winsNow(m) {
			return 1<<20 + depth
		}
	}

	if depth == 0 {
		return 0
	}

	best := -(1 << 29)

	for _, m := range moves {
		next := g.clone()
		next.applyTrustedMove(m)

		score := -search(next, depth-1, -beta, -alpha)
		if score > best {
			best = score
		}
		if best > alpha {
			alpha = best
		}
		if alpha >= beta {
			break
		}
	}

	return best
}

// Result is one finished game.
type Result struct {
	Winner *Player
	Ending Ending
	Plies  int
}

// PlayOut plays one game between two searchers, through the real game loop — the
// point is to measure the engine, not a model of it.
func PlayOut(rules RuleSet, white, black Searcher) Result {
	g := NewGameWithRules(rules)
	players := [2]Searcher{white, black}

	for !g.over {
		moves := g.gb.getAllPossibleMoves(g.p)
		if len(moves) == 0 {
			// The loop reports this itself, but a ruleset can reach it on the
			// opening move, before any turn has ended.
			won := opponent(g.p)
			return Result{Winner: &won, Ending: LostWithNoMove, Plies: g.moveNo}
		}

		g.applyTrustedMove(players[int(g.p)].choose(g, moves))
	}

	return Result{Winner: g.winner, Ending: g.ending, Plies: g.moveNo}
}

// Report is the set of numbers a ruleset is judged on.
type Report struct {
	Games      int
	WhiteWins  int
	BlackWins  int
	Draws      int
	Unresolved int // hit the ply cap: nobody was getting anywhere
	Stuck      int // a player was left with no legal move
	AvgPlies   float64
	Endings    map[Ending]int
}

// WhiteShare is the first player's cut of the decisive games.
func (r Report) WhiteShare() float64 {
	decisive := r.WhiteWins + r.BlackWins
	if decisive == 0 {
		return 0
	}

	return 100 * float64(r.WhiteWins) / float64(decisive)
}

func (r Report) String() string {
	pct := func(n int) float64 { return 100 * float64(n) / float64(max(r.Games, 1)) }

	return fmt.Sprintf("W %2.0f%% / B %2.0f%%  draws %2.0f%%  stuck %2.0f%%  avg plies %5.1f  first player %2.0f%%  %s",
		pct(r.WhiteWins), pct(r.BlackWins), pct(r.Draws), pct(r.Stuck),
		r.AvgPlies, r.WhiteShare(), r.endings())
}

func (r Report) endings() string {
	parts := make([]string, 0, 4)

	for _, e := range []Ending{WonByLine, LostWithNoMove, DrawnByRepetition, DrawnByLength} {
		if n := r.Endings[e]; n > 0 {
			parts = append(parts, fmt.Sprintf("%s %2.0f%%", e, 100*float64(n)/float64(max(r.Games, 1))))
		}
	}

	return "[" + strings.Join(parts, "  ") + "]"
}

// Measure plays a ruleset out and reports it.
func Measure(rules RuleSet, white, black Searcher, games int) Report {
	report := Report{Games: games, Endings: map[Ending]int{}}
	plies := 0

	for range games {
		result := PlayOut(rules, white, black)

		plies += result.Plies
		report.Endings[result.Ending]++

		switch {
		case result.Ending == LostWithNoMove:
			report.Stuck++
			if result.Winner != nil && *result.Winner == White {
				report.WhiteWins++
			} else {
				report.BlackWins++
			}
		case result.Winner == nil:
			report.Draws++
			if result.Ending == DrawnByLength {
				report.Unresolved++
			}
		case *result.Winner == White:
			report.WhiteWins++
		default:
			report.BlackWins++
		}
	}

	report.AvgPlies = float64(plies) / float64(max(games, 1))

	return report
}

// Opening is how one first move fared, which is what the pie rule turns on: the
// second player takes any opening that favours the mover, so the game settles on
// whichever opening is closest to even.
type Opening struct {
	Move  Move
	Score float64
	Games int
}

// MeasureOpenings plays every legal first move out and scores it.
func MeasureOpenings(rules RuleSet, player Searcher, gamesEach int) []Opening {
	opening := NewGameWithRules(rules)
	first := opening.gb.getAllPossibleMoves(White)

	out := make([]Opening, 0, len(first))

	for _, m := range first {
		wins, decisive := 0, 0

		for range gamesEach {
			g := NewGameWithRules(rules)
			g.applyTrustedMove(m)

			for !g.over {
				moves := g.gb.getAllPossibleMoves(g.p)
				if len(moves) == 0 {
					break
				}
				g.applyTrustedMove(player.choose(g, moves))
			}

			if g.winner == nil {
				continue
			}

			decisive++
			if *g.winner == White {
				wins++
			}
		}

		score := 50.0
		if decisive > 0 {
			score = 100 * float64(wins) / float64(decisive)
		}

		out = append(out, Opening{Move: m, Score: score, Games: gamesEach})
	}

	sort.Slice(out, func(i, j int) bool { return out[i].Score > out[j].Score })

	return out
}

// Variants are the rulesets worth keeping an eye on.
func Variants() map[string]RuleSet {
	noDropRules := DefaultRules()
	noDropRules.NoWinByDrop = false
	noDropRules.DropMustTouchOwn = false

	permanent := DefaultRules()
	permanent.CaptureReturnsToHand = false

	fourLine := DefaultRules()
	fourLine.WinLength = 4

	freeMove := DefaultRules()
	freeMove.MinPiecesToMove = 0

	// The two candidates the depth-2 sweep left standing, kept so the comparison
	// can be repeated: a depth-2 searcher liked four in a line, and a depth-3 one
	// left 70% of those games unfinished.
	shortTarget := DefaultRules()
	shortTarget.WinLength = 3
	shortTarget.MinPiecesToMove = 0
	shortTarget.NoWinByDrop = true
	shortTarget.DropMustTouchOwn = true

	shortTargetDev := shortTarget
	shortTargetDev.MinPiecesToMove = 2

	longTargetDrops := DefaultRules()
	longTargetDrops.NoWinByDrop = true
	longTargetDrops.DropMustTouchOwn = true

	return map[string]RuleSet{
		"win3-drops":     shortTarget,
		"win3-drops-dev": shortTargetDev,
		"win4-drops":     longTargetDrops,
		"default":        DefaultRules(),
		"legacy":         LegacyRules(),
		"no-drop-rules":  noDropRules,
		"permanent-caps": permanent,
		"four-line":      fourLine,
		"free-movement":  freeMove,
	}
}

// VariantNames is Variants in a stable order, so two runs print the same way.
func VariantNames() []string {
	names := make([]string, 0, len(Variants()))
	for name := range Variants() {
		names = append(names, name)
	}

	sort.Strings(names)

	return names
}
