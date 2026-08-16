const ActionType = {
  Select: 1,
  Execute: 0,
  Cancel: 2,
};

const Player = {
  White: 0,
  Black: 1,
};

const PieceGlyphs = {
  white: ["♙", "♘", "♗", "♖"],
  black: ["♟", "♞", "♝", "♜"],
};

function pieceGlyph(piece) {
  if (!piece) return "";
  const set = piece.player === Player.White ? PieceGlyphs.white : PieceGlyphs.black;
  return set[piece.pieceType] || "?";
}

let snapshot = null;
let controller = null;
let selectedHandSlot = null;


function pieceClass(piece) {
  if (!piece) return "";
  return piece.player === Player.White ? "piece-white" : "piece-black";
}

function isValidMove(row, col) {
  if (!snapshot || !snapshot.validMoves) return false;
  return snapshot.validMoves.some((p) => p.row === row && p.col === col);
}

function isSource(row, col) {
  if (!snapshot || !snapshot.source) return false;
  return snapshot.source.row === row && snapshot.source.col === col;
}

function sendAction(action) {
  if (controller) {
    controller.sendAction(action);
  }
}

function onCellClick(row, col) {
  if (!snapshot || snapshot.isOver) return;

  if (snapshot.source) {
    sendAction({
      actionType: ActionType.Execute,
      move: {
        source: snapshot.source,
        destination: { row, col },
      },
    });
    selectedHandSlot = null;
    return;
  }

  sendAction({
    actionType: ActionType.Select,
    move: {
      source: { row, col },
      destination: { row: 0, col: 0 },
    },
  });
}

function onHandSlotClick(player, idx, piece) {
  if (!snapshot || snapshot.isOver) return;
  if (player !== snapshot.currentPlayer) return;
  if (!piece) return;

  selectedHandSlot = idx;
  sendAction({
    actionType: ActionType.Select,
    move: {
      source: { row: idx, col: -1 },
      destination: { row: 0, col: 0 },
    },
  });
}

function playerName(p) {
  return p === Player.White ? "White" : "Black";
}

function renderStatus() {
  const el = document.getElementById("status");
  if (!snapshot) {
    el.textContent = "";
    return;
  }
  if (snapshot.isOver) {
    el.textContent = playerName(snapshot.winner) + " wins!";
    return;
  }
  if (snapshot.source) {
    el.textContent = "Choose a destination, or click the piece again to cancel.";
    return;
  }
  el.textContent = playerName(snapshot.currentPlayer) + "'s turn.";
}

function renderBoard() {
  const board = document.getElementById("board");
  board.innerHTML = "";

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";

      const piece = snapshot && snapshot.board[r] ? snapshot.board[r][c] : null;

      if (piece) {
        cell.textContent = pieceGlyph(piece);
        cell.classList.add(pieceClass(piece));
      }

      if (isSource(r, c)) {
        cell.classList.add("source");
      } else if (isValidMove(r, c)) {
        cell.classList.add("dest");
      }

      cell.addEventListener("click", () => onCellClick(r, c));
      board.appendChild(cell);
    }
  }
}

function renderHand(player, containerId, pieces) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  for (let i = 0; i < 4; i++) {
    const piece = pieces ? pieces[i] : null;
    const slot = document.createElement("div");
    slot.className = "hand-slot" + (piece ? "" : " empty");

    if (piece) {
      slot.textContent = pieceGlyph(piece);
      slot.classList.add(pieceClass(piece));
    }

    if (
      snapshot &&
      snapshot.source &&
      snapshot.source.col === -1 &&
      snapshot.source.row === i &&
      snapshot.currentPlayer === player
    ) {
      slot.classList.add("selected");
    }

    slot.addEventListener("click", () => onHandSlotClick(player, i, piece));
    container.appendChild(slot);
  }
}

function render() {
  renderStatus();
  renderBoard();
  renderHand(Player.White, "hand-white", snapshot ? snapshot.whiteHand : null);
  renderHand(Player.Black, "hand-black", snapshot ? snapshot.blackHand : null);
}

function onSnapshot(jsonStr) {
  snapshot = JSON.parse(jsonStr);
  render();
}

const go = new Go();
WebAssembly.instantiateStreaming(fetch("./bin/chetactoe.wasm"), go.importObject).then((result) => {
  go.run(result.instance);
  controller = StartLocalGame(onSnapshot);
});

