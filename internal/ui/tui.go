package ui

import (
	"fmt"
	"net"
	"slices"
	"strings"
	"time"

	"chetactoe/internal/engine"
	"chetactoe/internal/network"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type Mode int

const (
	ModeBoard Mode = iota
	ModeHand
)

const (
	udpDiscoveryPort = 9876
	tcpGamePort      = 4321
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

type Screen int

const (
	ScreenMenu Screen = iota
	ScreenSelect            
	ScreenNetworkConnection 
	ScreenNetworkDiscovery  
	ScreenNetworkWaiting    
	ScreenPlaying
)

type Model struct {
	screen Screen
	styles Styles

	move     chan<- engine.Action
	snapshot <-chan engine.GameSnapshot

	snapshotState engine.GameSnapshot

	localPlayer *engine.Player

	mode    Mode
	cursor  engine.Position
	handSel int

	menuCursor   int
	selectCursor int

	networkSnapshot  network.NetworkSnapshot
	connectionCursor int
	discoveryCursor  int
	netErr           string
}

var menuOptions = []struct {
	label string
	mode  engine.GameMode
}{
	{"Local (pass & play)", engine.GameModeLocal},
	{"Vs Bot", engine.GameModeBot},
	{"Network", engine.GameModeNetwork},
}

var selectOptions = []struct {
	label  string
	player engine.Player
}{
	{"White", engine.White},
	{"Black", engine.Black},
}

var connectionOptions = []struct {
	label      string
	playerType network.NetworkPlayertype
}{
	{"Host", network.Host},
	{"Peer", network.Peer},
}


type SnapshotMsg engine.GameSnapshot

type hostReadyMsg struct {
	conn net.Conn
	err  error
}

type devicesRefreshedMsg []*net.Addr

type peerConnectedMsg struct {
	conn net.Conn
	err  error
}

type tickMsg time.Time

func waitForSnapshot(snapshot <-chan engine.GameSnapshot) tea.Cmd {
	return func() tea.Msg {
		return SnapshotMsg(<-snapshot)
	}
}

func tickCmd() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg {
		return tickMsg(t)
	})
}


func Run() {
	p := tea.NewProgram(New())
	if _, err := p.Run(); err != nil {
		fmt.Println("Error running program:", err)
	}
}

func New() Model {
	return Model{
		screen: ScreenMenu,
		styles: defaultStyles(),
	}
}

func (m Model) Init() tea.Cmd {
	return nil
}


func (m Model) startLocalGame() (Model, tea.Cmd) {
	move := make(chan engine.Action, 10)
	snapshot := make(chan engine.GameSnapshot, 10)
	go engine.StartLocalGame(move, snapshot)

	m.screen = ScreenPlaying
	m.move, m.snapshot = move, snapshot
	m.localPlayer = nil 
	return m, waitForSnapshot(snapshot)
}

func (m Model) startBotGame(playerSide engine.Player) (Model, tea.Cmd) {
	botSide := engine.Black
	if playerSide == engine.Black {
		botSide = engine.White
	}

	move := make(chan engine.Action, 10)
	snapshot := make(chan engine.GameSnapshot, 10)
	go engine.StartBotGame(move, snapshot, botSide)

	m.screen = ScreenPlaying
	m.move, m.snapshot = move, snapshot
	m.localPlayer = &playerSide
	return m, waitForSnapshot(snapshot)
}

func (m Model) startNetworkGame(conn net.Conn, localPlayer engine.Player) (Model, tea.Cmd) {
	move := make(chan engine.Action, 10)
	snapshot := make(chan engine.GameSnapshot, 10)

	go engine.StartNetworkGame(move, snapshot, conn, localPlayer)

	m.screen = ScreenPlaying
	m.move, m.snapshot = move, snapshot
	m.localPlayer = &localPlayer
	m.networkSnapshot.Conn = conn
	return m, waitForSnapshot(snapshot)
}


func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch m.screen {
	case ScreenMenu:
		return m.updateMenu(msg)
	case ScreenSelect:
		return m.updateSelect(msg)
	case ScreenNetworkConnection:
		return m.updateNetworkConnection(msg)
	case ScreenNetworkDiscovery:
		return m.updateNetworkDiscovery(msg)
	case ScreenNetworkWaiting:
		return m.updateNetworkWaiting(msg)
	case ScreenPlaying:
		return m.updatePlayingScreen(msg)
	}
	return m, nil
}

func (m Model) updateMenu(msg tea.Msg) (tea.Model, tea.Cmd) {
	keyMsg, ok := msg.(tea.KeyMsg)
	if !ok {
		return m, nil
	}

	switch keyMsg.String() {
	case "ctrl+c", "q":
		return m, tea.Quit

	case "up", "k":
		m.menuCursor = clamp(m.menuCursor-1, 0, len(menuOptions)-1)

	case "down", "j":
		m.menuCursor = clamp(m.menuCursor+1, 0, len(menuOptions)-1)

	case "enter", " ":
		switch menuOptions[m.menuCursor].mode {
		case engine.GameModeBot:
			m.screen = ScreenSelect
			return m, nil
		case engine.GameModeNetwork:
			m.screen = ScreenNetworkConnection
			return m, nil
		default:
			return m.startLocalGame()
		}
	}

	return m, nil
}

func (m Model) updateSelect(msg tea.Msg) (tea.Model, tea.Cmd) {
	keyMsg, ok := msg.(tea.KeyMsg)
	if !ok {
		return m, nil
	}

	switch keyMsg.String() {
	case "ctrl+c", "q":
		return m, tea.Quit
	case "esc":
		m.screen = ScreenMenu
	case "up", "k", "down", "j", "left", "h", "right", "l":
		m.selectCursor = 1 - m.selectCursor
	case "enter", " ":
		return m.startBotGame(selectOptions[m.selectCursor].player)
	}

	return m, nil
}

func (m Model) updateNetworkConnection(msg tea.Msg) (tea.Model, tea.Cmd) {
	keyMsg, ok := msg.(tea.KeyMsg)
	if !ok {
		return m, nil
	}

	switch keyMsg.String() {
	case "ctrl+c", "q":
		return m, tea.Quit
	case "esc":
		m.screen = ScreenMenu
	case "up", "k", "down", "j":
		m.connectionCursor = 1 - m.connectionCursor
	case "enter", " ":
		playerType := connectionOptions[m.connectionCursor].playerType
		m.networkSnapshot.UDPPort = udpDiscoveryPort
		m.networkSnapshot.TCPPort = tcpGamePort

		if playerType == network.Host {
			m.screen = ScreenNetworkWaiting
			m.netErr = ""
			return m, startHostCmd(m.networkSnapshot.UDPPort, m.networkSnapshot.TCPPort)
		}

		m.screen = ScreenNetworkDiscovery
		m.netErr = ""
		network.StartDiscoveryListener(m.networkSnapshot.UDPPort)
		return m, tea.Batch(refreshDevicesCmd(m.networkSnapshot.UDPPort), tickCmd())
	}

	return m, nil
}

func (m Model) updateNetworkDiscovery(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tickMsg:
		return m, tea.Batch(refreshDevicesCmd(m.networkSnapshot.UDPPort), tickCmd())

	case devicesRefreshedMsg:
		m.networkSnapshot.RemoteAddrs = msg
		if m.discoveryCursor >= len(m.networkSnapshot.RemoteAddrs) {
			m.discoveryCursor = 0
		}
		return m, nil

	case peerConnectedMsg:
		if msg.err != nil {
			m.netErr = msg.err.Error()
			return m, nil
		}
		return m.startNetworkGame(msg.conn, engine.Black)

	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			return m, tea.Quit
		case "esc":
			m.screen = ScreenNetworkConnection
			return m, nil
		case "up", "k":
			if n := len(m.networkSnapshot.RemoteAddrs); n > 0 {
				m.discoveryCursor = clamp(m.discoveryCursor-1, 0, n-1)
			}
		case "down", "j":
			if n := len(m.networkSnapshot.RemoteAddrs); n > 0 {
				m.discoveryCursor = clamp(m.discoveryCursor+1, 0, n-1)
			}
		case "enter", " ":
			if len(m.networkSnapshot.RemoteAddrs) == 0 {
				m.netErr = "No devices discovered yet."
				return m, nil
			}
			m.netErr = ""
			addr := m.networkSnapshot.RemoteAddrs[m.discoveryCursor]
			return m, connectToPeerCmd(m.networkSnapshot.TCPPort, addr)
		}
	}

	return m, nil
}

func (m Model) updateNetworkWaiting(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case hostReadyMsg:
		if msg.err != nil {
			m.netErr = msg.err.Error()
			m.screen = ScreenNetworkConnection
			return m, nil
		}
		return m.startNetworkGame(msg.conn, engine.White)

	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			return m, tea.Quit
		case "esc":
			m.screen = ScreenNetworkConnection
			return m, nil
		}
	}

	return m, nil
}

func (m Model) updatePlayingScreen(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case SnapshotMsg:
		m.snapshotState = engine.GameSnapshot(msg)
		return m, waitForSnapshot(m.snapshot)

	case tea.KeyMsg:
		if m.snapshotState.IsOver {
			return m.updateDone(msg)
		}
		if m.localPlayer != nil && m.snapshotState.CurrentPlayer != *m.localPlayer {
			return m, nil
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
		return New(), nil
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
	switch m.screen {
	case ScreenMenu:
		return m.renderMenu()
	case ScreenSelect:
		return m.renderSelect()
	case ScreenNetworkConnection:
		return m.renderNetworkConnection()
	case ScreenNetworkDiscovery:
		return m.renderNetworkDiscovery()
	case ScreenNetworkWaiting:
		return m.renderNetworkWaiting()
	case ScreenPlaying:
		return m.renderGame()
	}
	return m.renderMenu()
}

func (m Model) renderMenu() string {
	var b strings.Builder

	b.WriteString(m.styles.title.Render("CHETACTOE"))
	b.WriteString("\n\n")
	b.WriteString("Choose a game mode:\n\n")

	for i, opt := range menuOptions {
		line := "  " + opt.label
		if i == m.menuCursor {
			line = m.styles.status.Render("▸ " + opt.label)
		}
		b.WriteString(line + "\n")
	}

	b.WriteString("\n")
	b.WriteString(m.styles.help.Render("↑/↓: choose    [enter] start    [q] quit"))

	return b.String()
}

func (m Model) renderSelect() string {
	var b strings.Builder

	b.WriteString(m.styles.title.Render("CHETACTOE"))
	b.WriteString("\n\n")
	b.WriteString("Choose your side:\n\n")

	for i, opt := range selectOptions {
		line := "  " + opt.label
		if i == m.selectCursor {
			line = m.styles.status.Render("▸ " + opt.label)
		}
		b.WriteString(line + "\n")
	}

	b.WriteString("\n")
	b.WriteString(m.styles.help.Render("↑/↓: choose    [enter] start    [esc] back    [q] quit"))

	return b.String()
}

func (m Model) renderNetworkConnection() string {
	var b strings.Builder

	b.WriteString(m.styles.title.Render("CHETACTOE"))
	b.WriteString("\n\n")
	b.WriteString("Host or join?\n\n")

	for i, opt := range connectionOptions {
		line := "  " + opt.label
		if i == m.connectionCursor {
			line = m.styles.status.Render("▸ " + opt.label)
		}
		b.WriteString(line + "\n")
	}

	b.WriteString("\n")
	b.WriteString(m.styles.help.Render("↑/↓: choose    [enter] confirm    [esc] back    [q] quit"))

	return b.String()
}

func (m Model) renderNetworkDiscovery() string {
	var b strings.Builder

	b.WriteString(m.styles.title.Render("CHETACTOE"))
	b.WriteString("\n\n")
	b.WriteString("Discovered hosts:\n\n")

	if len(m.networkSnapshot.RemoteAddrs) == 0 {
		b.WriteString(m.styles.help.Render("  Searching...\n"))
	}
	for i, addr := range m.networkSnapshot.RemoteAddrs {
		line := fmt.Sprintf("  [%d] %s", i, (*addr).String())
		if i == m.discoveryCursor {
			line = m.styles.status.Render("▸ " + strings.TrimPrefix(line, "  "))
		}
		b.WriteString(line + "\n")
	}

	if m.netErr != "" {
		b.WriteString("\n" + m.styles.status.Render("▸ "+m.netErr) + "\n")
	}

	b.WriteString("\n")
	b.WriteString(m.styles.help.Render("↑/↓: choose    [enter] connect    [esc] back    [q] quit"))

	return b.String()
}

func (m Model) renderNetworkWaiting() string {
	var b strings.Builder

	b.WriteString(m.styles.title.Render("CHETACTOE"))
	b.WriteString("\n\n")
	b.WriteString("Waiting for a peer to connect...\n")

	if m.netErr != "" {
		b.WriteString("\n" + m.styles.status.Render("▸ "+m.netErr) + "\n")
	}

	b.WriteString("\n")
	b.WriteString(m.styles.help.Render("[esc] cancel    [q] quit"))

	return b.String()
}

func (m Model) renderGame() string {
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

	if m.localPlayer != nil && m.snapshotState.CurrentPlayer != *m.localPlayer {
		return fmt.Sprintf("Waiting for %s...", playerName(m.snapshotState.CurrentPlayer))
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


func startHostCmd(udpPort, tcpPort int) tea.Cmd {
	return func() tea.Msg {
		conn, err := network.StartHost(udpPort, tcpPort)
		return hostReadyMsg{conn: conn, err: err}
	}
}

func refreshDevicesCmd(udpPort int) tea.Cmd {
	return func() tea.Msg {
		return devicesRefreshedMsg(network.DiscoverPeers(udpPort))
	}
}

func connectToPeerCmd(tcpPort int, addr *net.Addr) tea.Cmd {
	return func() tea.Msg {
		conn, err := network.ConnectToPeer(tcpPort, addr)
		return peerConnectedMsg{conn: conn, err: err}
	}
}