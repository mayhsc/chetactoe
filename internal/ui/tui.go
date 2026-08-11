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
	move <-chan engine.Action
	snapshot chan<- engine.GameSnapshot

	turn     engine.Player
	mode     Mode
	cursor   engine.Position
	handSel  int
	selected *engine.Position
	moves    []engine.Position
	done     bool
	winner   string
	status   string
	styles   Styles
}

func Run() {
	p := tea.NewProgram(New())
	if _, err := p.Run(); err != nil {
		fmt.Println("Error running program:", err)
	}
}

func New() Model {
	// gb := engine.InitializeGameBoard()
	move := make(chan engine.Action)
	snapshot := make(chan engine.GameSnapshot)

	go engine.StartGame(move, snapshot)
	initSnapshot := <- snapshot

	return Model{
		move: move,
		snapshot: snapshot,
		turn:   engine.White,
		cursor: engine.Position{},
		styles: defaultStyles(),
		status: "Select one of your pieces, or press t for your hand.",
	}
}

func (m Model) Init() tea.Cmd {
	return nil
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		if m.done {
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
		return m, nil
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
		if m.selected == nil {
			m.toggleHandMode()
		}

	case "enter", " ":
		return m.handleConfirm()

	case "esc":
		if m.selected != nil {
			m.selected = nil
			m.moves = nil
			m.status = "Selection cancelled."
		} else if m.mode == ModeHand {
			m.mode = ModeBoard
			m.status = "Select one of your pieces, or press t for your hand."
		}

	case "1", "2", "3", "4":
		if m.selected == nil {
			idx := int(msg.String()[0] - '1')
			m.selectHandPiece(idx)
		}
	}

	return m, nil
}

func (m *Model) toggleHandMode() {
	if m.mode == ModeBoard {
		m.mode = ModeHand
		m.status = fmt.Sprintf("Pick a piece from your hand (slot %d).", m.handSel)
	} else {
		m.mode = ModeBoard
		m.status = "Select one of your pieces, or press t for your hand."
	}
}

func (m *Model) handleConfirm() (tea.Model, tea.Cmd) {
	if m.mode == ModeHand {
		m.selectHandPiece(m.handSel)
		return m, nil
	}

	if m.selected == nil {
		piece := m.game.PieceAt(m.cursor)
		if piece == nil {
			m.status = "Empty square. Select one of your pieces, or press t for your hand."
			return m, nil
		}
		if piece.Player() != m.turn {
			m.status = fmt.Sprintf("That is %s's piece.", playerName(piece.Player()))
			return m, nil
		}

		moves := m.game.ValidMovesFor(m.cursor)
		if len(moves) == 0 {
			m.status = "That piece has no valid moves."
			return m, nil
		}

		pos := m.cursor
		m.selected = &pos
		m.moves = moves
		m.status = "Choose a highlighted square to move."
		return m, nil
	}

	if !slices.Contains(m.moves, m.cursor) {
		m.status = "Not a valid destination."
		return m, nil
	}

	src := *m.selected
	m.game.MovePiece(src, m.cursor, m.turn)

	if m.game.HasWon(m.turn) {
		m.done = true
		m.winner = playerName(m.turn)
		m.selected = nil
		m.moves = nil
		m.status = ""
		return m, nil
	}

	m.switchTurn()
	m.selected = nil
	m.moves = nil
	m.status = "Select one of your pieces, or press t for your hand."
	return m, nil
}

func (m *Model) selectHandPiece(idx int) {
	piece := m.game.HandPieces(m.turn)[idx]
	if piece == nil {
		m.status = "That hand slot is empty."
		return
	}

	placements := m.game.GetValidPlacements()
	if len(placements) == 0 {
		m.status = "The board is full. No placements available."
		return
	}

	src := engine.Position{Row: idx, Col: -1}
	m.selected = &src
	m.moves = placements
	m.mode = ModeBoard
	m.cursor = placements[0]
	m.status = "Choose a highlighted square to place your piece."
}

func (m *Model) switchTurn() {
	if m.turn == engine.White {
		m.turn = engine.Black
	} else {
		m.turn = engine.White
	}
}

func (m Model) View() string {
	var b strings.Builder

	b.WriteString(m.styles.title.Render("CHETACTOE"))
	b.WriteString("\n\n")

	if m.done {
		b.WriteString(m.styles.title.Render(m.winner + " WINS!"))
	} else {
		b.WriteString(fmt.Sprintf("Turn: %s", playerName(m.turn)))
	}
	b.WriteString("\n\n")

	b.WriteString(m.renderBoard())
	b.WriteString("\n\n")

	b.WriteString(m.renderHand(engine.Black))
	b.WriteString("\n")
	b.WriteString(m.renderHand(engine.White))
	b.WriteString("\n\n")

	if m.status != "" {
		b.WriteString(m.styles.status.Render("▸ " + m.status))
		b.WriteString("\n\n")
	}

	b.WriteString(m.renderHelp())

	return b.String()
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
	if p := m.game.PieceAt(pos); p != nil {
		content = glyphFor(p)
	}

	st := m.styles.cell
	switch {
	case slices.Contains(m.moves, pos):
		st = m.styles.dest
	case m.selected != nil && *m.selected == pos:
		st = m.styles.source
	}

	if m.cursor == pos {
		st = st.Reverse(true)
	}

	return st.Width(3).Align(lipgloss.Center).Render(content)
}

func (m Model) renderHand(p engine.Player) string {
	pieces := m.game.HandPieces(p)

	var slots []string
	for i := range 4 {
		content := "_"
		if pieces[i] != nil {
			content = glyphFor(pieces[i])
		}

		st := m.styles.hand.Width(3).Align(lipgloss.Center)
		if m.mode == ModeHand && p == m.turn && i == m.handSel {
			st = st.Reverse(true)
		}

		slots = append(slots, st.Render(content))
	}

	return fmt.Sprintf("%s: %s", playerName(p), strings.Join(slots, " "))
}

func (m Model) renderHelp() string {
	if m.done {
		return m.styles.help.Render("[r] restart    [q] quit")
	}

	if m.selected != nil {
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
