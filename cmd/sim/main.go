// Command sim plays a ruleset against itself and reports whether it is a game.
//
//	go run ./cmd/sim                          # every variant, quick
//	go run ./cmd/sim -variant default -n 500  # one of them, harder
//	go run ./cmd/sim -depth 4 -n 60           # against a real searcher
//	go run ./cmd/sim -check                   # exit 1 if the shipped rules regress
//
// The numbers that matter, and the targets they are held to:
//
//	games that finish      > 98%     a game that does not end is not a game
//	typical length         20-40     long enough to plan, short enough to replay
//	first-player share     50-57%    above ~60% and the second seat is a formality
//	skill pays             > 80%     a deeper search beating a shallower one
package main

import (
	"flag"
	"fmt"
	"math/rand"
	"os"

	"chetactoe/internal/engine"
)

func main() {
	var (
		variant  = flag.String("variant", "", "ruleset to play; empty plays all of them")
		games    = flag.Int("n", 200, "games per matchup")
		depth    = flag.Int("depth", 2, "search depth for both players (0 plays at random)")
		seed     = flag.Int64("seed", 1, "random seed, so a run can be repeated")
		check    = flag.Bool("check", false, "hold the shipped ruleset to its targets and exit non-zero if it misses")
		openings = flag.Bool("openings", false, "score every possible first move, which is what the pie rule turns on")
	)

	flag.Parse()

	if *check {
		os.Exit(runCheck(*seed))
	}

	if *openings {
		runOpenings(*variant, *games, *depth, *seed)
		return
	}

	names := engine.VariantNames()
	if *variant != "" {
		if _, ok := engine.Variants()[*variant]; !ok {
			fmt.Fprintf(os.Stderr, "unknown variant %q; have %v\n", *variant, names)
			os.Exit(2)
		}
		names = []string{*variant}
	}

	fmt.Printf("\n%d games per ruleset, both players searching to depth %d\n\n", *games, *depth)

	for _, name := range names {
		rules := engine.Variants()[name]
		player := engine.Searcher{Depth: *depth, Rand: rand.New(rand.NewSource(*seed))}

		report := engine.Measure(rules, player, player, *games)

		fmt.Printf("  %-16s %s\n", name, report)
	}

	fmt.Println()
}

// runOpenings scores every legal first move.
//
// Under the pie rule the second player takes any opening that favours the mover,
// so the game settles on whichever opening is closest to even — and that opening's
// score, not the raw first-player win rate, is what the game is actually worth to
// the opener.
func runOpenings(variant string, games, depth int, seed int64) {
	name := variant
	if name == "" {
		name = "default"
	}

	rules, ok := engine.Variants()[name]
	if !ok {
		fmt.Fprintf(os.Stderr, "unknown variant %q\n", name)
		os.Exit(2)
	}

	player := engine.Searcher{Depth: depth, Rand: rand.New(rand.NewSource(seed))}
	scored := engine.MeasureOpenings(rules, player, games)

	fmt.Printf("\n%s: every first move, %d games each, depth %d\n\n", name, games, depth)

	best, bestGap := scored[0], 100.0

	for _, o := range scored {
		if gap := abs(o.Score - 50); gap < bestGap {
			best, bestGap = o, gap
		}
	}

	for _, o := range scored[:min(6, len(scored))] {
		fmt.Printf("  %-28s opener wins %3.0f%%\n", describe(o.Move), o.Score)
	}

	fmt.Println("  ...")

	tail := scored[max(0, len(scored)-3):]
	for _, o := range tail {
		fmt.Printf("  %-28s opener wins %3.0f%%\n", describe(o.Move), o.Score)
	}

	fmt.Printf("\n  strongest opening        %3.0f%%   (what the opener gets with no swap rule)\n", scored[0].Score)
	fmt.Printf("  most even opening        %3.0f%%   %s\n", best.Score, describe(best.Move))
	fmt.Printf("\n  With the pie rule the opener cannot play anything above even without it being\n")
	fmt.Printf("  taken, so the game is worth about %.0f%% to them rather than %.0f%%.\n\n", best.Score, scored[0].Score)
}

func describe(m engine.Move) string {
	return fmt.Sprintf("%v -> %v", m.Source, m.Destination)
}

func abs(f float64) float64 {
	if f < 0 {
		return -f
	}
	return f
}

// runCheck is the CI guard: the shipped ruleset has to keep producing a game.
// It is deliberately loose — it catches a rule change that breaks termination or
// hands the first player the game, not small drifts.
func runCheck(seed int64) int {
	const games = 200

	rules := engine.DefaultRules()
	player := engine.Searcher{Depth: 2, Rand: rand.New(rand.NewSource(seed))}
	report := engine.Measure(rules, player, player, games)

	fmt.Printf("\nshipped ruleset over %d games\n  %s\n\n", games, report)

	failed := false

	fail := func(format string, args ...any) {
		failed = true
		fmt.Printf("  FAIL  "+format+"\n", args...)
	}

	if unresolved := 100 * float64(report.Unresolved) / float64(games); unresolved > 2 {
		fail("%.0f%% of games hit the ply cap; the target is under 2%%", unresolved)
	}

	if report.AvgPlies < 10 || report.AvgPlies > 60 {
		fail("games average %.0f plies; the target is 20-40, and 10-60 is the outer bound", report.AvgPlies)
	}

	// The raw self-play number ignores the pie rule, because a searcher with a
	// terminal-only evaluation has no way to judge whether a position is worth
	// taking. What the rule actually produces is the score of the most even
	// opening: the opener cannot play anything better than that without it being
	// taken off them.
	openings := engine.MeasureOpenings(rules, engine.Searcher{Depth: 2, Rand: rand.New(rand.NewSource(seed + 3))}, 12)

	strongest, evenest := openings[0].Score, 100.0
	for _, o := range openings {
		if abs(o.Score-50) < abs(evenest-50) {
			evenest = o.Score
		}
	}

	fmt.Printf("  first player, no swap    %3.0f%%   (strongest opening %.0f%%)\n", report.WhiteShare(), strongest)
	fmt.Printf("  first player, with swap  %3.0f%%   (the most even opening, which is all they can play)\n\n", evenest)

	if abs(evenest-50) > 12 {
		fail("even with the swap the opener is at %.0f%%; the target is 50-57%%", evenest)
	}

	// Skill has to pay, or the rules are noise.
	deep := engine.Searcher{Depth: 3, Rand: rand.New(rand.NewSource(seed + 1))}
	shallow := engine.Searcher{Depth: 0, Rand: rand.New(rand.NewSource(seed + 2))}
	skill := engine.Measure(rules, deep, shallow, 60)

	if won := 100 * float64(skill.WhiteWins) / 60; won < 80 {
		fail("a searching player beats a random one only %.0f%% of the time; the target is 80%%", won)
	}

	if failed {
		return 1
	}

	fmt.Println("  ok    the shipped ruleset still produces a game")

	return 0
}
