// Command sim plays a ruleset against itself and reports whether it is a game.
//
//	go run ./cmd/sim                          # every variant, side by side
//	go run ./cmd/sim -variant default -n 500  # one of them, harder
//	go run ./cmd/sim -depth 4 -n 60           # against a real searcher
//	go run ./cmd/sim -openings                # score every first move
//	go run ./cmd/sim -check                   # exit 1 if the shipped rules regress
//
// The numbers that matter, and the targets they are held to:
//
//	games that finish      > 98%     a game that does not end is not a game
//	typical length         15-45     long enough to plan, short enough to replay
//	first-player share     50-57%    above ~60% and the second seat is a formality
//	skill pays             > 80%     a searching player beating a random one
package main

import (
	"flag"
	"fmt"
	"math/rand"
	"os"
	"sort"

	"chetactoe/internal/engine"
)

func main() {
	var (
		variant  = flag.String("variant", "", "ruleset to play; empty plays all of them")
		games    = flag.Int("n", 200, "games per matchup")
		depth    = flag.Int("depth", 2, "search depth for both players (0 plays at random)")
		seed     = flag.Int64("seed", 1, "random seed, so a run can be repeated")
		check    = flag.Bool("check", false, "hold the shipped ruleset to its targets")
		openings = flag.Bool("openings", false, "score every possible first move")
		sweep    = flag.Bool("sweep", false, "try every combination of the rule knobs and rank them")
	)

	flag.Parse()

	switch {
	case *check:
		os.Exit(runCheck(*seed))

	case *sweep:
		runSweep(*games, *depth, *seed)

	case *openings:
		runOpenings(*variant, *games, *depth, *seed)

	default:
		runAll(*variant, *games, *depth, *seed)
	}
}

func runAll(variant string, games, depth int, seed int64) {
	names := engine.VariantNames()

	if variant != "" {
		if _, ok := engine.Variants()[variant]; !ok {
			fmt.Fprintf(os.Stderr, "unknown variant %q; have %v\n", variant, names)
			os.Exit(2)
		}
		names = []string{variant}
	}

	fmt.Printf("\n%d games per ruleset, both players searching to depth %d\n\n", games, depth)

	for _, name := range names {
		player := engine.Searcher{Depth: depth, Rand: rand.New(rand.NewSource(seed))}
		fmt.Printf("  %-15s %s\n", name, engine.Measure(engine.Variants()[name], player, player, games))
	}

	fmt.Println()
}

// runSweep tries the rule knobs against each other. It exists because porting a
// ruleset onto a different engine does not carry its balance with it: rules that
// measured well on their own can be lopsided next to somebody else's, and the
// only way to find out is to play them.
func runSweep(games, depth int, seed int64) {
	type row struct {
		label  string
		report engine.Report
		rules  engine.RuleSet
	}

	var rows []row

	for _, winLength := range []int{3, 4} {
		for _, minToMove := range []int{0, 2, 3} {
			for _, dropRules := range []bool{true, false} {
				rules := engine.DefaultRules()
				rules.WinLength = winLength
				rules.MinPiecesToMove = minToMove
				rules.NoWinByDrop = dropRules
				rules.DropMustTouchOwn = dropRules

				player := engine.Searcher{Depth: depth, Rand: rand.New(rand.NewSource(seed))}

				label := fmt.Sprintf("win %d  move-after %d  drop-rules %-5v", winLength, minToMove, dropRules)
				rows = append(rows, row{label, engine.Measure(rules, player, player, games), rules})
			}
		}
	}

	// Ranked by how close the first player is to even, since that is the one thing
	// no other knob fixed.
	sort.Slice(rows, func(i, j int) bool {
		return abs(rows[i].report.WhiteShare()-50) < abs(rows[j].report.WhiteShare()-50)
	})

	fmt.Printf("\n%d games each, depth %d, ranked by first-player balance\n\n", games, depth)

	for _, r := range rows {
		flag := "  "
		switch {
		case r.report.AvgPlies < 8 || r.report.AvgPlies > 60:
			flag = " ~" // ends, but too short or too long to be a game
		case 100*float64(r.report.Stuck)/float64(max(r.report.Games, 1)) > 5:
			flag = " !" // players running out of moves
		case abs(r.report.WhiteShare()-50) <= 7:
			flag = " *" // in the target band
		}

		fmt.Printf("%s %s   first player %3.0f%%   plies %5.1f   stuck %2.0f%%   draws %2.0f%%\n",
			flag, r.label, r.report.WhiteShare(), r.report.AvgPlies,
			100*float64(r.report.Stuck)/float64(max(r.report.Games, 1)),
			100*float64(r.report.Draws)/float64(max(r.report.Games, 1)))
	}

	fmt.Println("\n  * in the target band   ~ length off   ! players running out of moves")
	fmt.Println()
}

// runOpenings scores every legal first move. Under the pie rule the second player
// takes any opening that favours the mover, so the game settles on whichever
// opening is closest to even — and that score, not the raw win rate, is what the
// game is worth to the opener.
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

	evenest := scored[0]
	for _, o := range scored {
		if abs(o.Score-50) < abs(evenest.Score-50) {
			evenest = o
		}
	}

	for _, o := range scored[:min(5, len(scored))] {
		fmt.Printf("  %v -> %v   opener wins %3.0f%%\n", o.Move.Source, o.Move.Destination, o.Score)
	}
	fmt.Println("  ...")
	for _, o := range scored[max(0, len(scored)-2):] {
		fmt.Printf("  %v -> %v   opener wins %3.0f%%\n", o.Move.Source, o.Move.Destination, o.Score)
	}

	fmt.Printf("\n  strongest opening   %3.0f%%   (what the opener gets with no swap rule)\n", scored[0].Score)
	fmt.Printf("  most even opening   %3.0f%%   (all they can play once it can be taken)\n\n", evenest.Score)
}

// runCheck is the CI guard: the shipped ruleset has to keep producing a game. It
// is deliberately loose — it catches a rule change that breaks termination or
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

	if unresolved := 100 * float64(report.Unresolved) / games; unresolved > 2 {
		fail("%.0f%% of games hit the ply cap; the target is under 2%%", unresolved)
	}

	if report.AvgPlies < 10 || report.AvgPlies > 60 {
		fail("games average %.0f plies; the target is 15-45", report.AvgPlies)
	}

	// The raw number ignores the pie rule, because a terminal-only searcher cannot
	// judge whether a position is worth taking. What the rule actually produces is
	// the score of the most even opening.
	openings := engine.MeasureOpenings(rules, engine.Searcher{Depth: 2, Rand: rand.New(rand.NewSource(seed + 3))}, 10)

	evenest := 100.0
	for _, o := range openings {
		if abs(o.Score-50) < abs(evenest-50) {
			evenest = o.Score
		}
	}

	fmt.Printf("  first player, no swap    %3.0f%%\n", report.WhiteShare())
	fmt.Printf("  first player, with swap  %3.0f%%   (the most even opening)\n\n", evenest)

	if abs(evenest-50) > 15 {
		fail("even with the swap the opener is at %.0f%%; the target is 50-57%%", evenest)
	}

	deep := engine.Searcher{Depth: 3, Rand: rand.New(rand.NewSource(seed + 1))}
	random := engine.Searcher{Depth: 0, Rand: rand.New(rand.NewSource(seed + 2))}

	if skill := engine.Measure(rules, deep, random, 60); 100*float64(skill.WhiteWins)/60 < 80 {
		fail("a searching player beats a random one only %.0f%% of the time; the target is 80%%",
			100*float64(skill.WhiteWins)/60)
	}

	if failed {
		return 1
	}

	fmt.Println("  ok    the shipped ruleset still produces a game")

	return 0
}

func abs(f float64) float64 {
	if f < 0 {
		return -f
	}
	return f
}
