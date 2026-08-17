package engine

import (
	"encoding/json"
	"fmt"
)

// The wire format. A GameSnapshot is what crosses the TCP session between two
// players, and would cross a WebSocket to the web client, so it has to survive
// encoding — and Piece's fields are unexported, which means encoding/json writes
// it as `{}` unless the type says otherwise. Everything here exists so a snapshot
// arrives readable at the other end:
//
//	{"type":"knight","player":"black","position":{"row":1,"col":-2},"direction":"none"}
//
// Names rather than numbers, because a client that hard-codes 2 == bishop breaks
// silently the day a piece type is inserted.

var (
	pieceTypeNames = [...]string{"pawn", "knight", "bishop", "rook"}
	playerNames    = [...]string{"white", "black"}
	directionNames = [...]string{"up", "down", "left", "right", "none"}
	actionNames    = [...]string{"select", "execute", "cancel", "swap"}
)

func name(names []string, i int) string {
	if i < 0 || i >= len(names) {
		return fmt.Sprintf("unknown(%d)", i)
	}

	return names[i]
}

func index(names []string, want string) (int, bool) {
	for i, n := range names {
		if n == want {
			return i, true
		}
	}

	return 0, false
}

var endingNames = [...]string{"playing", "won", "repetition", "length", "no-move"}

func (e Ending) String() string { return name(endingNames[:], int(e)) }

func (e Ending) MarshalJSON() ([]byte, error) { return json.Marshal(e.String()) }

func (e *Ending) UnmarshalJSON(data []byte) error {
	return unmarshalEnum(data, endingNames[:], "ending", (*int)(e))
}

func (t PieceType) String() string { return name(pieceTypeNames[:], int(t)) }
func (p Player) String() string    { return name(playerNames[:], int(p)) }
func (d Direction) String() string { return name(directionNames[:], int(d)) }
func (a ActionType) String() string {
	return name(actionNames[:], int(a))
}

func (p Position) String() string {
	if InHand(p) {
		return fmt.Sprintf("%v hand slot %d", HandOwner(p), p.Row)
	}

	return fmt.Sprintf("%c%d", 'A'+rune(p.Col), p.Row+1)
}

func (t PieceType) MarshalJSON() ([]byte, error)  { return json.Marshal(t.String()) }
func (p Player) MarshalJSON() ([]byte, error)     { return json.Marshal(p.String()) }
func (d Direction) MarshalJSON() ([]byte, error)  { return json.Marshal(d.String()) }
func (a ActionType) MarshalJSON() ([]byte, error) { return json.Marshal(a.String()) }

func (t *PieceType) UnmarshalJSON(data []byte) error {
	return unmarshalEnum(data, pieceTypeNames[:], "piece type", (*int)(t))
}

func (p *Player) UnmarshalJSON(data []byte) error {
	return unmarshalEnum(data, playerNames[:], "player", (*int)(p))
}

func (d *Direction) UnmarshalJSON(data []byte) error {
	return unmarshalEnum(data, directionNames[:], "direction", (*int)(d))
}

func (a *ActionType) UnmarshalJSON(data []byte) error {
	return unmarshalEnum(data, actionNames[:], "action type", (*int)(a))
}

func unmarshalEnum(data []byte, names []string, what string, out *int) error {
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return fmt.Errorf("%s: %w", what, err)
	}

	i, ok := index(names, s)
	if !ok {
		return fmt.Errorf("unknown %s %q", what, s)
	}

	*out = i

	return nil
}

type pieceWire struct {
	Type      PieceType `json:"type"`
	Player    Player    `json:"player"`
	Position  Position  `json:"position"`
	Direction Direction `json:"direction"`
}

func (p Piece) MarshalJSON() ([]byte, error) {
	return json.Marshal(pieceWire{
		Type:      p.pieceType,
		Player:    p.player,
		Position:  p.position,
		Direction: p.direction,
	})
}

func (p *Piece) UnmarshalJSON(data []byte) error {
	var w pieceWire
	if err := json.Unmarshal(data, &w); err != nil {
		return err
	}

	p.pieceType = w.Type
	p.player = w.Player
	p.position = w.Position
	p.direction = w.Direction

	return nil
}
