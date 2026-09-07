const socket = io();

// ---------------------------------------------------------------------------
// Small DOM helpers
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function showScreen(id) {
  $$(".screen").forEach((s) => s.classList.add("hidden"));
  $(id).classList.remove("hidden");
}

let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3200);
}

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------
let myName = "";
let roomCode = "";
let lastState = null;

// ---------------------------------------------------------------------------
// Screen 1: Lobby
// ---------------------------------------------------------------------------
$("#btn-create").addEventListener("click", () => {
  myName = $("#input-name").value.trim() || "Agent";
  socket.emit("create_room", { name: myName }, (res) => {
    if (!res.ok) return toast(res.error || "Could not create room.");
    roomCode = res.code;
  });
});

$("#btn-join").addEventListener("click", () => {
  myName = $("#input-name").value.trim() || "Agent";
  const code = $("#input-code").value.trim().toUpperCase();
  if (!code) return toast("Enter a room code first.");
  socket.emit("join_room", { name: myName, code }, (res) => {
    if (!res.ok) return toast(res.error || "Could not join room.");
    roomCode = res.code;
  });
});

$("#input-code").addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase();
});

// ---------------------------------------------------------------------------
// Screen 2: Team select
// ---------------------------------------------------------------------------
$$(".btn-team").forEach((btn) => {
  btn.addEventListener("click", () => {
    socket.emit("set_team", { team: btn.dataset.team, role: btn.dataset.role });
  });
});

$("#btn-start").addEventListener("click", () => socket.emit("start_game"));

$("#btn-copy-code").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    toast("Room code copied!");
  } catch {
    toast(`Room code: ${roomCode}`);
  }
});

// ---------------------------------------------------------------------------
// Screen 3: Game
// ---------------------------------------------------------------------------
$("#clue-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const word = $("#clue-word").value.trim();
  const number = $("#clue-number").value;
  if (!word) return toast("Type a clue word first.");
  if (number === "" || isNaN(number)) return toast("Enter a number for your clue.");
  socket.emit("give_clue", { word, number });
  $("#clue-word").value = "";
  $("#clue-number").value = "";
});

$("#btn-end-turn").addEventListener("click", () => socket.emit("end_turn"));
$("#btn-new-game").addEventListener("click", () => socket.emit("new_game"));

function cardClicked(index) {
  if (!lastState) return;
  const { you, phase, turn } = lastState;
  if (!you || you.role !== "operative" || you.team !== turn || phase !== "guess") return;
  socket.emit("guess", { index });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function renderTeamSelect(state) {
  showScreen("#screen-teams");
  $("#room-code-display").textContent = state.code;

  const redList = $("#list-red");
  const blueList = $("#list-blue");
  const unassignedList = $("#list-unassigned");
  redList.innerHTML = "";
  blueList.innerHTML = "";
  unassignedList.innerHTML = "";

  state.players.forEach((p) => {
    const li = document.createElement("li");
    const nameSpan = document.createElement("span");
    nameSpan.textContent = p.name + (p.id === state.you?.id ? " (you)" : "");
    li.appendChild(nameSpan);

    if (p.role) {
      const tag = document.createElement("span");
      tag.className = "role-tag";
      tag.textContent = p.role;
      li.appendChild(tag);
    }

    if (p.team === "red") redList.appendChild(li);
    else if (p.team === "blue") blueList.appendChild(li);
    else unassignedList.appendChild(li);
  });
}

function renderGame(state) {
  showScreen("#screen-game");
  $("#room-code-display-2").textContent = state.code;

  // Scores
  $("#score-red").textContent = state.remaining.red;
  $("#score-blue").textContent = state.remaining.blue;

  // Turn banner
  const banner = $("#turn-banner");
  banner.classList.remove("turn-red", "turn-blue");
  banner.classList.add(state.turn === "red" ? "turn-red" : "turn-blue");
  if (state.phase === "over") {
    $("#turn-text").textContent = "Game over";
  } else {
    const roleWord = state.phase === "clue" ? "giving a clue" : "guessing";
    $("#turn-text").textContent = `${state.turn === "red" ? "Red" : "Blue"} team is ${roleWord}`;
  }

  // Roster
  const rosterRed = $("#roster-red");
  const rosterBlue = $("#roster-blue");
  rosterRed.innerHTML = "";
  rosterBlue.innerHTML = "";
  state.players.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = `${p.name}${p.id === state.you?.id ? " (you)" : ""} — ${p.role || "?"}`;
    if (p.team === "red") rosterRed.appendChild(li);
    else if (p.team === "blue") rosterBlue.appendChild(li);
  });

  $("#you-info").textContent = state.you
    ? `You are ${state.you.name}, ${state.you.team} ${state.you.role}.`
    : "";

  // Board
  const board = $("#board");
  board.innerHTML = "";
  state.board.forEach((cell, index) => {
    const div = document.createElement("div");
    div.className = "card";
    div.textContent = cell.word;

    const isSpymasterView = state.you && state.you.role === "spymaster" && !cell.revealed;

    if (cell.revealed) {
      div.classList.add("card-revealed", `card-${cell.color}`);
    } else if (isSpymasterView && cell.color) {
      div.classList.add(`card-peek-${cell.color}`);
    }

    const canClick =
      state.you &&
      state.you.role === "operative" &&
      state.you.team === state.turn &&
      state.phase === "guess" &&
      !cell.revealed;

    if (!canClick) div.classList.add("card-disabled");
    div.addEventListener("click", () => cardClicked(index));
    board.appendChild(div);
  });

  // Clue / waiting panels
  const isMyTurnTeam = state.you && state.you.team === state.turn;
  const clueForm = $("#clue-panel");
  const activeClue = $("#active-clue");
  const waitingPanel = $("#waiting-panel");
  clueForm.classList.add("hidden");
  activeClue.classList.add("hidden");
  waitingPanel.classList.add("hidden");

  if (state.phase === "over") {
    // handled by overlay
  } else if (state.phase === "clue") {
    if (state.you && state.you.role === "spymaster" && isMyTurnTeam) {
      clueForm.classList.remove("hidden");
    } else {
      waitingPanel.classList.remove("hidden");
      $("#waiting-text").textContent = isMyTurnTeam
        ? "Waiting for your spymaster's clue…"
        : `Waiting for ${state.turn}'s spymaster…`;
    }
  } else if (state.phase === "guess") {
    activeClue.classList.remove("hidden");
    $("#active-clue-text").textContent = `${state.clue.word} — ${state.clue.number}`;
    const left = Math.max(0, state.clue.number + 1 - state.clue.guessesUsed);
    $("#guesses-left").textContent = `${left} guess${left === 1 ? "" : "es"} left`;
    const canEndTurn = state.you && state.you.role === "operative" && isMyTurnTeam;
    $("#btn-end-turn").style.display = canEndTurn ? "inline-block" : "none";
  }

  // Log
  const log = $("#log");
  log.innerHTML = "";
  state.log.forEach((entry) => {
    const div = document.createElement("div");
    div.textContent = entry.text;
    log.appendChild(div);
  });
  log.scrollTop = log.scrollHeight;

  // Winner overlay
  const overlay = $("#overlay-winner");
  if (state.phase === "over" && state.winner) {
    overlay.classList.remove("hidden");
    $("#winner-text").textContent = `${state.winner === "red" ? "Red" : "Blue"} team wins!`;
  } else {
    overlay.classList.add("hidden");
  }
}

socket.on("state", (state) => {
  lastState = state;
  if (!state.you) return; // shouldn't happen once joined

  if (state.started) {
    renderGame(state);
  } else {
    renderTeamSelect(state);
  }
});

socket.on("errorMsg", (msg) => toast(msg));
