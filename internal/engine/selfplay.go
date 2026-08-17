package engine

import (
	"fmt"
	"math/rand"
	"sort"
	"strings"
)

// Self-play, so a rule change produces a number instead of an argument.
//
// This exists because the original ruleset could not be argued about usefully:
// four-in-a-line looked reasonable and measured as unplayable — 58% of games
// between competent players unfinished after 150 moves each — while the obvious
// fix, three-in-a-line, measured as a first-player race won 92% of the time.
// Neither of those is visible by reading the rules. Both take thirty seconds to
// find by playing them.

// Action pairs for the harness. Move is the engine's own type; this is just the
// list of everything one player may do.
func (gb *GameBoard) legalActions(p Player) []Move {
	var out []Move

	for slot := range HandSize {
		source := Position{Row: slot, Col: HandCol(p)}
		for _, dst := range gb.validDestinations(source, p) {
			out = append(out, Move{Source: source, Destination: dst})
		}
	}

	for r := range Cells {
		for c := range Cells {
			source := Position{Row: r, Col: c}
			for _, dst := range gb.validDestinations(source, p) {
				out = append(out, Move{Source: source, Destination: dst})
			}
		}
	}

	return out
}

// clone deep-copies a game so a player can look ahead without playing.
func (gb *GameBoard) clone() *GameBoard {
	out := &GameBoard{rules: gb.rules}

	copyPiece := func(p *Piece) *Piece {
		if p == nil {
			return nil
		}
		c := *p
		return &c
	}

	for r := range Cells {
		for c := range Cells {
			out.board.pieces[r][c] = copyPiece(gb.board.pieces[r][c])
		}
	}

	for i := range 2 {
		out.hand[i].player = gb.hand[i].player
		for slot := range HandSize {
			out.hand[i].Pieces[slot] = copyPiece(gb.hand[i].Pieces[slot])
		}
	}

	return out
}

func (gb *GameBoard) winsNow(p Player, m Move) bool {
	next := gb.clone()
	if _, err := next.MovePiece(m.Source, m.Destination, p); err != nil {
		return false
	}

	return next.board.isWinningState(p, next.rules.WinLength)
}

// Player is a way of choosing a move. Depth 0 plays at random; depth 1 takes a
// win if it sees one; deeper searches alpha-beta with a terminal-only evaluation,
// so any win it reports is real rather than a guess from a heuristic.
type Searcher struct {
	Depth int
	Rand  *rand.Rand
}

func (s Searcher) choose(gb *GameBoard, p Player, acts []Move) Move {
	if s.Depth <= 0 {
		return acts[s.Rand.Intn(len(acts))]
	}

	best, bestScore := acts[0], -1<<30
	var ties []Move

	for _, m := range acts {
		next := gb.clone()
		if _, err := next.MovePiece(m.Source, m.Destination, p); err != nil {
			continue
		}

		score := 0
		if next.board.isWinningState(p, next.rules.WinLength) {
			score = 1 << 20
		} else {
			next.tick(p)
			score = -search(next, opponent(p), s.Depth-1, -(1 << 30), 1<<30)
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

func search(gb *GameBoard, p Player, depth, alpha, beta int) int {
	acts := gb.legalActions(p)
	if len(acts) == 0 {
		return -(1 << 20) // no legal action loses
	}

	for _, m := range acts {
		if gb.winsNow(p, m) {
			return 1<<20 + depth
		}
	}

	if depth == 0 {
		return 0
	}

	best := -(1 << 29)

	for _, m := range acts {
		next := gb.clone()
		if _, err := next.MovePiece(m.Source, m.Destination, p); err != nil {
			continue
		}

		next.tick(p)
		score := -search(next, opponent(p), depth-1, -beta, -alpha)

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

// PlayOut plays one game between two searchers and reports how it ended. It runs
// the real move generator and the real win check — the point is to measure the
// engine, not a model of it.
func PlayOut(rules RuleSet, white, black Searcher) Result {
	game := NewGameBoard(rules)
	gb := &game

	return playOut(gb, rules, [2]Searcher{white, black}, White, 1)
}

// playRest continues a game already in progress with one searcher on both sides.
func playRest(gb *GameBoard, rules RuleSet, player Searcher, toMove Player, ply int) Result {
	return playOut(gb, rules, [2]Searcher{player, player}, toMove, ply)
}

func playOut(gb *GameBoard, rules RuleSet, players [2]Searcher, player Player, startPly int) Result {
	seen := map[string]int{gb.positionKey(player): 1}

	for ply := startPly; ; ply++ {
		acts := gb.legalActions(player)
		if len(acts) == 0 {
			won := opponent(player)
			return Result{Winner: &won, Ending: LostWithNoMove, Plies: ply - 1}
		}

		m := players[int(player)].choose(gb, player, acts)

		if _, err := gb.MovePiece(m.Source, m.Destination, player); err != nil {
			panic(fmt.Sprintf("harness played an illegal move: %v", err))
		}

		if gb.board.isWinningState(player, rules.WinLength) {
			won := player
			return Result{Winner: &won, Ending: WonByLine, Plies: ply}
		}

		gb.tick(player)
		player = opponent(player)

		key := gb.positionKey(player)
		seen[key]++

		if rules.RepetitionLimit > 0 && seen[key] >= rules.RepetitionLimit {
			return Result{Ending: DrawnByRepetition, Plies: ply}
		}

		if rules.MaxPlies > 0 && ply >= rules.MaxPlies {
			return Result{Ending: DrawnByLength, Plies: ply}
		}
	}
}

// Report is the set of numbers a ruleset is judged on.
type Report struct {
	Games      int
	WhiteWins  int
	BlackWins  int
	Draws      int
	Unresolved int // drawn by hitting the ply cap: nobody was getting anywhere
	AvgPlies   float64
	Endings    map[Ending]int
}

func (r Report) WhiteShare() float64 {
	decisive := r.WhiteWins + r.BlackWins
	if decisive == 0 {
		return 0
	}

	return 100 * float64(r.WhiteWins) / float64(decisive)
}

func (r Report) String() string {
	pct := func(n int) float64 { return 100 * float64(n) / float64(max(r.Games, 1)) }

	return fmt.Sprintf("W %2.0f%% / B %2.0f%%  draws %2.0f%% (cap %2.0f%%)  avg plies %5.1f  first-player share %2.0f%%  %s",
		pct(r.WhiteWins), pct(r.BlackWins), pct(r.Draws), pct(r.Unresolved), r.AvgPlies, r.WhiteShare(), r.endings())
}

// endings names how the games actually finished, which is the difference between
// a ruleset that produces games and one that produces stalemates and strandings.
func (r Report) endings() string {
	parts := make([]string, 0, 4)

	for _, e := range []Ending{WonByLine, LostWithNoMove, DrawnByRepetition, DrawnByLength} {
		if n := r.Endings[e]; n > 0 {
			parts = append(parts, fmt.Sprintf("%s %2.0f%%", e, 100*float64(n)/float64(max(r.Games, 1))))
		}
	}

	return "[" + strings.Join(parts, "  ") + "]"
}

// Opening is how one first move fared, which is what the pie rule turns on: the
// second player takes any opening that favours the mover, so the game settles on
// whichever opening is closest to even. A spread here means the swap has work to
// do; a flat set of openings means it has none.
type Opening struct {
	Move  Move
	Score float64 // the opener's share of decisive games, 0-100
	Games int
}

// MeasureOpenings plays every legal first move out and reports each one's score.
func MeasureOpenings(rules RuleSet, player Searcher, gamesEach int) []Opening {
	game := NewGameBoard(rules)
	first := (&game).legalActions(White)

	out := make([]Opening, 0, len(first))

	for _, opening := range first {
		wins, decisive := 0, 0

		for range gamesEach {
			result := playFrom(rules, opening, player)

			if result.Winner == nil {
				continue
			}

			decisive++
			if *result.Winner == White {
				wins++
			}
		}

		score := 50.0
		if decisive > 0 {
			score = 100 * float64(wins) / float64(decisive)
		}

		out = append(out, Opening{Move: opening, Score: score, Games: gamesEach})
	}

	sort.Slice(out, func(i, j int) bool { return out[i].Score > out[j].Score })

	return out
}

// playFrom plays a game whose first move is fixed.
func playFrom(rules RuleSet, opening Move, player Searcher) Result {
	game := NewGameBoard(rules)
	gb := &game

	if _, err := gb.MovePiece(opening.Source, opening.Destination, White); err != nil {
		panic(err)
	}

	gb.tick(White)

	return playRest(gb, rules, player, Black, 1)
}

// Measure plays a ruleset out `games` times and reports it.
func Measure(rules RuleSet, white, black Searcher, games int) Report {
	report := Report{Games: games, Endings: map[Ending]int{}}
	plies := 0

	for range games {
		result := PlayOut(rules, white, black)

		plies += result.Plies
		report.Endings[result.Ending]++

		switch {
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

// Variants are the rulesets worth keeping an eye on: the one being shipped, the
// one it replaced, and the near misses. `cmd/sim` plays them all.
func Variants() map[string]RuleSet {
	classicNoDrop := ClassicRules()
	classicNoDrop.NoWinByDrop = true

	simple := DefaultRules()
	simple.DropMustTouchOwn = false
	simple.CaptureCooldown = 0

	fourLine := DefaultRules()
	fourLine.WinLength = 4

	noRestriction := DefaultRules()
	noRestriction.NoWinByDrop = false
	noRestriction.DropMustTouchOwn = false

	return map[string]RuleSet{
		"default":        DefaultRules(),
		"classic":        ClassicRules(),
		"classic-nodrop": classicNoDrop,
		"simple":         simple,
		"four-line":      fourLine,
		"no-restriction": noRestriction,
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
