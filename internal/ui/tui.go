package ui

import (
	"fmt"
	"slices"
	"strings"

	"chetactoe/internal/engine"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type Mode int

const (
	ModeBoard Mode = iota
	ModeHand
)

type Styles struct {
	cell   lipgloss.Style
	dest   lipgloss.Style
	source lipgloss.Style
	hand   lipgloss.Style
	title  lipgloss.Style
	status lipgloss.Style
	help   lipgloss.Style
}

func defaultStyles() Styles {
	return Styles{
		cell:   lipgloss.NewStyle().Foreground(lipgloss.Color("#E4E7EB")),
		dest:   lipgloss.NewStyle().Background(lipgloss.Color("#1B7A6E")).Foreground(lipgloss.Color("#FFFFFF")).Bold(true),
		source: lipgloss.NewStyle().Background(lipgloss.Color("#C77D22")).Foreground(lipgloss.Color("#0A0A0A")).Bold(true),
		hand:   lipgloss.NewStyle().Foreground(lipgloss.Color("#B8C4D9")),
		title:  lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#FF6FA0")).Padding(0, 1).Background(lipgloss.Color("#1A1B26")),
		status: lipgloss.NewStyle().Foreground(lipgloss.Color("#F2C14E")).Bold(true),
		help:   lipgloss.NewStyle().Foreground(lipgloss.Color("#5C6B85")).Italic(true),
	}
}

type Model struct {
	move     chan<- engine.Action       
	snapshot <-chan engine.GameSnapshot 

	snapshotState engine.GameSnapshot 

	mode    Mode
	cursor  engine.Position
	handSel int
	styles  Styles
}

type SnapshotMsg engine.GameSnapshot

func waitForSnapshot(snapshot <-chan engine.GameSnapshot) tea.Cmd {
	return func() tea.Msg {
		return SnapshotMsg(<-snapshot)
	}
}

func Run() {
	p := tea.NewProgram(New())
	if _, err := p.Run(); err != nil {
		fmt.Println("Error running program:", err)
	}
}

func New() Model {
	move := make(chan engine.Action, 10)
	snapshot := make(chan engine.GameSnapshot, 10)

	go engine.StartGame(move, snapshot)
	initSnapshot := <-snapshot

	return Model{
		move:          move,
		snapshot:      snapshot,
		snapshotState: initSnapshot,
		cursor:        engine.Position{},
		styles:        defaultStyles(),
	}
}

func (m Model) Init() tea.Cmd {
	return waitForSnapshot(m.snapshot)
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {

	case SnapshotMsg:
		m.snapshotState = engine.GameSnapshot(msg)
		return m, waitForSnapshot(m.snapshot)

	case tea.KeyMsg:
		if m.snapshotState.IsOver {
			return m.updateDone(msg)
		}
		return m.updatePlaying(msg)
	}

	return m, nil
}

func (m Model) updateDone(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "q", "ctrl+c":
		return m, tea.Quit
	case "r":
		m = New() 
		return m, m.Init()
	}

	return m, nil
}

func (m Model) updatePlaying(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "ctrl+c", "q":
		return m, tea.Quit

	case "up", "k":
		if m.mode == ModeHand {
			m.handSel = clamp(m.handSel-1, 0, 3)
		} else {
			m.cursor.Row = clamp(m.cursor.Row-1, 0, 3)
		}

	case "down", "j":
		if m.mode == ModeHand {
			m.handSel = clamp(m.handSel+1, 0, 3)
		} else {
			m.cursor.Row = clamp(m.cursor.Row+1, 0, 3)
		}

	case "left", "h":
		if m.mode == ModeHand {
			m.handSel = clamp(m.handSel-1, 0, 3)
		} else {
			m.cursor.Col = clamp(m.cursor.Col-1, 0, 3)
		}

	case "right", "l":
		if m.mode == ModeHand {
			m.handSel = clamp(m.handSel+1, 0, 3)
		} else {
			m.cursor.Col = clamp(m.cursor.Col+1, 0, 3)
		}

	case "t", "tab":
		if m.snapshotState.Source == nil {
			m.toggleHandMode()
		}

	case "enter", " ":
		return m.handleConfirm()

	case "esc":
		if m.snapshotState.Source != nil {
			m.move <- engine.Action{ActionType: engine.Cancel}
		} else if m.mode == ModeHand {
			m.mode = ModeBoard
		}

	case "1", "2", "3", "4":
		if m.snapshotState.Source == nil {
			idx := int(msg.String()[0] - '1')
			m.handSel = idx
			m.move <- engine.Action{
				ActionType: engine.Select,
				Move: engine.Move{
					Source: engine.Position{Row: idx, Col: -1},
				},
			}
			m.mode = ModeBoard
		}
	}

	return m, nil
}

func (m *Model) toggleHandMode() {
	if m.mode == ModeBoard {
		m.mode = ModeHand
	} else {
		m.mode = ModeBoard
	}
}

func (m *Model) handleConfirm() (tea.Model, tea.Cmd) {
	if m.snapshotState.Source != nil {
		m.move <- engine.Action{
			ActionType: engine.Execute,
			Move: engine.Move{
				Source:      *m.snapshotState.Source,
				Destination: m.cursor,
			},
		}
		return m, nil
	}

	if m.mode == ModeHand {
		m.move <- engine.Action{
			ActionType: engine.Select,
			Move: engine.Move{
				Source: engine.Position{Row: m.handSel, Col: -1},
			},
		}
		m.mode = ModeBoard
	} else {
		m.move <- engine.Action{
			ActionType: engine.Select,
			Move: engine.Move{
				Source: m.cursor,
			},
		}
	}

	return m, nil
}

func (m Model) View() string {
	var b strings.Builder

	b.WriteString(m.styles.title.Render("CHETACTOE"))
	b.WriteString("\n\n")

	if m.snapshotState.IsOver {
		b.WriteString(m.styles.title.Render(playerName(*m.snapshotState.Winner) + " WINS!"))
	} else {
		b.WriteString(fmt.Sprintf("Turn: %s", playerName(m.snapshotState.CurrentPlayer)))
	}
	b.WriteString("\n\n")

	b.WriteString(m.renderBoard())
	b.WriteString("\n\n")

	b.WriteString(m.renderHand(engine.Black))
	b.WriteString("\n")
	b.WriteString(m.renderHand(engine.White))
	b.WriteString("\n\n")

	if m.currentStatus() != "" {
		b.WriteString(m.styles.status.Render("▸ " + m.currentStatus()))
		b.WriteString("\n\n")
	}

	b.WriteString(m.renderHelp())

	return b.String()
}

func (m Model) currentStatus() string {
	if m.snapshotState.IsOver {
		return fmt.Sprintf("Game over! %s won.", playerName(*m.snapshotState.Winner))
	}

	if m.snapshotState.Source != nil {
		if len(m.snapshotState.ValidMoves) == 0 {
			return "That piece has no valid moves. Press Esc to cancel."
		}
		return "Select a highlighted square to execute move, or press Esc to cancel."
	}

	if m.mode == ModeHand {
		return fmt.Sprintf("Hand slot %d selected. Press Enter to pick piece, or 't' for board.", m.handSel+1)
	}

	return fmt.Sprintf("Turn: %s. Select a piece or press 't' for hand.", playerName(m.snapshotState.CurrentPlayer))
}

func (m Model) renderBoard() string {
	var rows []string

	var header []string
	for c := range 4 {
		header = append(header, fmt.Sprintf("%3d", c))
	}
	rows = append(rows, "  "+strings.Join(header, " "))
	rows = append(rows, "  ┌───┬───┬───┬───┐")

	for r := range 4 {
		var cells []string
		for c := range 4 {
			cells = append(cells, m.renderCell(r, c))
		}
		rows = append(rows, fmt.Sprintf("%d │%s│", r, strings.Join(cells, "│")))
		if r < 3 {
			rows = append(rows, "  ├───┼───┼───┼───┤")
		}
	}

	rows = append(rows, "  └───┴───┴───┴───┘")
	return strings.Join(rows, "\n")
}

func (m Model) renderCell(r, c int) string {
	pos := engine.Position{Row: r, Col: c}

	content := "·"
	if p := m.snapshotState.Board[r][c]; p != nil {
		content = glyphFor(p)
	}

	st := m.styles.cell
	switch {
	case slices.Contains(m.snapshotState.ValidMoves, pos):
		st = m.styles.dest
	case m.snapshotState.Source != nil && *m.snapshotState.Source == pos:
		st = m.styles.source
	}

	if m.cursor == pos {
		st = st.Reverse(true)
	}

	return st.Width(3).Align(lipgloss.Center).Render(content)
}

func (m Model) renderHand(p engine.Player) string {
	var pieces [4]*engine.Piece
	if p == engine.White {
		pieces = m.snapshotState.WhiteHand
	} else {
		pieces = m.snapshotState.BlackHand
	}

	var slots []string
	for i := range 4 {
		content := "_"
		if pieces[i] != nil {
			content = glyphFor(pieces[i])
		}

		st := m.styles.hand.Width(3).Align(lipgloss.Center)
		if m.mode == ModeHand && p == m.snapshotState.CurrentPlayer && i == m.handSel {
			st = st.Reverse(true)
		}

		slots = append(slots, st.Render(content))
	}

	return fmt.Sprintf("%s: %s", playerName(p), strings.Join(slots, " "))
}

func (m Model) renderHelp() string {
	if m.snapshotState.IsOver {
		return m.styles.help.Render("[r] restart    [q] quit")
	}

	if m.snapshotState.Source != nil {
		return m.styles.help.Render("arrows/vim keys: move    [enter] confirm    [esc] cancel    [q] quit")
	}

	if m.mode == ModeHand {
		return m.styles.help.Render("←/→ or 1-4: pick piece    [enter] select    [t] back to board    [q] quit")
	}

	return m.styles.help.Render("arrows/vim keys: move    [enter] select    [t] hand    [q] quit")
}

func glyphFor(p *engine.Piece) string {
	labels := [2][4]string{
		{"♟", "♞", "♝", "♜"},
		{"♙", "♘", "♗", "♖"},
	}

	return labels[int(p.Player())][int(p.Type())]
}

func playerName(p engine.Player) string {
	if p == engine.White {
		return "White"
	}

	return "Black"
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}

	return v
}
